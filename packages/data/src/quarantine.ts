import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./loader";

/**
 * Filed names whose Knesset link the pipeline held back (an older MK matched by name alone,
 * with no second source). Read from the review file the ingest writes, so the site, the
 * database publish and the pipeline share one list instead of hand-copied ones.
 */
export function quarantinedKnessetNames(root = repoRoot()): Set<string> {
  const file = join(root, "data", "review", "knesset_links_quarantine.json");
  if (!existsSync(file)) return new Set();
  const rows = JSON.parse(readFileSync(file, "utf8")) as { name: string }[];
  return new Set(rows.map((r) => r.name));
}
