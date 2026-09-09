import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { site, formatDateTime } from "@/lib/site";

export const metadata: Metadata = {
  title: "בחירות 2026 — הכנסת ה-26",
  description:
    "כל רשימות המועמדים לכנסת ה-26, הסדר המלא, הרקע הפרלמנטרי של כל מועמד, וממוצע הסקרים — עם מקור לכל נתון.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { snapshot } = site();
  const election = snapshot.elections[0];

  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen font-sans antialiased">
        {snapshot.meta.dataset === "example" ? (
          <div className="bg-rose-700 px-4 py-2 text-center text-sm font-medium text-white">
            נתוני דוגמה בלבד — השמות, הרשימות והסקרים באתר זה בדיוניים ואינם נתוני אמת.
          </div>
        ) : null}

        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-2 px-4 py-4">
            <Link href="/" className="text-lg font-bold text-slate-900">
              בחירות 2026
            </Link>
            <div className="text-xs text-slate-500">
              {election ? (
                <>
                  הבחירות לכנסת ה-<span className="ltr-nums">{election.knessetNumber}</span> ·{" "}
                  {new Date(`${election.electionDate}T12:00:00Z`).toLocaleDateString("he-IL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {" · "}
                </>
              ) : null}
              עודכן: {formatDateTime(snapshot.meta.generatedAt)}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>

        <footer className="mx-auto max-w-5xl px-4 py-10 text-xs leading-relaxed text-slate-500">
          <p>
            נתוני הכנסת מגיעים ממאגר המידע הפרלמנטרי הרשמי; סטטוס הרשימות מוועדת הבחירות
            המרכזית. לכל נתון באתר נשמר המקור שממנו הגיע.
          </p>
          <p className="mt-1">
            שיטת החישוב של ממוצע הסקרים ושל חלוקת המנדטים מתועדת במלואה במסמך המתודולוגיה
            שבמאגר הקוד.
          </p>
        </footer>
      </body>
    </html>
  );
}
