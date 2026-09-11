import type { MetadataRoute } from "next";
import { SITE_URL, isRealData } from "@/lib/site";

export const dynamic = "force-static";

/**
 * While the snapshot holds example data the whole site is disallowed. The red banner tells
 * a human reader; it does nothing about a search engine indexing a fictional party's seat
 * count, or that page later surfacing in a search result stripped of its context.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isRealData()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
