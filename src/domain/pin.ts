/**
 * Six-digit game PIN (docs/05 P1). Uniqueness among live sessions is the
 * database's job (unique index + retry in P2); this module only makes and
 * reads PINs.
 */

export const PIN_LENGTH = 6;
const PIN_MIN = 100_000; // no leading zero, so numeric keypads never drop it
const PIN_SPAN = 900_000;

/** Returns an integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

/** Unbiased integer from Web Crypto (Node 22, browsers, edge runtimes). */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 32) {
    throw new RangeError("maxExclusive must be an integer in [1, 2^32]");
  }
  const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % maxExclusive;
  }
};

export function generatePin(randomInt: RandomInt = cryptoRandomInt): string {
  const n = randomInt(PIN_SPAN);
  if (!Number.isInteger(n) || n < 0 || n >= PIN_SPAN) {
    throw new RangeError("randomInt returned a value out of range");
  }
  return String(PIN_MIN + n);
}

const THAI_DIGIT_ZERO = 0x0e50; // ๐

/**
 * Normalize what a student typed: Thai digits (๐–๙) and full-width digits
 * become ASCII, and spaces or dashes are dropped.
 */
export function normalizePinInput(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - THAI_DIGIT_ZERO))
    .replace(/\D/g, "");
}

export function isValidPin(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin);
}
