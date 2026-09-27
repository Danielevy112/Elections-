import { normalizeHebrewName } from "@elections26/schema";
import type { SeatBand } from "./projection";

/**
 * Candidate and list search. One ranking, used by the API route, the /search page and the
 * tests, so what a shared /search?q= link shows is exactly what the search box showed.
 *
 * The index holds only public fields. Names are matched word by word on prefixes, in any
 * order: the filed lists write "בנט נפתלי", people type "נפתלי בנט".
 */
export interface SearchResult {
  kind: "candidate" | "party";
  slug: string;
  /** Name as shown on the site. */
  name: string;
  /** The candidate's name exactly as filed, when it differs from `name`. */
  filedName?: string;
  partyName?: string;
  position?: number;
  band?: SeatBand;
}

interface Entry extends SearchResult {
  words: string[];
}

export type SearchIndex = Entry[];

export function buildSearchIndex(
  rows: (SearchResult & { alsoKnownAs?: string[] })[],
): SearchIndex {
  return rows.map(({ alsoKnownAs = [], ...row }) => {
    const words = [row.name, row.filedName ?? "", ...alsoKnownAs].flatMap(tokens);
    // List names carry the definite article ("הליכוד", "הדמוקרטים"); people type
    // "ליכוד". Index those words without it too. Person names are left exact.
    if (row.kind === "party") words.push(...words.filter((w) => w.startsWith("ה") && w.length > 3).map((w) => w.slice(1)));
    return { ...row, words: [...new Set(words)] };
  });
}

function tokens(s: string): string[] {
  return normalizeHebrewName(s).split(" ").filter(Boolean);
}

export const QUERY_LIMITS = { minLength: 2, maxLength: 40, maxResults: 20 } as const;

/** Letters (any script), digits, spaces and the punctuation found in Hebrew names. */
const ALLOWED = /^[\p{L}\p{M}\p{N}\s'"׳״\-־–.]+$/u;

/**
 * Validate a raw query. Returns the trimmed query, or undefined for anything too short,
 * too long, or containing characters no name has — the caller answers 400.
 */
export function parseSearchQuery(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const q = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (q.length < QUERY_LIMITS.minLength || q.length > QUERY_LIMITS.maxLength) return undefined;
  if (!ALLOWED.test(q)) return undefined;
  if (tokens(q).length === 0) return undefined;
  return q;
}

const BAND_RANK: Record<string, number> = { safe: 0, borderline: 1, out: 2 };

/**
 * Tier 0: every query word is a whole word of the name, and nothing is left over.
 * Tier 1: every query word is a whole word. Tier 2: every query word starts a word.
 * Each query word must use a different word of the name. Lists rank above candidates in
 * the same tier; then candidates in projected seats first, then by list position.
 */
export function searchIndex(index: SearchIndex, query: string, limit: number = QUERY_LIMITS.maxResults): SearchResult[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const scored: { entry: Entry; tier: number }[] = [];
  for (const entry of index) {
    const tier = matchTier(q, entry.words);
    if (tier !== undefined) scored.push({ entry, tier });
  }
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.entry.kind === "party" ? 0 : 1) - (b.entry.kind === "party" ? 0 : 1) ||
      (BAND_RANK[a.entry.band ?? ""] ?? 3) - (BAND_RANK[b.entry.band ?? ""] ?? 3) ||
      (a.entry.position ?? 999) - (b.entry.position ?? 999) ||
      a.entry.name.localeCompare(b.entry.name, "he"),
  );
  return scored.slice(0, Math.min(limit, QUERY_LIMITS.maxResults)).map(({ entry: { words: _words, ...result } }) => result);
}

function matchTier(query: string[], words: string[]): number | undefined {
  const used = new Set<number>();
  let allWhole = true;
  for (const token of query) {
    // Prefer a whole-word hit, so "כץ" takes "כץ" and not "כצנלסון".
    let at = words.findIndex((w, i) => !used.has(i) && w === token);
    if (at < 0) {
      at = words.findIndex((w, i) => !used.has(i) && w.startsWith(token));
      allWhole = false;
    }
    if (at < 0) return undefined;
    used.add(at);
  }
  if (!allWhole) return 2;
  return used.size === words.length ? 0 : 1;
}
