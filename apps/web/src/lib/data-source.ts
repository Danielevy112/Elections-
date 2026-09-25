import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot, repoRoot } from "@elections26/data";
import type { Snapshot } from "@elections26/schema";
import type { ExtrasData, KnessetRecord, LegislativeRecord, KeyVote } from "./extras";

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
  const profiles = read<{ profiles: ExtrasData["knessetProfiles"] }>("knesset_profiles.json", { profiles: {} }).profiles;
  const activity = read<{activity: Record<string,KnessetRecord>}>("knesset_activity.json", {activity:{}}).activity;
  const keyVotes = read<{votes:KeyVote[]}>('dramatic_votes.json',{votes:[]}).votes;
  const votesByName = new Map<string,KeyVote[]>();
  for (const v of keyVotes) votesByName.set(v.candidate,[...(votesByName.get(v.candidate) ?? []),v]);
  return {
    knessetProfiles: Object.fromEntries(Object.entries(profiles).map(([name,p]) => [name, {...p, ...(activity[name] ? {record:activity[name]}:{}),  ...(votesByName.has(name) ? {keyVotes:votesByName.get(name)}:{})}])),
    photos: read<{ photos: ExtrasData["photos"] }>("photos.json", { photos: [] }).photos,
    bios: read<{ bios: ExtrasData["bios"] }>("bios.json", { bios: [] }).bios,
  };
}

function fromFiles(): Published {
  return { snapshot: loadSnapshot(), extras: extrasFromFiles(), from: "json" };
}

/**
 * DATA_SOURCE=db reads the published version from Postgres; anything else reads the
 * committed JSON. If the database is unreachable or returns invalid data, the committed
 * JSON is served instead, so a database outage can never take the site down.
 */
export function useDb(): boolean {
  if (!process.env.DATABASE_URL) return false;
  return process.env.DATA_SOURCE === "db";
}

export function loadPublished(): Published { return fromFiles(); }
export async function loadSnapshotPart(): Promise<{snapshot:Snapshot;from:"db"|"json"}> {
  if (!useDb()) return {snapshot:loadSnapshot(),from:"json"};
  try {
    const { neon } = await import("@neondatabase/serverless");
    const { loadSnapshotFromDb } = await import("@elections26/db");
    const sql = neon(process.env.DATABASE_URL as string);
    const db = { query: async (text:string,params?:unknown[]) => ({rows:(await sql.query(text,params ?? [])) as never[]}) };
    return {snapshot:await loadSnapshotFromDb(db),from:"db"};
  } catch (err) { console.error("[data] snapshot database read failed",err); return {snapshot:loadSnapshot(),from:"json"}; }
}
export async function loadExtrasPart(): Promise<{extras:ExtrasData;from:"db"|"json"}> {
  if (!useDb()) return {extras:extrasFromFiles(),from:"json"};
  try {
    const { neon } = await import("@neondatabase/serverless");
    const { loadExtrasFromDb } = await import("@elections26/db");
    const sql = neon(process.env.DATABASE_URL as string);
    const db = { query: async (text:string,params?:unknown[]) => ({rows:(await sql.query(text,params ?? [])) as never[]}) };
    return {extras:await loadExtrasFromDb(db) as unknown as ExtrasData,from:"db"};
  } catch (err) { console.error("[data] extras database read failed",err); return {extras:extrasFromFiles(),from:"json"}; }
}

/** Individual bill/query records are kept outside the shared <2MB Next data cache. */
let legislativeFile: {statuses:Record<string,string>;items:Record<string,LegislativeRecord>} | undefined;
export async function loadLegislativeItems(name: string): Promise<LegislativeRecord | undefined> {
  if (useDb()) {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const { loadLegislativeItemsFromDb } = await import("@elections26/db");
      const sql = neon(process.env.DATABASE_URL as string);
      const db = { query: async (text: string, params?: unknown[]) => ({ rows: (await sql.query(text, params ?? [])) as never[] }) };
      const items = await loadLegislativeItemsFromDb(db, name);
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
