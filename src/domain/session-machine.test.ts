// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createSession,
  isAcceptingAnswers,
  transition,
  type SessionConfig,
  type SessionEvent,
  type SessionState,
} from "./session-machine";

const config: SessionConfig = {
  questionCount: 4,
  timeLimitMs: 20_000,
  readMs: 0,
  top5Every: 3,
};

/** Apply events in order, failing the test on the first rejection. */
function run(events: SessionEvent[], cfg = config, from = createSession(cfg)): SessionState {
  return events.reduce((state, event) => {
    const result = transition(state, event, cfg);
    if (!result.ok) throw new Error(result.error.message);
    return result.state;
  }, from);
}

const playQuestion = (now: number): SessionEvent[] => [
  { type: "CLOSE", now: now + 20_000 },
  { type: "REVEAL" },
  { type: "NEXT", now: now + 30_000 },
];

describe("session machine — happy path", () => {
  it("walks lobby → questions → top5 → podium → review → summary → ended", () => {
    const phases: string[] = [];
    let state = createSession(config);
    const events: SessionEvent[] = [
      { type: "START", now: 0 },
      ...playQuestion(0),
      ...playQuestion(30_000),
      ...playQuestion(60_000), // after Q3: top5 is due
      { type: "NEXT", now: 100_000 },
      ...playQuestion(100_000), // Q4 is last: podium, not top5
      { type: "NEXT", now: 140_000 },
      { type: "SWAP_REVIEW_ITEM" },
      { type: "START_REVIEW", now: 150_000, itemCount: 3 },
      ...playQuestion(150_000),
      ...playQuestion(180_000),
      ...playQuestion(210_000),
      { type: "END" },
    ];
    for (const event of events) {
      const result = transition(state, event, config);
      expect(result.ok, `${event.type} in ${state.phase}`).toBe(true);
      if (result.ok) state = result.state;
      phases.push(state.phase);
    }
    expect(phases).toEqual([
      "question_open", "question_closed", "reveal",
      "question_open", "question_closed", "reveal",
      "question_open", "question_closed", "reveal",
      "top5",
      "question_open", "question_closed", "reveal",
      "podium",
      "review_map", "review_map",
      "review_open", "review_closed", "review_reveal",
      "review_open", "review_closed", "review_reveal",
      "review_open", "review_closed", "review_reveal",
      "summary", "ended",
    ]);
  });

  it("tracks question and review indexes", () => {
    const state = run([{ type: "START", now: 0 }, ...playQuestion(0)]);
    expect(state.questionIndex).toBe(1);
    expect(state.window).toEqual({ opensAt: 30_000, closesAt: 50_000 });
  });

  it("goes straight to summary when the teacher skips the review round", () => {
    const one = { ...config, questionCount: 1 };
    const state = run(
      [{ type: "START", now: 0 }, ...playQuestion(0), { type: "NEXT", now: 1 }, { type: "SKIP_REVIEW" }],
      one,
    );
    expect(state.phase).toBe("summary");
  });
});

describe("D1 — out-of-order transitions are rejected", () => {
  const cases: Array<[string, SessionEvent[], SessionEvent]> = [
    ["REVEAL in lobby", [], { type: "REVEAL" }],
    ["NEXT in lobby", [], { type: "NEXT", now: 0 }],
    ["START twice", [{ type: "START", now: 0 }], { type: "START", now: 1 }],
    ["REVEAL while question is open", [{ type: "START", now: 0 }], { type: "REVEAL" }],
    ["NEXT while question is open", [{ type: "START", now: 0 }], { type: "NEXT", now: 1 }],
    ["CLOSE twice", [{ type: "START", now: 0 }, { type: "CLOSE", now: 1 }], { type: "CLOSE", now: 2 }],
    ["START_REVIEW before podium", [{ type: "START", now: 0 }], { type: "START_REVIEW", now: 1, itemCount: 3 }],
    ["SWAP_REVIEW_ITEM during a question", [{ type: "START", now: 0 }], { type: "SWAP_REVIEW_ITEM" }],
    ["RESUME when not paused", [], { type: "RESUME", now: 0 }],
    ["PAUSE twice", [{ type: "PAUSE", now: 0 }], { type: "PAUSE", now: 1 }],
    ["NEXT while paused", [{ type: "START", now: 0 }, { type: "PAUSE", now: 1 }], { type: "NEXT", now: 2 }],
    ["anything after END", [{ type: "END" }], { type: "START", now: 0 }],
    ["END after END", [{ type: "END" }], { type: "END" }],
  ];

  it.each(cases)("%s", (_label, setup, event) => {
    const before = run(setup);
    const snapshot = structuredClone(before);
    const result = transition(before, event, config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_transition");
      expect(result.error.event).toBe(event.type);
      expect(result.error.phase).toBe(before.phase);
    }
    expect(before).toEqual(snapshot); // input never mutated
  });

  it("rejects START_REVIEW without items as an invalid event", () => {
    const one = { ...config, questionCount: 1 };
    const atMap = run([{ type: "START", now: 0 }, ...playQuestion(0), { type: "NEXT", now: 1 }], one);
    const result = transition(atMap, { type: "START_REVIEW", now: 2, itemCount: 0 }, one);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_event");
  });
});

