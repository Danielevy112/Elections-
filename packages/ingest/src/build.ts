import { createHash } from "node:crypto";
import type {
  Bill,
  BillInitiator,
  Candidacy,
  CandidateList,
  Claim,
  Committee,
  CommitteeMembership,
  Election,
  KnessetMembership,
  Party,
  Person,
  Poll,
  PollResult,
  Snapshot,
  Source,
  SourceKind,
} from "@elections26/schema";
import { BillStatus } from "@elections26/schema";
import type { ManualBundle } from "./adapters/manual";
import { mapBillStatus, type KnessetPull } from "./adapters/knesset";
import { matchPerson, normalizeHebrewName, slugifyHebrew, uniqueSlug } from "./match";

/** Deduplicates sources by URL (or title, for manual entries) and hands back stable ids. */
class SourceRegistry {
  private readonly sources = new Map<string, Source>();
  readonly claims: Claim[] = [];

  constructor(private readonly retrievedAt: string) {}

  use(kind: SourceKind, title: string, url?: string, note?: string): string {
    const key = url ?? `${kind}:${title}`;
    const existing = this.sources.get(key);
    if (existing) return existing.id;

    const id = `source:${createHash("sha1").update(key).digest("hex").slice(0, 12)}`;
    this.sources.set(key, {
      id,
      kind,
      ...(url ? { url } : {}),
      title,
      retrievedAt: this.retrievedAt,
      ...(note ? { note } : {}),
    });
    return id;
  }

  /** Record that `field` of `subject` is `value`, per `sourceId`. */
  assert(
    subjectType: Claim["subjectType"],
    subjectId: string,
    field: string,
    value: string | number | boolean,
    sourceId: string,
  ): void {
    this.claims.push({
      id: `claim:${createHash("sha1")
        .update(`${subjectType}|${subjectId}|${field}`)
        .digest("hex")
        .slice(0, 12)}`,
      subjectType,
      subjectId,
      field,
      value: String(value),
      sourceId,
      verifiedAt: this.retrievedAt,
    });
  }

  get all(): Source[] {
    return [...this.sources.values()];
  }
}

export interface UnmatchedCandidate {
  name: string;
  partyKey: string;
  position: number;
  reason: string;
  candidates: string[];
}

export interface BuildResult {
  snapshot: Snapshot;
  unmatched: UnmatchedCandidate[];
}

export interface BuildInput {
  manual: ManualBundle;
  knesset: KnessetPull | undefined;
  mode: "live" | "offline";
  generatedAt: string;
}

