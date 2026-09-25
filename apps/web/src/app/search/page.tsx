import type { Metadata } from "next";
import { parseSearchQuery } from "@elections26/data";
import { Card } from "@/components/ui";
import { ResultList } from "@/components/search-results";
import { search } from "@/lib/search";

export const metadata: Metadata = { title: "חיפוש", robots: { index: false, follow: true } };

/** Server-rendered results: works without JavaScript, and a /search?q= link can be shared. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = parseSearchQuery(Array.isArray(raw) ? raw[0] : raw);
  const results = q ? await search(q) : [];

  return (
    <div className="space-y-4">
      <form action="/search" method="get" role="search" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? (typeof raw === "string" ? raw.slice(0, 40) : "")}
          maxLength={40}
          placeholder="שם מועמד/ת או רשימה"
          aria-label="חיפוש מועמד/ת או רשימה"
          className="min-w-0 flex-1 rounded-xl bg-ink-card px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
        />
        <button className="rounded-xl bg-accent px-4 text-sm font-medium text-white">חיפוש</button>
      </form>

      {q === undefined ? (
        raw ? <p className="text-sm text-ink-muted">אפשר לחפש לפי שם, 2 עד 40 תווים.</p> : null
      ) : results.length === 0 ? (
        <p className="text-sm text-ink-muted">לא נמצאו מועמדים או רשימות עבור "{q}".</p>
      ) : (
        <Card className="overflow-hidden">
          <ResultList results={results} />
        </Card>
      )}
    </div>
  );
}
