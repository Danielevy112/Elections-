import Link from "next/link";
import { notFound } from "next/navigation";
import { sourcesForField } from "@elections26/data";
import { Avatar, BackLink, BandChip, Card, SourceLink, Sources, Stat } from "@/components/ui";
import { BillRecordSection } from "@/components/bill-record";
import { billRecord, formatSeats, site } from "@/lib/site";
import { displayName, knessetProfile, partyBio, partyPhoto, roleLabel } from "@/lib/extras";

export const revalidate = 3600;

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
  const bio = partyBio(party?.id, position);
  const photo = partyPhoto(party?.id, position);
  const name = displayName(person.nameHe, party?.id, position);
  // The bill list is shown only when the verified profile and the snapshot person are the
  // same Knesset person; otherwise nothing, never a record matched some other way.
  const record =
    profile && person.knessetPersonId === profile.knessetPersonId ? await billRecord(person.id) : undefined;
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
        ) : bio ? null : (
          <p className="p-4 text-sm text-ink-muted">לא נמצאה רשומה מאומתת במאגר הכנסת</p>
        )}
      </Card>

      {bio ? (
        <Card className="p-4">
          <h2 className="pb-2 text-sm font-bold">בקצרה</h2>
          <blockquote className="border-s-2 border-ink-line ps-3 text-[13px] leading-6 text-ink-muted">{bio.text}</blockquote>
          <div className="pt-2">
            <SourceLink href={bio.sourcePage}>{bio.credit}</SourceLink>
          </div>
        </Card>
      ) : null}

      {record && profile ? <BillRecordSection record={record} sourceHref={profile.sources.bills} /> : null}

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