describe("top 5 cadence", () => {
  it("never shows top5 when top5Every is null unless the host asks", () => {
    const manual = { ...config, top5Every: null };
    const afterQ3 = run(
      [{ type: "START", now: 0 }, ...playQuestion(0), ...playQuestion(30_000), ...playQuestion(60_000)],
      manual,
    );
    expect(afterQ3.phase).toBe("question_open");
    expect(afterQ3.questionIndex).toBe(3);
  });

  it("lets the host open top5 from any reveal, including the last one", () => {
    const one = { ...config, questionCount: 1 };
    const top5 = run(
      [{ type: "START", now: 0 }, { type: "CLOSE", now: 1 }, { type: "REVEAL" }, { type: "SHOW_TOP5" }],
      one,
    );
    expect(top5.phase).toBe("top5");
    expect(run([{ type: "NEXT", now: 2 }], one, top5).phase).toBe("podium");
  });
});

describe("answer window, pause and resume", () => {
  it("opens answers only after the reading time", () => {
    const reading = { ...config, readMs: 4_000 };
    const state = run([{ type: "START", now: 1_000 }], reading);
    expect(state.window).toEqual({ opensAt: 5_000, closesAt: 25_000 });
    expect(isAcceptingAnswers(state, 4_999)).toBe(false);
    expect(isAcceptingAnswers(state, 5_000)).toBe(true);
    expect(isAcceptingAnswers(state, 25_000)).toBe(true);
    expect(isAcceptingAnswers(state, 25_001)).toBe(false);
  });

  it("records an early close as the actual close time", () => {
    const state = run([{ type: "START", now: 0 }, { type: "CLOSE", now: 8_000 }]);
    expect(state.window).toEqual({ opensAt: 0, closesAt: 8_000 });
    expect(isAcceptingAnswers(state, 1_000)).toBe(false);
  });

  it("freezes the timer while paused and returns to the same phase", () => {
    const paused = run([{ type: "START", now: 0 }, { type: "PAUSE", now: 5_000 }]);
    expect(paused.phase).toBe("paused");
    expect(isAcceptingAnswers(paused, 6_000)).toBe(false);

    const resumed = run([{ type: "RESUME", now: 15_000 }], config, paused);
    expect(resumed.phase).toBe("question_open");
    expect(resumed.pause).toBeNull();
    // 15 s were left before the pause, so the window now ends at 30 s.
    expect(resumed.window).toEqual({ opensAt: 10_000, closesAt: 30_000 });
  });

  it("does not move the window when paused outside an open question", () => {
    const reveal = run([{ type: "START", now: 0 }, { type: "CLOSE", now: 20_000 }, { type: "REVEAL" }]);
    const back = run([{ type: "PAUSE", now: 21_000 }, { type: "RESUME", now: 90_000 }], config, reveal);
    expect(back.phase).toBe("reveal");
    expect(back.window).toEqual(reveal.window);
  });

  it("allows END from pause", () => {
    expect(run([{ type: "START", now: 0 }, { type: "PAUSE", now: 1 }, { type: "END" }]).phase).toBe("ended");
  });
});

describe("config validation", () => {
  it.each([
    { questionCount: 0 },
    { questionCount: 1.5 },
    { timeLimitMs: 0 },
    { readMs: -1 },
    { top5Every: 0 },
  ])("rejects %o", (patch) => {
    expect(() => createSession({ ...config, ...patch })).toThrow(RangeError);
  });
});
