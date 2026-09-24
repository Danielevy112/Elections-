import type { MetadataRoute } from "next";
import { SITE_URL, isRealData, site } from "@/lib/site";

export const revalidate = 3600;

/** Empty while the dataset is example — nothing here is worth pointing a crawler at yet. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await isRealData())) return [];

  const data = await site();
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
