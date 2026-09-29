// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanText, comparisonKey, graphemeLength } from "./text";

describe("text normalization", () => {
  it("removes zero-width characters and collapses whitespace", () => {
    expect(cleanText("  ต้น​‍กล้า \t\n ห้อง﻿๒  ")).toBe("ต้นกล้า ห้อง๒");
  });

  it("folds Thai nikhahit + sara aa into sara am for comparison", () => {
    expect(comparisonKey("นํา")).toBe(comparisonKey("นำ"));
  });

  it("lower-cases and folds full-width letters for comparison", () => {
    expect(comparisonKey("ＴＥＡＭ a")).toBe("team a");
  });

  it("counts a Thai consonant with vowel and tone marks as one", () => {
    expect(graphemeLength("ที่")).toBe(1);
    expect(graphemeLength("น้ำ")).toBe(1); // sara am is a spacing mark (UAX #29)
    expect(graphemeLength("เด็ก")).toBe(3);
    expect(graphemeLength("ครูแนน")).toBe(5);
    expect(graphemeLength("abc")).toBe(3);
  });
});
