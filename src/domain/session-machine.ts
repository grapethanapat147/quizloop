/**
 * Live game session state machine (docs/05 P1, docs/01 §5).
 *
 * Pure: no I/O and no clock. Every event that depends on time carries
 * `now` (server epoch ms) so the server stays authoritative and tests stay
 * deterministic. Route handlers in P2 must run every host command through
 * `transition` and persist the returned state.
 */

export const PHASES = [
  "lobby",
  "question_open",
  "question_closed",
  "reveal",
  "top5",
  "podium",
  "review_map",
  "review_open",
  "review_closed",
  "review_reveal",
  "summary",
  "ended",
  "paused",
] as const;

export type Phase = (typeof PHASES)[number];

/** Phases the host can pause from and resume back to. */
export type ActivePhase = Exclude<Phase, "paused" | "ended">;

export interface SessionConfig {
  /** Number of main questions in the game (≥ 1). */
  questionCount: number;
  /** Answer window per question in ms (> 0). */
  timeLimitMs: number;
  /**
   * Reading time before answers open, in ms (≥ 0). docs/01 §5 mentions
   * 3–5 s; the default stays 0 until Grape decides (decision-log).
   */
  readMs: number;
  /**
   * Show the top 5 automatically after every N main questions. `null`
   * means only when the host sends SHOW_TOP5 (decision-log: open).
   */
  top5Every: number | null;
}

export const DEFAULT_SESSION_CONFIG: Omit<SessionConfig, "questionCount"> = {
  timeLimitMs: 20_000,
  readMs: 0,
  top5Every: 3,
};

/** Server-time window in which answers are accepted (inclusive). */
export interface AnswerWindow {
  opensAt: number;
  closesAt: number;
}

export interface SessionState {
  phase: Phase;
  /** Index of the current main question, -1 before the first opens. */
  questionIndex: number;
  /** Index of the current review item, -1 before the review round. */
  reviewIndex: number;
  /** Items in the review round; 0 until START_REVIEW. */
  reviewCount: number;
  /**
   * Answer window of the current (or last) question. After CLOSE,
   * `closesAt` holds the actual close time.
   */
  window: AnswerWindow | null;
  /** Set only while `phase === "paused"`. */
  pause: { from: ActivePhase; at: number } | null;
}

export type SessionEvent =
  | { type: "START"; now: number }
  | { type: "CLOSE"; now: number }
  | { type: "REVEAL" }
  | { type: "SHOW_TOP5" }
  | { type: "NEXT"; now: number }
  | { type: "START_REVIEW"; now: number; itemCount: number }
  | { type: "SKIP_REVIEW" }
  | { type: "SWAP_REVIEW_ITEM" }
  | { type: "PAUSE"; now: number }
  | { type: "RESUME"; now: number }
  | { type: "END" };

export type SessionEventType = SessionEvent["type"];

export interface TransitionError {
  code: "invalid_transition" | "invalid_event";
  phase: Phase;
  event: SessionEventType;
  message: string;
}

export type TransitionResult =
  | { ok: true; state: SessionState }
  | { ok: false; error: TransitionError };

export function assertValidConfig(config: SessionConfig): void {
  const { questionCount, timeLimitMs, readMs, top5Every } = config;
  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new RangeError("questionCount must be an integer ≥ 1");
  }
  if (!Number.isFinite(timeLimitMs) || timeLimitMs <= 0) {
    throw new RangeError("timeLimitMs must be > 0");
  }
  if (!Number.isFinite(readMs) || readMs < 0) {
    throw new RangeError("readMs must be ≥ 0");
  }
  if (top5Every !== null && (!Number.isInteger(top5Every) || top5Every < 1)) {
    throw new RangeError("top5Every must be null or an integer ≥ 1");
  }
}

export function createSession(config: SessionConfig): SessionState {
  assertValidConfig(config);
  return {
    phase: "lobby",
    questionIndex: -1,
    reviewIndex: -1,
    reviewCount: 0,
    window: null,
    pause: null,
  };
}

const ok = (state: SessionState): TransitionResult => ({ ok: true, state });

function reject(
  state: SessionState,
  event: SessionEvent,
  code: TransitionError["code"] = "invalid_transition",
  detail?: string,
): TransitionResult {
  return {
    ok: false,
    error: {
      code,
      phase: state.phase,
      event: event.type,
      message: detail ?? `${event.type} is not allowed in ${state.phase}`,
    },
  };
}

function openWindow(now: number, config: SessionConfig): AnswerWindow {
  const opensAt = now + config.readMs;
  return { opensAt, closesAt: opensAt + config.timeLimitMs };
}

function isLastQuestion(state: SessionState, config: SessionConfig): boolean {
  return state.questionIndex >= config.questionCount - 1;
}

