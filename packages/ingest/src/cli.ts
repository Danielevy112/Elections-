import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Fetcher, type FetchMode } from "./http";
import { loadManualBundle } from "./adapters/manual";
import { pullKnesset, type KnessetPull } from "./adapters/knesset";
import { buildSnapshot } from "./build";
import { writeSnapshot, stableJson } from "./write";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Options {
  mode: FetchMode;
  skipKnesset: boolean;
  knessetNumbers: number[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    // Offline by default: a sync must be asked for explicitly, never triggered by a
    // stray script invocation on someone's laptop.
    mode: "offline",
    skipKnesset: false,
    knessetNumbers: [24, 25],
  };

  for (const arg of argv) {
    if (arg === "--live") options.mode = "live";
    else if (arg === "--offline") options.mode = "offline";
    else if (arg === "--skip-knesset") options.skipKnesset = true;
    else if (arg.startsWith("--knesset=")) {
      options.knessetNumbers = arg
        .slice("--knesset=".length)
        .split(",")
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => Number.isFinite(n));
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manualDir = join(ROOT, "data", "manual_overrides");
  const fixtureDir = join(ROOT, "data", "fixtures");
  const snapshotDir = join(ROOT, "data", "snapshots");

  console.log(`ingest: mode=${options.mode} knesset=${options.knessetNumbers.join(",")}`);

  const manual = loadManualBundle(manualDir);
  console.log(
    `  manual: ${manual.parties.length} parties, ${manual.lists.length} lists, ${manual.polls.length} polls`,
  );

  const fetcher = new Fetcher(options.mode, fixtureDir);
  let knesset: KnessetPull | undefined;

  if (options.skipKnesset) {
    console.log("  knesset: skipped (--skip-knesset)");
  } else {
    try {
      knesset = await pullKnesset(fetcher, { knessetNumbers: options.knessetNumbers });
      console.log(
        `  knesset: ${knesset.persons.length} persons, ${knesset.positions.length} positions, ` +
          `${knesset.bills.length} bills`,
      );
      reportFields(knesset);
    } catch (error) {
      if (options.mode === "live") throw error;
      // Offline with no recorded Knesset responses is the normal state of a fresh clone.
      // Build what we can from the manual layer rather than failing the whole run.
      console.warn(`  knesset: unavailable offline — ${(error as Error).message.split("\n")[0]}`);
      console.warn("  knesset: continuing without parliamentary data from OData");
    }
  }

  const { snapshot, unmatched } = buildSnapshot({
    manual,
    knesset,
    mode: options.mode,
    generatedAt: new Date().toISOString(),
  });

  writeSnapshot(snapshotDir, snapshot);
  writeFileSync(join(ROOT, "data", "unmatched.json"), stableJson(unmatched), "utf8");

  console.log("  wrote:");
  for (const [name, count] of Object.entries(snapshot.meta.counts)) {
    console.log(`    ${name.padEnd(22)} ${count}`);
  }

  if (unmatched.length > 0) {
    console.warn(`\n  ${unmatched.length} candidate(s) could not be matched to a Knesset person.`);
    console.warn("  Review data/unmatched.json and add entries to");
    console.warn("  data/manual_overrides/person_links.json. Names are never matched by guesswork.");
    for (const row of unmatched.slice(0, 10)) {
      console.warn(`    - ${row.name} (${row.partyKey} #${row.position}) — ${row.reason}`);
    }
  }
}

function reportFields(knesset: KnessetPull): void {
  const surprises = knesset.report.surprises;
  const missing = knesset.report.missing;
  if (surprises.length > 0) {
    console.log("  field aliases that differed from the documented name:");
    for (const row of surprises) console.log(`    ${row.canonical} -> ${row.actual}`);
  }
  if (missing.length > 0) {
    console.log(`  fields upstream never supplied: ${missing.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(`\ningest failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
