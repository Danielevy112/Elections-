import { normalizeHebrewName } from "@elections26/schema";

// One normaliser for matching and for search; it lives in packages/schema so the site
// can use it without depending on the ingest pipeline.
export { normalizeHebrewName };

const TRANSLITERATION: Record<string, string> = {
  "ב": "b", "ג": "g", "ד": "d", "ז": "z", "ח": "ch",
  "ט": "t", "כ": "k", "ל": "l", "מ": "m", "נ": "n",
  "ס": "s", "פ": "p", "צ": "tz", "ק": "k", "ר": "r",
  "ש": "sh", "ת": "t",
};

/**
 * Letters whose sound depends on where they fall in the word. Unpointed Hebrew does not
 * write vowels, so a flat table renders "אופק" as "vpk"; these few positional rules are
 * what make a slug readable enough to recognise in a shared link.
 */
function transliterateLetter(char: string, index: number, length: number): string {
  const first = index === 0;
  const last = index === length - 1;

  switch (char) {
    case "א":
    case "ע":
      return first ? "a" : "";
    case "ו":
      return first ? "v" : "o";
    case "י":
      return last ? "i" : "y";
    case "ה":
      return last ? "a" : "h";
    default:
      break;
  }

  if (TRANSLITERATION[char] !== undefined) return TRANSLITERATION[char];
  if (/[a-z0-9]/.test(char)) return char;
  return "";
}

/**
 * URL slug for a Hebrew name. Routes have to be ASCII-safe, and a transliterated slug
 * stays readable and shareable where a percent-encoded Hebrew one does not.
 */
export function slugifyHebrew(name: string, fallback: string): string {
  const words = normalizeHebrewName(name)
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) =>
      [...word].map((char, i) => transliterateLetter(char, i, word.length)).join(""),
    )
    .filter((word) => word.length > 0);

  const slug = words.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : fallback;
}

/** Make a slug unique within a run by suffixing -2, -3, ... */
export function uniqueSlug(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }
  let n = 2;
  while (taken.has(`${candidate}-${n}`)) n += 1;
  const slug = `${candidate}-${n}`;
  taken.add(slug);
  return slug;
}

export interface MatchTarget {
  id: string;
  nameNormalized: string;
}

export type MatchOutcome =
  | { kind: "matched"; personId: string; via: "override" | "exact" }
  | { kind: "unmatched"; reason: "no-candidate" | "ambiguous"; candidates: string[] };

/**
 * Resolve a name from an external source to a known person.
 *
 * Deliberately has no fuzzy tier. Attaching one politician's voting record to another is
 * the worst failure this product can produce, so anything short of an exact or explicitly
 * mapped match is reported for a human instead of guessed.
 */
export function matchPerson(
  rawName: string,
  targets: MatchTarget[],
  overrides: Record<string, string> = {},
): MatchOutcome {
  const normalized = normalizeHebrewName(rawName);

  const override = overrides[rawName] ?? overrides[normalized];
  if (override) return { kind: "matched", personId: override, via: "override" };

  // One person can be a target under several name forms; count people, not forms.
  const hits = [...new Set(targets.filter((t) => t.nameNormalized === normalized).map((t) => t.id))];
  if (hits.length === 1) return { kind: "matched", personId: hits[0]!, via: "exact" };
  if (hits.length > 1) {
    return { kind: "unmatched", reason: "ambiguous", candidates: hits };
  }
  return { kind: "unmatched", reason: "no-candidate", candidates: [] };
}
