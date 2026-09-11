import type { MetadataRoute } from "next";
import { SITE_URL, isRealData, site } from "@/lib/site";

export const dynamic = "force-static";

/** Empty while the dataset is example — nothing here is worth pointing a crawler at yet. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isRealData()) return [];

  const data = site();
  const lastModified = new Date(data.snapshot.meta.generatedAt);

  return [
    { url: SITE_URL, lastModified, changeFrequency: "hourly", priority: 1 },
    ...data.parties.map(({ party }) => ({
      url: `${SITE_URL}/party/${party.slug}`,
      lastModified,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...data.candidates.map(({ person }) => ({
      url: `${SITE_URL}/candidate/${person.slug}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
