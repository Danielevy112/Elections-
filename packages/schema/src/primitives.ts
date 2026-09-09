import { z } from "zod";

/** Stable, human-readable identifier used across snapshots (e.g. "person:knesset-887"). */
export const Id = z.string().min(1).max(120);

/** ISO-8601 date, day precision: 2026-10-27 */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** ISO-8601 instant: 2026-09-09T06:14:00Z */
export const IsoDateTime = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());

export const Url = z.string().url();

/** URL-safe slug used in site routes. Hebrew is transliterated upstream. */
export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected a lowercase kebab-case slug");

/**
 * Where a fact came from. Ordered loosely by authority: the Knesset and the Central
 * Elections Committee outrank a party's own material, which outranks press and Wikidata.
 */
export const SourceKind = z.enum([
  "knesset",
  "cec",
  "datagov",
  "party",
  "wikidata",
  "press",
  "manual",
]);
export type SourceKind = z.infer<typeof SourceKind>;
