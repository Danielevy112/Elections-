import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CandidateListStatus } from "@elections26/schema";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Hand-maintained inputs. These are not a fallback: for the 26th Knesset they are the
 * primary source, because lists were filed on 7-8 September 2026 and no machine-readable
 * feed carries them yet, and because Israel has no public polling API.
 *
 * The price of entering data by hand is that it must be exactly as traceable as scraped
 * data, so `sourceUrl` is required throughout and validated on every run.
 */
export const ManualElection = z.object({
  /** Required, and deliberately unset by default: see SnapshotMeta.dataset. */
  dataset: z.enum(["example", "real"]),
  knessetNumber: z.number().int().positive(),
  electionDate: IsoDate,
  totalSeats: z.number().int().positive().default(120),
  thresholdPct: z.number().positive().default(3.25),
  listSubmissionOpensAt: IsoDate.optional(),
  listSubmissionClosesAt: IsoDate.optional(),
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().min(1),
});

export const ManualParty = z.object({
  key: z.string().min(1),
  nameHe: z.string().min(1),
  nameEn: z.string().optional(),
  shortNameHe: z.string().optional(),
  leaderName: z.string().optional(),
  ballotLetters: z.string().optional(),
  logoUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().min(1),
});

export const ManualCandidate = z.object({
  position: z.number().int().positive(),
  nameHe: z.string().min(1),
  /** Set when the person is already known to the Knesset dataset. */
  knessetPersonId: z.number().int().positive().optional(),
  photoUrl: z.string().url().optional(),
});

export const ManualList = z.object({
  partyKey: z.string().min(1),
  status: CandidateListStatus,
  submittedAt: IsoDate.optional(),
  statusChangedAt: IsoDate.optional(),
  statusNote: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().min(1),
  candidates: z.array(ManualCandidate).min(1),
});

export const ManualPollResult = z.object({
  partyKey: z.string().min(1),
  mandates: z.number().int().min(0),
  belowThreshold: z.boolean().default(false),
});

export const ManualPoll = z.object({
  key: z.string().min(1),
  pollster: z.string().min(1),
  publisher: z.string().min(1),
  publishedAt: IsoDate,
  fieldworkStart: IsoDate.optional(),
  fieldworkEnd: IsoDate.optional(),
  sampleSize: z.number().int().positive().optional(),
  marginOfError: z.number().positive().optional(),
  sourceUrl: z.string().url(),
  results: z.array(ManualPollResult).min(1),
});

/** Example parliamentary records, loaded only for the example dataset. */
export const ManualParliamentary = z.object({
  memberships: z.array(
    z.object({
      candidateName: z.string().min(1),
      knessetNumber: z.number().int().positive(),
      factionNameHe: z.string().optional(),
      startDate: IsoDate.optional(),
      endDate: IsoDate.optional(),
    }),
  ).default([]),
  committees: z.array(
    z.object({ key: z.string().min(1), nameHe: z.string().min(1), knessetNumber: z.number().int().positive().optional() }),
  ).default([]),
  committeeMemberships: z.array(
    z.object({
      candidateName: z.string().min(1),
      committeeKey: z.string().min(1),
      knessetNumber: z.number().int().positive(),
      role: z.enum(["chair", "member", "replacement", "unknown"]).default("member"),
    }),
  ).default([]),
  bills: z.array(
    z.object({
      key: z.string().min(1),
      nameHe: z.string().min(1),
      knessetNumber: z.number().int().positive().optional(),
      status: z.string().min(1).default("unknown"),
      url: z.string().url().optional(),
    }),
  ).default([]),
  billInitiators: z.array(
    z.object({
      billKey: z.string().min(1),
      candidateName: z.string().min(1),
      isPrimary: z.boolean().default(false),
    }),
  ).default([]),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export type ManualElection = z.infer<typeof ManualElection>;
export type ManualParty = z.infer<typeof ManualParty>;
export type ManualList = z.infer<typeof ManualList>;
export type ManualPoll = z.infer<typeof ManualPoll>;
export type ManualParliamentary = z.infer<typeof ManualParliamentary>;

export interface ManualBundle {
  election: ManualElection;
  parties: ManualParty[];
  lists: ManualList[];
  polls: ManualPoll[];
  personLinks: Record<string, string>;
  parliamentary: ManualParliamentary | undefined;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseFile<S extends z.ZodTypeAny>(schema: S, path: string, label: string): z.infer<S> {
  const parsed = schema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 15)
      .map((i) => `  [${i.path.join(".")}] ${i.message}`)
      .join("\n");
    throw new Error(`${label} (${path}) failed validation:\n${issues}`);
  }
  return parsed.data;
}

export function loadManualBundle(dir: string): ManualBundle {
  const parliamentaryPath = join(dir, "example_parliamentary.json");
  const linksPath = join(dir, "person_links.json");

  return {
    election: parseFile(ManualElection, join(dir, "election.json"), "election.json"),
    parties: parseFile(z.array(ManualParty), join(dir, "parties.json"), "parties.json"),
    lists: parseFile(z.array(ManualList), join(dir, "lists.json"), "lists.json"),
    polls: parseFile(z.array(ManualPoll), join(dir, "polls.json"), "polls.json"),
    personLinks: existsSync(linksPath)
      ? parseFile(z.record(z.string(), z.string()), linksPath, "person_links.json")
      : {},
    parliamentary: existsSync(parliamentaryPath)
      ? parseFile(ManualParliamentary, parliamentaryPath, "example_parliamentary.json")
      : undefined,
  };
}
