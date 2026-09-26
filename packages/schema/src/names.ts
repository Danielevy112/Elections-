/**
 * Hebrew diacritics (niqqud and cantillation), minus U+05BE MAQAF. The maqaf sits inside
 * this block but is a word separator, not a mark: stripping it would weld "בן־גוריון"
 * into one token and stop it matching "בן גוריון".
 */
const NIQQUD = /[֑-ֽֿ-ׇ]/g;
/** Geresh, gershayim and the ASCII quotes people type instead. */
const QUOTES = /['"׳״‘’“”]/g;

const FINAL_LETTERS: Record<string, string> = {
  "ך": "כ", // ך -> כ
  "ם": "מ", // ם -> מ
  "ן": "נ", // ן -> נ
  "ף": "פ", // ף -> פ
  "ץ": "צ", // ץ -> צ
};

/**
 * Canonical form used to compare two Hebrew names.
 *
 * The Knesset and the Elections Committee write the same person differently: niqqud,
 * gershayim in abbreviations, final letters mid-name after a hyphen, double spaces. This
 * folds away exactly those differences and nothing else — it must never merge two people.
 */
export function normalizeHebrewName(input: string): string {
  const stripped = input
    .normalize("NFC")
    .replace(/[־\-–—]/g, " ")
    .replace(NIQQUD, "")
    .replace(QUOTES, "")
    .replace(/[.,()[\]]/g, " ");

  const folded = [...stripped]
    .map((char) => FINAL_LETTERS[char] ?? char)
    .join("");

  return folded.replace(/\s+/g, " ").trim().toLowerCase();
}
