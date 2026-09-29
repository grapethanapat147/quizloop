/**
 * Server-side scoring (docs/05 P1, formula in docs/decision-log.md).
 *
 * - accuracy: every correct answer earns the same points.
 * - speed: correct answers lose points linearly with time used, down to a
 *   floor, so a slow correct answer still beats a wrong one.
 * - The review round never scores (docs/03 §1: รอบทบทวนไม่คิดอันดับ).
 */
import type { AnswerWindow } from "./session-machine";

export type ScoringMode = "speed" | "accuracy";
export type Round = "main" | "review";

export interface ScoringRules {
  /** Points for a correct answer in accuracy mode, and the speed-mode max. */
  maxPoints: number;
  /** Share of maxPoints a correct answer keeps at the last moment (0–1). */
  speedFloorRatio: number;
}

export const SCORING_RULES: ScoringRules = {
  maxPoints: 1000,
  speedFloorRatio: 0.5,
};

export interface ScoreInput {
  mode: ScoringMode;
  round: Round;
  isCorrect: boolean;
  /** Server receive time (epoch ms). Never trust a client timestamp. */
  answeredAt: number;
  window: AnswerWindow;
}

export function scoreAnswer(input: ScoreInput, rules: ScoringRules = SCORING_RULES): number {
  const { mode, round, isCorrect, answeredAt, window } = input;

  if (round === "review" || !isCorrect) return 0;
  if (answeredAt < window.opensAt || answeredAt > window.closesAt) return 0;
  if (mode === "accuracy") return rules.maxPoints;

  const duration = window.closesAt - window.opensAt;
  if (duration <= 0) return rules.maxPoints;

  const usedShare = (answeredAt - window.opensAt) / duration;
  const points = rules.maxPoints * (1 - (1 - rules.speedFloorRatio) * usedShare);
  return Math.round(points);
}