function isTop5Due(state: SessionState, config: SessionConfig): boolean {
  if (config.top5Every === null || isLastQuestion(state, config)) return false;
  return (state.questionIndex + 1) % config.top5Every === 0;
}

function openQuestion(
  state: SessionState,
  index: number,
  now: number,
  config: SessionConfig,
): SessionState {
  return {
    ...state,
    phase: "question_open",
    questionIndex: index,
    window: openWindow(now, config),
  };
}

function afterMainQuestion(
  state: SessionState,
  now: number,
  config: SessionConfig,
): SessionState {
  if (isLastQuestion(state, config)) return { ...state, phase: "podium" };
  return openQuestion(state, state.questionIndex + 1, now, config);
}

function closeWindow(window: AnswerWindow | null, now: number) {
  if (!window) return window;
  return { ...window, closesAt: Math.min(window.closesAt, now) };
}

function resume(state: SessionState, now: number): SessionState {
  const pause = state.pause!;
  let window = state.window;
  if (window && (pause.from === "question_open" || pause.from === "review_open")) {
    // Freeze the clock while paused: shift the whole window forward.
    const pausedFor = Math.max(0, now - pause.at);
    window = {
      opensAt: window.opensAt + pausedFor,
      closesAt: window.closesAt + pausedFor,
    };
  }
  return { ...state, phase: pause.from, window, pause: null };
}

/**
 * Apply one event. Returns `{ ok: false }` for any out-of-order event; the
 * input state is never mutated.
 */
export function transition(
  state: SessionState,
  event: SessionEvent,
  config: SessionConfig,
): TransitionResult {
  const { phase } = state;

  if (phase === "ended") return reject(state, event);

  // Global events.
  if (event.type === "END") {
    return ok({ ...state, phase: "ended", pause: null });
  }
  if (event.type === "PAUSE") {
    if (phase === "paused") return reject(state, event);
    return ok({ ...state, phase: "paused", pause: { from: phase, at: event.now } });
  }
  if (event.type === "RESUME") {
    if (phase !== "paused" || !state.pause) return reject(state, event);
    return ok(resume(state, event.now));
  }

  switch (phase) {
    case "lobby":
      if (event.type === "START") return ok(openQuestion(state, 0, event.now, config));
      break;

    case "question_open":
      if (event.type === "CLOSE") {
        return ok({ ...state, phase: "question_closed", window: closeWindow(state.window, event.now) });
      }
      break;

    case "question_closed":
      if (event.type === "REVEAL") return ok({ ...state, phase: "reveal" });
      break;

    case "reveal":
      if (event.type === "SHOW_TOP5") return ok({ ...state, phase: "top5" });
      if (event.type === "NEXT") {
        if (isTop5Due(state, config)) return ok({ ...state, phase: "top5" });
        return ok(afterMainQuestion(state, event.now, config));
      }
      break;

    case "top5":
      if (event.type === "NEXT") return ok(afterMainQuestion(state, event.now, config));
      break;

    case "podium":
      if (event.type === "NEXT") return ok({ ...state, phase: "review_map" });
      break;

    case "review_map":
      if (event.type === "SWAP_REVIEW_ITEM") return ok(state);
      if (event.type === "SKIP_REVIEW") return ok({ ...state, phase: "summary", window: null });
      if (event.type === "START_REVIEW") {
        if (!Number.isInteger(event.itemCount) || event.itemCount < 1) {
          return reject(state, event, "invalid_event", "START_REVIEW needs itemCount ≥ 1");
        }
        return ok({
          ...state,
          phase: "review_open",
          reviewIndex: 0,
          reviewCount: event.itemCount,
          window: openWindow(event.now, config),
        });
      }
      break;

    case "review_open":
      if (event.type === "CLOSE") {
        return ok({ ...state, phase: "review_closed", window: closeWindow(state.window, event.now) });
      }
      break;

    case "review_closed":
      if (event.type === "REVEAL") return ok({ ...state, phase: "review_reveal" });
      break;

    case "review_reveal":
      if (event.type === "NEXT") {
        if (state.reviewIndex >= state.reviewCount - 1) {
          return ok({ ...state, phase: "summary", window: null });
        }
        return ok({
          ...state,
          phase: "review_open",
          reviewIndex: state.reviewIndex + 1,
          window: openWindow(event.now, config),
        });
      }
      break;

    case "summary":
    case "paused":
      break;
  }

  return reject(state, event);
}

/** Which round answers belong to right now, or null outside a question. */
export function currentRound(state: SessionState): "main" | "review" | null {
  if (state.phase === "question_open") return "main";
  if (state.phase === "review_open") return "review";
  return null;
}

/** True when an answer received at server time `now` can be recorded. */
export function isAcceptingAnswers(state: SessionState, now: number): boolean {
  if (currentRound(state) === null || !state.window) return false;
  return now >= state.window.opensAt && now <= state.window.closesAt;
}
