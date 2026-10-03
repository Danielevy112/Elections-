import Link from "next/link";
import { Avatar, Card, Pills, StatusBadge } from "@/components/ui";
import { formatDate, site } from "@/lib/site";
import { displayName, partyPhoto } from "@/lib/extras";
import { pollBlocs } from "@/lib/poll-blocs";

export const revalidate = 3600;

export default async function HomePage() {
  const { parties, projection } = await site();
  const polled = parties
    .filter((p) => p.projection)
    .sort((a, b) => (b.projection!.projectedSeats - a.projection!.projectedSeats) || (b.projection!.mean - a.projection!.mean));
  const others = parties.filter((p) => !p.projection);
  const barred = polled.filter((p) => p.list?.status === "disqualified");

  return (
    <div className="space-y-4">
      <Pills items={[{ label: "טבלת מנדטים", href: "/", active: true }, { label: "השוואת רשימות", href: "/compare" }, { label: "השוואת עמדות", href: "/issues" }, { label: "כל הרשימות", href: "#lists" }]} />

      {barred.length ? <Card className="border border-rose-500/30 p-3 text-xs leading-5 text-rose-200"><strong>החלטת פסילה, בכפוף לערעור:</strong> {barred.map((p, i) => <span key={p.party.id}>{i ? " · " : " "}<Link className="underline" href={`/party/${p.party.slug}`}>{p.party.nameHe}</Link></span>)}. ועדת הבחירות קבעה שהרשימות מנועות מהשתתפות; מעמד הרשימות עדיין כפוף להליך הערעור. המנדטים להלן מוצגים רק כדי להבין את תוצאות הסקרים, ואינם תחזית מושבים מאושרת. <a href="https://www.gov.il/he/pages/candidates-lists-26" target="_blank" rel="noopener noreferrer" className="underline">מקור: ועדת הבחירות ↗</a></Card> : null}

      {projection.polls.some((poll) => pollBlocs.some((bloc) => bloc.pollId === poll.id)) ? <Card className="space-y-4 p-4" aria-labelledby="poll-blocs-heading">
        <div><h2 id="poll-blocs-heading" className="text-base font-bold">תמונת גושים לפי סקר</h2><p className="mt-1 text-xs leading-5 text-ink-muted">החלוקה והכינויים הם של כל מפרסם בנפרד, לא ממוצע או תחזית לקואליציה. אין חיבור בין סקרים או חלוקה מחדש של מושבים.</p></div>
        {projection.polls.map((poll) => {
          const bloc = pollBlocs.find((item) => item.pollId === poll.id);
          if (!bloc) return null;
          return <section key={poll.id} className="space-y-2 border-t border-ink-line pt-3" aria-label={`חלוקת הגושים בסקר ${poll.publisher}`}>
            <h3 className="text-sm font-semibold"><a href={poll.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">{poll.publisher}, {formatDate(poll.publishedAt)} ↗</a></h3>
            {bloc.groups.map((group) => <div key={group.label} className="grid grid-cols-[minmax(0,1fr)_2rem] gap-x-2 text-xs"><div className="flex items-center justify-between gap-2"><span>{group.label}</span></div><strong className="text-left tabular">{group.seats}</strong><div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-ink-row"><div className={`h-full rounded-full ${group.color}`} style={{ width: `${group.seats / 120 * 100}%` }} /></div></div>)}
            <p className="text-xs leading-5 text-ink-muted">רע"ם והרשימה המשותפת: {bloc.arabListSeats} מנדטים בסקר, שהמפרסם לא שייך לאף גוש.{barred.length ? " ועדת הבחירות פסלה רשימה מביניהן, בכפוף לערעור." : ""}</p>
          </section>;
        })}
      </Card> : null}

      <Card className="overflow-hidden">
        <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
          <h1 className="text-base font-bold">ממוצע הסקרים</h1>
          <span className="text-[11px] text-ink-muted">
            {projection.polls.length} סקרים · אחרון {projection.latestPollDate ? formatDate(projection.latestPollDate) : "—"}
          </span>
        </div>
        <div className="grid grid-cols-[1.5rem_1fr_2.75rem_3.5rem] items-center gap-x-2 border-b border-ink-line px-4 pb-2 text-[11px] text-ink-dim">
          <span>#</span>
          <span>רשימה</span>
          <span className="text-center">מנדטים</span>
          <span className="text-center">טווח</span>
        </div>
        <ol>
          {polled.map(({ party, projection: p, list, leader }, i) => {
            const leaderName = leader ? displayName(leader.nameHe, party.id, 1) : undefined;
            const disqualified = list?.status === "disqualified";
            return (
              <li key={party.id} className={`border-b border-ink-line/60 last:border-0 ${p!.qualifies ? "" : "opacity-60"} ${disqualified ? "bg-rose-500/5" : ""}`}>
                <Link href={`/party/${party.slug}`} className="grid grid-cols-[1.5rem_1fr_2.75rem_3.5rem] items-center gap-x-2 px-4 py-2.5 hover:bg-ink-row">
                  <span className="text-xs text-ink-muted tabular">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={leaderName ?? party.nameHe} photo={partyPhoto(party.id, 1)} size={32} />
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-semibold ${disqualified ? "line-through decoration-rose-400" : ""}`}>{party.nameHe}</span>
                      <span className="flex items-center gap-1.5 truncate text-[11px] text-ink-muted">
                        {leaderName}
                        {list && list.status !== "submitted" ? <StatusBadge status={list.status} /> : null}
                      </span>
                    </span>
                  </span>
                  <span className={`text-center text-lg font-bold tabular ${disqualified ? "text-rose-300 line-through" : ""}`} title={disqualified ? "החלטת פסילה בכפוף לערעור; מספר זה הוא נתון סקר בלבד" : undefined}>{p!.qualifies ? p!.projectedSeats : 0}</span>
                  <span className="text-center text-xs text-ink-muted tabular ltr-nums">
                    {p!.min}–{p!.max}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-ink-line px-4 py-3 text-[11px] leading-relaxed text-ink-dim">
          הסקרים בממוצע:{" "}
          {projection.polls.map((poll, i) => (
            <span key={poll.id}>
              {i > 0 && " · "}
              <a href={poll.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline decoration-dotted underline-offset-2 hover:text-fg">
                {poll.publisher} / {poll.pollster}, {formatDate(poll.publishedAt)}
              </a>
            </span>
          ))}
          .{barred.length ? " רשימות שנפסלו מוצגות לפי הסקרים עד להכרעת בג״ץ." : ""}
        </div>
      </Card>

      <Card id="lists" className="overflow-hidden">
        <h2 className="px-4 pb-2 pt-4 text-base font-bold">כל הרשימות שהוגשו</h2>
        <ul>
          {[...polled, ...others].map(({ party, list, leader, candidates }) => (
            <li key={party.id} className="border-t border-ink-line/60">
              <Link href={`/party/${party.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-row">
                <Avatar name={leader ? displayName(leader.nameHe, party.id, 1) : party.nameHe} photo={partyPhoto(party.id, 1)} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{party.nameHe}</span>
                  <span className="block text-[11px] text-ink-dim">{candidates.length} מועמדים</span>
                </span>
                {list ? <StatusBadge status={list.status} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
