/**
 * Possible Knesset links that exact matching misses, for a person to review.
 *
 *   npx tsx scripts/link-candidates.ts
 *
 * The filed lists often carry a second given name ("הרוש גיטי ענבל") where the Knesset
 * prints first + last only. Exact matching rightly refuses those, and they are never
 * linked automatically. This lists, for every candidate with no link, each Knesset person
 * whose first and last name both appear among the filed name's words, so a reviewer can
 * confirm one by adding it to knesset_links.json with a reason.
 *
 * Reads only committed files: the snapshot, and the KNS_Person pages the sync recorded.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot, repoRoot } from "@elections26/data";
import { normalizeHebrewName, stableJson } from "@elections26/ingest";

const root = repoRoot();
const fixtures = join(root, "data", "fixtures");

interface KnessetPerson {
  id: number;
  first: string;
  last: string;
}

function knessetPersons(): KnessetPerson[] {
  const out = new Map<number, KnessetPerson>();
  for (const file of readdirSync(fixtures).filter((f) => /svc-kns-person\.[0-9a-f]+\.json$/.test(f))) {
    const page = JSON.parse(readFileSync(join(fixtures, file), "utf8")) as { value?: Record<string, unknown>[] };
    for (const row of page.value ?? []) {
      const id = Number(row.PersonID);
      if (Number.isInteger(id) && typeof row.FirstName === "string" && typeof row.LastName === "string") {
        out.set(id, { id, first: row.FirstName, last: row.LastName });
      }
    }
  }
  return [...out.values()];
}

const words = (s: string) => normalizeHebrewName(s).split(" ").filter(Boolean);

/** Where `needle` occurs as consecutive words in `hay`, or -1. */
function indexOfRun(hay: string[], needle: string[]): number {
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    if (needle.every((w, j) => hay[i + j] === w)) return i;
  }
  return -1;
}

/**
 * The filed lists write "surname given-names…". A Knesset person fits when their surname
 * opens the filed name (allowing one extra surname word before it, for a double surname
 * such as "בדרה גולן") and their first name follows it, whole.
 */
function fits(filed: string[], first: string[], last: string[]): boolean {
  const at = indexOfRun(filed, last);
  if (at < 0 || at > 1) return false;
  return indexOfRun(filed.slice(at + last.length), first) >= 0;
}

function recentKnessetIds(): Set<number> {
  const ids = new Set<number>();
  for (const file of readdirSync(fixtures).filter((f) => /svc-kns-persontoposition\.[0-9a-f]+\.json$/.test(f))) {
    const page = JSON.parse(readFileSync(join(fixtures, file), "utf8")) as { value?: Record<string, unknown>[] };
    for (const row of page.value ?? []) if (Number(row.KnessetNum) >= 24) ids.add(Number(row.PersonID));
  }
  return ids;
}
const snapshot = loadSnapshot(undefined, { omit: ["bills", "bill_initiators", "claims"] });
const persons = new Map(snapshot.persons.map((p) => [p.id, p]));
const profiles = JSON.parse(readFileSync(join(root, "data", "manual_overrides", "knesset_profiles.json"), "utf8")).profiles as Record<
  string,
  { knessetPersonId: number; knessetTerms: number[] }
>;
const termsById = new Map(Object.values(profiles).map((p) => [p.knessetPersonId, p.knessetTerms]));

const pool = knessetPersons().map((p) => ({ ...p, firstWords: words(p.first), lastWords: words(p.last) }));
const recent = recentKnessetIds();
const linkedIds = new Set(snapshot.persons.flatMap((p) => (p.knessetPersonId !== undefined ? [p.knessetPersonId] : [])));

const rows = [];
for (const candidacy of snapshot.candidacies) {
  const person = persons.get(candidacy.personId)!;
  if (person.knessetPersonId !== undefined) continue;
  const filed = words(person.nameHe);
  if (filed.length < 3) continue; // two-word names were already tried exactly
  const hits = pool.filter((k) => !linkedIds.has(k.id) && fits(filed, k.firstWords, k.lastWords));
  if (hits.length === 0) continue;
  const [, partyKey] = /:(k26-\d+)$/.exec(candidacy.listId) ?? [];
  rows.push({
    partyKey,
    position: candidacy.position,
    nameHe: person.nameHe,
    possible: hits.map((k) => ({
      knessetPersonId: k.id,
      nameKnesset: `${k.first} ${k.last}`,
      knessetTerms: termsById.get(k.id) ?? null,
      servedInKnesset24or25: recent.has(k.id),
      profile: `https://knesset.gov.il/OdataV4/ParliamentInfo/KNS_PersonToPosition?$filter=PersonID%20eq%20${k.id}`,
    })),
    note: hits.length > 1 ? "more than one Knesset person fits; do not link without a source that tells them apart" : undefined,
  });
}

rows.sort((a, b) => (a.partyKey ?? "").localeCompare(b.partyKey ?? "") || a.position - b.position);
const out = join(root, "data", "review", "knesset_link_candidates.json");
mkdirSync(join(root, "data", "review"), { recursive: true });
writeFileSync(
  out,
  stableJson({
    note: "Possible links only. Nothing here is shown on the site. To confirm one, add it to data/manual_overrides/knesset_links.json with a reason a person could check.",
    candidates: rows,
  }),
  "utf8",
);
console.log(`${rows.length} candidate(s) with a possible Knesset link → ${out}`);
