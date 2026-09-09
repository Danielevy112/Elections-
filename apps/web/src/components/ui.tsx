import Link from "next/link";
import type { Source } from "@elections26/schema";
import { BAND_LABEL, LIST_STATUS_HINT, LIST_STATUS_LABEL } from "@/lib/site";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-300"
      : status === "disqualified" || status === "withdrawn"
        ? "bg-rose-100 text-rose-900 ring-rose-300"
        : "bg-amber-100 text-amber-900 ring-amber-300";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone}`}
      title={LIST_STATUS_HINT[status] ?? status}
    >
      {LIST_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function BandChip({ band }: { band: "safe" | "borderline" | "out" }) {
  const tone = {
    safe: "bg-safe-bg text-safe-text ring-safe-border",
    borderline: "bg-borderline-bg text-borderline-text ring-borderline-border",
    out: "bg-out-bg text-out-text ring-out-border",
  }[band];

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ${tone}`}>
      {BAND_LABEL[band]}
    </span>
  );
}

/**
 * Citation link. Every number the site prints should be one click from the document it
 * came from; where a fact has no retrievable source we say so rather than hiding it.
 */
export function Sources({ sources, label = "מקור" }: { sources: Source[]; label?: string }) {
  if (sources.length === 0) {
    return <span className="text-xs text-slate-400">ללא מקור מתועד</span>;
  }
  return (
    <span className="text-xs text-slate-500">
      {sources.map((source, index) => (
        <span key={source.id}>
          {index > 0 && " · "}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-dotted underline-offset-2 hover:text-slate-800"
              title={source.title}
            >
              {label}
            </a>
          ) : (
            <span title={source.title}>{label}: {source.title}</span>
          )}
        </span>
      ))}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-slate-900 ltr-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-slate-500 hover:text-slate-800">
      ← {children}
    </Link>
  );
}
