/**
 * Player nickname / group-name checks (docs/05 P1, docs/03 §3.2).
 * Names are the only player identity we keep (Non-negotiable 1).
 */
import { ALLOWED_SUBSTRINGS, BLOCKED_SUBSTRINGS, BLOCKED_WORDS } from "./blocked-words";
import { cleanText, comparisonKey, graphemeLength } from "./text";

export interface NameRules {
  /** Max length in user-perceived characters (graphemes). */
  maxLength: number;
}

export const NAME_RULES: NameRules = { maxLength: 20 };

export type NameRejection = "empty" | "too_long" | "blocked" | "duplicate";

export type NameCheck =
  | { ok: true; name: string; key: string }
  | { ok: false; reason: NameRejection };

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
};
const SEPARATORS = /[\s\p{P}\p{S}_]+/gu;

function deLeet(text: string): string {
  return text.replace(/[01!|3457@$]/g, (ch) => LEET[ch]);
}

/** True when the name contains a blocked word, even with separators or leetspeak. */
export function containsBlockedWord(name: string): boolean {
  const key = comparisonKey(name);
  const variants = [key, deLeet(key)];

  for (const variant of variants) {
    const squashed = variant.replace(SEPARATORS, "");
    const scrubbed = ALLOWED_SUBSTRINGS.reduce((text, ok) => text.replaceAll(ok, " "), squashed);
    if (BLOCKED_SUBSTRINGS.some((w) => scrubbed.includes(w))) return true;

    const words = variant.split(SEPARATORS).filter(Boolean);
    if (words.some((w) => BLOCKED_WORDS.includes(w))) return true;
    if (BLOCKED_WORDS.includes(squashed)) return true;
  }
  return false;
}

/** Stable key for duplicate checks: case-insensitive, NFKC, spaces collapsed. */
export function nameKey(name: string): string {
  return comparisonKey(name);
}

/**
 * Validate a nickname or group name against names already in the session.
 * Pass every name the session has seen, including removed players, so a
 * removed name cannot come straight back.
 */
export function checkDisplayName(
  raw: string,
  takenNames: Iterable<string>,
  rules: NameRules = NAME_RULES,
): NameCheck {
  const name = cleanText(raw);
  if (name.length === 0) return { ok: false, reason: "empty" };
  if (graphemeLength(name) > rules.maxLength) return { ok: false, reason: "too_long" };
  if (containsBlockedWord(name)) return { ok: false, reason: "blocked" };

  const key = nameKey(name);
  for (const taken of takenNames) {
    if (nameKey(taken) === key) return { ok: false, reason: "duplicate" };
  }
  return { ok: true, name, key };
}
