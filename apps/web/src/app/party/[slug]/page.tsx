import Link from "next/link";
import { notFound } from "next/navigation";
import { sourcesForField } from "@elections26/data";
import { Avatar, BackLink, BandDot, Card, Pills, Sources, StatusBadge } from "@/components/ui";
import { LIST_STATUS_HINT, formatDate, formatSeats, site } from "@/lib/site";
import { displayName, knessetProfile, partyPhoto, roleLabel, topRole } from "@/lib/extras";

export function generateStaticParams() {
  return site().parties.map(({ party }) => ({ slug: party.slug }));
}

const COLS = "grid-cols-[1.75rem_minmax(0,1fr)_2.5rem_3.25rem_2.5rem]";

export default async function PartyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = site();
  const view = data.parties.find((p) => p.party.slug === slug);
  if (!view) notFound();

  const { party, list, leader, projection, candidates } = view;
  const statusSources = list ? sourcesForField(data, "candidateList", list.id, "status") : [];
  const listSources = sourcesForField(data, "party", party.id, "nameHe");
  const leaderName = leader ? displayName(leader.nameHe, party.id, 1) : undefined;
  const withRecord = candidates.filter((c) => knessetProfile(c.person.nameHe)).length;

  return (
    <div className="space-y-4">
      <BackLink href="/">כל הרשימות</BackLink>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={leaderName ?? party.nameHe} photo={partyPhoto(party.id, 1)} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight">{party.nameHe}</h1>
            {leaderName ? <p className="text-sm text-ink-muted">בראשות {leaderName}</p> : null}
          </div>
          {projection ? (
            <div className="text-center">
              <div className="text-3xl font-bold tabular">{projection.qualifies ? projection.projectedSeats : 0}</div>
              <div className="text-[11px] text-ink-muted">מנדטים</div>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
          {list ? <StatusBadge status={list.status} /> : null}
          {projection ? (
            <span>
              ממוצע <span className="ltr-nums tabular">{formatSeats(projection.mean)}</span> · טווח{" "}
              <span className="ltr-nums tabular">
                {projection.min}–{projection.max}
              </span>{" "}
              · {projection.pollCount} סקרים
            </span>
          ) : (
            <span>לא נכללה בסקרים האחרונים</span>
          )}
        </div>
        {list?.statusNote ? (
          <p className="mt-2 text-[11px] text-ink-muted">
            {LIST_STATUS_HINT[list.status]} · {list.statusNote} <Sources sources={statusSources} />
          </p>
        ) : null}
      </Card>

      <Pills items={[{ label: "הרכב הרשימה", href: `/party/${party.slug}`, active: true }]} />

      <Card className="overflow-hidden">
        <div className={`grid ${COLS} items-end gap-x-1.5 border-b border-ink-line px-3 py-2 text-[10px] leading-tight text-ink-dim`}>
          <span>#</span>
          <span>מועמד · תפקיד בכיר</span>
          <span className="text-center">שנים בכנסת</span>
          <span className="text-center">חוקים שעברו/ הוגשו</span>
          <span className="text-center">שאילתות</span>
        </div>
        <ol>
          {candidates.map(({ candidacy, person, band, isCutLine }) => {
            const profile = knessetProfile(person.nameHe);
            const name = displayName(person.nameHe, party.id, candidacy.position);
            const role = topRole(profile);
            return (
              <li key={candidacy.id}>
                {isCutLine ? (
                  <div className="flex items-center gap-2 bg-ink-row px-3 py-1" aria-hidden>
                    <span className="h-px flex-1 bg-band-edge/50" />
                    <span className="text-[10px] font-medium text-band-edge">קו הכניסה לפי הסקרים</span>
                    <span className="h-px flex-1 bg-band-edge/50" />
                  </div>
                ) : null}
                <Link
                  href={`/candidate/${person.slug}`}
                  className={`grid ${COLS} items-center gap-x-1.5 border-b border-ink-line/50 px-3 py-2 hover:bg-ink-row ${band === "out" ? "opacity-70" : ""}`}
                >
                  <span className="flex items-center gap-1 text-xs text-ink-muted tabular">
                    <BandDot band={band} />
                    {candidacy.position}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={name} photo={partyPhoto(party.id, candidacy.position)} size={34} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{name}</span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {role ? roleLabel(role) : profile ? `חבר/ת כנסת` : "\u00a0"}
                      </span>
                    </span>
                  </span>
                  <span className="text-center text-sm font-bold tabular">{profile ? formatSeats(profile.yearsAsMk) : "–"}</span>
                  <span className="text-center text-xs tabular ltr-nums">
                    {profile ? (
                      <>
                        <span className="font-bold text-fg">{profile.billsPassed}</span>
                        <span className="text-ink-dim">/{profile.billsInitiated}</span>
                      </>
                    ) : (
                      <span className="text-ink-dim">–</span>
                    )}
                  </span>
                  <span className="text-center text-xs tabular text-ink-muted">{profile?.parliamentaryQuestions ?? "–"}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="px-3 py-3 text-[11px] leading-relaxed text-ink-dim">
          {withRecord} מתוך {candidates.length} המועמדים כיהנו בכנסת (שם זהה במאגר הכנסת). נתוני פעילות: המאגר
          הפרלמנטרי של הכנסת, כל כנסות העבר; מקור מפורט בכרטיס של כל מועמד. סדר הרשימה:{" "}
          <Sources sources={listSources} label="ערוץ כנסת, 9.9" />
          {list?.submittedAt ? ` · הוגשה ${formatDate(list.submittedAt)}` : ""}.{" "}
          <span className="inline-flex items-center gap-1"><BandDot band="safe" /> נכנס בכל הסקרים</span>{" "}
          <span className="inline-flex items-center gap-1"><BandDot band="borderline" /> בחלק מהסקרים</span>
        </div>
      </Card>
    </div>
  );
}
