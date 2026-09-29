// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCORING_RULES, scoreAnswer, type ScoreInput } from "./scoring";

const window = { opensAt: 10_000, closesAt: 30_000 }; // 20 s window

const answer = (patch: Partial<ScoreInput>): ScoreInput => ({
  mode: "speed",
  round: "main",
  isCorrect: true,
  answeredAt: 10_000,
  window,
  ...patch,
});

describe("D2 — accuracy mode", () => {
  it("gives the same points whether fast or slow", () => {
    expect(scoreAnswer(answer({ mode: "accuracy", answeredAt: 10_000 }))).toBe(1000);
    expect(scoreAnswer(answer({ mode: "accuracy", answeredAt: 29_999 }))).toBe(1000);
  });

  it("gives 0 for a wrong answer", () => {
    expect(scoreAnswer(answer({ mode: "accuracy", isCorrect: false }))).toBe(0);
  });
});

describe("D2 — speed mode follows round(1000 × (1 − 0.5 × t/T))", () => {
  it.each([
    [10_000, 1000], // instant
    [15_000, 875], // 25 % of the window
    [20_000, 750], // half
    [25_000, 625],
    [30_000, 500], // last moment = floor
    [12_345, 941], // 1000 × (1 − 0.5 × 2345/20000) = 941.375
  ])("answered at %i ms → %i points", (answeredAt, expected) => {
    expect(scoreAnswer(answer({ answeredAt }))).toBe(expected);
  });

  it("never drops below the floor for a correct answer inside the window", () => {
    for (let t = window.opensAt; t <= window.closesAt; t += 997) {
      expect(scoreAnswer(answer({ answeredAt: t }))).toBeGreaterThanOrEqual(
        SCORING_RULES.maxPoints * SCORING_RULES.speedFloorRatio,
      );
    }
  });

  it("gives 0 for a wrong answer", () => {
    expect(scoreAnswer(answer({ isCorrect: false }))).toBe(0);
  });

  it("uses custom rules when given", () => {
    const rules = { maxPoints: 100, speedFloorRatio: 0 };
    expect(scoreAnswer(answer({ answeredAt: 20_000 }), rules)).toBe(50);
  });
});

describe("D3 — answers outside the window and the review round score 0", () => {
  it.each(["speed", "accuracy"] as const)("%s: after close = 0", (mode) => {
    expect(scoreAnswer(answer({ mode, answeredAt: 30_001 }))).toBe(0);
  });

  it.each(["speed", "accuracy"] as const)("%s: before open (reading time) = 0", (mode) => {
    expect(scoreAnswer(answer({ mode, answeredAt: 9_999 }))).toBe(0);
  });

  it("uses the actual close time after an early close", () => {
    const closedEarly = { opensAt: 10_000, closesAt: 18_000 };
    expect(scoreAnswer(answer({ window: closedEarly, answeredAt: 18_500 }))).toBe(0);
  });

  it.each(["speed", "accuracy"] as const)("%s: review round = 0 even when correct", (mode) => {
    expect(scoreAnswer(answer({ mode, round: "review" }))).toBe(0);
  });
});
