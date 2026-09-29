/**
 * Deterministic review-round selection (docs/03 §3.3, docs/05 P1).
 *
 * No AI and no per-player data: the input is aggregate answer counts per
 * option, so the host never learns who picked what (Non-negotiable 1, 4).
 *
 * For each concept c:
 *   base(c)       = all answers in main questions that have a distractor of c
 *   wrongShare(c) = answers that picked a distractor of c ÷ base(c)
 *   eligible      = base(c) ≥ minBase (otherwise its numbers are never exposed)
 *   standout      = eligible and wrongShare(c) ≥ standoutShare
 *
 * Round = review items of the top standout concepts; fill from eligible
 * concepts by wrongShare, then from ineligible ones in quiz order.
 * Ties: higher wrongShare → lower accuracy on the concept's questions →
 * earlier concept in the quiz (decision-log 2026-09-26).
 */

export type ConceptId = string;
export type QuestionId = string;
export type ReviewItemId = string;

export interface SelectionRules {
  /** Concepts with fewer answers than this are ignored (docs/03 §3.3: 5). */
  minBase: number;
  /** A concept is a standout at or above this wrong share (docs/03 §3.3: 20%). */
  standoutShare: number;
  /** Items in the review round (docs/03 §1: 3). */
  roundSize: number;
}

export const SELECTION_RULES: SelectionRules = {
  minBase: 5,
  standoutShare: 0.2,
  roundSize: 3,
};

export interface MainQuestionResult {
  questionId: QuestionId;
  correctIndex: number;
  /** Concept behind each option; the correct option's entry is ignored. */
  conceptIdByOption: ReadonlyArray<ConceptId | null>;
  /** Aggregate number of answers per option. */
  optionCounts: ReadonlyArray<number>;
}

/** An approved review-bank item. Pending items must be filtered out first. */
export interface ReviewBankItem {
  id: ReviewItemId;
  conceptId: ConceptId;
}

export interface ConceptStat {
  conceptId: ConceptId;
  base: number;
  eligible: boolean;
  standout: boolean;
  /** null when not eligible, so the UI cannot show it. */
  wrongShare: number | null;
  /** Share of correct answers on this concept's questions; null when not eligible. */
  accuracy: number | null;
  questionIds: QuestionId[];
}

export type SelectionReason = "standout" | "fill" | "teacher";

export interface SelectedReviewItem {
  itemId: ReviewItemId;
  conceptId: ConceptId;
  reason: SelectionReason;
}

export interface ReviewSelection {
  /** "no_standout" → UI shows ยังไม่มีจุดที่ควรทบทวนเป็นพิเศษ. */
  status: "has_standout" | "no_standout";
  /** One entry per concept, in quiz order. */
  concepts: ConceptStat[];
  /** Up to roundSize items, best first. */
  items: SelectedReviewItem[];
}

export interface SelectionInput {
  /** Concepts in quiz order; this order is the last tie-break. */
  conceptIds: ReadonlyArray<ConceptId>;
  questions: ReadonlyArray<MainQuestionResult>;
  bank: ReadonlyArray<ReviewBankItem>;
}

function assertQuestionShape(q: MainQuestionResult): void {
  const n = q.optionCounts.length;
  if (q.conceptIdByOption.length !== n) {
    throw new RangeError(`${q.questionId}: conceptIdByOption and optionCounts differ in length`);
  }
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= n) {
    throw new RangeError(`${q.questionId}: correctIndex out of range`);
  }
  if (q.optionCounts.some((c) => !Number.isInteger(c) || c < 0)) {
    throw new RangeError(`${q.questionId}: optionCounts must be non-negative integers`);
  }
}

function sum(values: ReadonlyArray<number>): number {
  return values.reduce((a, b) => a + b, 0);
}

