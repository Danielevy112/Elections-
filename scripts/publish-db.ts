/**
 * Publish the committed snapshot (and photos/bios/Knesset profiles) to Postgres as one
 * data version, then tell the live site to regenerate.
 *
 *   DATABASE_URL=... [REVALIDATE_URL=https://.../api/revalidate REVALIDATE_SECRET=...] npm run publish-db
 *
 * Runs the migration first (idempotent). Validates before writing; a failed publish rolls
 * back and leaves the live version untouched.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { loadSnapshot, repoRoot } from "@elections26/data";
import { migrate, publish, type Db } from "@elections26/db";

// --from-build: used by the Vercel build. Publishes only on production builds with
// DATA_SOURCE=db. Preview builds never write, so a branch preview can't overwrite the
// data the live site serves (both environments share one database).
if (
  process.argv.includes("--from-build") &&
  (process.env.VERCEL_ENV !== "production" || process.env.DATA_SOURCE !== "db" || !process.env.DATABASE_URL)
) {
  console.log("publish-db: not a production build with DATA_SOURCE=db, skipping");
  process.exit(0);
}

async function main() {
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const ov = (f: string) => JSON.parse(readFileSync(join(repoRoot(), "data", "manual_overrides", f), "utf8"));
const extras = {
  knessetProfiles: ov("knesset_profiles.json").profiles,
  photos: ov("photos.json").photos,
  bios: ov("bios.json").bios,
};

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
const db: Db = { query: async (text, params) => (await client.query(text, params)) as never };
try {
  await migrate(db);
  const runId = await publish(db, loadSnapshot(), extras);
  console.log(`published data version ${runId}`);
} finally {
  client.release();
  await pool.end();
}

if (process.env.REVALIDATE_URL && process.env.REVALIDATE_SECRET) {
  const res = await fetch(process.env.REVALIDATE_URL, {
    method: "POST",
    headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET },
  });
  console.log(`revalidate: ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
