import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot, repoRoot } from "@elections26/data";
import type { Snapshot } from "@elections26/schema";
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

function fromFiles(): Published {
  return { snapshot: loadSnapshot(), extras: extrasFromFiles(), from: "json" };
}

/**
 * DATA_SOURCE=db (or any Vercel preview with a database attached) reads the published
 * version from Postgres; anything else reads the
 * committed JSON. If the database is unreachable or returns invalid data, the committed
 * JSON is served instead, so a database outage can never take the site down.
 */
export function useDb(): boolean {
  if (!process.env.DATABASE_URL) return false;
  return process.env.DATA_SOURCE === "db" || process.env.VERCEL_ENV === "preview";
}

export async function loadPublished(): Promise<Published> {
  if (!useDb()) return fromFiles();
  try {
    const { neon } = await import("@neondatabase/serverless");
    const { loadSnapshotFromDb, loadExtrasFromDb } = await import("@elections26/db");
    const sql = neon(process.env.DATABASE_URL as string);
    const db = { query: async (text: string, params?: unknown[]) => ({ rows: (await sql.query(text, params ?? [])) as never[] }) };
    const [snapshot, extras] = await Promise.all([loadSnapshotFromDb(db), loadExtrasFromDb(db)]);
    return { snapshot, extras: extras as unknown as ExtrasData, from: "db" };
  } catch (err) {
    console.error("[data] database read failed, serving committed JSON:", err);
    return fromFiles();
  }
}
