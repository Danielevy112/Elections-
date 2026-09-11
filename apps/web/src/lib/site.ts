import { buildSite, loadSnapshot, type SiteData } from "@elections26/data";

/**
 * Public origin of the site, used for canonical URLs and the sitemap. Vercel supplies
 * VERCEL_PROJECT_PRODUCTION_URL on every build; the fallback only matters locally.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

/**
 * Whether the snapshot currently describes reality.
 *
 * Everything about public exposure hangs off this one field: the banner, robots, the
 * sitemap and the noindex tag. Flipping `dataset` to "real" in the election override is
 * the single switch, so there is no second place to forget.
 */
export function isRealData(): boolean {
  return site().snapshot.meta.dataset === "real";
}

let cached: SiteData | undefined;

/**
 * The site's single read of the data layer. Everything is static, so this runs at build
 * time and the result is shared across all pages in the render.
 */
export function site(): SiteData {
  if (!cached) cached = buildSite(loadSnapshot());
  return cached;
}

export function formatSeats(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

const HE_DATE = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});

export function formatDate(iso: string): string {
  return HE_DATE.format(new Date(`${iso}T12:00:00Z`));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

export const LIST_STATUS_LABEL: Record<string, string> = {
  submitted: "הוגשה",
  approved: "אושרה",
  disqualified: "נפסלה",
  withdrawn: "נמשכה",
};

export const LIST_STATUS_HINT: Record<string, string> = {
  submitted: "הרשימה הוגשה לוועדת הבחירות אך טרם אושרה סופית",
  approved: "הרשימה אושרה על ידי ועדת הבחירות המרכזית",
  disqualified: "הרשימה נפסלה",
  withdrawn: "הרשימה נמשכה על ידי מגישיה",
};

export const BAND_LABEL: Record<string, string> = {
  safe: "צפוי להיכנס",
  borderline: "על הגבול",
  out: "כרגע מחוץ לכנסת",
};
