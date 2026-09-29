// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkDisplayName, containsBlockedWord, nameKey } from "./names";

const reason = (raw: string, taken: string[] = []) => {
  const result = checkDisplayName(raw, taken);
  return result.ok ? "ok" : result.reason;
};

describe("D10 — empty names", () => {
  it.each(["", "   ", "​‍﻿", "\t\n"])("rejects %j", (raw) => {
    expect(reason(raw)).toBe("empty");
  });
});

describe("D10 — length", () => {
  it("allows 20 characters and rejects 21", () => {
    expect(reason("a".repeat(20))).toBe("ok");
    expect(reason("a".repeat(21))).toBe("too_long");
  });

  it("counts a Thai syllable with marks as one character", () => {
    expect(reason("ที่".repeat(20))).toBe("ok"); // 60 code points, 20 graphemes
    expect(reason("ที่".repeat(21))).toBe("too_long");
  });
});

describe("D10 — duplicates", () => {
  it.each([
    ["Ton", ["ton"]],
    ["  TON  ", ["Ton"]],
    ["To​n", ["Ton"]],
    ["ทีม  ส้ม", ["ทีม ส้ม"]],
    ["นํา", ["นำ"]], // ํา vs ำ look identical on screen
    ["ＴＯＮ", ["ton"]],
  ])("rejects %j when %j is taken", (raw, taken) => {
    expect(reason(raw, taken)).toBe("duplicate");
  });

  it("allows a different name", () => {
    expect(reason("ต้นกล้า", ["ต้นข้าว", "Ton"])).toBe("ok");
  });

  it("keeps the cleaned display name and returns its key", () => {
    expect(checkDisplayName("  ทีม​   ส้ม ", [])).toEqual({ ok: true, name: "ทีม ส้ม", key: "ทีม ส้ม" });
    expect(nameKey("Team A")).toBe("team a");
  });
});

describe("D10 — impolite words (basic Thai/English)", () => {
  it.each([
    "ทีมเหี้ย",
    "ค ว ย",
    "ค.ว.ย",
    "มึงอะ",
    "หี",
    "ห-ี",
    "ไอ้สัส",
    "FUCK",
    "f.u.c.k",
    "sh1t",
    "B!tch",
    "sh|t",
    "a55",
    "Dick",
    "big ass",
  ])("blocks %j", (raw) => {
    expect(reason(raw)).toBe("blocked");
    expect(containsBlockedWord(raw)).toBe(true);
  });

  it.each(["หีบสมบัติ", "สัดส่วน", "ทีมแม่งาน", "class 5", "Dickens", "cocktail", "กูเกิล", "ครูแนน", "ทีม 4", "Scunthorpe", "ห้อง 2/1!"])(
    "allows everyday name %j",
    (raw) => {
      expect(reason(raw)).toBe("ok");
    },
  );

  it("checks words before duplicates", () => {
    expect(reason("fuck", ["fuck"])).toBe("blocked");
  });
});
