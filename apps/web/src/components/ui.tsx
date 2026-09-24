import Link from "next/link";
import type { Source } from "@elections26/schema";
import { BAND_LABEL, LIST_STATUS_HINT, LIST_STATUS_LABEL } from "@/lib/site";
import { initials, type PartyPhoto } from "@/lib/extras";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "disqualified" || status === "withdrawn"
        ? "bg-rose-500/15 text-rose-300"
        : "bg-ink-pill text-ink-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
      title={LIST_STATUS_HINT[status] ?? status}
    >
      {LIST_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const BAND_TONE = {
  safe: "bg-band-in",
  borderline: "bg-band-edge",
  out: "bg-band-out",
} as const;

export function BandDot({ band }: { band: "safe" | "borderline" | "out" }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${BAND_TONE[band]}`} title={BAND_LABEL[band]} />;
}

export function BandChip({ band }: { band: "safe" | "borderline" | "out" }) {
  const tone = {
    safe: "bg-band-in/15 text-band-in",
    borderline: "bg-band-edge/15 text-band-edge",
    out: "bg-ink-pill text-ink-muted",
  }[band];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{BAND_LABEL[band]}</span>;
}

/** Party-published photo, or the candidate's initials. Never a photo from any other source. */
export function Avatar({ name, photo, size = 36 }: { name: string; photo?: PartyPhoto; size?: number }) {
  const style = { width: size, height: size };
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.path}
        alt={name}
        title={photo.credit}
        style={style}
        className="shrink-0 rounded-full bg-ink-pill object-cover object-top"
        loading="lazy"
      />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: size * 0.36 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink-pill font-semibold text-ink-muted"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Pills({ items }: { items: { label: string; href: string; active?: boolean }[] }) {
  return (
    <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
            i.active ? "bg-accent text-white" : "bg-ink-pill text-ink-muted"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-2xl bg-ink-card ${className}`}>
      {children}
    </section>
  );
}

/**
 * Citation link. Every number the site prints should be one click from the document it
 * came from; where a fact has no retrievable source we say so rather than hiding it.
 */
export function Sources({ sources, label = "מקור" }: { sources: Source[]; label?: string }) {
  if (sources.length === 0) return <span className="text-[11px] text-ink-dim">ללא מקור מתועד</span>;
  return (
    <span className="text-[11px] text-ink-dim">
      {sources.map((source, index) => (
        <span key={source.id}>
          {index > 0 && " · "}
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline decoration-dotted underline-offset-2 hover:text-fg" title={source.title}>
              {label}
            </a>
          ) : (
            <span title={source.title}>
              {label}: {source.title}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

export function SourceLink({ href, children = "מקור" }: { href: string; children?: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-[11px] text-ink-dim underline decoration-dotted underline-offset-2 hover:text-fg">
      {children}
    </a>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  return (
    <div className="rounded-xl bg-ink-row p-3">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular ltr-nums">{value}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        {hint ? <span className="text-[11px] text-ink-dim">{hint}</span> : <span />}
        {href ? <SourceLink href={href} /> : null}
      </div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-ink-muted hover:text-fg">
      → {children}
    </Link>
  );
}
