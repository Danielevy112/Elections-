import Link from "next/link";
import type { SearchResult } from "@elections26/data";

/** Kept free of server-only imports: the search box renders these on the client too. */
export const BAND_TEXT = { safe: "צפוי להיכנס", borderline: "על הגבול", out: "כרגע מחוץ לכנסת" } as const;
const BAND_TONE = { safe: "bg-band-in", borderline: "bg-band-edge", out: "bg-band-out" } as const;

export function resultHref(r: SearchResult): string {
  return r.kind === "party" ? `/party/${r.slug}` : `/candidate/${r.slug}`;
}

export function ResultRow({ result, active = false }: { result: SearchResult; active?: boolean }) {
  return (
    <span className={`flex items-center justify-between gap-3 px-4 py-2.5 ${active ? "bg-ink-row" : ""}`}>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{result.name}</span>
        <span className="block truncate text-[11px] text-ink-dim">
          {result.kind === "party"
            ? "רשימה"
            : [result.partyName, result.position !== undefined ? `מקום ${result.position}` : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      {result.band ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-muted">
          <span className={`inline-block h-2 w-2 rounded-full ${BAND_TONE[result.band]}`} aria-hidden />
          {BAND_TEXT[result.band]}
        </span>
      ) : null}
    </span>
  );
}

export function ResultList({ results }: { results: SearchResult[] }) {
  return (
    <ol>
      {results.map((r) => (
        <li key={`${r.kind}:${r.slug}`} className="border-t border-ink-line/60 first:border-t-0">
          <Link href={resultHref(r)} className="block hover:bg-ink-row">
            <ResultRow result={r} />
          </Link>
        </li>
      ))}
    </ol>
  );
}
