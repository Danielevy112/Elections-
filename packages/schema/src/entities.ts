import { z } from "zod";
import { Id, IsoDate, IsoDateTime, Slug, Url } from "./primitives";

export const Person = z.object({
  id: Id,
  slug: Slug,
  nameHe: z.string().min(1),
  nameEn: z.string().optional(),
  /** Normalised Hebrew name used for entity matching. See ingest/match.ts. */
  nameNormalized: z.string().min(1),
  gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
  birthDate: IsoDate.optional(),
  photoUrl: Url.optional(),
  /** KNS_Person.PersonID — the join key to every parliamentary record. */
  knessetPersonId: z.number().int().positive().optional(),
  wikidataId: z.string().regex(/^Q\d+$/).optional(),
  knessetProfileUrl: Url.optional(),
});
export type Person = z.infer<typeof Person>;

export const Party = z.object({
  id: Id,
  slug: Slug,
  nameHe: z.string().min(1),
  nameEn: z.string().optional(),
  shortNameHe: z.string().optional(),
  leaderPersonId: Id.optional(),
  logoUrl: Url.optional(),
  /** Ballot letters (אותיות הפתק), assigned by the CEC after lists are filed. */
  ballotLetters: z.string().optional(),
  /** KNS_Faction.FactionID, when the party maps to a sitting faction. */
  knessetFactionId: z.number().int().positive().optional(),
  websiteUrl: Url.optional(),
});
export type Party = z.infer<typeof Party>;

export const Election = z.object({
  id: Id,
  knessetNumber: z.number().int().positive(),
  electionDate: IsoDate,
  /** Seats in the Knesset. 120, but kept explicit so the projection never hardcodes it. */
  totalSeats: z.number().int().positive().default(120),
  /** Electoral threshold as a fraction of valid votes. 3.25% since 2014. */
  thresholdPct: z.number().positive().max(100).default(3.25),
  listSubmissionOpensAt: IsoDate.optional(),
  listSubmissionClosesAt: IsoDate.optional(),
});
export type Election = z.infer<typeof Election>;

/**
 * Filing a list is not approval. The CEC approves, disqualifies or receives withdrawals
 * afterwards, so this is required with no default and is rendered on every party card.
 */
export const CandidateListStatus = z.enum([
  "submitted",
  "approved",
  "disqualified",
  "withdrawn",
]);
export type CandidateListStatus = z.infer<typeof CandidateListStatus>;

export const CandidateList = z.object({
  id: Id,
  electionId: Id,
  partyId: Id,
  status: CandidateListStatus,
  submittedAt: IsoDate.optional(),
  statusChangedAt: IsoDate.optional(),
  /** Free-text reason, required by validate.ts when status is disqualified. */
  statusNote: z.string().optional(),
});
export type CandidateList = z.infer<typeof CandidateList>;

export const Candidacy = z.object({
  id: Id,
  listId: Id,
  personId: Id,
  /** 1-based slot on the list. Contiguity is enforced by validate.ts. */
  position: z.number().int().positive(),
});
export type Candidacy = z.infer<typeof Candidacy>;

export const KnessetMembership = z.object({
  id: Id,
  personId: Id,
  knessetNumber: z.number().int().positive(),
  factionId: Id.optional(),
  factionNameHe: z.string().optional(),
  startDate: IsoDate.optional(),
  /** Absent means the term is current or ended with the Knesset itself. */
  endDate: IsoDate.optional(),
});
export type KnessetMembership = z.infer<typeof KnessetMembership>;

export const Committee = z.object({
  id: Id,
  knessetCommitteeId: z.number().int().positive().optional(),
  nameHe: z.string().min(1),
  knessetNumber: z.number().int().positive().optional(),
});
export type Committee = z.infer<typeof Committee>;

export const CommitteeMembership = z.object({
  id: Id,
  personId: Id,
  committeeId: Id,
  knessetNumber: z.number().int().positive(),
  role: z.enum(["chair", "member", "replacement", "unknown"]).default("member"),
  startDate: IsoDate.optional(),
  endDate: IsoDate.optional(),
});
export type CommitteeMembership = z.infer<typeof CommitteeMembership>;

/** Where a bill got to. Only `passed` counts as law in the UI. */
export const BillStatus = z.enum([
  "proposed",
  "preliminary",
  "first_reading",
  "committee",
  "second_third_reading",
  "passed",
  "rejected",
  "frozen",
  "withdrawn",
  "unknown",
]);
export type BillStatus = z.infer<typeof BillStatus>;

export const BillType = z.enum(["government", "private", "committee", "unknown"]);
export type BillType = z.infer<typeof BillType>;

export const Bill = z.object({
  id: Id,
  knessetBillId: z.number().int().positive().optional(),
  nameHe: z.string().min(1),
  knessetNumber: z.number().int().positive().optional(),
  status: BillStatus.default("unknown"),
  /** Raw upstream status text, kept so a mis-mapped status is always traceable. */
  statusRawHe: z.string().optional(),
  /**
   * Whether this is a government bill or a private member's bill. The distinction matters
   * for reading an MK's record: a private bill is their own initiative, a government one
   * is the cabinet's that they signed.
   */
  billType: BillType.default("unknown"),
  lastUpdatedAt: IsoDate.optional(),
  url: Url.optional(),
});
export type Bill = z.infer<typeof Bill>;

export const BillInitiator = z.object({
  id: Id,
  billId: Id,
  personId: Id,
  /** True for the lead initiator, false for co-signers. Counted separately in the UI. */
  isPrimary: z.boolean().default(false),
});
export type BillInitiator = z.infer<typeof BillInitiator>;

export const Poll = z.object({
  id: Id,
  electionId: Id,
  /** The institute that ran the fieldwork (e.g. "מדגם"), not the outlet that aired it. */
  pollster: z.string().min(1),
  publisher: z.string().min(1),
  publishedAt: IsoDate,
  fieldworkStart: IsoDate.optional(),
  fieldworkEnd: IsoDate.optional(),
  sampleSize: z.number().int().positive().optional(),
  marginOfError: z.number().positive().optional(),
  /** Required. A poll with no retrievable source is not publishable. */
  sourceUrl: Url,
});
export type Poll = z.infer<typeof Poll>;

export const PollResult = z.object({
  id: Id,
  pollId: Id,
  partyId: Id,
  /** Seats this poll gives the party. 0 when the poll places it below threshold. */
  mandates: z.number().int().min(0),
  belowThreshold: z.boolean().default(false),
});
export type PollResult = z.infer<typeof PollResult>;

/**
 * Milestone 2 seam: an AI-written paragraph is only ever allowed to summarise claims that
 * already exist, and must name them. Nothing writes this yet.
 */
export const Summary = z.object({
  id: Id,
  subjectType: z.enum(["person", "party"]),
  subjectId: Id,
  textHe: z.string().min(1),
  /** Claim ids the text is derived from. Empty is invalid: no unsourced prose. */
  basedOnClaimIds: z.array(Id).min(1),
  model: z.string().min(1),
  generatedAt: IsoDateTime,
});
export type Summary = z.infer<typeof Summary>;
