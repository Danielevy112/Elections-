import { readFileSync, readdirSync } from "node:fs";
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
  photos: Record<string, unknown>[];
  bios: Record<string, unknown>[];
}

const here = dirname(fileURLToPath(import.meta.url));

/** Every migration, in file-name order. Each is idempotent, so all run on every publish. */
export function migrationSql(): string {
  const dir = join(here, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
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
export async function loadSnapshotFromDb(db: Db, options: { omit?: readonly CollectionName[] } = {}): Promise<Snapshot> {
  const out: Record<string, unknown> = {};
  const omit = new Set<string>(options.omit ?? []);
  for (const name of COLLECTION_NAMES) {
    if (omit.has(name)) {
      out[name] = [];
      continue;
    }
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

export interface BillRecordRow {
  knessetBillId?: number;
  nameHe: string;
  knessetNumber?: number;
  status: string;
  statusRawHe?: string;
  billType: string;
  isPrimary: boolean;
}

/**
 * One person's legislative record straight from Postgres: counts aggregated in SQL and the
 * two lists capped, so a veteran with 3,000 bills costs three indexed queries, not a scan
 * of every bill. Mirrors billRecordFromItems in packages/data.
 */
export async function loadBillRecord(
  db: Db,
  personId: string,
  limits: { passed: number; recentLead: number },
): Promise<{ counts: { initiated: number; lead: number; passed: number; privateLead: number }; passed: BillRecordRow[]; recentLead: BillRecordRow[] }> {
  const item = `jsonb_strip_nulls(jsonb_build_object('knessetBillId', b.knesset_bill_id, 'nameHe', b.name_he,
    'knessetNumber', b.knesset_number, 'status', b.status, 'statusRawHe', b.status_raw_he, 'billType', b.bill_type,
    'isPrimary', bi.is_primary)) AS row`;
  const order = `ORDER BY b.knesset_number DESC NULLS LAST, b.knesset_bill_id DESC NULLS LAST`;
  const [counts, passed, recentLead] = await Promise.all([
    db.query<{ initiated: number; lead: number; passed: number; private_lead: number }>(
      `SELECT count(*)::int AS initiated,
              count(*) FILTER (WHERE bi.is_primary)::int AS lead,
              count(*) FILTER (WHERE b.status = 'passed')::int AS passed,
              count(*) FILTER (WHERE bi.is_primary AND b.bill_type = 'private')::int AS private_lead
         FROM bill_initiators bi JOIN bills b ON b.id = bi.bill_id WHERE bi.person_id = $1`,
      [personId],
    ),
    db.query<{ row: BillRecordRow }>(
      `SELECT ${item} FROM bill_initiators bi JOIN bills b ON b.id = bi.bill_id
        WHERE bi.person_id = $1 AND b.status = 'passed' ${order} LIMIT $2`,
      [personId, limits.passed],
    ),
    db.query<{ row: BillRecordRow }>(
      `SELECT ${item} FROM bill_initiators bi JOIN bills b ON b.id = bi.bill_id
        WHERE bi.person_id = $1 AND bi.is_primary AND b.bill_type = 'private' ${order} LIMIT $2`,
      [personId, limits.recentLead],
    ),
  ]);
  const c = counts.rows[0]!;
  return {
    counts: { initiated: c.initiated, lead: c.lead, passed: c.passed, privateLead: c.private_lead },
    passed: passed.rows.map((r) => r.row),
    recentLead: recentLead.rows.map((r) => r.row),
  };
}

const DATA_TABLES = [...COLLECTION_NAMES.map((n) => TABLES[n].table), "knesset_profiles", "photos", "bios", "meta"];

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
