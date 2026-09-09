import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import { formatDate, formatSeats, site } from "@/lib/site";

export default function HomePage() {
  const { parties, projection } = site();
  const ranked = parties.filter((p) => p.projection && p.projection.qualifies);
  const belowThreshold = parties.filter((p) => p.projection && !p.projection.qualifies);
  const totalSeats = ranked.reduce((sum, p) => sum + (p.projection?.projectedSeats ?? 0), 0);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-slate-900">ממוצע הסקרים</h1>
        {projection.polls.length === 0 ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            אין סקרים עדכניים בטווח הזמן שנקבע, ולכן לא מוצגת תחזית מנדטים.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">
              מבוסס על <span className="ltr-nums">{projection.polls.length}</span> הסקרים
              האחרונים, סקר אחד לכל מכון. הסקר האחרון פורסם ב־
              {projection.latestPollDate ? formatDate(projection.latestPollDate) : "—"}.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                    <th className="py-2 font-medium">רשימה</th>
                    <th className="py-2 font-medium">תחזית</th>
                    <th className="py-2 font-medium">טווח בסקרים</th>
                    <th className="py-2 font-medium">סקרים</th>
                    <th className="py-2 font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map(({ party, projection: p, list }) => (
                    <tr key={party.id} className="border-b border-slate-100">
                      <td className="py-2">
                        <Link href={`/party/${party.slug}`} className="font-medium text-slate-900 hover:underline">
                          {party.nameHe}
                        </Link>
                      </td>
                      <td className="py-2 font-semibold ltr-nums">{p?.projectedSeats}</td>
                      <td className="py-2 text-slate-600 ltr-nums">
                        {p?.min}–{p?.max}
                      </td>
                      <td className="py-2 text-slate-500 ltr-nums">{p?.pollCount}</td>
                      <td className="py-2">{list ? <StatusBadge status={list.status} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-xs text-slate-500">
                    <td className="py-2">סך הכול</td>
                    <td className="py-2 font-semibold ltr-nums">{totalSeats}</td>
                    <td colSpan={3}>
                      {projection.partialCoverage ? "מתוך 120 — הסקרים אינם מכסים את כל הרשימות" : "מתוך 120"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {belowThreshold.length > 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                מתחת לאחוז החסימה בממוצע הסקרים:{" "}
                {belowThreshold.map((p, i) => (
                  <span key={p.party.id}>
                    {i > 0 && ", "}
                    <Link href={`/party/${p.party.slug}`} className="hover:underline">
                      {p.party.nameHe}
                    </Link>
                    {" "}
                    <span className="ltr-nums">({formatSeats(p.projection?.mean ?? 0)})</span>
                  </span>
                ))}
                .
              </p>
            ) : null}
          </>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">כל הרשימות</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {parties.map(({ party, list, leader, projection: p, candidates }) => (
            <Link
              key={party.id}
              href={`/party/${party.slug}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-400"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{party.nameHe}</div>
                  {leader ? (
                    <div className="text-sm text-slate-500">בראשות {leader.nameHe}</div>
                  ) : null}
                </div>
                {list ? <StatusBadge status={list.status} /> : null}
              </div>

              <div className="mt-3 flex items-baseline gap-4 text-sm">
                <div>
                  <span className="text-2xl font-bold text-slate-900 ltr-nums">
                    {p ? formatSeats(p.mean) : "—"}
                  </span>{" "}
                  <span className="text-slate-500">מנדטים בממוצע</span>
                </div>
                {p ? (
                  <div className="text-slate-500">
                    טווח <span className="ltr-nums">{p.min}–{p.max}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-2 text-xs text-slate-500">
                <span className="ltr-nums">{candidates.length}</span> מועמדים ברשימה
                {p && !p.qualifies ? " · מתחת לאחוז החסימה" : ""}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
