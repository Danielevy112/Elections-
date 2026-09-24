import { z } from "zod";
import {
  Bill,
  BillInitiator,
  Candidacy,
  CandidateList,
  Committee,
  CommitteeMembership,
  Election,
  KnessetMembership,
  Party,
  Person,
  Poll,
  PollResult,
} from "./entities";
import { Claim, Source } from "./provenance";
import { IsoDateTime } from "./primitives";

export const SnapshotMeta = z.object({
  generatedAt: IsoDateTime,
  /** "live" when adapters hit the network, "offline" when replayed from fixtures. */
  mode: z.enum(["live", "offline"]),
  /**
   * Whether this snapshot describes reality.
   *
   * A repo has to ship runnable data, but an elections site rendering invented candidate
   * lists as though they were filed is the single worst thing this project could do. So
   * the distinction is a required field rather than a convention: the site refuses to
   * present an `example` snapshot without a standing warning, and `validate.ts` refuses
   * to let example-sourced rows into a `real` one.
   */
  /**
   * `preliminary` sits between the two: real filings, but taken from a source that is not
   * yet the final official record (e.g. a press publication of the filed lists before the
   * Central Elections Committee approves them). It is held to every rule of `real` except
   * that the site keeps a standing banner and stays out of search indexes.
   */
  dataset: z.enum(["example", "preliminary", "real"]),
  counts: z.record(z.string(), z.number().int().min(0)),
});
export type SnapshotMeta = z.infer<typeof SnapshotMeta>;

/**
 * The one place that maps a snapshot file to its schema. The loader, the writer and the
 * validator all read this, so adding an entity means touching exactly this table.
 */
export const COLLECTIONS = {
  persons: Person,
  parties: Party,
  elections: Election,
  candidate_lists: CandidateList,
  candidacies: Candidacy,
  knesset_memberships: KnessetMembership,
  committees: Committee,
  committee_memberships: CommitteeMembership,
  bills: Bill,
  bill_initiators: BillInitiator,
  polls: Poll,
  poll_results: PollResult,
  sources: Source,
  claims: Claim,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

export type Snapshot = {
  [K in CollectionName]: z.infer<(typeof COLLECTIONS)[K]>[];
} & { meta: SnapshotMeta };
