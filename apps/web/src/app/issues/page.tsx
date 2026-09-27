import Link from "next/link";
import { Card, SourceLink } from "@/components/ui";
import { positionsByParty } from "@/lib/positions";
import { site } from "@/lib/site";

export const metadata = { title: "השוואת עמדות הרשימות" };
export const revalidate = 3600;

/** Only topics explicitly covered by the linked, party-authored Israeli documents.
 * Empty cells are unknown here, not evidence that a party has no policy.
 */
const topics = [
  { title: "שירות וגיוס", entries: [
    { partyId: "party:k26-01", issue: "גיוס וביטחון" },
    { partyId: "party:k26-11", issue: "גיוס" },
    { partyId: "party:k26-17", issue: "שירות" },
  ] },
  { title: "כלכלה ויוקר מחיה", entries: [
    { partyId: "party:k26-01", issue: "עסקים קטנים" },
    { partyId: "party:k26-11", issue: "יוקר המחיה" },
    { partyId: "party:k26-17", issue: "יוקר המחיה" },
  ] },
];

export default async function IssuesPage() {
  const { parties } = await site();
  const names = new Map(parties.map(({ party }) => [party.id, { name: party.nameHe, slug: party.slug }]));
  return <div className="space-y-4">
    <Link href="/" className="text-sm text-ink-muted">→ לטבלת המנדטים</Link>
    <h1 className="text-xl font-bold">השוואת עמדות הרשימות</h1>
    <Card className="p-4 text-xs leading-6 text-ink-muted">מוצגות רק עמדות שאותרו במסמכים שפרסמו הרשימות עצמן, עם קישור ישיר למקור. זהו מבחר ראשוני של שלוש רשימות ושני נושאים, לא השוואה של כל הרשימות או התחייבות לביצוע. היעדר עמדה כאן אינו אומר שלרשימה אין עמדה.</Card>
    {topics.map((topic) => <Card key={topic.title} className="space-y-3 p-4">
      <h2 className="text-base font-bold">{topic.title}</h2>
      <div className="grid gap-3 sm:grid-cols-3">{topic.entries.map(({ partyId, issue }) => {
        const party = names.get(partyId);
        const statement = positionsByParty[partyId]?.find((p) => p.issue === issue);
        return <section key={partyId} className="min-w-0 rounded-xl border border-ink-line p-3">
          <h3 className="text-sm font-semibold">{party ? <Link href={`/party/${party.slug}`} className="underline decoration-dotted underline-offset-2">{party.name}</Link> : partyId}</h3>
          {statement ? <><p className="mt-1 text-xs leading-5 text-ink-muted">{statement.summary}</p><SourceLink href={statement.source}>מסמך הרשימה ↗</SourceLink></> : <p className="mt-1 text-xs text-ink-dim">לא נוספה עמדה מאומתת בנושא זה.</p>}
        </section>;
      })}</div>
    </Card>)}
  </div>;
}
