import type { Fetcher } from "./http";

/** Base URL of the Knesset's public OData service. */
export const KNESSET_ODATA_BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc";

export type Row = Record<string, unknown>;

/**
 * Unwrap an OData payload. v3 replies as `{d:{results:[]}}` or `{d:[]}`, v4 as
 * `{value:[]}`; the service has served all three over its life, so accept each.
 */
export function unwrap(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (typeof payload !== "object" || payload === null) return [];

  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.value)) return obj.value as Row[];

  const d = obj.d;
  if (Array.isArray(d)) return d as Row[];
  if (typeof d === "object" && d !== null && Array.isArray((d as Row).results)) {
    return (d as Row).results as Row[];
  }
  return [];
}

/**
 * Continuation link from an OData payload, if the service sent one.
 *
 * The Knesset service caps every page at 100 rows no matter what `$top` asks for, and
 * hands back `odata.nextLink` carrying a `$skiptoken` — a continuation cursor, not an
 * offset. Following that link is the only reliable way to read a whole entity set: an
 * earlier version of this code paged with `$skip` and stopped as soon as a page came back
 * shorter than requested, which meant every entity silently stopped after its first 100
 * rows.
 */
export function nextLink(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const obj = payload as Record<string, unknown>;

  for (const key of ["odata.nextLink", "@odata.nextLink"]) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  // OData v3 JSON-verbose spelling.
  const d = obj.d;
  if (typeof d === "object" && d !== null) {
    const next = (d as Record<string, unknown>).__next;
    if (typeof next === "string" && next.length > 0) return next;
  }
  return undefined;
}

/**
 * Resolve a continuation link against the service root, and make sure it still asks for
 * JSON — the service omits `$format` from the links it generates, and following one
 * without it comes back as XML.
 */
export function resolveNextUrl(link: string, base: string): string {
  const url = /^https?:\/\//i.test(link) ? new URL(link) : new URL(`${base}/${link}`);
  if (!url.searchParams.has("$format")) url.searchParams.set("$format", "json");
  return url.toString();
}

/**
 * Read a whole entity set, following the service's continuation links.
 *
 * `hardLimit` is passed as `$top`, which this service treats as a total budget across the
 * continuation chain rather than a page size. It exists because KNS_Bill and
 * KNS_BillInitiator run to hundreds of thousands of rows; callers pass a scoped filter and
 * a ceiling so a six-hourly job stays a six-hourly job.
 */
export async function odataCollect(
  fetcher: Fetcher,
  entity: string,
  options: {
    base?: string;
    filter?: string;
    select?: string[];
    hardLimit?: number;
  } = {},
): Promise<Row[]> {
  const base = options.base ?? KNESSET_ODATA_BASE;
  const hardLimit = options.hardLimit ?? 50_000;

  const params = new URLSearchParams({ $format: "json", $top: String(hardLimit) });
  if (options.filter) params.set("$filter", options.filter);
  if (options.select?.length) params.set("$select", options.select.join(","));

  const rows: Row[] = [];
  // A service that hands back a link it has already served would otherwise loop forever.
  const visited = new Set<string>();
  let url: string | undefined = `${base}/${entity}?${params.toString()}`;

  while (url && rows.length < hardLimit) {
    if (visited.has(url)) break;
    visited.add(url);

    const payload = await fetcher.json(url);
    const page = unwrap(payload);
    if (page.length === 0) break;
    rows.push(...page);

    const link = nextLink(payload);
    url = link ? resolveNextUrl(link, base) : undefined;
  }

  return rows.slice(0, hardLimit);
}

/**
 * Build `$filter` clauses for a set of ids, in chunks small enough to stay inside the
 * service's URL limits. Lets a join be pushed to the server instead of pulling an entity
 * set whole and discarding almost all of it.
 */
export function idFilterChunks(
  field: string,
  ids: number[],
  perChunk = 40,
): string[] {
  const unique = [...new Set(ids)];
  const chunks: string[] = [];
  for (let i = 0; i < unique.length; i += perChunk) {
    chunks.push(unique.slice(i, i + perChunk).map((id) => `${field} eq ${id}`).join(" or "));
  }
  return chunks;
}

/**
 * Read a field that upstream may spell differently than documented.
 *
 * The service's casing is inconsistent across entity sets and could not be verified from
 * the build environment, so each call lists the plausible spellings and the first present
 * one wins. `FieldReport` records which alias actually matched so a live run tells us the
 * real shape instead of failing silently on undefined.
 */
export function pick(row: Row, aliases: string[], report?: FieldReport): unknown {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && value !== "") {
      report?.hit(aliases[0]!, alias);
      return value;
    }
  }
  report?.miss(aliases[0]!);
  return undefined;
}

export function pickString(row: Row, aliases: string[], report?: FieldReport): string | undefined {
  const value = pick(row, aliases, report);
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

export function pickInt(row: Row, aliases: string[], report?: FieldReport): number | undefined {
  const value = pick(row, aliases, report);
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Tracks which field aliases upstream actually used, so a live run is self-documenting. */
export class FieldReport {
  private readonly hits = new Map<string, string>();
  private readonly misses = new Set<string>();

  hit(canonical: string, alias: string): void {
    this.hits.set(canonical, alias);
    this.misses.delete(canonical);
  }

  miss(canonical: string): void {
    if (!this.hits.has(canonical)) this.misses.add(canonical);
  }

  /** Aliases that differed from the canonical name — the ones worth pinning in code. */
  get surprises(): { canonical: string; actual: string }[] {
    return [...this.hits.entries()]
      .filter(([canonical, actual]) => canonical !== actual)
      .map(([canonical, actual]) => ({ canonical, actual }));
  }

  get missing(): string[] {
    return [...this.misses].sort();
  }
}
