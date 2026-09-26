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
import { BillStatus, BillType, verifyKnessetLink } from "@elections26/schema";
import type { ManualBundle, ManualList, ManualParty } from "./adapters/manual";
import type { CandidateListRow } from "./adapters/datagov";
import { mapBillStatus, mapBillType, type KnessetPull } from "./adapters/knesset";
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

/** A name-matched Knesset link held back by verifyKnessetLink, for a person to review. */
export interface QuarantinedLink {
  name: string;
  partyKey: string;
  position: number;
  knessetPersonId: number;
  knessetName: string | undefined;
  lastKnesset: number | undefined;
  reason: string;
}

export interface BuildResult {
  snapshot: Snapshot;
  unmatched: UnmatchedCandidate[];
  quarantined: QuarantinedLink[];
}

export interface BuildInput {
  manual: ManualBundle;
  knesset: KnessetPull | undefined;
  /** Official candidate lists, when data.gov.il covers this election. */
  datagovLists: CandidateListRow[] | undefined;
  datagovSourceUrl?: string;
  mode: "live" | "offline";
  generatedAt: string;
}

/**
 * Choose which candidate lists to build from.
 *
 * The official feed outranks the manual layer, per the precedence in docs/sources.md: as
 * soon as data.gov.il carries this election, its rows replace the hand-entered ones.
 *
 * Two details are deliberate. Status stays with the manual override where one exists and
 * otherwise falls back to "submitted" — the dataset lists candidates but does not say
 * whether the Elections Committee approved the list, and claiming approval we cannot
 * source is exactly the failure this project is built to avoid. And a party appearing in
 * the feed that we have never seen still gets a list; a real filing must not be dropped
 * because it was missing from our own table.
 */
