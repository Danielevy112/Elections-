import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  billRecordFromItems,
  indexBillItems,
  loadSnapshot,
  RECORD_COLLECTIONS,
  RECORD_LIMITS,
  repoRoot,
  type BillRecord,
  type BillRecordItem,
} from "@elections26/data";
import { COLLECTION_NAMES, type Snapshot } from "@elections26/schema";
import type { ExtrasData } from "./extras";

export interface Published {
  snapshot: Snapshot;
  extras: ExtrasData;
  from: "db" | "json";
}

function extrasFromFiles(): ExtrasData {
  const read = <T,>(file: string, fallback: T): T => {
    try {
      return JSON.parse(readFileSync(join(repoRoot(), "data", "manual_overrides", file), "utf8")) as T;
    } catch {
      return fallback;
    }
  };
  return {
    knessetProfiles: read<{ profiles: ExtrasData["knessetProfiles"] }>("knesset_profiles.json", { profiles: {} }).profiles,
    photos: read<{ photos: ExtrasData["photos"] }>("photos.json", { photos: [] }).photos,
    bios: read<{ bios: ExtrasData["bios"] }>("bios.json", { bios: [] }).bios,
  };
}

// The site-wide snapshot leaves the legislative record out: tens of thousands of bills do
// not belong in one cached blob. They are read per candidate by loadRecord below.
function fromFiles(): Published {
  return { snapshot: loadSnapshot(undefined, { omit: RECORD_COLLECTIONS }), extras: extrasFromFiles(), from: "json" };
}

/**
 * DATA_SOURCE=db reads the published version from Postgres; anything else reads the
 * committed JSON. If the database is unreachable or returns invalid data, the committed
 * JSON is served instead, so a database outage can never take the site down.
 */
export function useDb(): boolean {
  if (!readUrl()) return false;
  return process.env.DATA_SOURCE === "db";
}

/**
 * The site only ever reads. DATABASE_URL_READONLY is a login in the web_reader role
 * (SELECT only, short statement timeout); DATABASE_URL, which can write, stays with the
 * build's publish step and is used here only until the read-only one is configured.
 */
function readUrl(): string | undefined {
  return process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL || undefined;
}

/** A database read that hangs must not hold a page: give up and fall back. */
const READ_TIMEOUT_MS = 5_000;
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`database read exceeded ${READ_TIMEOUT_MS}ms`)), READ_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readDb() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(readUrl() as string);
  return { query: async (text: string, params?: unknown[]) => ({ rows: (await sql.query(text, params ?? [])) as never[] }) };
}

export async function loadPublished(): Promise<Published> {
  if (!useDb()) return fromFiles();
  try {
    const { loadSnapshotFromDb, loadExtrasFromDb } = await import("@elections26/db");
    const db = await readDb();
    const [snapshot, extras] = await withTimeout(
      Promise.all([loadSnapshotFromDb(db, { omit: RECORD_COLLECTIONS }), loadExtrasFromDb(db)]),
    );
    return { snapshot, extras: extras as unknown as ExtrasData, from: "db" };
  } catch (err) {
    console.error("[data] database read failed, serving committed JSON:", err);
    return fromFiles();
  }
}

let billIndex: Map<string, BillRecordItem[]> | undefined;

/**
 * One person's legislative record: three indexed queries against Postgres, or, without a
 * database, the committed JSON indexed once per server process. A failed or slow database
 * read falls back to the JSON rather than failing the page.
 */
export async function loadRecord(personId: string): Promise<BillRecord> {
  if (useDb()) {
    try {
      const { loadBillRecord } = await import("@elections26/db");
      return (await withTimeout(loadBillRecord(await readDb(), personId, RECORD_LIMITS))) as BillRecord;
    } catch (err) {
      console.error("[data] record read failed, serving committed JSON:", err);
    }
  }
  if (!billIndex) {
    const { bills, bill_initiators } = loadSnapshot(undefined, {
      omit: COLLECTION_NAMES.filter((n) => !(RECORD_COLLECTIONS as readonly string[]).includes(n)),
    });
    billIndex = indexBillItems({ bills, bill_initiators });
  }
  return billRecordFromItems(billIndex.get(personId) ?? []);
}
