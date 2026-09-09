import Link from "next/link";
import { notFound } from "next/navigation";
import { sourcesForField } from "@elections26/data";
import { BackLink, BandChip, Sources, Stat } from "@/components/ui";
import { formatDate, site } from "@/lib/site";

export function generateStaticParams() {
  return site().candidates.map(({ person }) => ({ slug: person.slug }));
}

export default async function CandidatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = site();
  const view = data.candidates.find((c) => c.person.slug === slug);
  if (!view) notFound();

  const { person, party, position, band, memberships, committees, billStats, billStatsByKnesset, notableBills } = view;
  const nameSources = sourcesForField(data, "person", person.id, "nameHe");
  const hasRecord = memberships.length > 0 || committees.length > 0 || billStats.initiated > 0;

  return (
    <div className="space-y-6">
      <BackLink href={party ? `/party/${party.slug}` : "/"}>
        {party ? `חזרה לרשימת ${party.nameHe}` : "חזרה לעמוד הראשי"}
      </BackLink>

      <header>
        <h1 className="text-2xl font-bold text-slate-900">{person.nameHe}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
          {party && position ? (
            <span>
              מקום <span className="font-semibold ltr-nums">{position}</span> ברשימת{" "}
              <Link href={`/party/${party.slug}`} className="hover:underline">
                {party.nameHe}
              </Link>
            </span>
          ) : null}
          {band ? <BandChip band={band} /> : null}
        </div>
        <div className="mt-1">
          <Sources sources={nameSources} label="מקור לרישום ברשימה" />
        </div>
        {person.knessetProfileUrl ? (
          <a
            href={person.knessetProfileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-block text-sm text-slate-600 underline decoration-dotted underline-offset-2"
          >
            פרופיל באתר הכנסת
          </a>
        ) : null}
      </header>

      {!hasRecord ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          לא נמצא רישום פרלמנטרי עבור מועמד זה במאגר הכנסת. ייתכן שמדובר במועמד שלא כיהן
          בכנסת, או ששמו טרם קושר לרשומה במאגר — קישור כזה נעשה ידנית ולעולם לא בניחוש.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="הצעות חוק כיוזם" value={billStats.initiated} />
        <Stat label="כיוזם משותף" value={billStats.coInitiated} />
        <Stat label="הגיעו לחקיקה" value={billStats.passed} />
        <Stat label="כהונות בכנסת" value={memberships.length} />
      </section>

      {memberships.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-slate-900">כהונות</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {memberships.map((membership) => (
              <li
                key={membership.id}
                className="flex flex-wrap items-baseline gap-x-2 rounded border border-slate-200 bg-white px-3 py-2"
              >
                <span className="font-medium text-slate-900">
                  הכנסת ה־<span className="ltr-nums">{membership.knessetNumber}</span>
                </span>
                {membership.factionNameHe ? (
                  <span className="text-slate-600">· סיעת {membership.factionNameHe}</span>
                ) : null}
                {membership.startDate ? (
                  <span className="text-slate-500">
                    · מ־{formatDate(membership.startDate)}
                    {membership.endDate ? ` עד ${formatDate(membership.endDate)}` : ""}
                  </span>
                ) : null}
                <span className="mr-auto">
                  <Sources
                    sources={sourcesForField(data, "knessetMembership", membership.id, "knessetNumber")}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {committees.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-slate-900">ועדות</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {committees.map(({ committee, membership }) => (
              <li
                key={membership.id}
                className="flex flex-wrap items-baseline gap-x-2 rounded border border-slate-200 bg-white px-3 py-2"
              >
                <span className="font-medium text-slate-900">{committee.nameHe}</span>
                <span className="text-slate-600">
                  · {membership.role === "chair" ? "יושב/ת ראש" : "חבר/ה"}
                </span>
                <span className="text-slate-500">
                  · הכנסת ה־<span className="ltr-nums">{membership.knessetNumber}</span>
                </span>
                <span className="mr-auto">
                  <Sources
                    sources={sourcesForField(data, "committeeMembership", membership.id, "committeeId")}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {billStatsByKnesset.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-slate-900">פעילות חקיקה לפי כנסת</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[24rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 font-medium">כנסת</th>
                  <th className="py-2 font-medium">כיוזם</th>
                  <th className="py-2 font-medium">כיוזם משותף</th>
                  <th className="py-2 font-medium">הגיעו לחקיקה</th>
                </tr>
              </thead>
              <tbody>
                {billStatsByKnesset.map(({ knessetNumber, stats }) => (
                  <tr key={knessetNumber} className="border-b border-slate-100">
                    <td className="py-2 ltr-nums">{knessetNumber}</td>
                    <td className="py-2 ltr-nums">{stats.initiated}</td>
                    <td className="py-2 ltr-nums">{stats.coInitiated}</td>
                    <td className="py-2 ltr-nums">{stats.passed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {notableBills.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-slate-900">הצעות חוק שהגיעו לחקיקה</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {notableBills.map((bill) => (
              <li key={bill.id} className="rounded border border-slate-200 bg-white px-3 py-2">
                {bill.url ? (
                  <a href={bill.url} target="_blank" rel="noreferrer noopener" className="hover:underline">
                    {bill.nameHe}
                  </a>
                ) : (
                  bill.nameHe
                )}
                {bill.knessetNumber ? (
                  <span className="text-slate-500">
                    {" "}
                    · הכנסת ה־<span className="ltr-nums">{bill.knessetNumber}</span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
