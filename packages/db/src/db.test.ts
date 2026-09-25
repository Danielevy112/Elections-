import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTION_NAMES } from "@elections26/schema";
import { loadSnapshot, repoRoot } from "@elections26/data";
import { loadExtrasFromDb, loadLegislativeItemsFromDb, loadSnapshotFromDb, migrate, publish, type Db, type Extras } from "./index";

function extrasFromRepo(): Extras {
  const ov = (f: string) => JSON.parse(readFileSync(join(repoRoot(), "data", "manual_overrides", f), "utf8"));
  return { knessetProfiles: ov("knesset_profiles.json").profiles, photos: ov("photos.json").photos, bios: ov("bios.json").bios };
}

async function freshDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = {
    query: async (text, params) => {
      if (!params || params.length === 0) {
        const res = await pg.exec(text);
        return { rows: (res.at(-1)?.rows ?? []) as never[] };
      }
      return (await pg.query(text, params)) as never;
    },
  };
  await migrate(db);
  return db;
}

describe("postgres data layer", () => {
  it("round-trips the committed snapshot exactly", async () => {
    const db = await freshDb();
    const snapshot = loadSnapshot();
    await publish(db, snapshot, extrasFromRepo());
    const back = await loadSnapshotFromDb(db);
    for (const name of COLLECTION_NAMES) expect(back[name], name).toEqual(snapshot[name]);
    expect(back.meta).toEqual(snapshot.meta);
  }, 60_000);

  it("round-trips photos, bios and Knesset profiles", async () => {
    const db = await freshDb();
    const extras = extrasFromRepo();
    await publish(db, loadSnapshot(), extras);
    const back = await loadExtrasFromDb(db);
    expect(back.knessetProfiles).toEqual(extras.knessetProfiles);
    expect(back.photos.length).toBe(extras.photos.length);
    expect(back.bios.map((b) => b.text)).toEqual(extras.bios.map((b) => b.text));
  }, 60_000);

  it("keeps individual legislation outside the global extras cache", async () => {
    const db = await freshDb();
    const extras = extrasFromRepo();
    extras.legislativeItems = {
      "בנט נפתלי": { bills: [{ id: 2139769, title: "הצעת חוק", status: "הונחה" }], questions: [] },
    };
    await publish(db, loadSnapshot(), extras);
    const back = await loadExtrasFromDb(db);
    expect(back.knessetProfiles["בנט נפתלי"]).not.toHaveProperty("items");
    expect(back).not.toHaveProperty("legislativeItems");
    expect(await loadLegislativeItemsFromDb(db, "בנט נפתלי")).toEqual(extras.legislativeItems["בנט נפתלי"]);
    expect(await loadLegislativeItemsFromDb(db, "אין כזה")).toBeUndefined();
  }, 60_000);

  it("keeps the published version when a publish fails", async () => {
    const db = await freshDb();
    const snapshot = loadSnapshot();
    await publish(db, snapshot, extrasFromRepo());
    const broken = { ...snapshot, candidacies: [...snapshot.candidacies, { ...snapshot.candidacies[0]! }] };
    await expect(publish(db, broken, extrasFromRepo())).rejects.toThrow();
    const back = await loadSnapshotFromDb(db);
    expect(back.candidacies.length).toBe(snapshot.candidacies.length);
    const runs = await db.query<{ status: string }>("SELECT status FROM sync_runs ORDER BY id");
    expect(runs.rows.map((r) => r.status)).toEqual(["published", "failed"]);
  }, 60_000);
});

describe("column map", () => {
  it("covers every field of every snapshot collection", async () => {
    const { COLLECTIONS } = await import("@elections26/schema");
    const { TABLES } = await import("./columns");
    for (const name of COLLECTION_NAMES) {
      const keys = Object.keys((COLLECTIONS[name] as unknown as { shape: Record<string, unknown> }).shape).sort();
      expect(TABLES[name].columns.map((c) => c[0]).sort(), name).toEqual(keys);
    }
  });
});
