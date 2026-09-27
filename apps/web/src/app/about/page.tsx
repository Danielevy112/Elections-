import Link from "next/link";
import { Card, SourceLink } from "@/components/ui";
import { formatDateTime, site } from "@/lib/site";
import { DEFAULT_SELECTION } from "@elections26/data";

export const metadata = { title: "אודות ומתודולוגיה" };
export const revalidate = 3600;

export default async function AboutPage() {
  const data = await site();
  return <div className="space-y-4">
    <Link href="/" className="text-sm text-ink-muted">→ לטבלת המנדטים</Link>
    <h1 className="text-xl font-bold">אודות ומתודולוגיה</h1>
    <Card className="space-y-2 p-4 text-sm leading-6"><p>בחירות 2026 מציג מידע ממקורות גלויים. הוא אינו אתר רשמי של ועדת הבחירות ואינו המלצת הצבעה.</p><p>הנתונים עדיין מקדימים: רשימות שהוגשו, החלטות וערעורים שיכולים לשנות את ההרכב. עדכון נתונים אחרון: {formatDateTime(data.snapshot.meta.generatedAt)}.</p><p>המטרה: להראות מי מופיע בכל רשימה, מה הרקע הפרלמנטרי שלו ומה אומרות העמדות שפרסמו הרשימות בעצמן, עם קישור למקור. היעדר נתון אינו עמדה.</p></Card>
    <Card className="space-y-2 p-4 text-sm leading-6"><h2 className="font-bold">מנדטים וסקרים</h2><p>נבחר הסקר האחרון מכל מכון בטווח {DEFAULT_SELECTION.windowDays} ימים ממועד עדכון המאגר, עד {DEFAULT_SELECTION.maxPolls} מכונים. ממוצע המנדטים מחושב רק מסקרים שדיווחו על הרשימה. הטווח הוא המינימום והמקסימום באותם סקרים; מתחת לאחוז החסימה נספרים אפס מנדטים. כשכיסוי הסקרים מלא, הממוצעים של הרשימות העוברות מנורמלים ל-120 מושבים. זו הערכה, לא תוצאת בחירות ולא תחזית לקואליציה.</p><p>מקורות הסקרים הנוכחיים: {data.projection.polls.map((poll, i) => <span key={poll.id}>{i ? " · " : ""}<SourceLink href={poll.sourceUrl}>{poll.publisher}, {poll.publishedAt}</SourceLink></span>)}</p></Card>
    <Card className="space-y-2 p-4 text-sm leading-6"><h2 className="font-bold">רשימות ורקורד</h2><p>סדר המועמדים ומעמד הרשימות נבדקים מול <SourceLink href="https://www.gov.il/he/pages/candidates-lists-26">ועדת הבחירות המרכזית</SourceLink>. רשימות שהוגשו אינן בהכרח הרשימות הסופיות. נתוני הכהונה והפעילות מקורם <SourceLink href="https://knesset.gov.il/OdataV4/ParliamentInfo/">במאגר הכנסת</SourceLink>; רשומה היסטורית אינה משויכת למועמד לפי שם זהה בלבד. תמונה מוצגת רק כשזהות ורישיון נבדקו; אחרת מוצגות ראשי תיבות.</p></Card>
  </div>;
}
