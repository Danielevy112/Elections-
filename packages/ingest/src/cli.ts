import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Fetcher, type FetchMode } from "./http";
import { loadManualBundle } from "./adapters/manual";
import { pullKnesset, type KnessetPull } from "./adapters/knesset";
import {
  describeProbe,
  fetchCandidateLists,
  probeCandidateLists,
  type CandidateListRow,
} from "./adapters/datagov";
import { buildSnapshot } from "./build";
import type { FieldReport } from "./odata";
import { writeSnapshot, stableJson } from "./write";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Options {
  mode: FetchMode;
  skipKnesset: boolean;
  skipDatagov: boolean;
  /** Report on data.gov.il coverage and exit without writing anything. */
  probeOnly: boolean;
  knessetNumbers: number[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    // Offline by default: a sync must be asked for explicitly, never triggered by a
    // stray script invocation on someone's laptop.
    mode: "offline",
    skipKnesset: false,
    skipDatagov: false,
    probeOnly: false,
    knessetNumbers: [24, 25],
  };

  for (const arg of argv) {
    if (arg === "--live") options.mode = "live";
    else if (arg === "--offline") options.mode = "offline";
    else if (arg === "--skip-knesset") options.skipKnesset = true;
    else if (arg === "--skip-datagov") options.skipDatagov = true;
    else if (arg === "--probe") options.probeOnly = true;
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
  const electionKnesset = manual.election.knessetNumber;

  if (options.probeOnly) {
    console.log(describeProbe(await probeCandidateLists(fetcher, electionKnesset)));
    return;
  }

  // Official candidate lists, if data.gov.il covers this election yet.
  let datagovLists: CandidateListRow[] | undefined;
  if (options.skipDatagov) {
    console.log("  data.gov.il: skipped (--skip-datagov)");
  } else {
    try {
      const probe = await probeCandidateLists(fetcher, electionKnesset);
      if (probe.matched) {
        const pull = await fetchCandidateLists(fetcher, probe.matched.id);
        datagovLists = pull.rows;
        console.log(
          `  data.gov.il: Knesset ${electionKnesset} IS covered — ${pull.rows.length} rows; ` +
            "official lists take precedence over the manual layer",
        );
        reportFieldNames("data.gov.il", pull.report);
      } else {
        console.log(
          `  data.gov.il: Knesset ${electionKnesset} not covered yet — using manual lists`,
        );
      }
    } catch (error) {
      if (options.mode === "live") throw error;
      console.warn(`  data.gov.il: unavailable offline — ${firstLine(error)}`);
    }
  }
  let knesset: KnessetPull | undefined;

  if (options.skipKnesset) {
    console.log("  knesset: skipped (--skip-knesset)");
  } else {
    try {
      knesset = await pullKnesset(fetcher, {
        knessetNumbers: options.knessetNumbers,
        candidateNames: candidateNames(manual, datagovLists),
      });
      console.log(
        `  knesset: ${knesset.persons.length} persons, ${knesset.positions.length} positions, ` +
          `${knesset.bills.length} bills`,
      );
      reportFields(knesset);
    } catch (error) {
      if (options.mode === "live") throw error;
      // Offline with no recorded Knesset responses is the normal state of a fresh clone.
      // Build what we can from the manual layer rather than failing the whole run.
      console.warn(`  knesset: unavailable offline — ${firstLine(error)}`);
      console.warn("  knesset: continuing without parliamentary data from OData");
    }
  }

  const { snapshot, unmatched } = buildSnapshot({
    manual,
    knesset,
    datagovLists,
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

/** Every name that appears on a list, from whichever source is currently authoritative. */
function candidateNames(
  manual: ReturnType<typeof loadManualBundle>,
  datagovLists: CandidateListRow[] | undefined,
): string[] {
  if (datagovLists && datagovLists.length > 0) {
    return datagovLists.map((row) => row.candidateName);
  }
  return manual.lists.flatMap((list) => list.candidates.map((c) => c.nameHe));
}

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
}

function reportFields(knesset: KnessetPull): void {
  reportFieldNames("knesset", knesset.report);
}

/**
 * Print what upstream actually called its fields. Neither source's column names could be
 * confirmed when the adapters were written, so this output is how a live run tells us the
 * real shape rather than silently producing rows full of undefined.
 */
function reportFieldNames(label: string, report: FieldReport): void {
  for (const row of report.surprises) {
    console.log(`  ${label}: field "${row.canonical}" actually arrived as "${row.actual}"`);
  }
  if (report.missing.length > 0) {
    console.log(`  ${label}: never supplied ${report.missing.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(`\ningest failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
