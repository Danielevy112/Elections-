import { z } from "zod";
import { Id, IsoDateTime, SourceKind, Url } from "./primitives";

/**
 * A retrievable document a fact was read from. Sources are deduplicated by URL during
 * ingestion, so many claims share one source row.
 */
export const Source = z.object({
  id: Id,
  kind: SourceKind,
  /** Absent only for `kind: "manual"`, where a human is the source of record. */
  url: Url.optional(),
  title: z.string().min(1),
  /** When ingestion actually read this document. */
  retrievedAt: IsoDateTime,
  note: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const ClaimSubjectType = z.enum([
  "person",
  "party",
  "candidateList",
  "candidacy",
  "knessetMembership",
  "committeeMembership",
  "poll",
  "pollResult",
]);
export type ClaimSubjectType = z.infer<typeof ClaimSubjectType>;

/**
 * One attributable assertion: "field F of subject S is V, per source X, checked at T".
 *
 * Claims live outside the entity records so entities stay readable while every displayed
 * number still resolves to a document. Keyed by (subjectType, subjectId, field), which is
 * exactly the primary key this becomes as a Postgres table.
 */
export const Claim = z.object({
  id: Id,
  subjectType: ClaimSubjectType,
  subjectId: Id,
  /** Field path on the subject, e.g. "position" or "billsInitiated". */
  field: z.string().min(1),
  /** The asserted value, serialised. Compared as a string to detect upstream changes. */
  value: z.string(),
  sourceId: Id,
  verifiedAt: IsoDateTime,
});
export type Claim = z.infer<typeof Claim>;
