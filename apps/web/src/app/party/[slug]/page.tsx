import Link from "next/link";
import { notFound } from "next/navigation";
import { sourcesForField } from "@elections26/data";
import { BackLink, BandChip, Sources, StatusBadge, Stat } from "@/components/ui";
import { LIST_STATUS_HINT, formatDate, formatSeats, site } from "@/lib/site";

export function generateStaticParams() {
  return site().parties.map(({ party }) => ({ slug: party.slug }));
}

export default async function PartyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = site();
  const view = data.parties.find((p) => p.party.slug === slug);
  if (!view) notFound();

  const { party, list, leader, projection, candidates } = view;
  const { partialCoverage, coveredSeats } = data.projection;
  const statusSources = list
    ? sourcesForField(data, "candidateList", list.id, "status")
    : [];

  const safe = candidates.filter((c) => c.band === "safe").length;
  const borderline = candidates.filter((c) => c.band === "borderline").length;

  return (
    <div className="space-y-6">
      <BackLink href="/">חזרה לכל הרשימות</BackLink>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{party.nameHe}</h1>
          {list ? <StatusBadge status={list.status} /> : null}
        </div>
        {leader ? (
          <p className="mt-1 text-slate-600">
            בראשות{" "}
            <Link href={`/candidate/${leader.slug}`} className="hover:underline">
              {leader.nameHe}
            </Link>
          </p>
        ) : null}
        {list ? (
          <p className="mt-2 text-sm text-slate-500">
            {LIST_STATUS_HINT[list.status]}
            {list.submittedAt ? ` · הוגשה ב־${formatDate(list.submittedAt)}` : ""}
            {list.statusNote ? ` · ${list.statusNote}` : ""}{" "}
            <Sources sources={statusSources} />
          </p>
        ) : null}
      </header>

      {projection ? (
        <section className="grid gap-3 sm:grid-cols-4">
          <Stat
            label="תחזית מנדטים"
            value={projection.projectedSeats}
            hint={partialCoverage ? "מתוך המפלגות שנסקרו" : "לאחר נרמול ל-120"}
          />
          <Stat label="ממוצע הסקרים" value={formatSeats(projection.mean)} />
          <Stat label="טווח בסקרים" value={`${projection.min}–${projection.max}`} />
          <Stat
            label="מבוסס על"
            value={projection.pollCount}
            hint={projection.pollCount === 1 ? "סקר אחד" : "סקרים"}
          />
        </section>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          אין סקרים עדכניים המכסים רשימה זו, ולכן לא מוצגת תחזית.
        </p>
      )}

      {partialCoverage ? (
        <p className="rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-700">
          הסקרים שבמאגר מכסים כרגע{" "}
          <span className="ltr-nums">{Math.round(coveredSeats)}</span> מנדטים בלבד מתוך{" "}
          <span className="ltr-nums">120</span>. התחזית מוצגת ביחס למה שנמדד בפועל ולא
          מנורמלת לכנסת מלאה, כדי לא לנפח את המספרים.
        </p>
      ) : null}

      {projection && !projection.qualifies ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          לפי ממוצע הסקרים הנוכחי הרשימה נמצאת מתחת לאחוז החסימה. מקומות המסומנים כ״על
          הגבול״ נכנסו לכנסת רק בחלק מהסקרים.
        </p>
      ) : null}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900">הרשימה המלאה</h2>
          <p className="text-sm text-slate-500">
            <span className="ltr-nums">{safe}</span> צפויים להיכנס ·{" "}
            <span className="ltr-nums">{borderline}</span> על הגבול ·{" "}
            <span className="ltr-nums">{candidates.length - safe - borderline}</span> כרגע מחוץ לכנסת
          </p>
        </div>

        <p className="mt-1 text-sm text-slate-500">
          הסימון נגזר מהטווח שהסקרים עצמם נותנים לרשימה: עד מקום{" "}
          <span className="ltr-nums">{projection?.safeThrough ?? 0}</span> כל הסקרים מכניסים,
          ועד מקום <span className="ltr-nums">{projection?.borderlineThrough ?? 0}</span> חלקם
          מכניסים.
        </p>

        <ol className="mt-4 space-y-1">
          {candidates.map(({ candidacy, person, band, isCutLine }) => (
            <li key={candidacy.id}>
              {isCutLine ? (
                <div className="my-2 flex items-center gap-2" aria-hidden>
                  <div className="h-px flex-1 bg-slate-300" />
                  <span className="text-xs font-medium text-slate-500">
                    קו הכניסה לפי הסקרים
                  </span>
                  <div className="h-px flex-1 bg-slate-300" />
                </div>
              ) : null}

              <Link
                href={`/candidate/${person.slug}`}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition hover:border-slate-400 ${
                  band === "safe"
                    ? "border-safe-border/40 bg-safe-bg"
                    : band === "borderline"
                      ? "border-borderline-border/40 bg-borderline-bg"
                      : "border-out-border bg-out-bg"
                }`}
              >
                <span
                  className={`w-8 shrink-0 text-center text-sm font-bold ltr-nums ${
                    band === "safe"
                      ? "text-safe-text"
                      : band === "borderline"
                        ? "text-borderline-text"
                        : "text-out-text"
                  }`}
                >
                  {candidacy.position}
                </span>
                <span className="flex-1 font-medium text-slate-900">{person.nameHe}</span>
                <BandChip band={band} />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
