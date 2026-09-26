import type { MetadataRoute } from "next";
import { SITE_URL, isRealData } from "@/lib/site";

export const revalidate = 3600;

/**
 * Link-preview fetchers, not search engines: they read a page's og: tags and card image
 * when someone shares a link, and index nothing. Allowed even before the data is final,
 * so a shared link shows its card (which carries its own "preliminary" badge). The
 * noindex tag keeps search engines out regardless.
 */
const PREVIEW_BOTS = ["Twitterbot", "facebookexternalhit", "Facebot", "TelegramBot", "WhatsApp", "LinkedInBot", "Slackbot", "Discordbot"];

/**
 * Until the data is final the site is disallowed to everything but link previews. The red banner tells
 * a human reader; it does nothing about a search engine indexing a fictional party's seat
 * count, or that page later surfacing in a search result stripped of its context.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!(await isRealData())) {
    return {
      rules: [
        { userAgent: PREVIEW_BOTS, allow: "/", disallow: "/api/" },
        { userAgent: "*", disallow: "/" },
      ],
    };
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
