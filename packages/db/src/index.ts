import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLLECTIONS,
  COLLECTION_NAMES,
  SnapshotMeta,
  type CollectionName,
  type Snapshot,
} from "@elections26/schema";
import { TABLES, type Column } from "./columns";

export { TABLES } from "./columns";

/** The smallest surface both the Neon pool and PGlite (tests) provide. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Extras {
  knessetProfiles: Record<string, { knessetPersonId: number } & Record<string, unknown>>;
  legislativeItems?: Record<string, {bills: Record<string, unknown>[], questions: Record<string, unknown>[]}>;
  photos: Record<string, unknown>[];
  bios: Record<string, unknown>[];
}

const here = dirname(fileURLToPath(import.meta.url));

export function migrationSql(): string {
  return readFileSync(join(here, "..", "migrations", "001_init.sql"), "utf8");
}

export async function migrate(db: Db): Promise<void> {
  await db.query(migrationSql());
}

function readExpr([key, col, type]: Column): string {
  const v = type === "date" ? `to_char(${col}, 'YYYY-MM-DD')` : type === "numeric" ? `${col}::float8` : col;
  return `'${key}', ${v}`;
}

function castExpr([key, , type]: Column): string {
  const pg = type === "int" ? "int" : type === "numeric" ? "numeric" : type === "bool" ? "bool" : type === "date" ? "date" : type === "timestamptz" ? "timestamptz" : "text";
  return `(e.v->>'${key}')::${pg}`;
}

/** Read the published data back in exactly the Snapshot shape the JSON loader returns. */
export async function loadSnapshotFromDb(db: Db): Promise<Snapshot> {
  const out: Record<string, unknown> = {};
  for (const name of COLLECTION_NAMES) {
    const { table, columns } = TABLES[name];
    // jsonb_build_object caps at 100 args; our widest table has 11 columns.
    const { rows } = await db.query<{ row: unknown }>(
      `SELECT jsonb_strip_nulls(jsonb_build_object(${columns.map(readExpr).join(", ")})) AS row FROM ${table} ORDER BY ord`,
    );
    const parsed = COLLECTIONS[name as CollectionName].array().safeParse(rows.map((r) => r.row));
    if (!parsed.success) throw new Error(`${table}: DB rows failed validation: ${parsed.error.issues[0]?.message}`);
    out[name] = parsed.data;
  }
  const meta = await db.query<{ row: unknown }>(
    `SELECT jsonb_build_object('generatedAt', generated_at, 'mode', mode, 'dataset', dataset, 'counts', counts) AS row FROM meta`,
  );
  if (meta.rows.length !== 1) throw new Error("meta: no published data version");
  out.meta = SnapshotMeta.parse(meta.rows[0]!.row);
  return out as Snapshot;
}

export async function loadLegislativeItemsFromDb(db: Db, filedName: string): Promise<{bills:Record<string,unknown>[],questions:Record<string,unknown>[]} | undefined> {
  const { rows } = await db.query<{ items: {bills:Record<string,unknown>[],questions:Record<string,unknown>[]} }>(
    `SELECT items FROM legislative_items WHERE filed_name = $1`, [filedName],
  );
  return rows[0]?.items;
}

export async function loadExtrasFromDb(db: Db): Promise<Extras> {
  const profiles = await db.query<{ filed_name: string; profile: Extras["knessetProfiles"][string] }>(
    `SELECT filed_name, profile FROM knesset_profiles ORDER BY ord`,
  );
  const photos = await db.query<{ row: Record<string, unknown> }>(
    `SELECT jsonb_build_object('partyKey', party_key, 'position', position, 'nameHe', name_he, 'nameAsPrinted', name_as_printed,
       'path', path, 'imageUrl', image_url, 'sourcePage', source_page, 'credit', credit) AS row
     FROM photos WHERE removed_at IS NULL ORDER BY ord`,
  );
  const bios = await db.query<{ row: Record<string, unknown> }>(
    `SELECT jsonb_build_object('partyKey', party_key, 'position', position, 'nameHe', name_he, 'nameAsPrinted', name_as_printed,
       'text', text, 'sourcePage', source_page, 'credit', credit, 'source', source) AS row FROM bios ORDER BY ord`,
  );
  return {
    knessetProfiles: Object.fromEntries(profiles.rows.map((r) => [r.filed_name, r.profile])),
    photos: photos.rows.map((r) => r.row),
    bios: bios.rows.map((r) => r.row),
  };
}

