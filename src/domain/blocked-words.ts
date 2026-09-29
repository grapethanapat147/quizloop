/**
 * Basic Thai/English blocklist for player names (docs/03 §3.2). Names are
 * shown on the classroom projector, so this errs on blocking; the teacher
 * can still remove any name in the lobby. Keep entries lower-case.
 */

/** Blocked anywhere in the name, even with spaces or dots in between. */
export const BLOCKED_SUBSTRINGS: readonly string[] = [
  // Thai
  "เหี้ย",
  "ควย",
  "เย็ด",
  "สัส",
  "ส้นตีน",
  "ดอกทอง",
  "อีดอก",
  "กะหรี่",
  "ระยำ",
  "จัญไร",
  "แม่ง",
  "เงี่ยน",
  "แตด",
  "มึง",
  "ไอ้สัตว์",
  "อีสัตว์",
  "หน้าหี",
  // English
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "nigger",
  "nigga",
  "whore",
  "slut",
  "pussy",
];

/**
 * Blocked only as a whole word, because they hide inside everyday words
 * (หีบ, สัดส่วน, class, cocktail).
 */
export const BLOCKED_WORDS: readonly string[] = ["หี", "สัด", "dick", "cock", "ass", "fag"];

/** Everyday words that contain a blocked substring; removed before matching. */
export const ALLOWED_SUBSTRINGS: readonly string[] = ["แม่งาน", "สัสดี", "ขมึง", "scunthorpe"];