export function buildSnapshot(input: BuildInput): BuildResult {
  const { manual, knesset } = input;
  const registry = new SourceRegistry(input.generatedAt);
  const unmatched: UnmatchedCandidate[] = [];

  const electionId = `election:${manual.election.knessetNumber}`;
  const electionSource = registry.use(
    manual.election.sourceUrl ? "cec" : "manual",
    manual.election.sourceTitle,
    manual.election.sourceUrl,
  );

  const election: Election = {
    id: electionId,
    knessetNumber: manual.election.knessetNumber,
    electionDate: manual.election.electionDate,
    totalSeats: manual.election.totalSeats,
    thresholdPct: manual.election.thresholdPct,
    ...(manual.election.listSubmissionOpensAt
      ? { listSubmissionOpensAt: manual.election.listSubmissionOpensAt }
      : {}),
    ...(manual.election.listSubmissionClosesAt
      ? { listSubmissionClosesAt: manual.election.listSubmissionClosesAt }
      : {}),
  };

  // ---- persons -----------------------------------------------------------------
  // Knesset persons form the match target set; list candidates are resolved against it.
  const knessetByPersonId = new Map<number, KnessetPull["persons"][number]>();
  for (const person of knesset?.persons ?? []) knessetByPersonId.set(person.knessetPersonId, person);

  const matchTargets = (knesset?.persons ?? []).map((p) => ({
    id: `person:knesset-${p.knessetPersonId}`,
    nameNormalized: normalizeHebrewName(p.nameHe),
  }));

  const persons = new Map<string, Person>();
  const slugs = new Set<string>();
  const personIdByKnessetId = new Map<number, string>();
  /** Candidate display name -> our person id, for the parliamentary example data. */
  const personIdByName = new Map<string, string>();

  function ensurePerson(args: {
    nameHe: string;
    knessetPersonId?: number;
    photoUrl?: string;
    sourceId: string;
  }): Person {
    const knessetId = args.knessetPersonId;
    const id = knessetId !== undefined ? `person:knesset-${knessetId}` : `person:${hash(args.nameHe)}`;

    const existing = persons.get(id);
    if (existing) return existing;

    const upstream = knessetId !== undefined ? knessetByPersonId.get(knessetId) : undefined;
    const nameHe = upstream?.nameHe ?? args.nameHe;
    const person: Person = {
      id,
      slug: uniqueSlug(slugifyHebrew(nameHe, `person-${hash(nameHe).slice(0, 6)}`), slugs),
      nameHe,
      nameNormalized: normalizeHebrewName(nameHe),
      gender: upstream?.gender ?? "unknown",
      ...(upstream?.photoUrl ?? args.photoUrl ? { photoUrl: upstream?.photoUrl ?? args.photoUrl } : {}),
      ...(knessetId !== undefined ? { knessetPersonId: knessetId } : {}),
      ...(knessetId !== undefined
        ? { knessetProfileUrl: `https://main.knesset.gov.il/mk/Pages/MkPersonalDetails.aspx?MkId=${knessetId}` }
        : {}),
    };

    persons.set(id, person);
    if (knessetId !== undefined) personIdByKnessetId.set(knessetId, id);
    personIdByName.set(normalizeHebrewName(args.nameHe), id);
    registry.assert("person", id, "nameHe", nameHe, args.sourceId);
    return person;
  }

  // ---- parties -----------------------------------------------------------------
  const partyIdByKey = new Map<string, string>();
  const parties: Party[] = [];
  const partySlugs = new Set<string>();

  for (const manualParty of manual.parties) {
    const id = `party:${manualParty.key}`;
    const sourceId = registry.use(
      manualParty.sourceUrl ? "party" : "manual",
      manualParty.sourceTitle,
      manualParty.sourceUrl,
    );
    partyIdByKey.set(manualParty.key, id);

    let leaderPersonId: string | undefined;
    if (manualParty.leaderName) {
      const outcome = matchPerson(manualParty.leaderName, matchTargets, manual.personLinks);
      const leader = ensurePerson({
        nameHe: manualParty.leaderName,
        ...(outcome.kind === "matched"
          ? { knessetPersonId: knessetIdFromPersonId(outcome.personId) }
          : {}),
        sourceId,
      });
      leaderPersonId = leader.id;
    }

    const party: Party = {
      id,
      slug: uniqueSlug(slugifyHebrew(manualParty.nameHe, manualParty.key), partySlugs),
      nameHe: manualParty.nameHe,
      ...(manualParty.nameEn ? { nameEn: manualParty.nameEn } : {}),
      ...(manualParty.shortNameHe ? { shortNameHe: manualParty.shortNameHe } : {}),
      ...(leaderPersonId ? { leaderPersonId } : {}),
      ...(manualParty.logoUrl ? { logoUrl: manualParty.logoUrl } : {}),
      ...(manualParty.ballotLetters ? { ballotLetters: manualParty.ballotLetters } : {}),
      ...(manualParty.websiteUrl ? { websiteUrl: manualParty.websiteUrl } : {}),
    };
    parties.push(party);
    registry.assert("party", id, "nameHe", party.nameHe, sourceId);
    if (party.ballotLetters) {
      registry.assert("party", id, "ballotLetters", party.ballotLetters, sourceId);
    }
  }

  // ---- lists and candidacies ---------------------------------------------------
  const candidateLists: CandidateList[] = [];
  const candidacies: Candidacy[] = [];

  for (const manualList of manual.lists) {
    const partyId = partyIdByKey.get(manualList.partyKey);
    if (!partyId) {
      throw new Error(`lists.json references unknown party key "${manualList.partyKey}"`);
    }
    const listId = `list:${manual.election.knessetNumber}:${manualList.partyKey}`;
    const sourceId = registry.use(
      manualList.sourceUrl ? "cec" : "manual",
      manualList.sourceTitle,
      manualList.sourceUrl,
    );

    candidateLists.push({
      id: listId,
      electionId,
      partyId,
      status: manualList.status,
      ...(manualList.submittedAt ? { submittedAt: manualList.submittedAt } : {}),
      ...(manualList.statusChangedAt ? { statusChangedAt: manualList.statusChangedAt } : {}),
      ...(manualList.statusNote ? { statusNote: manualList.statusNote } : {}),
    });
    registry.assert("candidateList", listId, "status", manualList.status, sourceId);

    for (const candidate of manualList.candidates) {
      const outcome = matchPerson(candidate.nameHe, matchTargets, manual.personLinks);
      if (outcome.kind === "unmatched" && knesset !== undefined) {
        unmatched.push({
          name: candidate.nameHe,
          partyKey: manualList.partyKey,
          position: candidate.position,
          reason: outcome.reason,
          candidates: outcome.candidates,
        });
      }

      const knessetPersonId =
        candidate.knessetPersonId ??
        (outcome.kind === "matched" ? knessetIdFromPersonId(outcome.personId) : undefined);

      const person = ensurePerson({
        nameHe: candidate.nameHe,
        ...(knessetPersonId !== undefined ? { knessetPersonId } : {}),
        ...(candidate.photoUrl ? { photoUrl: candidate.photoUrl } : {}),
        sourceId,
      });

      const candidacyId = `candidacy:${listId}:${candidate.position}`;
      candidacies.push({ id: candidacyId, listId, personId: person.id, position: candidate.position });
      registry.assert("candidacy", candidacyId, "position", candidate.position, sourceId);
    }
  }

  // ---- polls -------------------------------------------------------------------
  const polls: Poll[] = [];
  const pollResults: PollResult[] = [];

  for (const manualPoll of manual.polls) {
    const pollId = `poll:${manualPoll.key}`;
    const sourceId = registry.use("press", `${manualPoll.publisher} — ${manualPoll.pollster}`, manualPoll.sourceUrl);

    polls.push({
      id: pollId,
      electionId,
      pollster: manualPoll.pollster,
      publisher: manualPoll.publisher,
      publishedAt: manualPoll.publishedAt,
      ...(manualPoll.fieldworkStart ? { fieldworkStart: manualPoll.fieldworkStart } : {}),
      ...(manualPoll.fieldworkEnd ? { fieldworkEnd: manualPoll.fieldworkEnd } : {}),
      ...(manualPoll.sampleSize ? { sampleSize: manualPoll.sampleSize } : {}),
      ...(manualPoll.marginOfError ? { marginOfError: manualPoll.marginOfError } : {}),
      sourceUrl: manualPoll.sourceUrl,
    });
    registry.assert("poll", pollId, "publishedAt", manualPoll.publishedAt, sourceId);

    for (const result of manualPoll.results) {
      const partyId = partyIdByKey.get(result.partyKey);
      if (!partyId) {
        throw new Error(`polls.json (${manualPoll.key}) references unknown party "${result.partyKey}"`);
      }
      const resultId = `pollresult:${manualPoll.key}:${result.partyKey}`;
      pollResults.push({
        id: resultId,
        pollId,
        partyId,
        // A poll that puts a party under the threshold awards it no seats.
        mandates: result.belowThreshold ? 0 : result.mandates,
        belowThreshold: result.belowThreshold,
      });
      registry.assert("pollResult", resultId, "mandates", result.mandates, sourceId);
    }
  }

  // ---- parliamentary record ----------------------------------------------------
  const parliamentary = buildParliamentary({
    knesset,
    manual,
    registry,
    personIdByKnessetId,
    personIdByName,
    ensurePerson,
  });

  const collections = {
    persons: [...persons.values()],
    parties,
    elections: [election],
    candidate_lists: candidateLists,
    candidacies,
    knesset_memberships: parliamentary.memberships,
    committees: parliamentary.committees,
    committee_memberships: parliamentary.committeeMemberships,
    bills: parliamentary.bills,
    bill_initiators: parliamentary.billInitiators,
    polls,
    poll_results: pollResults,
    sources: registry.all,
    claims: registry.claims,
  };

  const counts = Object.fromEntries(
    Object.entries(collections).map(([name, rows]) => [name, rows.length]),
  );

  return {
    snapshot: {
      ...collections,
      meta: {
        generatedAt: input.generatedAt,
        mode: input.mode,
        dataset: manual.election.dataset,
        counts,
      },
    },
    unmatched,
  };
}

