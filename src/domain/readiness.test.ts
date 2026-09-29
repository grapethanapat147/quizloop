// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  READINESS_CODES,
  checkReadiness,
  type DraftMainQuestion,
  type DraftQuiz,
  type DraftReviewItem,
} from "./readiness";

const main = (id: string, patch: Partial<DraftMainQuestion> = {}): DraftMainQuestion => ({
  id,
  kind: "main",
  status: "approved",
  stem: `โจทย์ ${id}`,
  options: ["ก", "ข", "ค", "ง"],
  correctIndex: 0,
  explanation: "เหตุผลหนึ่งบรรทัด",
  conceptIdByOption: [null, "A", "B", "C"],
  ...patch,
});

const review = (id: string, conceptId: string | null, patch: Partial<DraftReviewItem> = {}): DraftReviewItem => ({
  id,
  kind: "review",
  status: "approved",
  stem: `ข้อทบทวน ${id}`,
  options: ["ก", "ข", "ค", "ง"],
  correctIndex: 1,
  explanation: "เหตุผลหนึ่งบรรทัด",
  conceptId,
  ...patch,
});

const readyQuiz = (): DraftQuiz => ({
  concepts: [
    { id: "A", label: "มโนทัศน์ A" },
    { id: "B", label: "มโนทัศน์ B" },
    { id: "C", label: "มโนทัศน์ C" },
  ],
  questions: [main("m1"), main("m2"), review("r1", "A"), review("r2", "B"), review("r3", "C")],
});

/** Replace one question by id. */
const withQuestion = (quiz: DraftQuiz, id: string, patch: object): DraftQuiz => ({
  ...quiz,
  questions: quiz.questions.map((q) => (q.id === id ? ({ ...q, ...patch } as typeof q) : q)),
});

const codes = (quiz: DraftQuiz) => checkReadiness(quiz).issues.map((i) => i.code);

describe("D9 — readiness", () => {
  it("is ready when everything is approved and complete", () => {
    expect(checkReadiness(readyQuiz())).toEqual({ ready: true, issues: [] });
  });

  it("blocks a quiz with no main questions", () => {
    const quiz = { ...readyQuiz(), questions: readyQuiz().questions.filter((q) => q.kind === "review") };
    expect(codes(quiz)).toEqual(["no_main_questions"]);
  });

  it("blocks while a main question is pending and names it", () => {
    const result = checkReadiness(withQuestion(readyQuiz(), "m2", { status: "pending" }));
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual([{ code: "main_pending", questionIds: ["m2"] }]);
  });

  it("blocks while a review item is pending (docs/03 §1: approve every item)", () => {
    const quiz = { ...readyQuiz(), questions: [...readyQuiz().questions, review("r4", "A", { status: "pending" })] };
    expect(checkReadiness(quiz).issues).toEqual([{ code: "review_pending", questionIds: ["r4"] }]);
  });

  it("blocks when fewer than 3 review items are approved and reports the count", () => {
    const quiz = { ...readyQuiz(), questions: readyQuiz().questions.filter((q) => q.id !== "r3") };
    expect(checkReadiness(quiz).issues).toEqual([{ code: "review_bank_too_small", questionIds: [], count: 2 }]);
  });

  it("does not count pending review items toward the minimum", () => {
    const result = checkReadiness(withQuestion(readyQuiz(), "r3", { status: "pending" }));
    expect(result.issues.map((i) => i.code)).toEqual(["review_pending", "review_bank_too_small"]);
  });

  it("blocks more than 5 concepts", () => {
    const quiz = readyQuiz();
    quiz.concepts.push(...["D", "E", "F"].map((id) => ({ id, label: id })));
    expect(checkReadiness(quiz).issues).toEqual([{ code: "too_many_concepts", questionIds: [], count: 6 }]);
  });

  it.each([
    ["missing_stem", "m1", { stem: "   " }],
    ["invalid_options", "m1", { options: ["ก", "ข", "ค"], conceptIdByOption: [null, "A", "B"] }],
    ["invalid_options", "m1", { options: ["ก", "", "ค", "ง"] }],
    ["invalid_options", "m1", { conceptIdByOption: [null, "A", "B"] }],
    ["missing_correct_answer", "m1", { correctIndex: null }],
    ["missing_correct_answer", "r1", { correctIndex: 4 }],
    ["missing_explanation", "m1", { explanation: "" }],
    ["missing_explanation", "r1", { explanation: " " }],
    ["distractor_missing_concept", "m1", { conceptIdByOption: [null, "A", null, "C"] }],
    ["review_missing_concept", "r1", { conceptId: null }],
    ["unknown_concept", "m1", { conceptIdByOption: [null, "A", "Z", "C"] }],
    ["unknown_concept", "r1", { conceptId: "Z" }],
    ["review_same_as_main", "r1", { stem: "  โจทย์​ m1 " }],
  ] as const)("%s on %s", (code, id, patch) => {
    expect(checkReadiness(withQuestion(readyQuiz(), id, patch)).issues).toEqual([{ code, questionIds: [id] }]);
  });

  it("ignores the concept slot of the correct option", () => {
    const quiz = withQuestion(readyQuiz(), "m1", { correctIndex: 2, conceptIdByOption: ["A", "B", null, "C"] });
    expect(checkReadiness(quiz).ready).toBe(true);
  });

  it("returns every reason at once, in panel order", () => {
    const broken: DraftQuiz = {
      concepts: ["A", "B", "C", "D", "E", "F"].map((id) => ({ id, label: id })),
      questions: [
        main("m1", { status: "pending", stem: "", explanation: "" }),
        main("m2", { options: ["ก", "ข", "ค"], conceptIdByOption: [null, "A", "B"] }),
        main("m3", { correctIndex: null }),
        main("m4", { conceptIdByOption: [null, null, "Z", "A"] }),
        review("r1", null, { status: "pending", stem: "โจทย์ m3" }),
        review("r2", "Q"),
      ],
    };
    // With no main questions at all, add the quiz-level reason separately.
    const onlyReview: DraftQuiz = { concepts: [], questions: [review("r9", "A")] };

    const result = checkReadiness(broken);
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual([
      { code: "main_pending", questionIds: ["m1"] },
      { code: "review_pending", questionIds: ["r1"] },
      { code: "review_bank_too_small", questionIds: [], count: 1 },
      { code: "too_many_concepts", questionIds: [], count: 6 },
      { code: "missing_stem", questionIds: ["m1"] },
      { code: "invalid_options", questionIds: ["m2"] },
      { code: "missing_correct_answer", questionIds: ["m3"] },
      { code: "missing_explanation", questionIds: ["m1"] },
      { code: "distractor_missing_concept", questionIds: ["m4"] },
      { code: "review_missing_concept", questionIds: ["r1"] },
      { code: "unknown_concept", questionIds: ["m4", "r2"] },
      { code: "review_same_as_main", questionIds: ["r1"] },
    ]);
    expect(codes(onlyReview)).toContain("no_main_questions");

    const covered = new Set([...result.issues.map((i) => i.code), ...codes(onlyReview)]);
    expect([...covered].sort()).toEqual([...READINESS_CODES].sort());
  });
});
