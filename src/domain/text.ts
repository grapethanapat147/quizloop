/**
 * Text normalization shared by the domain (names, question stems).
 */

// Soft hyphen, zero-width space/joiners, LRM/RLM, word joiner and friends, BOM.
const INVISIBLE = /[­​-‏⁠-⁤﻿]/g;
const CONTROL = /\p{Cc}/gu;

/** Display form: NFC, invisible characters removed, spaces collapsed, trimmed. */
export function cleanText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comparison form: NFKC also folds look-alikes such as Thai นิคหิต + สระอา
 * ("ํา") into สระอำ ("ำ") and full-width letters into ASCII.
 */
export function comparisonKey(raw: string): string {
  return cleanText(raw).normalize("NFKC").toLowerCase();
}

const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });

/** User-perceived length: a Thai consonant with its vowel and tone marks counts once. */
export function graphemeLength(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}
