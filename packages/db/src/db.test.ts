import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTION_NAMES } from "@elections26/schema";
import { billRecordFromItems, indexBillItems, loadSnapshot, RECORD_COLLECTIONS, RECORD_LIMITS, repoRoot } from "@elections26/data";
import { loadBillRecord, loadExtrasFromDb, loadSnapshotFromDb, migrate, publish, type Db, type Extras } from "./index";

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

describe("per-candidate legislative record", () => {
  it("serves one candidate's record from SQL exactly as the JSON path computes it", async () => {
    const db = await freshDb();
    const snapshot = loadSnapshot();
    await publish(db, snapshot, extrasFromRepo());
    const byPerson = indexBillItems(snapshot);
    // The three people with the most initiations, plus one with none.
    const people = [...byPerson.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([id]) => id);
    people.push(snapshot.persons.find((p) => !byPerson.has(p.id))!.id);
    for (const personId of people) {
      const expected = billRecordFromItems(byPerson.get(personId) ?? []);
      expect(await loadBillRecord(db, personId, RECORD_LIMITS), personId).toEqual(expected);
    }

    // The site snapshot leaves the record collections out entirely.
    const light = await loadSnapshotFromDb(db, { omit: RECORD_COLLECTIONS });
    expect(light.bills).toEqual([]);
    expect(light.bill_initiators).toEqual([]);
    expect(light.candidacies.length).toBe(snapshot.candidacies.length);

    // And the per-person lookup is an index lookup, not a scan of every initiation.
    await db.query("ANALYZE");
    const plan = await db.query<{ "QUERY PLAN": string }>(
      "EXPLAIN SELECT * FROM bill_initiators WHERE person_id = $1",
      [people[0]],
    );
    expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain("bill_initiators_person");
  }, 120_000);
});
