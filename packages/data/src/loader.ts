import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLLECTIONS,
  COLLECTION_NAMES,
  SnapshotMeta,
  type CollectionName,
  type Snapshot,
} from "@elections26/schema";

/** Repo root, resolved from this file so it works under tsx, vitest and Next alike. */
export function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function snapshotDir(root = repoRoot()): string {
  return join(root, "data", "snapshots");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Read and validate every snapshot file. Throws on the first schema violation — a build
 * that ships malformed data is worse than a build that fails.
 */
export function loadSnapshot(dir = snapshotDir()): Snapshot {
  const out: Record<string, unknown> = {};

  for (const name of COLLECTION_NAMES) {
    const path = join(dir, `${name}.json`);
    const raw = readJson(path);
    if (!Array.isArray(raw)) {
      throw new Error(`${name}.json must contain a JSON array`);
    }
    const parsed = COLLECTIONS[name as CollectionName].array().safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${name}.json failed validation:\n${formatIssues(parsed.error.issues)}`);
    }
    out[name] = parsed.data;
  }

  const meta = SnapshotMeta.safeParse(readJson(join(dir, "meta.json")));
  if (!meta.success) {
    throw new Error(`meta.json failed validation:\n${formatIssues(meta.error.issues)}`);
  }
  out.meta = meta.data;

  return out as Snapshot;
}

function formatIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .slice(0, 20)
    .map((issue) => `  [${issue.path.join(".")}] ${issue.message}`)
    .join("\n");
}

/** Index a collection by id for O(1) joins. */
export function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

/** Group rows by a key, preserving input order within each group. */
export function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}