const DATA_TABLES = [...COLLECTION_NAMES.map((n) => TABLES[n].table), "knesset_profiles", "legislative_items", "photos", "bios", "meta"];

/**
 * Publish one complete, already-validated data version in a single transaction: readers
 * see the old version until COMMIT and never a half-written one. A failure rolls back and
 * is recorded in sync_runs; the site keeps serving what it had.
 */
export async function publish(db: Db, snapshot: Snapshot, extras: Extras): Promise<number> {
  for (const name of COLLECTION_NAMES) COLLECTIONS[name].array().parse(snapshot[name]);
  const run = await db.query<{ id: string }>(`INSERT INTO sync_runs DEFAULT VALUES RETURNING id`);
  const runId = Number(run.rows[0]!.id);
  try {
    await db.query("BEGIN");
    await db.query(`TRUNCATE ${DATA_TABLES.join(", ")}`);
    for (const name of COLLECTION_NAMES) {
      const { table, columns } = TABLES[name];
      await db.query(
        `INSERT INTO ${table} (${columns.map((c) => c[1]).join(", ")}, ord)
         SELECT ${columns.map(castExpr).join(", ")}, (e.o - 1)::int FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS e(v, o)`,
        [JSON.stringify(snapshot[name])],
      );
    }
    await db.query(
      `INSERT INTO knesset_profiles (filed_name, knesset_person_id, profile, ord)
       SELECT e.v->>0, (e.v->1->>'knessetPersonId')::int, e.v->1, (e.o - 1)::int FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS e(v, o)`,
      [JSON.stringify(Object.entries(extras.knessetProfiles))],
    );
    await db.query(
      `INSERT INTO legislative_items (filed_name, items)
       SELECT e.v->>0, e.v->1 FROM jsonb_array_elements($1::jsonb) AS e(v)`,
      [JSON.stringify(Object.entries(extras.legislativeItems ?? {}))],
    );
    await db.query(
      `INSERT INTO photos (party_key, position, name_he, name_as_printed, path, image_url, source_page, credit, ord)
       SELECT e.v->>'partyKey', (e.v->>'position')::int, e.v->>'nameHe', e.v->>'nameAsPrinted', e.v->>'path', e.v->>'imageUrl',
              e.v->>'sourcePage', e.v->>'credit', (e.o - 1)::int FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS e(v, o)`,
      [JSON.stringify(extras.photos)],
    );
    await db.query(
      `INSERT INTO bios (party_key, position, name_he, name_as_printed, text, source_page, credit, source, ord)
       SELECT e.v->>'partyKey', (e.v->>'position')::int, e.v->>'nameHe', e.v->>'nameAsPrinted', e.v->>'text', e.v->>'sourcePage',
              e.v->>'credit', coalesce(e.v->>'source', 'party'), (e.o - 1)::int FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS e(v, o)`,
      [JSON.stringify(extras.bios)],
    );
    const m = snapshot.meta;
    await db.query(`INSERT INTO meta (generated_at, mode, dataset, counts) VALUES ($1, $2, $3, $4::jsonb)`, [
      m.generatedAt, m.mode, m.dataset, JSON.stringify(m.counts),
    ]);
    await db.query("COMMIT");
    await db.query(`UPDATE sync_runs SET status = 'published', finished_at = now(), counts = $2::jsonb WHERE id = $1`, [
      runId, JSON.stringify(m.counts),
    ]);
    return runId;
  } catch (err) {
    await db.query("ROLLBACK").catch(() => undefined);
    await db.query(`UPDATE sync_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`, [runId, String(err)]);
    throw err;
  }
}
