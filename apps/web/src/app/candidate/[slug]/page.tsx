import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sourcesForField } from "@elections26/data";
import { Avatar, BackLink, BandChip, Card, SourceLink, Sources, Stat } from "@/components/ui";
import { BAND_LABEL, formatDate, formatSeats, shareMetadata, site } from "@/lib/site";
import { loadLegislativeItems } from "@/lib/data-source";
import { attendance, displayName, knessetProfile, partyBio, partyPhoto, roleLabel } from "@/lib/extras";

export const revalidate = 3600;

/** Title and description for the page and its share card: who, which list, which place. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const view = (await site()).candidates.find((c) => c.person.slug === slug);
  if (!view) return {};
  const name = displayName(view.person.nameHe, view.party?.id, view.position);
  const where = view.party && view.position ? `מקום ${view.position} ב${view.party.shortNameHe ?? view.party.nameHe}` : "";
  const title = [name, where].filter(Boolean).join(" — ");
  const description = view.band ? `${where}: ${BAND_LABEL[view.band]} לפי ממוצע הסקרים.` : where;
  return shareMetadata(title, description);
}

export async function generateStaticParams() {
  return (await site()).candidates.map(({ person }) => ({ slug: person.slug }));
}

function yearOf(d: string | null) {
  return d ? d.slice(0, 4) : null;
}

export default async function CandidatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await site();
  const view = data.candidates.find((c) => c.person.slug === slug);
  if (!view) notFound();

  const { person, party, position, band } = view;
  const profile = knessetProfile(person.nameHe);
  const items = profile ? await loadLegislativeItems(person.nameHe) : undefined;
  const bio = partyBio(party?.id, position);
  const photo = partyPhoto(party?.id, position);
  const rec = profile?.record;
  const total = rec?.total;
  // Most recent term first; committees are shown for the latest term served.
  const termKeys = Object.keys(rec?.terms ?? {}).sort((x, y) => Number(y) - Number(x));
  const latest = termKeys[0] ? rec!.terms[termKeys[0]] : undefined;
  const mainCommittees = (latest?.committees ?? []).filter((c) => (/^ועדת /.test(c) && !/^ועדת המשנה/.test(c) && !/משותפת/.test(c)) || !!latest?.committeeChairs.includes(c));
  const hidden = (latest?.committees.length ?? 0) - mainCommittees.length;
  const att = attendance(total);
  const name = displayName(person.nameHe, party?.id, position);
  const pid = profile?.knessetPersonId;
  const od = "https://knesset.gov.il/OdataV4/ParliamentInfo/";
  const source = (table: string, filter: string) => `${od}${table}?$filter=${encodeURIComponent(filter)}`;
  const voteSource = pid ? source("KNS_PlenumVoteResult", `MkId eq ${pid} and VoteDate ge 2015-03-31T00:00:00+02:00 and VoteDate lt 2026-10-27T00:00:00+02:00`) : undefined;
  const billSource = pid ? source("KNS_BillInitiator", `PersonID eq ${pid} and IsInitiator eq true`) : undefined;
  const questionSource = pid ? source("KNS_Query", `PersonID eq ${pid} and KnessetNum ge 20 and KnessetNum le 25`) : undefined;
  const agendaSource = pid ? source("KNS_Agenda", `InitiatorPersonID eq ${pid} and KnessetNum ge 20 and KnessetNum le 25`) : undefined;
  const nameSources = sourcesForField(data, "person", person.id, "nameHe");
  // The Knesset lists the prime minister also as minister of the PM's office; show one row.
  const pmStarts = new Set(profile?.roles.filter((r) => r.title === "ראש הממשלה").map((r) => r.start) ?? []);
  const roles =
    profile?.roles.filter(
      (r) => r.title !== 'יו"ר סיעה' && !(r.title === "שר" && r.of === "משרד ראש הממשלה" && pmStarts.has(r.start)),
    ) ?? [];

  return (
    <div className="space-y-4">
      <BackLink href={party ? `/party/${party.slug}` : "/"}>{party ? party.nameHe : "כל הרשימות"}</BackLink>

      <Card className="overflow-hidden">
        <div className="flex flex-col items-center bg-gradient-to-b from-ink-hero to-ink-card px-4 pb-4 pt-6 text-center">
          <Avatar name={name} photo={photo} size={112} />
          <h1 className="mt-3 text-xl font-bold">{name}</h1>
          {party && position ? (
            <p className="mt-0.5 text-sm text-ink-muted">
              מקום <span className="font-semibold text-fg tabular">{position}</span> ב
              <Link href={`/party/${party.slug}`} className="hover:underline">
                {party.nameHe}
              </Link>
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-2">{band ? <BandChip band={band} /> : null}</div>
          <div className="mt-2 text-[11px] text-ink-dim">
            כפי שהוגש: {person.nameHe} · <Sources sources={nameSources} />
            {photo ? (
              <>
                {" "}· תמונה: <SourceLink href={photo.sourcePage}>{photo.credit}</SourceLink>
              </>
            ) : null}
          </div>
        </div>

        {profile ? (
          <div className="grid grid-cols-2 gap-2 p-3">
            <Stat label="שנים כחבר/ת כנסת" value={formatSeats(profile.yearsAsMk)} hint={`מאז ${yearOf(profile.firstMkDate)}`} href={profile.sources.positions} />
            <Stat label="כנסות" value={profile.knessetTerms.length} hint={`הכנסות ${profile.knessetTerms.join(", ")}`} href={profile.sources.positions} />
            <Stat label="הצעות חוק שעברו" value={profile.billsPassed} hint={`מתוך ${profile.billsInitiated} שיזם/ה`} href={profile.sources.bills} />
            <Stat label="שאילתות" value={profile.parliamentaryQuestions ?? "–"} href={profile.sources.questions} />
          </div>
        ) : (
          <p className="p-4 text-sm text-ink-muted">לא נמצאה רשומה מאומתת במאגר הכנסת</p>
        )}
      </Card>

      {rec && total ? (
        <Card className="overflow-hidden">
          <h2 className="px-4 pt-4 text-sm font-bold">פעילות בכנסת, 2015-2026</h2>
          <p className="px-4 text-[11px] text-ink-dim">הכנסות {termKeys.join(", ")} · נתונים עד {formatDate(rec.asOf)}</p>
          <div className="grid grid-cols-2 gap-2 p-3">
            <Stat
              label="השתתפות בהצבעות"
              value={att !== undefined ? `${att}%` : "–"}
              hint={`${total.votesPresent} מתוך ${total.votesHeld}`}
              href={voteSource}
            />
            <Stat label="הצעות חוק שעברו" value={total.billsPassed} hint={`מתוך ${total.billsInitiated} שיזם/ה`} href={billSource} />
            <Stat label="שאילתות" value={total.questions} href={questionSource} />
            <Stat label="הצעות לסדר היום" value={total.agendaMotions} href={agendaSource} />
          </div>
          <div className="px-3 pb-2">
            <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr] gap-x-2 px-1 pb-1 text-[10px] text-ink-dim">
              <span>כנסת</span>
              <span className="text-center">השתתפות</span>
              <span className="text-center">חוקים שעברו</span>
              <span className="text-center">שאילתות</span>
            </div>
            {termKeys.map((k) => {
              const t = rec.terms[k]!;
              const ta = attendance(t);
              return (
                <div key={k} className="grid grid-cols-[3.5rem_1fr_1fr_1fr] items-center gap-x-2 border-t border-ink-line/60 px-1 py-1.5 text-[12px] tabular">
                  <span className="text-ink-muted">ה-{k}</span>
                  <a href={t.sources.votes} target="_blank" rel="noreferrer noopener" className="text-center hover:underline">
                    {ta !== undefined ? `${ta}%` : "–"}
                  </a>
                  <a href={t.sources.bills} target="_blank" rel="noreferrer noopener" className="text-center hover:underline">
                    <span className="ltr-nums">{t.billsPassed}/{t.billsInitiated}</span>
                  </a>
                  <a href={t.sources.questions} target="_blank" rel="noreferrer noopener" className="text-center hover:underline">
                    {t.questions}
                  </a>
                </div>
              );
            })}
          </div>
          {latest!.committees.length > 0 ? (
            <div className="border-t border-ink-line/60 px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-ink-muted">
                  ועדות בכנסת ה-{termKeys[0]} ({latest!.committees.length}{hidden > 0 ? `, מתוכן ${hidden} משותפות/משנה` : ""})
                </span>
                <SourceLink href={latest!.sources.committees} />
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {mainCommittees.map((c) => (
                  <li key={c} className={`rounded-full px-2.5 py-0.5 text-[11px] ${latest!.committeeChairs.includes(c) ? "bg-accent/20 text-fg" : "bg-ink-pill text-ink-muted"}`}>
                    {latest!.committeeChairs.includes(c) ? `יו"ר · ${c}` : c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {profile?.keyVotes?.filter((v) => v.party === party?.id.replace(/^party:/, "")).length ? (
        <Card className="overflow-hidden">
          <h2 className="px-4 pt-4 text-sm font-bold">הצבעות מפתח מול המצע</h2>
          <p className="px-4 pt-1 text-[10px] leading-4 text-ink-dim">השוואה למצע הנוכחי של הרשימה, לא לעמדה של הסיעה שבה כיהן/ה ביום ההצבעה. מוצגות הצבעות מתועדות בלבד, בנושאים שמופיעים במצע, עם פער עד 10 קולות או קריאה שלישית או חוק יסוד.</p>
          <ol className="space-y-2 p-3">
            {profile.keyVotes.filter((v) => v.party === party?.id.replace(/^party:/, "")).map((v) => (
              <li key={`${v.party}-${v.vote}`} className="rounded-xl bg-ink-row px-3 py-2.5">
                <a href={v.voteUrl} target="_blank" rel="noopener noreferrer" className="block text-[12px] font-semibold leading-5 hover:underline">{v.voteTitle} ↗</a>
                <div className="mt-1 text-[10px] text-ink-muted">
                  <a href={v.resultUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">הצבעה אישית: {v.positionAtVote} ↗</a>
                  {' · '}{v.reading} · {formatDate(v.date)} · סיעה: <a href={v.factionUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{v.faction} ↗</a>
                </div>
                <p className="mt-1 text-[10px] text-ink-dim">
                  <a href={v.voteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">בעד {v.for}, נגד {v.against} ↗</a>
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">
                  <a href={v.platform} target="_blank" rel="noopener noreferrer" className="hover:underline">מצע: {v.category} ↗</a>
                  {v.mismatch ? <> · <a href={v.resultUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-fg hover:underline">המצע כיום: {v.position} · הצבעה אז: נגד ↗</a></> : null}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      ) : party?.id === "party:k26-29" ? <Card className="p-4 text-xs text-ink-muted">המצע טרם פורסם</Card> : null}

      {items ? (
        <Card className="overflow-hidden">
          <h2 className="px-4 pt-4 text-sm font-bold">הצעות חוק ושאילתות, 2015-2026</h2>
          <div className="grid grid-cols-2 gap-2 p-3">
            <Stat label="הצעות חוק שיזם/ה" value={items.bills.length} href={billSource} />
            <Stat label="הצעות שהתקבלו בקריאה שלישית" value={items.bills.filter((b) => b.statusId === 118).length} href={billSource} />
            <Stat label="שאילתות" value={items.questions.length} href={questionSource} />
          </div>
          <div className="px-4 pb-4">
            <h3 className="pb-2 text-xs font-bold">הצעות חוק</h3>
            {items.bills.length ? <ol className="max-h-80 space-y-1 overflow-y-auto">
              {items.bills.map((b) => <li key={b.id} className="rounded-lg bg-ink-row px-3 py-2">
                <a className="block text-[12px] font-medium leading-5 hover:underline" href={b.url} target="_blank" rel="noopener noreferrer">{b.title} ↗</a>
                <span className="text-[10px] text-ink-muted">הכנסת ה-{b.knesset} · {b.status}</span>
              </li>)}
            </ol> : <p className="text-xs text-ink-muted">לא נרשמו הצעות חוק שיזם/ה בתקופה זו</p>}
            <h3 className="pb-2 pt-4 text-xs font-bold">שאילתות</h3>
            {items.questions.length ? <ol className="max-h-80 space-y-1 overflow-y-auto">
              {items.questions.map((q) => <li key={q.id} className="rounded-lg bg-ink-row px-3 py-2">
                <a className="block text-[12px] font-medium leading-5 hover:underline" href={q.url} target="_blank" rel="noopener noreferrer">{q.title} ↗</a>
                <span className="text-[10px] text-ink-muted">הכנסת ה-{q.knesset} · {q.status}</span>
              </li>)}
            </ol> : <p className="text-xs text-ink-muted">לא נרשמו שאילתות בתקופה זו</p>}
          </div>
        </Card>
      ) : null}

      {bio ? (
        <Card className="p-4">
          <h2 className="pb-2 text-sm font-bold">בקצרה</h2>
          <blockquote className="border-s-2 border-ink-line ps-3 text-[13px] leading-6 text-ink-muted">{bio.text}</blockquote>
          <div className="pt-2">
            <SourceLink href={bio.sourcePage}>{bio.credit}</SourceLink>
          </div>
        </Card>
      ) : null}

      {roles.length > 0 ? (
        <Card className="overflow-hidden">
          <h2 className="px-4 pb-2 pt-4 text-sm font-bold">תפקידים</h2>
          <ol>
            {roles.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-t border-ink-line/60 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{roleLabel(r)}</span>
                  <span className="block text-[11px] text-ink-dim">{r.knessets && r.knessets.length > 1 ? `הכנסות ${Math.min(...r.knessets)}–${Math.max(...r.knessets)}` : `הכנסת ה-${r.knesset}`}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted tabular ltr-nums">
                  {yearOf(r.start)}–{yearOf(r.end) ?? "היום"}
                </span>
              </li>
            ))}
          </ol>
          <div className="px-4 pb-3 pt-1">{profile ? <SourceLink href={profile.sources.positions}>מקור: המאגר הפרלמנטרי של הכנסת</SourceLink> : null}</div>
        </Card>
      ) : null}

      {profile && profile.factions.length > 0 ? (
        <Card className="overflow-hidden">
          <h2 className="px-4 pb-2 pt-4 text-sm font-bold">סיעות בכנסת</h2>
          <ol>
            {profile.factions.map((f) => (
              <li key={`${f.knesset}-${f.name}`} className="flex items-center justify-between gap-3 border-t border-ink-line/60 px-4 py-2.5">
                <span className="min-w-0 truncate text-[13px]">{f.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">הכנסת ה-{f.knesset}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
