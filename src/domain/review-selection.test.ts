// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computeConceptStats,
  selectReviewRound,
  swapReviewItem,
  type MainQuestionResult,
  type ReviewBankItem,
} from "./review-selection";

/** One question whose three distractors all map to `conceptId`. */
function single(conceptId: string, correct: number, wrong: number): MainQuestionResult {
  return {
    questionId: `q-${conceptId}`,
    correctIndex: 0,
    conceptIdByOption: [null, conceptId, conceptId, conceptId],
    optionCounts: [correct, wrong, 0, 0],
  };
}

const bankFor = (...conceptIds: string[]): ReviewBankItem[] =>
  conceptIds.map((c) => ({ id: `r-${c}`, conceptId: c }));

const ids = (items: { itemId: string }[]) => items.map((i) => i.itemId);

describe("concept stats", () => {
  it("sums base, wrong answers and accuracy across questions", () => {
    const questions: MainQuestionResult[] = [
      { questionId: "q1", correctIndex: 2, conceptIdByOption: ["A", "B", null, "A"], optionCounts: [3, 1, 5, 1] },
      { questionId: "q2", correctIndex: 0, conceptIdByOption: [null, "A", "C", "C"], optionCounts: [6, 2, 1, 1] },
    ];
    const [a, b, c] = computeConceptStats(["A", "B", "C"], questions);
    // A appears in q1 (10 answers) and q2 (10 answers): wrong = 3 + 1 + 2.
    expect(a).toMatchObject({ base: 20, wrongShare: 6 / 20, accuracy: 11 / 20, questionIds: ["q1", "q2"] });
    expect(b).toMatchObject({ base: 10, wrongShare: 1 / 10, accuracy: 5 / 10, questionIds: ["q1"] });
    expect(c).toMatchObject({ base: 10, wrongShare: 2 / 10, standout: true, questionIds: ["q2"] });
  });

  it("ignores a concept id placed on the correct option", () => {
    const q: MainQuestionResult = {
      questionId: "q1", correctIndex: 0, conceptIdByOption: ["A", "A", null, null], optionCounts: [8, 2, 0, 0],
    };
    const [a] = computeConceptStats(["A"], [q]);
    expect(a.wrongShare).toBe(0.2);
  });

  it("rejects malformed question results", () => {
    const bad = { ...single("A", 5, 5), optionCounts: [5, 5, 0] };
    expect(() => computeConceptStats(["A"], [bad])).toThrow(RangeError);
    expect(() => computeConceptStats(["A"], [{ ...single("A", 5, 5), correctIndex: 4 }])).toThrow(RangeError);
    expect(() => computeConceptStats(["A"], [{ ...single("A", 5, 5), optionCounts: [5, -1, 0, 0] }])).toThrow(RangeError);
  });
});

describe("D4 — concepts with base < 5 are never selected from data", () => {
  const questions = [single("A", 8, 2), single("B", 9, 1), single("C", 10, 0), single("E", 0, 4)];
  const result = selectReviewRound({
    conceptIds: ["A", "B", "C", "E"],
    questions,
    bank: bankFor("A", "B", "C", "E"),
  });

  it("does not mark a 100 % wrong concept with base 4 as a standout", () => {
    const e = result.concepts.find((c) => c.conceptId === "E")!;
    expect(e).toMatchObject({ base: 4, eligible: false, standout: false });
  });

  it("hides its wrong share and accuracy", () => {
    const e = result.concepts.find((c) => c.conceptId === "E")!;
    expect(e.wrongShare).toBeNull();
    expect(e.accuracy).toBeNull();
  });

  it("leaves it out while eligible concepts can fill the round", () => {
    expect(ids(result.items)).toEqual(["r-A", "r-B", "r-C"]);
  });

  it("uses it only as the last resort, in quiz order, when the bank needs it", () => {
    const sparse = selectReviewRound({
      conceptIds: ["A", "E", "F"],
      questions: [single("A", 5, 5), single("E", 0, 4), single("F", 1, 2)],
      bank: bankFor("F", "E", "A"),
    });
    expect(ids(sparse.items)).toEqual(["r-A", "r-E", "r-F"]);
    expect(sparse.items.map((i) => i.reason)).toEqual(["standout", "fill", "fill"]);
  });
});

describe("D5 — three or more standouts", () => {
  it("picks the top three by wrong share", () => {
    const result = selectReviewRound({
      conceptIds: ["A", "B", "C", "D"],
      questions: [single("A", 7, 3), single("B", 4, 6), single("C", 5, 5), single("D", 6, 4)],
      bank: bankFor("A", "B", "C", "D"),
    });
    expect(result.status).toBe("has_standout");
    expect(ids(result.items)).toEqual(["r-B", "r-C", "r-D"]);
    expect(result.items.every((i) => i.reason === "standout")).toBe(true);
  });

  it("treats exactly 20 % as a standout and 19.9 % as not", () => {
    const result = selectReviewRound({
      conceptIds: ["A", "B"],
      questions: [single("A", 12, 3), { ...single("B", 802, 199), questionId: "q-B" }],
      bank: bankFor("A", "B"),
    });
    const [a, b] = result.concepts;
    expect(a.wrongShare).toBe(0.2); // 3 / 15
    expect(a.standout).toBe(true);
    expect(b.standout).toBe(false); // 199 / 1001
  });

  it("skips a standout concept that has no approved review item", () => {
    const result = selectReviewRound({
      conceptIds: ["A", "B", "C", "D"],
      questions: [single("A", 4, 6), single("B", 5, 5), single("C", 6, 4), single("D", 7, 3)],
      bank: bankFor("B", "C", "D"),
    });
    expect(ids(result.items)).toEqual(["r-B", "r-C", "r-D"]);
  });
});

