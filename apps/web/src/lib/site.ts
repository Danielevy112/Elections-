import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { buildSite, type SiteData } from "@elections26/data";
import { loadPublished, loadSnapshotPart, loadExtrasPart } from "./data-source";
import { setExtras } from "./extras";

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
export async function isRealData(): Promise<boolean> {
  return (await site()).snapshot.meta.dataset === "real";
}

/**
 * The published data version, cached under the "data" tag. The sync job calls
 * /api/revalidate after it publishes, which drops this entry and every page built from it;
 * the hourly revalidate is only a safety net. Visitors are served from the CDN, so the
 * database is read once per data change, not once per visit.
 */
// The cache key includes the deployment, so every deploy (each of which publishes a new
// data version first) starts from fresh data instead of the previous deploy's cache.
const DEPLOY_KEY = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
const cachedSnapshot = unstable_cache(loadSnapshotPart, ["published-snapshot", DEPLOY_KEY], { tags: ["data"], revalidate: 3600 });
const cachedExtras = unstable_cache(loadExtrasPart, ["published-extras", DEPLOY_KEY], { tags: ["data"], revalidate: 3600 });
/** Each half stays below Next's 2 MB cache-entry cap. If either database read fails,
 * use one coherent committed version rather than mixing stores. */
export async function published() {
  const [snapshotPart, extrasPart] = await Promise.all([cachedSnapshot(), cachedExtras()]);
  if (snapshotPart.from === "db" && extrasPart.from === "db") return { snapshot: snapshotPart.snapshot, extras: extrasPart.extras, from: "db" as const };
  return loadPublished();
}

let built: { key: string; data: SiteData } | undefined;

/** The site's single read of the data layer. */
export async function site(): Promise<SiteData> {
  const { snapshot, extras } = await published();
  setExtras(extras);
  const key = `${snapshot.meta.generatedAt}:${snapshot.candidacies.length}:${snapshot.sources.length}`;
  if (built?.key !== key) built = { key, data: buildSite(snapshot) };
  return built.data;
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

/**
 * Page metadata for a shareable page. Next replaces the layout's openGraph/twitter objects
 * wholesale when a page sets them, so every field is spelled out here once.
 */
export function shareMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: { type: "website", locale: "he_IL", siteName: "בחירות 2026", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}
