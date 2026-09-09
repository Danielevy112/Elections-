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
 * Read a whole entity set, following `$skip` until a short page comes back.
 *
 * `hardLimit` exists because KNS_Bill and KNS_BillInitiator run to hundreds of thousands
 * of rows; a sync that silently pulls all of them turns a 6-hourly job into an hours-long
 * one. Callers pass a Knesset-scoped filter and a ceiling.
 */
export async function odataCollect(
  fetcher: Fetcher,
  entity: string,
  options: {
    base?: string;
    filter?: string;
    select?: string[];
    pageSize?: number;
    hardLimit?: number;
  } = {},
): Promise<Row[]> {
  const base = options.base ?? KNESSET_ODATA_BASE;
  const pageSize = options.pageSize ?? 1000;
  const hardLimit = options.hardLimit ?? 50_000;

  const rows: Row[] = [];
  let skip = 0;

  while (rows.length < hardLimit) {
    const params = new URLSearchParams({ $format: "json", $top: String(pageSize), $skip: String(skip) });
    if (options.filter) params.set("$filter", options.filter);
    if (options.select?.length) params.set("$select", options.select.join(","));

    const page = unwrap(await fetcher.json(`${base}/${entity}?${params.toString()}`));
    rows.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }

  return rows.slice(0, hardLimit);
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
