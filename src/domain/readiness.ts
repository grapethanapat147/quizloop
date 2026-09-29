/**
 * Can this quiz open a game? (docs/05 P1, docs/03 §1, Non-negotiable 3)
 *
 * Returns every reason at once so the teacher's readiness panel can list
 * them all, not just the first.
 */
import { comparisonKey } from "./text";

export type ConceptId = string;
export type QuestionId = string;
export type ApprovalStatus = "pending" | "approved";

interface DraftQuestionBase {
  id: QuestionId;
  status: ApprovalStatus;
  stem: string;
  options: string[];
  /** null until the teacher picks the answer. */
  correctIndex: number | null;
  /** One-line reason shown with the answer (เฉลย + เหตุผล). */
  explanation: string;
}

export interface DraftMainQuestion extends DraftQuestionBase {
  kind: "main";
  /** Concept behind each option; the correct option's entry is ignored. */
  conceptIdByOption: Array<ConceptId | null>;
}

export interface DraftReviewItem extends DraftQuestionBase {
  kind: "review";
  conceptId: ConceptId | null;
}

export type DraftQuestion = DraftMainQuestion | DraftReviewItem;

export interface DraftConcept {
  id: ConceptId;
  label: string;
}

export interface DraftQuiz {
  concepts: DraftConcept[];
  questions: DraftQuestion[];
}

export interface ReadinessRules {
  /** docs/01 §3: multiple choice with 4 options. */
  optionCount: number;
  /** docs/03 §1: at most 5 concepts per quiz. */
  maxConcepts: number;
  /** docs/03 §1 and Non-negotiable 3: at least 3 approved review items. */
  minApprovedReviewItems: number;
}

export const READINESS_RULES: ReadinessRules = {
  optionCount: 4,
  maxConcepts: 5,
  minApprovedReviewItems: 3,
};

/** Listed in the order the readiness panel should show them. */
export const READINESS_CODES = [
  "no_main_questions",
  "main_pending",
  "review_pending",
  "review_bank_too_small",
  "too_many_concepts",
  "missing_stem",
  "invalid_options",
  "missing_correct_answer",
  "missing_explanation",
  "distractor_missing_concept",
  "review_missing_concept",
  "unknown_concept",
  "review_same_as_main",
] as const;

export type ReadinessCode = (typeof READINESS_CODES)[number];

export interface ReadinessIssue {
  code: ReadinessCode;
  /** Questions the teacher needs to fix; empty for quiz-level issues. */
  questionIds: QuestionId[];
  /** For count-based issues: the current count. */
  count?: number;
}

export interface Readiness {
  ready: boolean;
  issues: ReadinessIssue[];
}

const isBlank = (s: string) => s.trim().length === 0;

function hasValidAnswer(q: DraftQuestion): boolean {
  return (
    q.correctIndex !== null &&
    Number.isInteger(q.correctIndex) &&
    q.correctIndex >= 0 &&
    q.correctIndex < q.options.length
  );
}

export function checkReadiness(quiz: DraftQuiz, rules: ReadinessRules = READINESS_RULES): Readiness {
  const main = quiz.questions.filter((q): q is DraftMainQuestion => q.kind === "main");
  const review = quiz.questions.filter((q): q is DraftReviewItem => q.kind === "review");
  const conceptIds = new Set(quiz.concepts.map((c) => c.id));
  const mainStems = new Set(main.map((q) => comparisonKey(q.stem)));

  const idsWhere = (list: DraftQuestion[], test: (q: DraftQuestion) => boolean) =>
    list.filter(test).map((q) => q.id);

  const distractorConcepts = (q: DraftMainQuestion) =>
    hasValidAnswer(q) ? q.conceptIdByOption.filter((_, i) => i !== q.correctIndex) : [];

  const approvedReview = review.filter((q) => q.status === "approved").length;

  const found: Record<ReadinessCode, ReadinessIssue | null> = {
    no_main_questions: main.length === 0 ? { code: "no_main_questions", questionIds: [] } : null,
    main_pending: issue("main_pending", idsWhere(main, (q) => q.status === "pending")),
    review_pending: issue("review_pending", idsWhere(review, (q) => q.status === "pending")),
    review_bank_too_small:
      approvedReview < rules.minApprovedReviewItems
        ? { code: "review_bank_too_small", questionIds: [], count: approvedReview }
        : null,
    too_many_concepts:
      quiz.concepts.length > rules.maxConcepts
        ? { code: "too_many_concepts", questionIds: [], count: quiz.concepts.length }
        : null,
    missing_stem: issue("missing_stem", idsWhere(quiz.questions, (q) => isBlank(q.stem))),
    invalid_options: issue(
      "invalid_options",
      idsWhere(
        quiz.questions,
        (q) =>
          q.options.length !== rules.optionCount ||
          q.options.some(isBlank) ||
          (q.kind === "main" && q.conceptIdByOption.length !== q.options.length),
      ),
    ),
    missing_correct_answer: issue("missing_correct_answer", idsWhere(quiz.questions, (q) => !hasValidAnswer(q))),
    missing_explanation: issue("missing_explanation", idsWhere(quiz.questions, (q) => isBlank(q.explanation))),
    distractor_missing_concept: issue(
      "distractor_missing_concept",
      main.filter((q) => distractorConcepts(q).some((c) => c === null)).map((q) => q.id),
    ),
    review_missing_concept: issue("review_missing_concept", review.filter((q) => q.conceptId === null).map((q) => q.id)),
    unknown_concept: issue("unknown_concept", [
      ...main.filter((q) => distractorConcepts(q).some((c) => c !== null && !conceptIds.has(c))).map((q) => q.id),
      ...review.filter((q) => q.conceptId !== null && !conceptIds.has(q.conceptId)).map((q) => q.id),
    ]),
    review_same_as_main: issue(
      "review_same_as_main",
      review.filter((q) => !isBlank(q.stem) && mainStems.has(comparisonKey(q.stem))).map((q) => q.id),
    ),
  };

  const issues = READINESS_CODES.map((code) => found[code]).filter((i): i is ReadinessIssue => i !== null);
  return { ready: issues.length === 0, issues };
}

function issue(code: ReadinessCode, questionIds: QuestionId[]): ReadinessIssue | null {
  return questionIds.length > 0 ? { code, questionIds } : null;
}