export function resolveLists(
  manual: ManualBundle,
  datagovRows: CandidateListRow[] | undefined,
): { lists: ManualList[]; parties: ManualParty[]; origin: "datagov" | "manual" } {
  if (!datagovRows || datagovRows.length === 0) {
    return { lists: manual.lists, parties: manual.parties, origin: "manual" };
  }

  const byNormalizedName = new Map<string, ManualParty>();
  for (const party of manual.parties) {
    byNormalizedName.set(normalizeHebrewName(party.nameHe), party);
    if (party.datagovName) byNormalizedName.set(normalizeHebrewName(party.datagovName), party);
  }

  const grouped = new Map<string, CandidateListRow[]>();
  for (const row of datagovRows) {
    const key = normalizeHebrewName(row.partyName);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const listsByKey = new Map(manual.lists.map((list) => [list.partyKey, list]));
  const parties: ManualParty[] = [];
  const lists: ManualList[] = [];

  for (const [normalized, rows] of grouped) {
    const known = byNormalizedName.get(normalized);
    const displayName = rows[0]?.partyName ?? normalized;
    const key = known?.key ?? `datagov-${hash(normalized).slice(0, 8)}`;
    const override = known ? listsByKey.get(known.key) : undefined;

    parties.push(
      known ?? {
        key,
        nameHe: displayName,
        ...(rows[0]?.ballotLetters ? { ballotLetters: rows[0].ballotLetters } : {}),
        sourceTitle: "רשימות המועמדים לכנסת — ועדת הבחירות המרכזית (data.gov.il)",
      },
    );

    lists.push({
      partyKey: key,
      status: override?.status ?? "submitted",
      ...(override?.submittedAt ? { submittedAt: override.submittedAt } : {}),
      ...(override?.statusChangedAt ? { statusChangedAt: override.statusChangedAt } : {}),
      ...(override?.statusNote ? { statusNote: override.statusNote } : {}),
      sourceTitle: "רשימות המועמדים לכנסת — ועדת הבחירות המרכזית (data.gov.il)",
      candidates: [...rows]
        .sort((a, b) => a.position - b.position)
        .map((row) => ({ position: row.position, nameHe: row.candidateName })),
    });
  }

  // Parties we know of that the feed did not mention keep their manual list, so a party
  // page never vanishes mid-election because of a gap upstream.
  for (const party of manual.parties) {
    if (parties.some((p) => p.key === party.key)) continue;
    const list = listsByKey.get(party.key);
    if (!list) continue;
    parties.push(party);
    lists.push(list);
  }

  return { lists, parties, origin: "datagov" };
}

export function buildSnapshot(input: BuildInput): BuildResult {
  const { knesset } = input;
  const resolved = resolveLists(input.manual, input.datagovLists);
  // Downstream code reads lists and parties from `manual`; swapping them here keeps the
  // official feed and the hand-entered layer on one code path.
  const manual: ManualBundle = {
    ...input.manual,
    parties: resolved.parties,
    lists: resolved.lists,
  };
  const registry = new SourceRegistry(input.generatedAt);
  const unmatched: UnmatchedCandidate[] = [];

  const electionId = `election:${manual.election.knessetNumber}`;
  const electionSource = registry.use(
    manual.election.sourceKind ?? (manual.election.sourceUrl ? "cec" : "manual"),
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

  // The Knesset writes "first last"; the Elections Committee (and the press copying it)
  // writes "last first". Both orders are exact targets for the same person — still no
  // fuzzy tier, and a name that hits two different people stays ambiguous.
  const matchTargets = (knesset?.persons ?? []).flatMap((p) => {
    const id = `person:knesset-${p.knessetPersonId}`;
    const forms = new Set([normalizeHebrewName(p.nameHe)]);
    if (p.nameHeReversed) forms.add(normalizeHebrewName(p.nameHeReversed));
    return [...forms].map((nameNormalized) => ({ id, nameNormalized }));
  });

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
    // The name as filed stays the person's name. The Knesset's spelling ("first last") is
    // a different claim from a different source; letting it overwrite the filed name
    // changed 131 candidate URLs and broke every lookup keyed by the filed name.
    const nameHe = args.nameHe;
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

  // ---- Knesset links -------------------------------------------------------------
  // The last Knesset each person sat in: the positions this pull covers (24–25), widened
  // by the full term lists in knesset_profiles.json.
  const lastKnessetById = new Map<number, number>();
  for (const pos of knesset?.positions ?? []) {
    lastKnessetById.set(pos.knessetPersonId, Math.max(lastKnessetById.get(pos.knessetPersonId) ?? 0, pos.knessetNumber));
  }
  for (const [id, terms] of manual.knessetTermsById) {
    lastKnessetById.set(id, Math.max(lastKnessetById.get(id) ?? 0, ...terms));
  }
  const manualLinkBySlot = new Map(manual.knessetLinks.map((l) => [`${l.partyKey}:${l.position}`, l]));
  const quarantined: QuarantinedLink[] = [];

  /**
   * The Knesset person a list slot may be shown as, or undefined. A reviewed manual link
   * wins; a name match must pass verifyKnessetLink, and one that doesn't is quarantined.
   */
  function verifiedLink(args: {
    name: string;
    partyKey: string;
    position: number;
    manualId: number | undefined;
    matchedId: number | undefined;
  }): number | undefined {
    const slot = `${args.partyKey}:${args.position}`;
    const manualLink = manualLinkBySlot.get(slot);
    // A manually named historical match still needs a separately reviewed identity source.
    // Do not fall through to a different person when a manual candidate is quarantined.
    const explicitId = manualLink?.knessetPersonId ?? args.manualId;
    if (explicitId !== undefined) {
      const explicitVerdict = verifyKnessetLink(lastKnessetById.get(explicitId));
      if (explicitVerdict.accepted) return explicitId;
      quarantined.push({
        name: args.name, partyKey: args.partyKey, position: args.position,
        knessetPersonId: explicitId,
        knessetName: knessetByPersonId.get(explicitId)?.nameHe,
        lastKnesset: explicitVerdict.lastKnesset, reason: explicitVerdict.reason,
      });
      return undefined;
    }
    if (args.matchedId === undefined) return undefined;
    const verdict = verifyKnessetLink(lastKnessetById.get(args.matchedId));
    if (verdict.accepted) return args.matchedId;
    quarantined.push({
      name: args.name,
      partyKey: args.partyKey,
      position: args.position,
      knessetPersonId: args.matchedId,
      knessetName: knessetByPersonId.get(args.matchedId)?.nameHe,
      lastKnesset: verdict.lastKnesset,
      reason: verdict.reason,
    });
    return undefined;
  }

  // ---- parties -----------------------------------------------------------------
  const partyIdByKey = new Map<string, string>();
  const parties: Party[] = [];
  const partySlugs = new Set<string>();
  // Leaders are resolved after the lists, so a leader who is also a candidate is the same
  // person under the name as filed rather than whatever parties.json spells.
  const leaders: { partyIndex: number; name: string; sourceId: string }[] = [];

  for (const manualParty of manual.parties) {
    const id = `party:${manualParty.key}`;
    const sourceId = registry.use(
      manualParty.sourceKind ?? (manualParty.sourceUrl ? "party" : "manual"),
      manualParty.sourceTitle,
      manualParty.sourceUrl,
    );
    partyIdByKey.set(manualParty.key, id);

    if (manualParty.leaderName) leaders.push({ partyIndex: parties.length, name: manualParty.leaderName, sourceId });

    const party: Party = {
      id,
      slug: uniqueSlug(slugifyHebrew(manualParty.nameHe, manualParty.key), partySlugs),
      nameHe: manualParty.nameHe,
      ...(manualParty.nameEn ? { nameEn: manualParty.nameEn } : {}),
      ...(manualParty.shortNameHe ? { shortNameHe: manualParty.shortNameHe } : {}),
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
      manualList.sourceKind ?? (manualList.sourceUrl ? "cec" : "manual"),
      manualList.sourceTitle,
      manualList.sourceUrl,
    );
    const statusSourceId = manualList.statusSourceUrl
      ? registry.use(
          manualList.statusSourceKind ?? "press",
          manualList.statusSourceTitle ?? manualList.sourceTitle,
          manualList.statusSourceUrl,
        )
      : sourceId;

    candidateLists.push({
      id: listId,
      electionId,
      partyId,
      status: manualList.status,
      ...(manualList.submittedAt ? { submittedAt: manualList.submittedAt } : {}),
      ...(manualList.statusChangedAt ? { statusChangedAt: manualList.statusChangedAt } : {}),
      ...(manualList.statusNote ? { statusNote: manualList.statusNote } : {}),
    });
    registry.assert("candidateList", listId, "status", manualList.status, statusSourceId);

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

      const knessetPersonId = verifiedLink({
        name: candidate.nameHe,
        partyKey: manualList.partyKey,
        position: candidate.position,
        manualId: candidate.knessetPersonId,
        matchedId: outcome.kind === "matched" ? knessetIdFromPersonId(outcome.personId) : undefined,
      });

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

  for (const leader of leaders) {
    const outcome = matchPerson(leader.name, matchTargets, manual.personLinks);
    const matchedId = outcome.kind === "matched" ? knessetIdFromPersonId(outcome.personId) : undefined;
    // Only a link some candidate already earned; a leader is never linked on their own.
    const filedId = personIdByName.get(normalizeHebrewName(leader.name));
    const person =
      filedId !== undefined
        ? persons.get(filedId)!
        : matchedId !== undefined && personIdByKnessetId.has(matchedId)
          ? persons.get(personIdByKnessetId.get(matchedId)!)!
          : ensurePerson({ nameHe: leader.name, sourceId: leader.sourceId });
    parties[leader.partyIndex] = { ...parties[leader.partyIndex]!, leaderPersonId: person.id };
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
    quarantined,
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
        billType: BillType.parse(mapBillType(bill.billTypeHe)),
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
    billType: "private",
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
