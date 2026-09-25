import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";
import { SITE_URL, isRealData, site, formatDateTime } from "@/lib/site";

const DESCRIPTION =
  "כל רשימות המועמדים לכנסת ה-26, הסדר המלא, הרקע הפרלמנטרי של כל מועמד, וממוצע הסקרים — עם מקור לכל נתון.";

export async function generateMetadata(): Promise<Metadata> {
  const real = await isRealData();
  return {
  metadataBase: new URL(SITE_URL),
  title: "בחירות 2026 — הכנסת ה-26",
  description: DESCRIPTION,
  // Keeps example data out of search results and out of link previews. Paired with
  // robots.ts so a crawler that ignores one still meets the other.
  robots: real
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: "בחירות 2026",
    title: "בחירות 2026 — הכנסת ה-26",
    description: DESCRIPTION,
  },
  };
}

/** Pages are cached on the CDN and regenerated when the data layer publishes (see /api/revalidate). */
export const revalidate = 3600;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { snapshot } = await site();
  const election = snapshot.elections[0];

  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-ink-page font-sans text-fg antialiased">
        {snapshot.meta.dataset === "example" ? (
          <div className="bg-rose-700 px-4 py-2 text-center text-xs font-medium text-fg">
            נתוני דוגמה בלבד — השמות, הרשימות והסקרים באתר זה בדיוניים ואינם נתוני אמת.
          </div>
        ) : null}
        {snapshot.meta.dataset === "preliminary" ? (
          <div className="bg-[#3a2a06] px-4 py-2 text-center text-[11px] leading-snug text-amber-200">
            נתונים מקדימים: הרשימות כפי שהוגשו, מתוך פרסום של ערוץ כנסת, לפני האישור הסופי של
            ועדת הבחירות המרכזית (27.9). עשויים להשתנות.
          </div>
        ) : null}

        <header className="sticky top-0 z-20 border-b border-ink-line bg-ink-page/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="text-base font-bold tracking-tight">
              בחירות 2026
            </Link>
            <div className="flex items-center gap-3 text-[11px] text-ink-muted">
              {election ? (
                <>
                  הכנסת ה-<span className="ltr-nums">{election.knessetNumber}</span> ·{" "}
                  {new Date(`${election.electionDate}T12:00:00Z`).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" })}
                </>
              ) : null}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

        <footer className="mx-auto max-w-3xl px-4 pb-10 pt-4 text-[11px] leading-relaxed text-ink-dim">
          <p>
            נתוני פעילות מהמאגר הפרלמנטרי של הכנסת. תמונות מועמדים ממקורות בעלי רישיון שימוש חופשי, עם
            קרדיט וקישור למקור. לכל נתון באתר יש קישור
            למקור שלו. עודכן: {formatDateTime(snapshot.meta.generatedAt)}
          </p>
        </footer>
      </body>
    </html>
  );
}
