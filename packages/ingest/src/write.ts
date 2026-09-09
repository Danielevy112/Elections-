import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COLLECTION_NAMES, type Snapshot } from "@elections26/schema";

/**
 * Write the snapshot as one file per collection, key-sorted and newline-terminated.
 *
 * Deterministic output is not cosmetic here: snapshots are committed, and a sync that
 * reorders keys produces a diff nobody can review. Stable formatting means a data diff
 * shows exactly what changed upstream.
 */
export function writeSnapshot(dir: string, snapshot: Snapshot): void {
  mkdirSync(dir, { recursive: true });

  for (const name of COLLECTION_NAMES) {
    const rows = [...snapshot[name]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    writeFileSync(join(dir, `${name}.json`), stableJson(rows), "utf8");
  }
  writeFileSync(join(dir, "meta.json"), stableJson(snapshot.meta), "utf8");
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, sortedKeys, 2)}\n`;
}

function sortedKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(source).sort().map((k) => [k, source[k]]));
}
