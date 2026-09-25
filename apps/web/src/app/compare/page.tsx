import Link from "next/link";
import type { Metadata } from "next";
import { Avatar, BackLink, Card, Pills, SourceLink } from "@/components/ui";
import { formatSeats, site } from "@/lib/site";
import { attendance, displayName, knessetProfile, partyPhoto, roleLabel, topRole } from "@/lib/extras";
import type { PartyView } from "@elections26/data";

export const revalidate = 3600;
export const metadata: Metadata = { title: "השוואת רשימות" };

const OD = "https://knesset.gov.il/OdataV4/ParliamentInfo/";

/** Totals for the candidates inside a list's projected seats, from the per-candidate records. */
function summary(view: PartyView) {
  const seats = view.projection?.qualifies ? view.projection.projectedSeats : 0;
  const profiles = view.candidates.slice(0, seats).map((c) => knessetProfile(c.person.nameHe));
  const served = profiles.filter((p) => p !== undefined);
  const recs = served.map((p) => p.record?.total).filter((a) => a !== undefined);
  const complete = served.length === recs.length;
  const eligibleVotes = recs.reduce((s, x) => s + x.votesHeld, 0);
  const sourceLists = view.candidates.slice(0,seats).filter((c) => knessetProfile(c.person.nameHe)).map((c) => knessetProfile(c.person.nameHe)!);
  return {
    seats,
    served: served.length,
    years: Math.round(served.reduce((s, p) => s + p.yearsAsMk, 0)),
    withRecord: recs.length,
    sourceLists,
    attendance: complete && eligibleVotes > 0 ? Math.round(100 * recs.reduce((s, x) => s + x.votesPresent, 0) / eligibleVotes) : undefined,
    billsPassed: complete ? recs.reduce((s, a) => s + a.billsPassed, 0) : undefined,
    questions: complete ? recs.reduce((s, a) => s + a.questions, 0) : undefined,
    motions: complete ? recs.reduce((s, a) => s + a.agendaMotions, 0) : undefined,
  };
}

/** One head-to-head metric: big number each side, a split bar, the unit under the numbers. */
function H2H({ label, unit, a, b, format = (n: number) => String(n) }: { label: string; unit: string; a?: number; b?: number; format?: (n: number) => string }) {
  const known = a !== undefined && b !== undefined;
  const total = known ? a + b : 0;
  const share = known && total > 0 ? (a / total) * 100 : 50;
  const lead = !known || a === b ? 0 : a > b ? 1 : -1;
  const num = (v: number | undefined, win: boolean) => (
    <div className="text-center">
      <div className={`text-2xl font-bold leading-none tabular ${v === undefined ? "text-ink-dim" : win ? "text-fg" : "text-ink-muted"}`}>
        {v === undefined ? "–" : format(v)}
      </div>
      <div className="mt-1 text-[10px] text-ink-dim">{v === undefined ? "אין נתון" : unit}</div>
    </div>
  );
  return (
    <div className="border-t border-ink-line/60 px-4 py-3">
      <div className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center">
        {num(a, lead === 1)}
        <div className="px-2 text-center text-[12px] font-medium text-ink-muted">{label}</div>
        {num(b, lead === -1)}
      </div>
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {known && total > 0 ? (
          <>
            <span className={`rounded-full bg-accent ${lead === -1 ? "opacity-40" : ""}`} style={{ width: `${share}%` }} />
            <span className={`rounded-full bg-band-edge ${lead === 1 ? "opacity-40" : ""}`} style={{ width: `${100 - share}%` }} />
          </>
        ) : (
          <span className="w-full rounded-full bg-ink-pill" />
        )}
      </div>
    </div>
  );
}

function PartyPicker({ name, value, parties, color }: { name: string; value: string; parties: PartyView[]; color: string }) {
  return (
    <select name={name} defaultValue={value} className={`w-full min-w-0 rounded-xl border-b-2 bg-ink-row px-2 py-2 text-[13px] font-semibold text-fg ${color}`}>
      {parties.map(({ party }) => (
        <option key={party.slug} value={party.slug}>
          {party.nameHe}
        </option>
      ))}
    </select>
  );
}