export function computeConceptStats(
  conceptIds: ReadonlyArray<ConceptId>,
  questions: ReadonlyArray<MainQuestionResult>,
  rules: SelectionRules = SELECTION_RULES,
): ConceptStat[] {
  questions.forEach(assertQuestionShape);

  return conceptIds.map((conceptId) => {
    let base = 0;
    let wrong = 0;
    let correct = 0;
    const questionIds: QuestionId[] = [];

    for (const q of questions) {
      const distractorIndexes = q.conceptIdByOption
        .map((c, i) => (c === conceptId && i !== q.correctIndex ? i : -1))
        .filter((i) => i >= 0);
      if (distractorIndexes.length === 0) continue;

      questionIds.push(q.questionId);
      base += sum(q.optionCounts);
      correct += q.optionCounts[q.correctIndex];
      wrong += sum(distractorIndexes.map((i) => q.optionCounts[i]));
    }

    const eligible = base >= rules.minBase;
    const wrongShare = eligible ? wrong / base : null;
    return {
      conceptId,
      base,
      eligible,
      standout: wrongShare !== null && wrongShare >= rules.standoutShare,
      wrongShare,
      accuracy: eligible ? correct / base : null,
      questionIds,
    };
  });
}

/** Ranked concept order: standouts, other eligible, then ineligible. */
function rankConcepts(stats: ConceptStat[]): ConceptStat[] {
  const position = new Map(stats.map((s, i) => [s.conceptId, i]));
  const byEvidence = (a: ConceptStat, b: ConceptStat) =>
    b.wrongShare! - a.wrongShare! ||
    a.accuracy! - b.accuracy! ||
    position.get(a.conceptId)! - position.get(b.conceptId)!;

  const standouts = stats.filter((s) => s.standout).sort(byEvidence);
  const otherEligible = stats.filter((s) => s.eligible && !s.standout).sort(byEvidence);
  const ineligible = stats.filter((s) => !s.eligible);
  return [...standouts, ...otherEligible, ...ineligible];
}

export function selectReviewRound(
  input: SelectionInput,
  rules: SelectionRules = SELECTION_RULES,
): ReviewSelection {
  const concepts = computeConceptStats(input.conceptIds, input.questions, rules);
  const ranked = rankConcepts(concepts);
  const standoutIds = new Set(concepts.filter((c) => c.standout).map((c) => c.conceptId));

  const items: SelectedReviewItem[] = [];
  const used = new Set<ReviewItemId>();
  const take = (item: ReviewBankItem) => {
    used.add(item.id);
    items.push({
      itemId: item.id,
      conceptId: item.conceptId,
      reason: standoutIds.has(item.conceptId) ? "standout" : "fill",
    });
  };
  const full = () => items.length >= rules.roundSize;

  // Pass 1: one item per concept in ranked order. Pass 2: a second item per
  // concept if the bank has one. Pass 3: anything left, in bank order.
  for (let pass = 0; pass < 2 && !full(); pass++) {
    for (const concept of ranked) {
      if (full()) break;
      const next = input.bank.find((i) => i.conceptId === concept.conceptId && !used.has(i.id));
      if (next) take(next);
    }
  }
  for (const item of input.bank) {
    if (full()) break;
    if (!used.has(item.id)) take(item);
  }

  return {
    status: standoutIds.size > 0 ? "has_standout" : "no_standout",
    concepts,
    items,
  };
}

export type SwapError = "position_out_of_range" | "item_not_in_bank" | "item_already_selected";

/** Teacher presses `เปลี่ยนข้อ` on one slot before the round starts. */
export function swapReviewItem(
  items: ReadonlyArray<SelectedReviewItem>,
  position: number,
  newItemId: ReviewItemId,
  bank: ReadonlyArray<ReviewBankItem>,
): { ok: true; items: SelectedReviewItem[] } | { ok: false; error: SwapError } {
  if (!Number.isInteger(position) || position < 0 || position >= items.length) {
    return { ok: false, error: "position_out_of_range" };
  }
  const replacement = bank.find((i) => i.id === newItemId);
  if (!replacement) return { ok: false, error: "item_not_in_bank" };
  if (items.some((i) => i.itemId === newItemId)) {
    return { ok: false, error: "item_already_selected" };
  }
  const next = [...items];
  next[position] = { itemId: replacement.id, conceptId: replacement.conceptId, reason: "teacher" };
  return { ok: true, items: next };
}
