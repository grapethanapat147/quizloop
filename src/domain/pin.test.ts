// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cryptoRandomInt, generatePin, isValidPin, normalizePinInput } from "./pin";

describe("generatePin", () => {
  it("maps the random range onto 100000–999999", () => {
    expect(generatePin(() => 0)).toBe("100000");
    expect(generatePin(() => 899_999)).toBe("999999");
  });

  it("always produces a valid 6-digit PIN with the default generator", () => {
    for (let i = 0; i < 2_000; i++) expect(isValidPin(generatePin())).toBe(true);
  });

  it("rejects a generator that goes out of range", () => {
    expect(() => generatePin(() => 900_000)).toThrow(RangeError);
    expect(() => generatePin(() => -1)).toThrow(RangeError);
    expect(() => generatePin(() => 1.5)).toThrow(RangeError);
  });
});

describe("cryptoRandomInt", () => {
  it("stays in [0, max)", () => {
    for (let i = 0; i < 2_000; i++) {
      const n = cryptoRandomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it.each([0, -1, 1.5, 2 ** 32 + 1])("rejects max %s", (max) => {
    expect(() => cryptoRandomInt(max)).toThrow(RangeError);
  });
});

describe("PIN input", () => {
  it.each([
    ["123456", "123456"],
    [" 123 456 ", "123456"],
    ["123-456", "123456"],
    ["๑๒๓๔๕๖", "123456"],
    ["๑๒๓ 456", "123456"],
    ["１２３４５６", "123456"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizePinInput(raw)).toBe(expected);
  });

  it.each([
    ["123456", true],
    ["999999", true],
    ["012345", false],
    ["12345", false],
    ["1234567", false],
    ["12a456", false],
    ["", false],
  ])("isValidPin(%j) = %s", (pin, valid) => {
    expect(isValidPin(pin)).toBe(valid);
  });
});