/** Collapsed: full name and one number (years in the Knesset). */
function Slot({ view, i, side }: { view: PartyView; i: number; side: "a" | "b" }) {
  const c = view.candidates[i];
  if (!c) return <div className="flex-1" />;
  const profile = knessetProfile(c.person.nameHe);
  const name = displayName(c.person.nameHe, view.party.id, c.candidacy.position);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${side === "b" ? "flex-row-reverse text-left" : ""}`}>
      <Avatar name={name} photo={partyPhoto(view.party.id, c.candidacy.position)} size={30} />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-tight">{name}</div>
        <div className="text-[11px] text-ink-muted">
          {profile ? (
            <><span className="font-bold text-fg tabular">{formatSeats(profile.yearsAsMk)}</span> שנים בכנסת <SourceLink href={profile.sources.positions}>מקור</SourceLink></>
          ) : (
            "אין רקורד כנסת מקושר"
          )}
        </div>
      </div>
    </div>
  );
}

/** Expanded: the candidate's record, each figure with its unit and source. */
function Detail({ view, i }: { view: PartyView; i: number }) {
  const c = view.candidates[i];
  if (!c) return <div className="flex-1" />;
  const profile = knessetProfile(c.person.nameHe);
  const role = topRole(profile);
  const a = profile?.record;
  const att = attendance(a?.total);
  const last = a ? Object.keys(a.terms).sort((x, y) => Number(y) - Number(x))[0] : undefined;
  const src = last ? a!.terms[last]! : undefined;
  const pid = profile?.knessetPersonId;
  const all = pid ? `${OD}KNS_PersonToPosition?$filter=PersonID%20eq%20${pid}%20and%20KnessetNum%20ge%2020%20and%20KnessetNum%20le%2025` : undefined;
  const link = (table: string, filter: string) => `${OD}${table}?$filter=${encodeURIComponent(filter)}`;
  const billSource = pid ? link("KNS_BillInitiator", `PersonID eq ${pid} and IsInitiator eq true`) : undefined;
  const questionSource = pid ? link("KNS_Query", `PersonID eq ${pid} and KnessetNum ge 20 and KnessetNum le 25`) : undefined;
  const agendaSource = pid ? link("KNS_Agenda", `InitiatorPersonID eq ${pid} and KnessetNum ge 20 and KnessetNum le 25`) : undefined;
  const voteSource = pid ? link("KNS_PlenumVoteResult", `MkId eq ${pid} and VoteDate ge 2015-03-31T00:00:00+02:00 and VoteDate lt 2026-10-27T00:00:00+02:00`) : undefined;
  const line = (k: string, v: React.ReactNode, href?: string) => (
    <li className="flex items-baseline justify-between gap-2">
      <span className="text-ink-dim">{k}</span>
      <span className="tabular">
        {v}
        {href ? <> <SourceLink href={href}>מקור</SourceLink></> : null}
      </span>
    </li>
  );
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-ink-row p-2.5 text-[11px]">
      {profile ? (
        <ul className="space-y-1">
          {role ? <li className="pb-0.5 text-[12px] font-medium text-fg">{roleLabel(role)} <SourceLink href={`${OD}KNS_PersonToPosition?$filter=PersonID%20eq%20${pid}`}>מקור</SourceLink></li> : null}
          {a && src ? <>
            {att !== undefined ? line("השתתפות בהצבעות", `${att}%`, voteSource) : null}
            {line("חוקים שעברו", `${a.total.billsPassed} מתוך ${a.total.billsInitiated}`, billSource)}
            {line("שאילתות", a.total.questions, questionSource)}
            {line("הצעות לסדר", a.total.agendaMotions, agendaSource)}
            <li className="text-[10px] text-ink-dim">2015-2026 · הכנסות {Object.keys(a.terms).join(", ")} {all ? <SourceLink href={all}>מקור</SourceLink> : null}</li>
          </> : <li className="text-ink-muted">אין נתוני פעילות מ-2015 ואילך</li>}
        </ul>
      ) : (
        <p className="text-ink-muted">אין רקורד כנסת מקושר</p>
      )}
      <Link href={`/candidate/${c.person.slug}`} className="mt-2 block text-[11px] font-medium text-accent">
        לדף המועמד/ת ←
      </Link>
    </div>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const q = await searchParams;
  const data = await site();
  const { parties } = data;
  const pollLinks = [...new Set(data.projection?.polls.map((p) => p.sourceUrl).filter((u): u is string => !!u) ?? [])];
  const ranked = [...parties].sort(
    (x, y) => (y.projection?.projectedSeats ?? -1) - (x.projection?.projectedSeats ?? -1) || x.party.nameHe.localeCompare(y.party.nameHe, "he"),
  );
  const A = (ranked.find((p) => p.party.slug === q.a) ?? ranked[0])!;
  const B = (ranked.find((p) => p.party.slug === q.b && p !== A) ?? ranked.find((p) => p !== A))!;
  const sa = summary(A);
  const sb = summary(B);
  const rows = Math.max(A.candidates.length, B.candidates.length);
  const partyVotes = (v: PartyView) => v.candidates.flatMap((c) => knessetProfile(c.person.nameHe)?.keyVotes?.filter((vote) => vote.party === v.party.id.replace(/^party:/, "")) ?? []);
  const cut = Math.max(sa.seats, sb.seats);
  const logo = (v: PartyView) => (
    <Link href={`/party/${v.party.slug}`} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Avatar name={v.leader ? displayName(v.leader.nameHe, v.party.id, 1) : v.party.nameHe} photo={partyPhoto(v.party.id, 1)} size={52} />
      <span className="text-[13px] font-bold leading-tight">{v.party.nameHe}</span>
    </Link>
  );

  return (
    <div className="space-y-4">
      <BackLink href="/">כל הרשימות</BackLink>
      <Pills items={[{ label: "טבלת מנדטים", href: "/" }, { label: "השוואת רשימות", href: "/compare", active: true }]} />

      <Card className="p-3">
        <form action="/compare" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <PartyPicker name="a" value={A.party.slug} parties={ranked} color="border-accent" />
          <span className="text-xs text-ink-dim">מול</span>
          <PartyPicker name="b" value={B.party.slug} parties={ranked} color="border-band-edge" />
          <button type="submit" className="col-span-3 rounded-full bg-ink-pill py-2 text-sm font-medium text-fg">
            השווה
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 bg-gradient-to-b from-ink-hero to-ink-card px-4 pb-3 pt-4">
          {logo(A)}
          <div className="pt-4 text-center">
            <div className="text-xl font-bold tabular">
              {sa.seats} <span className="text-ink-dim">-</span> {sb.seats}
            </div>
            <div className="text-[10px] text-ink-dim">הערכת מנדטים מסקרים</div>
          </div>
          {logo(B)}
        </div>
        <div className="px-4 pb-1 text-center text-[11px] text-ink-dim">המועמדים בתוך המנדטים של כל רשימה · מקורות הסקרים: {pollLinks.map((url, i) => <span key={url}>{i ? " · " : ""}<SourceLink href={url}>{i + 1}</SourceLink></span>)}</div>
        <H2H label="כיהנו בכנסת" unit="מועמדים" a={sa.served} b={sb.served} />
        <H2H label="ותק מצטבר בכנסת" unit="שנים" a={sa.years} b={sb.years} />
        <H2H label="השתתפות בהצבעות" unit="ממוצע, 2015-2026" a={sa.attendance} b={sb.attendance} format={(n) => `${n}%`} />
        <H2H label="חוקים שעברו" unit="2015-2026" a={sa.billsPassed} b={sb.billsPassed} />
        <H2H label="שאילתות" unit="2015-2026" a={sa.questions} b={sb.questions} />
        <H2H label="הצעות לסדר היום" unit="2015-2026" a={sa.motions} b={sb.motions} />
        <details className="border-t border-ink-line/60 px-4 py-2.5 text-[11px] text-ink-dim">
          <summary className="cursor-pointer">מקורות לכל נתון בסיכומים ↗</summary>
          {[{label:A.party.nameHe, sum:sa},{label:B.party.nameHe,sum:sb}].map(({label,sum}) => <div key={label} className="mt-2"><b>{label}</b><ul className="space-y-1">{sum.sourceLists.map((p) => <li key={p.knessetPersonId}>
            <SourceLink href={p.sources.positions}>{p.nameKnesset ?? p.knessetPersonId}: שנות כהונה ↗</SourceLink>
            {p.record ? <> · <SourceLink href={`${OD}KNS_PlenumVoteResult?$filter=MkId%20eq%20${p.knessetPersonId}`}>הצבעות ↗</SourceLink> · <SourceLink href={p.sources.bills}>חוקים ↗</SourceLink> · <SourceLink href={p.sources.questions}>שאילתות ↗</SourceLink></> : null}
          </li>)}</ul></div>)}
        </details>
        <div className="border-t border-ink-line/60 px-4 py-2.5 text-[11px] text-ink-dim">
          הסיכומים מחושבים מהמועמדים בטווח המנדטים לעיל; השתתפות בהצבעות היא סך ההצבעות המתועדות חלקי סך ההצבעות הזמינות בתקופות כהונתם. לחצו על שורה כדי לראות מקור פרטני לכל נתון.
        </div>
      </Card>

      {(partyVotes(A).length || partyVotes(B).length) ? (
        <Card className="overflow-hidden p-4">
          <h2 className="text-sm font-bold">הצבעות מפתח מול המצע</h2>
          <p className="mt-1 text-[10px] leading-4 text-ink-dim">מבחר הצבעות מתועדות בלבד; אין סיקור מלא לכל המפלגות. ההשוואה למצע הרשימה הנוכחי, לא לעמדת הסיעה בעת ההצבעה. פער עד 10, קריאה שלישית או חוק יסוד.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[A,B].map((v) => <div key={v.party.id} className="min-w-0">
              <h3 className="mb-2 text-xs font-bold">{v.party.nameHe}</h3>
              {partyVotes(v).length ? <ol className="space-y-2">{partyVotes(v).map((vote) => <li key={`${vote.candidate}-${vote.vote}`} className="rounded-xl bg-ink-row p-3 text-[11px] leading-5">
                <Link href={`/candidate/${v.candidates.find((c) => c.person.nameHe === vote.candidate)?.person.slug}`} className="font-semibold hover:underline">{displayName(vote.candidate,v.party.id,v.candidates.find((c) => c.person.nameHe === vote.candidate)?.candidacy.position ?? 0)}</Link>
                <div><SourceLink href={vote.resultUrl}>{vote.positionAtVote} ↗</SourceLink> · <SourceLink href={vote.voteUrl}>{vote.voteTitle} ↗</SourceLink></div>
                <div className="text-ink-dim">{vote.reading} · {vote.date} · סיעה: <SourceLink href={vote.factionUrl}>{vote.faction} ↗</SourceLink></div>
                <div><SourceLink href={vote.voteUrl}>בעד {vote.for}, נגד {vote.against} ↗</SourceLink></div>
                <div><SourceLink href={vote.platform}>מצע: {vote.position} ↗</SourceLink>{vote.mismatch ? " · הצבעתו/ה שונה מעמדה זו במצע הנוכחי" : ""}</div>
              </li>)}</ol> : <p className="text-[10px] text-ink-dim">אין הצבעות מפתח מסוקרות לרשימה זו.</p>}
            </div>)}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-line px-4 py-2.5 text-[12px] font-bold">
          <span className="border-b-2 border-accent pb-0.5">{A.party.nameHe}</span>
          <span className="text-[10px] font-normal text-ink-dim">הרכב · לחצו על עמדה לפרטים</span>
          <span className="border-b-2 border-band-edge pb-0.5">{B.party.nameHe}</span>
        </div>
        <div className="px-3 py-2 text-[10px] text-ink-dim">הרכב הרשימות: <SourceLink href="https://www.knesset.tv/main-articles/61384/94592/">הרשימות שהוגשו ↗</SourceLink></div>
        <ol>
          {Array.from({ length: rows }, (_, i) => (
            <li key={i}>
              {i === cut && cut > 0 ? (
                <div className="flex items-center gap-2 bg-ink-row px-3 py-1" aria-hidden>
                  <span className="h-px flex-1 bg-band-edge/50" />
                  <span className="text-[10px] font-medium text-band-edge">מכאן - מחוץ למנדטים של שתי הרשימות</span>
                  <span className="h-px flex-1 bg-band-edge/50" />
                </div>
              ) : null}
              <details className="group border-b border-ink-line/50">
                <summary className={`flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 hover:bg-ink-row ${i >= cut ? "opacity-70" : ""}`}>
                  <Slot view={A} i={i} side="a" />
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-pill text-[11px] font-bold text-ink-muted tabular group-open:bg-accent group-open:text-white">
                    {i + 1}
                  </span>
                  <Slot view={B} i={i} side="b" />
                </summary>
                <div className="flex gap-2 px-3 pb-3">
                  <Detail view={A} i={i} />
                  <Detail view={B} i={i} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