function knessetIdFromPersonId(personId: string): number | undefined {
  const match = /^person:knesset-(\d+)$/.exec(personId);
  return match ? Number(match[1]) : undefined;
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

interface ParliamentaryInput {
  knesset: KnessetPull | undefined;
  manual: ManualBundle;
  registry: SourceRegistry;
  personIdByKnessetId: Map<number, string>;
  personIdByName: Map<string, string>;
  ensurePerson: (args: { nameHe: string; knessetPersonId?: number; sourceId: string }) => Person;
}

function buildParliamentary(input: ParliamentaryInput): {
  memberships: KnessetMembership[];
  committees: Committee[];
  committeeMemberships: CommitteeMembership[];
  bills: Bill[];
  billInitiators: BillInitiator[];
} {
  const { knesset, manual, registry, personIdByKnessetId } = input;

  // Live path: everything comes from the Knesset's own service.
  if (knesset) {
    const knessetSource = registry.use(
      "knesset",
      "מאגר המידע הפרלמנטרי של הכנסת (OData)",
      "https://knesset.gov.il/Odata/ParliamentInfo.svc",
    );

    const memberships: KnessetMembership[] = [];
    for (const position of knesset.positions) {
      const personId = personIdByKnessetId.get(position.knessetPersonId);
      if (!personId) continue; // Not on any list we track; skip rather than bloat the snapshot.
      const id = `membership:${position.knessetPersonId}:${position.knessetNumber}`;
      if (memberships.some((m) => m.id === id)) continue;
      memberships.push({
        id,
        personId,
        knessetNumber: position.knessetNumber,
        ...(position.factionId ? { factionId: `faction:${position.factionId}` } : {}),
        ...(position.factionNameHe ? { factionNameHe: position.factionNameHe } : {}),
        ...(position.startDate ? { startDate: position.startDate } : {}),
        ...(position.endDate ? { endDate: position.endDate } : {}),
      });
      registry.assert("knessetMembership", id, "knessetNumber", position.knessetNumber, knessetSource);
    }

    const committees: Committee[] = knesset.committees.map((c) => ({
      id: `committee:${c.knessetCommitteeId}`,
      knessetCommitteeId: c.knessetCommitteeId,
      nameHe: c.nameHe,
      ...(c.knessetNumber ? { knessetNumber: c.knessetNumber } : {}),
    }));

    const trackedPersonIds = new Set(personIdByKnessetId.keys());
    const bills: Bill[] = [];
    const keptBillIds = new Set<number>();
    const initiatorsByBill = new Map<number, typeof knesset.billInitiators>();
    for (const initiator of knesset.billInitiators) {
      if (!trackedPersonIds.has(initiator.knessetPersonId)) continue;
      const bucket = initiatorsByBill.get(initiator.knessetBillId);
      if (bucket) bucket.push(initiator);
      else initiatorsByBill.set(initiator.knessetBillId, [initiator]);
    }

    for (const bill of knesset.bills) {
      if (!initiatorsByBill.has(bill.knessetBillId)) continue;
      keptBillIds.add(bill.knessetBillId);
      bills.push({
        id: `bill:${bill.knessetBillId}`,
        knessetBillId: bill.knessetBillId,
        nameHe: bill.nameHe,
        ...(bill.knessetNumber ? { knessetNumber: bill.knessetNumber } : {}),
        status: BillStatus.parse(mapBillStatus(bill.statusRawHe)),
        ...(bill.statusRawHe ? { statusRawHe: bill.statusRawHe } : {}),
      });
    }

    const billInitiators: BillInitiator[] = [];
    for (const [billId, rows] of initiatorsByBill) {
      if (!keptBillIds.has(billId)) continue;
      for (const row of rows) {
        const personId = personIdByKnessetId.get(row.knessetPersonId);
        if (!personId) continue;
        billInitiators.push({
          id: `initiator:${billId}:${row.knessetPersonId}`,
          billId: `bill:${billId}`,
          personId,
          isPrimary: row.isPrimary,
        });
      }
    }

    return { memberships, committees, committeeMemberships: [], bills, billInitiators };
  }

  // Offline / example path: parliamentary records supplied by hand, clearly sourced.
  const example = manual.parliamentary;
  if (!example) {
    return { memberships: [], committees: [], committeeMemberships: [], bills: [], billInitiators: [] };
  }

  const sourceId = registry.use(
    example.sourceUrl ? "knesset" : "manual",
    example.sourceTitle,
    example.sourceUrl,
  );

  const resolve = (name: string): string | undefined =>
    input.personIdByName.get(normalizeHebrewName(name));

  const memberships: KnessetMembership[] = [];
  for (const row of example.memberships) {
    const personId = resolve(row.candidateName);
    if (!personId) continue;
    const id = `membership:${hash(`${row.candidateName}:${row.knessetNumber}`)}`;
    memberships.push({
      id,
      personId,
      knessetNumber: row.knessetNumber,
      ...(row.factionNameHe ? { factionNameHe: row.factionNameHe } : {}),
      ...(row.startDate ? { startDate: row.startDate } : {}),
      ...(row.endDate ? { endDate: row.endDate } : {}),
    });
    registry.assert("knessetMembership", id, "knessetNumber", row.knessetNumber, sourceId);
  }

  const committees: Committee[] = example.committees.map((c) => ({
    id: `committee:${c.key}`,
    nameHe: c.nameHe,
    ...(c.knessetNumber ? { knessetNumber: c.knessetNumber } : {}),
  }));
  const committeeKeys = new Set(committees.map((c) => c.id));

  const committeeMemberships: CommitteeMembership[] = [];
  for (const row of example.committeeMemberships) {
    const personId = resolve(row.candidateName);
    const committeeId = `committee:${row.committeeKey}`;
    if (!personId || !committeeKeys.has(committeeId)) continue;
    const id = `cmt-membership:${hash(`${row.candidateName}:${row.committeeKey}:${row.knessetNumber}`)}`;
    committeeMemberships.push({ id, personId, committeeId, knessetNumber: row.knessetNumber, role: row.role });
    registry.assert("committeeMembership", id, "committeeId", committeeId, sourceId);
  }

  const bills: Bill[] = example.bills.map((b) => ({
    id: `bill:${b.key}`,
    nameHe: b.nameHe,
    ...(b.knessetNumber ? { knessetNumber: b.knessetNumber } : {}),
    status: BillStatus.parse(BillStatus.safeParse(b.status).success ? b.status : mapBillStatus(b.status)),
    statusRawHe: b.status,
    ...(b.url ? { url: b.url } : {}),
  }));
  const billKeys = new Set(bills.map((b) => b.id));

  const billInitiators: BillInitiator[] = [];
  for (const row of example.billInitiators) {
    const personId = resolve(row.candidateName);
    const billId = `bill:${row.billKey}`;
    if (!personId || !billKeys.has(billId)) continue;
    billInitiators.push({
      id: `initiator:${hash(`${row.billKey}:${row.candidateName}`)}`,
      billId,
      personId,
      isPrimary: row.isPrimary,
    });
  }

  return { memberships, committees, committeeMemberships, bills, billInitiators };
}
