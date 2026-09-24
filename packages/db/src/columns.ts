import type { CollectionName } from "@elections26/schema";

/**
 * One row per snapshot field: JSON key, Postgres column, Postgres type. The table layout,
 * the seed and the loader are all generated from this map, so the DB can never drift from
 * the validated snapshot model. Optional fields are nullable; the loader strips nulls so a
 * row read back is byte-identical to the JSON it came from.
 */
export type PgType = "text" | "int" | "numeric" | "bool" | "date" | "timestamptz";
export type Column = readonly [key: string, column: string, type: PgType, required?: true];

export const TABLES: Record<CollectionName, { table: string; columns: readonly Column[] }> = {
  persons: { table: "persons", columns: [
    ["id", "id", "text", true], ["slug", "slug", "text", true], ["nameHe", "name_he", "text", true],
    ["nameEn", "name_en", "text"], ["nameNormalized", "name_normalized", "text", true],
    ["gender", "gender", "text", true], ["birthDate", "birth_date", "date"], ["photoUrl", "photo_url", "text"],
    ["knessetPersonId", "knesset_person_id", "int"], ["wikidataId", "wikidata_id", "text"],
    ["knessetProfileUrl", "knesset_profile_url", "text"],
  ] },
  parties: { table: "parties", columns: [
    ["id", "id", "text", true], ["slug", "slug", "text", true], ["nameHe", "name_he", "text", true],
    ["nameEn", "name_en", "text"], ["shortNameHe", "short_name_he", "text"], ["leaderPersonId", "leader_person_id", "text"],
    ["logoUrl", "logo_url", "text"], ["ballotLetters", "ballot_letters", "text"],
    ["knessetFactionId", "knesset_faction_id", "int"], ["websiteUrl", "website_url", "text"],
  ] },
  elections: { table: "elections", columns: [
    ["id", "id", "text", true], ["knessetNumber", "knesset_number", "int", true], ["electionDate", "election_date", "date", true],
    ["totalSeats", "total_seats", "int", true], ["thresholdPct", "threshold_pct", "numeric", true],
    ["listSubmissionOpensAt", "list_submission_opens_at", "date"], ["listSubmissionClosesAt", "list_submission_closes_at", "date"],
  ] },
  candidate_lists: { table: "candidate_lists", columns: [
    ["id", "id", "text", true], ["electionId", "election_id", "text", true], ["partyId", "party_id", "text", true],
    ["status", "status", "text", true], ["submittedAt", "submitted_at", "date"], ["statusChangedAt", "status_changed_at", "date"],
    ["statusNote", "status_note", "text"],
  ] },
  candidacies: { table: "candidacies", columns: [
    ["id", "id", "text", true], ["listId", "list_id", "text", true], ["personId", "person_id", "text", true],
    ["position", "position", "int", true],
  ] },
  knesset_memberships: { table: "knesset_memberships", columns: [
    ["id", "id", "text", true], ["personId", "person_id", "text", true], ["knessetNumber", "knesset_number", "int", true],
    ["factionId", "faction_id", "text"], ["factionNameHe", "faction_name_he", "text"],
    ["startDate", "start_date", "date"], ["endDate", "end_date", "date"],
  ] },
  committees: { table: "committees", columns: [
    ["id", "id", "text", true], ["knessetCommitteeId", "knesset_committee_id", "int"], ["nameHe", "name_he", "text", true],
    ["knessetNumber", "knesset_number", "int"],
  ] },
  committee_memberships: { table: "committee_memberships", columns: [
    ["id", "id", "text", true], ["personId", "person_id", "text", true], ["committeeId", "committee_id", "text", true],
    ["knessetNumber", "knesset_number", "int", true], ["role", "role", "text", true],
    ["startDate", "start_date", "date"], ["endDate", "end_date", "date"],
  ] },
  bills: { table: "bills", columns: [
    ["id", "id", "text", true], ["knessetBillId", "knesset_bill_id", "int"], ["nameHe", "name_he", "text", true],
    ["knessetNumber", "knesset_number", "int"], ["status", "status", "text", true], ["statusRawHe", "status_raw_he", "text"],
    ["billType", "bill_type", "text", true], ["lastUpdatedAt", "last_updated_at", "date"], ["url", "url", "text"],
  ] },
  bill_initiators: { table: "bill_initiators", columns: [
    ["id", "id", "text", true], ["billId", "bill_id", "text", true], ["personId", "person_id", "text", true],
    ["isPrimary", "is_primary", "bool", true],
  ] },
  polls: { table: "polls", columns: [
    ["id", "id", "text", true], ["electionId", "election_id", "text", true], ["pollster", "pollster", "text", true],
    ["publisher", "publisher", "text", true], ["publishedAt", "published_at", "date", true],
    ["fieldworkStart", "fieldwork_start", "date"], ["fieldworkEnd", "fieldwork_end", "date"],
    ["sampleSize", "sample_size", "int"], ["marginOfError", "margin_of_error", "numeric"], ["sourceUrl", "source_url", "text", true],
  ] },
  poll_results: { table: "poll_results", columns: [
    ["id", "id", "text", true], ["pollId", "poll_id", "text", true], ["partyId", "party_id", "text", true],
    ["mandates", "mandates", "int", true], ["belowThreshold", "below_threshold", "bool", true],
  ] },
  sources: { table: "sources", columns: [
    ["id", "id", "text", true], ["kind", "kind", "text", true], ["url", "url", "text"], ["title", "title", "text", true],
    ["retrievedAt", "retrieved_at", "text", true], ["note", "note", "text"],
  ] },
  claims: { table: "claims", columns: [
    ["id", "id", "text", true], ["subjectType", "subject_type", "text", true], ["subjectId", "subject_id", "text", true],
    ["field", "field", "text", true], ["value", "value", "text", true], ["sourceId", "source_id", "text", true],
    ["verifiedAt", "verified_at", "text", true],
  ] },
};
