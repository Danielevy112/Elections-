import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ManualPoll, loadManualBundle } from "@elections26/ingest";
import { stableJson } from "@elections26/ingest";

/**
 * Entry tool for polls.
 *
 * Polls are the one input that will never be automated away: Israel has no public polling
 * API, and the numbers are published as broadcast graphics and article text. So entry gets
 * a real tool rather than a hand-edited JSON file, and every rule `validate.ts` enforces on
 * a finished snapshot is enforced here too — at the point of entry, where a mistake costs
 * seconds instead of a bad deploy.
 *
 *   npm run add-poll -- --pollster "מדגם" --publisher "חדשות 12" \
 *     --date 2026-09-10 --sample 751 --source https://... \
 *     --seats ofek=24,yachad-kadima=21,bayit-yarok=0!
 *
 * A trailing "!" on a seat count marks the party as below the electoral threshold.
 * Alternatively pipe a JSON object on stdin with the same fields.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL_DIR = join(ROOT, "data", "manual_overrides");

export interface PollInput {
  pollster: string;
  publisher: string;
  publishedAt: string;
  sourceUrl: string;
  sampleSize?: number;
  fieldworkStart?: string;
  fieldworkEnd?: string;
  marginOfError?: number;
  seats: Record<string, { mandates: number; belowThreshold: boolean }>;
}

export function parseSeats(spec: string): PollInput["seats"] {
  const seats: PollInput["seats"] = {};
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const match = /^([^=]+)=(\d+)(!?)$/.exec(part);
    if (!match) {
      throw new Error(`bad --seats entry "${part}"; expected partyKey=NUMBER, "!" if below threshold`);
    }
    const [, key, value, below] = match;
    const belowThreshold = below === "!";
    seats[key!.trim()] = {
      // A party under the threshold wins no seats whatever figure was printed beside it.
      mandates: belowThreshold ? 0 : Number.parseInt(value!, 10),
      belowThreshold,
    };
  }
  return seats;
}

export interface ValidationContext {
  partyKeys: Set<string>;
  totalSeats: number;
  existingKeys: Set<string>;
  today: string;
}

/** Every rule validate.ts applies to a snapshot, applied before the poll is written. */
export function checkPoll(input: PollInput, context: ValidationContext): string[] {
  const problems: string[] = [];

  if (!input.sourceUrl) {
    problems.push("a poll with no sourceUrl is not publishable");
  } else if (!/^https?:\/\//.test(input.sourceUrl)) {
    problems.push(`sourceUrl must be an http(s) URL, got "${input.sourceUrl}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt)) {
    problems.push(`--date must be YYYY-MM-DD, got "${input.publishedAt}"`);
  } else if (input.publishedAt > context.today) {
    problems.push(`poll is dated ${input.publishedAt}, in the future`);
  }
  if (input.fieldworkEnd && input.fieldworkEnd > input.publishedAt) {
    problems.push("fieldwork ends after the poll was published");
  }

  const entries = Object.entries(input.seats);
  if (entries.length === 0) problems.push("no --seats given");

  for (const [key, result] of entries) {
    if (!context.partyKeys.has(key)) {
      problems.push(
        `unknown party key "${key}"; known keys: ${[...context.partyKeys].sort().join(", ")}`,
      );
    }
    if (result.belowThreshold && result.mandates > 0) {
      problems.push(`"${key}" is marked below threshold but claims ${result.mandates} seats`);
    }
  }

  const total = entries.reduce((sum, [, r]) => sum + r.mandates, 0);
  if (total > context.totalSeats) {
    problems.push(`seats total ${total}, more than the ${context.totalSeats} available`);
  }

  const key = pollKey(input);
  if (context.existingKeys.has(key)) {
    problems.push(`a poll with key "${key}" is already recorded; edit polls.json to replace it`);
  }

  return problems;
}

export function pollKey(input: PollInput): string {
  const slug = input.pollster.replace(/\s+/g, "-").toLowerCase();
  return `${slug}-${input.publishedAt}`;
}

export function toManualPoll(input: PollInput): z.infer<typeof ManualPoll> {
  return ManualPoll.parse({
    key: pollKey(input),
    pollster: input.pollster,
    publisher: input.publisher,
    publishedAt: input.publishedAt,
    ...(input.fieldworkStart ? { fieldworkStart: input.fieldworkStart } : {}),
    ...(input.fieldworkEnd ? { fieldworkEnd: input.fieldworkEnd } : {}),
    ...(input.sampleSize ? { sampleSize: input.sampleSize } : {}),
    ...(input.marginOfError ? { marginOfError: input.marginOfError } : {}),
    sourceUrl: input.sourceUrl,
    results: Object.entries(input.seats).map(([partyKey, r]) => ({
      partyKey,
      mandates: r.mandates,
      belowThreshold: r.belowThreshold,
    })),
  });
}

function parseArgs(argv: string[]): PollInput {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag?.startsWith("--")) throw new Error(`expected a --flag, got "${flag}"`);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${flag.slice(2)} needs a value`);
    flags.set(flag.slice(2), value);
  }

  const required = (name: string): string => {
    const value = flags.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };

  const sample = flags.get("sample");
  const moe = flags.get("moe");

  return {
    pollster: required("pollster"),
    publisher: required("publisher"),
    publishedAt: required("date"),
    sourceUrl: flags.get("source") ?? "",
    ...(sample ? { sampleSize: Number.parseInt(sample, 10) } : {}),
    ...(moe ? { marginOfError: Number.parseFloat(moe) } : {}),
    ...(flags.get("fieldwork-start") ? { fieldworkStart: flags.get("fieldwork-start")! } : {}),
    ...(flags.get("fieldwork-end") ? { fieldworkEnd: flags.get("fieldwork-end")! } : {}),
    seats: parseSeats(required("seats")),
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const bundle = loadManualBundle(MANUAL_DIR);

  let input: PollInput;
  if (argv.length === 0) {
    const raw = (await readStdin()).trim();
    if (!raw) {
      console.error("add-poll: no arguments and nothing on stdin. See scripts/add-poll.ts.");
      process.exitCode = 1;
      return;
    }
    const parsed = JSON.parse(raw) as PollInput & { seats?: PollInput["seats"] | string };
    input = {
      ...parsed,
      seats: typeof parsed.seats === "string" ? parseSeats(parsed.seats) : (parsed.seats ?? {}),
    };
  } else {
    input = parseArgs(argv);
  }

  const problems = checkPoll(input, {
    partyKeys: new Set(bundle.parties.map((p) => p.key)),
    totalSeats: bundle.election.totalSeats,
    existingKeys: new Set(bundle.polls.map((p) => p.key)),
    today: new Date().toISOString().slice(0, 10),
  });

  if (problems.length > 0) {
    console.error(`add-poll: ${problems.length} problem(s) — nothing was written\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  const path = join(MANUAL_DIR, "polls.json");
  const polls = JSON.parse(readFileSync(path, "utf8")) as unknown[];
  polls.push(toManualPoll(input));
  writeFileSync(path, stableJson(polls), "utf8");

  console.log(`add-poll: wrote "${pollKey(input)}" to polls.json`);
  console.log("  now run: npm run ingest -- --offline && npm run validate");
}

if (process.argv[1]?.endsWith("add-poll.ts")) {
  main().catch((error: unknown) => {
    console.error(`add-poll: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
