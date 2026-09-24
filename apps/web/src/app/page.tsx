import Link from "next/link";
import { Avatar, Card, Pills, StatusBadge } from "@/components/ui";
import { formatDate, site } from "@/lib/site";
import { displayName, partyPhoto } from "@/lib/extras";

export const revalidate = 3600;

export default async function HomePage() {
  const { parties, projection } = await site();
  const polled = parties
    .filter((p) => p.projection)
    .sort((a, b) => (b.projection!.projectedSeats - a.projection!.projectedSeats) || (b.projection!.mean - a.projection!.mean));
  const others = parties.filter((p) => !p.projection);

  return (
    <div className="space-y-4">
      <Pills items={[{ label: "טבלת מנדטים", href: "/", active: true }, { label: "כל הרשימות", href: "#lists" }]} />

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
            return (
              <li key={party.id} className={`border-b border-ink-line/60 last:border-0 ${p!.qualifies ? "" : "opacity-60"}`}>
                <Link href={`/party/${party.slug}`} className="grid grid-cols-[1.5rem_1fr_2.75rem_3.5rem] items-center gap-x-2 px-4 py-2.5 hover:bg-ink-row">
                  <span className="text-xs text-ink-muted tabular">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={leaderName ?? party.nameHe} photo={partyPhoto(party.id, 1)} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{party.nameHe}</span>
                      <span className="flex items-center gap-1.5 truncate text-[11px] text-ink-muted">
                        {leaderName}
                        {list && list.status !== "submitted" ? <StatusBadge status={list.status} /> : null}
                      </span>
                    </span>
                  </span>
                  <span className="text-center text-lg font-bold tabular">{p!.qualifies ? p!.projectedSeats : 0}</span>
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
          . רשימות שנפסלו מוצגות לפי הסקרים עד להכרעת בג״ץ.
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
