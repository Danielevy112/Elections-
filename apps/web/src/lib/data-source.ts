import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot, RECORD_COLLECTIONS, repoRoot } from "@elections26/data";
import type { Snapshot } from "@elections26/schema";
import type { ExtrasData, KnessetRecord, LegislativeRecord, KeyVote } from "./extras";

export interface Published {
  snapshot: Snapshot;
  extras: ExtrasData;
  from: "db" | "json";
}

// Exact-name matches to old MKs without independent evidence tying them to the 2026 list slot.
// The Knesset record documents the historical MK, not this candidate's identity.
const quarantinedKnessetNames = new Set(["אזולאי דוד", "לוי דוד", "אפרתי יוסף", "בירן מיכל", "חיים יהודה", "פלד משה", "שטרן אברהם"]);

function extrasFromFiles(): ExtrasData {
  const read = <T,>(file: string, fallback: T): T => {
    try {
      return JSON.parse(readFileSync(join(repoRoot(), "data", "manual_overrides", file), "utf8")) as T;
    } catch {
      return fallback;
    }
  };
  const profiles = read<{ profiles: ExtrasData["knessetProfiles"] }>("knesset_profiles.json", { profiles: {} }).profiles;
  const activity = read<{activity: Record<string,KnessetRecord>}>("knesset_activity.json", {activity:{}}).activity;
  const keyVotes = read<{votes:KeyVote[]}>('dramatic_votes.json',{votes:[]}).votes;
  const votesByName = new Map<string,KeyVote[]>();
  for (const v of keyVotes) votesByName.set(v.candidate,[...(votesByName.get(v.candidate) ?? []),v]);
  return {
    knessetProfiles: Object.fromEntries(Object.entries(profiles).filter(([name]) => !quarantinedKnessetNames.has(name)).map(([name,p]) => [name, {...p, ...(activity[name] ? {record:activity[name]}:{}),  ...(votesByName.has(name) ? {keyVotes:votesByName.get(name)}:{})}])),
    photos: read<{ photos: ExtrasData["photos"] }>("photos.json", { photos: [] }).photos,
    bios: read<{ bios: ExtrasData["bios"] }>("bios.json", { bios: [] }).bios,
  };
}

function fromFiles(): Published {
  return { snapshot: siteSnapshot(), extras: extrasFromFiles(), from: "json" };
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

// The site-wide snapshot leaves the synced bills out (RECORD_COLLECTIONS): tens of
// thousands of rows would break the 2 MB cache-entry cap. Per-candidate bills and
// questions are read one person at a time by loadLegislativeItems.
const siteSnapshot = () => loadSnapshot(undefined, { omit: RECORD_COLLECTIONS });

export function loadPublished(): Published { return fromFiles(); }
export async function loadSnapshotPart(): Promise<{snapshot:Snapshot;from:"db"|"json"}> {
  if (!useDb()) return {snapshot:siteSnapshot(),from:"json"};
  try {
    const { loadSnapshotFromDb } = await import("@elections26/db");
    return {snapshot:await withTimeout(loadSnapshotFromDb(await readDb(), { omit: RECORD_COLLECTIONS })),from:"db"};
  } catch (err) { console.error("[data] snapshot database read failed",err); return {snapshot:siteSnapshot(),from:"json"}; }
}
export async function loadExtrasPart(): Promise<{extras:ExtrasData;from:"db"|"json"}> {
  if (!useDb()) return {extras:extrasFromFiles(),from:"json"};
  try {
    const { loadExtrasFromDb } = await import("@elections26/db");
    const extras = await withTimeout(loadExtrasFromDb(await readDb())) as unknown as ExtrasData;
    extras.knessetProfiles = Object.fromEntries(Object.entries(extras.knessetProfiles).filter(([name]) => !quarantinedKnessetNames.has(name)));
    return {extras,from:"db"};
  } catch (err) { console.error("[data] extras database read failed",err); return {extras:extrasFromFiles(),from:"json"}; }
}

/** Individual bill/query records are kept outside the shared <2MB Next data cache. */
let legislativeFile: {statuses:Record<string,string>;items:Record<string,LegislativeRecord>} | undefined;
export async function loadLegislativeItems(name: string): Promise<LegislativeRecord | undefined> {
  if (useDb()) {
    try {
      const { loadLegislativeItemsFromDb } = await import("@elections26/db");
      const items = await withTimeout(loadLegislativeItemsFromDb(await readDb(), name));
      if (items) return items as unknown as LegislativeRecord;
      // Older published versions predate this optional table. Do not mix current files
      // with a different database snapshot, especially after candidate-list edits.
      return undefined;
    } catch (err) { console.error("[data] individual legislation read failed; using committed JSON", err); }
  }
  try {
    legislativeFile ??= JSON.parse(readFileSync(join(repoRoot(), "data", "manual_overrides", "legislative_items.json"), "utf8"));
    const record = legislativeFile!.items[name];
    if (!record) return undefined;
    const status = <T extends {statusId:number}>(item: T) => ({...item,status:legislativeFile!.statuses[String(item.statusId)] ?? "לא ידוע"});
    return {bills:record.bills.map(status),questions:record.questions.map(status)};
  } catch { return undefined; }
}
