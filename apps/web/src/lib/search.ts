import { buildSearchIndex, searchIndex, type SearchIndex, type SearchResult } from "@elections26/data";
import { displayName } from "./extras";
import { site } from "./site";

let built: { key: string; index: SearchIndex } | undefined;

/**
 * Search over the published data version the rest of the site reads. The index is built
 * once per data version per server instance (1,384 candidates and 38 lists, a few hundred
 * KB), and answers are cached on the CDN by query, so the data layer is not hit per
 * keystroke.
 */
export async function search(query: string, limit?: number): Promise<SearchResult[]> {
  const data = await site();
  const key = `${data.snapshot.meta.generatedAt}:${data.candidates.length}`;
  if (built?.key !== key) {
    const rows = [
      ...data.parties.map((view) => ({
        kind: "party" as const,
        slug: view.party.slug,
        name: view.party.nameHe,
        ...(view.party.shortNameHe ? { alsoKnownAs: [view.party.shortNameHe] } : {}),
      })),
      ...data.candidates.map((c) => {
        const name = displayName(c.person.nameHe, c.party?.id, c.position);
        return {
          kind: "candidate" as const,
          slug: c.person.slug,
          name,
          ...(name !== c.person.nameHe ? { filedName: c.person.nameHe } : {}),
          ...(c.party ? { partyName: c.party.shortNameHe ?? c.party.nameHe } : {}),
          ...(c.position !== undefined ? { position: c.position } : {}),
          ...(c.band ? { band: c.band } : {}),
        };
      }),
    ];
    built = { key, index: buildSearchIndex(rows) };
  }
  return searchIndex(built.index, query, limit);
}