describe("D6 — fewer than three standouts", () => {
  it("fills from the bank by wrong share, highest first", () => {
    const result = selectReviewRound({
      conceptIds: ["A", "B", "C", "D"],
      questions: [single("A", 5, 5), single("B", 9, 1), single("C", 10, 0), single("D", 19, 1)],
      bank: bankFor("A", "B", "C", "D"),
    });
    expect(result.status).toBe("has_standout");
    expect(ids(result.items)).toEqual(["r-A", "r-B", "r-D"]);
    expect(result.items.map((i) => i.reason)).toEqual(["standout", "fill", "fill"]);
  });

  it("uses a second item of a concept only after every concept had one", () => {
    const result = selectReviewRound({
      conceptIds: ["A", "B"],
      questions: [single("A", 5, 5), single("B", 9, 1)],
      bank: [
        { id: "r-A1", conceptId: "A" },
        { id: "r-A2", conceptId: "A" },
        { id: "r-B1", conceptId: "B" },
      ],
    });
    expect(ids(result.items)).toEqual(["r-A1", "r-B1", "r-A2"]);
  });

  it("returns fewer items when the bank is too small", () => {
    const result = selectReviewRound({
      conceptIds: ["A"],
      questions: [single("A", 5, 5)],
      bank: bankFor("A"),
    });
    expect(ids(result.items)).toEqual(["r-A"]);
  });
});

describe("D7 — no standout", () => {
  it("returns no_standout with three items ordered by wrong share", () => {
    const result = selectReviewRound({
      conceptIds: ["A", "B", "C"],
      questions: [single("A", 9, 1), single("B", 10, 0), single("C", 5, 1)],
      bank: bankFor("A", "B", "C"),
    });
    expect(result.status).toBe("no_standout");
    expect(ids(result.items)).toEqual(["r-C", "r-A", "r-B"]);
    expect(result.items.every((i) => i.reason === "fill")).toBe(true);
  });

  it("returns no_standout when nobody answered", () => {
    const result = selectReviewRound({
      conceptIds: ["A", "B", "C"],
      questions: [single("A", 0, 0), single("B", 0, 0), single("C", 0, 0)],
      bank: bankFor("C", "B", "A"),
    });
    expect(result.status).toBe("no_standout");
    expect(ids(result.items)).toEqual(["r-A", "r-B", "r-C"]); // quiz order
  });
});

describe("D8 — tie-break", () => {
  it("puts lower accuracy first when wrong shares tie", () => {
    // A and B both 30 % wrong; A's question also loses 20 % to concept X.
    const questions: MainQuestionResult[] = [
      { questionId: "q1", correctIndex: 0, conceptIdByOption: [null, "A", "X", "X"], optionCounts: [5, 3, 2, 0] },
      { questionId: "q2", correctIndex: 0, conceptIdByOption: [null, "B", "B", "B"], optionCounts: [7, 3, 0, 0] },
    ];
    const result = selectReviewRound({
      conceptIds: ["B", "A", "X"],
      questions,
      bank: bankFor("A", "B", "X"),
    });
    const [b, a] = result.concepts;
    expect(a.wrongShare).toBe(b.wrongShare);
    expect(a.accuracy).toBeLessThan(b.accuracy!);
    expect(ids(result.items)).toEqual(["r-A", "r-B", "r-X"]);
  });

  it("falls back to quiz order when share and accuracy both tie", () => {
    const result = selectReviewRound({
      conceptIds: ["D", "C", "B", "A"],
      questions: [single("A", 7, 3), single("B", 7, 3), single("C", 7, 3), single("D", 7, 3)],
      bank: bankFor("A", "B", "C", "D"),
    });
    expect(ids(result.items)).toEqual(["r-D", "r-C", "r-B"]);
  });
});

describe("rules are configurable", () => {
  it("honours a different minBase and threshold", () => {
    const result = selectReviewRound(
      {
        conceptIds: ["A", "B", "C"],
        questions: [single("A", 1, 3), single("B", 3, 1), single("C", 4, 0)],
        bank: bankFor("A", "B", "C"),
      },
      { minBase: 4, standoutShare: 0.5, roundSize: 2 },
    );
    expect(result.concepts.map((c) => c.standout)).toEqual([true, false, false]);
    expect(ids(result.items)).toEqual(["r-A", "r-B"]);
  });
});

describe("swapReviewItem (เปลี่ยนข้อ)", () => {
  const bank = bankFor("A", "B", "C", "D");
  const items = [
    { itemId: "r-A", conceptId: "A", reason: "standout" as const },
    { itemId: "r-B", conceptId: "B", reason: "fill" as const },
    { itemId: "r-C", conceptId: "C", reason: "fill" as const },
  ];

  it("replaces one slot and marks it as the teacher's choice", () => {
    const result = swapReviewItem(items, 1, "r-D", bank);
    expect(result).toEqual({
      ok: true,
      items: [items[0], { itemId: "r-D", conceptId: "D", reason: "teacher" }, items[2]],
    });
    expect(items[1].itemId).toBe("r-B"); // input untouched
  });

  it.each([
    [5, "r-D", "position_out_of_range"],
    [-1, "r-D", "position_out_of_range"],
    [0, "r-Z", "item_not_in_bank"],
    [0, "r-C", "item_already_selected"],
  ] as const)("position %i → %s fails with %s", (position, itemId, error) => {
    expect(swapReviewItem(items, position, itemId, bank)).toEqual({ ok: false, error });
  });
});
