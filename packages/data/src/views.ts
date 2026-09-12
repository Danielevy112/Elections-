import type {
  Bill,
  Candidacy,
  CandidateList,
  Claim,
  Committee,
  CommitteeMembership,
  KnessetMembership,
  Party,
  Person,
  Snapshot,
  Source,
} from "@elections26/schema";
import { byId, groupBy } from "./loader";
import {
  DEFAULT_SELECTION,
  bandForPosition,
  project,
  type PartyProjection,
  type Projection,
  type SeatBand,
} from "./projection";

export interface SourcedValue<T> {
  value: T;
  sources: Source[];
}

export interface BillStats {
  initiated: number;
  coInitiated: number;
  passed: number;
  /**
   * Private member's bills the person signed. This is the figure that actually reflects an
   * MK's own initiative; a government bill they co-signed is the cabinet's.
   */
  privateBills: number;
  /** Bills whose status the Knesset lookup did not resolve — never counted as passed. */
  statusUnknown: number;
}

export interface CandidateOnList {
  candidacy: Candidacy;
  person: Person;
  band: SeatBand;
  /** True for the first position outside the safe band — the visual cut line. */
  isCutLine: boolean;
}

export interface PartyView {
  party: Party;
  list: CandidateList | undefined;
  leader: Person | undefined;
  projection: PartyProjection | undefined;
  candidates: CandidateOnList[];
}

export interface CandidateView {
  person: Person;
  party: Party | undefined;
  position: number | undefined;
  band: SeatBand | undefined;
  memberships: KnessetMembership[];
  committees: { committee: Committee; membership: CommitteeMembership }[];
  billStats: BillStats;
  billStatsByKnesset: { knessetNumber: number; stats: BillStats }[];
  notableBills: Bill[];
  claims: Claim[];
}

export interface SiteData {
  snapshot: Snapshot;
  projection: Projection;
  parties: PartyView[];
  candidates: CandidateView[];
  sourcesById: Map<string, Source>;
  /** Claims keyed as `${subjectType}:${subjectId}` for source lookups in the UI. */
  claimsBySubject: Map<string, Claim[]>;
}

export interface BuildOptions {
  /** Reference instant for poll recency. Defaults to the snapshot's generation time. */
  asOf?: Date;
  windowDays?: number;
  maxPolls?: number;
}

export function buildSite(snapshot: Snapshot, options: BuildOptions = {}): SiteData {
  const election = snapshot.elections[0];
  if (!election) throw new Error("snapshot contains no election");

  const projection = project(election, snapshot.polls, snapshot.poll_results, {
    asOf: options.asOf ?? new Date(snapshot.meta.generatedAt),
    windowDays: options.windowDays ?? DEFAULT_SELECTION.windowDays,
    maxPolls: options.maxPolls ?? DEFAULT_SELECTION.maxPolls,
  });

  const persons = byId(snapshot.persons);
  const sourcesById = byId(snapshot.sources);
  const listsByParty = new Map(snapshot.candidate_lists.map((l) => [l.partyId, l]));
  const candidaciesByList = groupBy(snapshot.candidacies, (c) => c.listId);
  const claimsBySubject = groupBy(
    snapshot.claims,
    (c) => `${c.subjectType}:${c.subjectId}`,
  );

  const parties: PartyView[] = snapshot.parties
    .map((party) => {
      const list = listsByParty.get(party.id);
      const partyProjection = projection.byParty.get(party.id);
      const rows = list ? (candidaciesByList.get(list.id) ?? []) : [];
      const ordered = [...rows].sort((a, b) => a.position - b.position);

      const candidates: CandidateOnList[] = [];
      for (const candidacy of ordered) {
        const person = persons.get(candidacy.personId);
        if (!person) continue;
        const band = bandForPosition(partyProjection, candidacy.position);
        candidates.push({
          candidacy,
          person,
          band,
          isCutLine:
            band !== "safe" && candidacy.position === (partyProjection?.safeThrough ?? 0) + 1,
        });
      }

      return { party, list, leader: party.leaderPersonId ? persons.get(party.leaderPersonId) : undefined, projection: partyProjection, candidates };
    })
    .sort(byProjectedSeatsDesc);

  const candidates = buildCandidateViews(snapshot, parties, persons);

  return { snapshot, projection, parties, candidates, sourcesById, claimsBySubject };
}

function byProjectedSeatsDesc(a: PartyView, b: PartyView): number {
  const aSeats = a.projection?.projectedSeats ?? -1;
  const bSeats = b.projection?.projectedSeats ?? -1;
  if (aSeats !== bSeats) return bSeats - aSeats;
  return a.party.nameHe.localeCompare(b.party.nameHe, "he");
}

function buildCandidateViews(
  snapshot: Snapshot,
  parties: PartyView[],
  persons: Map<string, Person>,
): CandidateView[] {
  const committeesById = byId(snapshot.committees);
  const membershipsByPerson = groupBy(snapshot.knesset_memberships, (m) => m.personId);
  const committeeMembershipsByPerson = groupBy(
    snapshot.committee_memberships,
    (m) => m.personId,
  );
  const billsById = byId(snapshot.bills);
  const initiationsByPerson = groupBy(snapshot.bill_initiators, (b) => b.personId);
  const claimsBySubject = groupBy(snapshot.claims, (c) => `${c.subjectType}:${c.subjectId}`);

  // Where each person sits on a 26th-Knesset list, if anywhere.
  const placement = new Map<string, { party: Party; position: number; band: SeatBand }>();
  for (const view of parties) {
    for (const row of view.candidates) {
      placement.set(row.person.id, {
        party: view.party,
        position: row.candidacy.position,
        band: row.band,
      });
    }
  }

  return [...persons.values()].map((person) => {
    const initiations = initiationsByPerson.get(person.id) ?? [];
    const bills = initiations
      .map((i) => ({ initiation: i, bill: billsById.get(i.billId) }))
      .filter((row): row is { initiation: (typeof initiations)[number]; bill: Bill } =>
        row.bill !== undefined,
      );

    const statsFor = (rows: typeof bills): BillStats => ({
      initiated: rows.filter((r) => r.initiation.isPrimary).length,
      coInitiated: rows.filter((r) => !r.initiation.isPrimary).length,
      passed: rows.filter((r) => r.bill.status === "passed").length,
      privateBills: rows.filter((r) => r.bill.billType === "private").length,
      statusUnknown: rows.filter((r) => r.bill.status === "unknown").length,
    });

    const knessetNumbers = [
      ...new Set(bills.map((r) => r.bill.knessetNumber).filter((n): n is number => n != null)),
    ].sort((a, b) => b - a);

    const seat = placement.get(person.id);
    const committees = (committeeMembershipsByPerson.get(person.id) ?? [])
      .map((membership) => ({ membership, committee: committeesById.get(membership.committeeId) }))
      .filter((row): row is { membership: CommitteeMembership; committee: Committee } =>
        row.committee !== undefined,
      );

    return {
      person,
      party: seat?.party ?? undefined,
      position: seat?.position,
      band: seat?.band,
      memberships: (membershipsByPerson.get(person.id) ?? []).sort(
        (a, b) => b.knessetNumber - a.knessetNumber,
      ),
      committees,
      billStats: statsFor(bills),
      billStatsByKnesset: knessetNumbers.map((knessetNumber) => ({
        knessetNumber,
        stats: statsFor(bills.filter((r) => r.bill.knessetNumber === knessetNumber)),
      })),
      notableBills: bills
        .filter((r) => r.bill.status === "passed")
        .map((r) => r.bill)
        .slice(0, 10),
      claims: claimsBySubject.get(`person:${person.id}`) ?? [],
    } satisfies CandidateView;
  });
}

/** Resolve the sources backing one field of one subject, for a citation link in the UI. */
export function sourcesForField(
  site: SiteData,
  subjectType: string,
  subjectId: string,
  field: string,
): Source[] {
  const claims = site.claimsBySubject.get(`${subjectType}:${subjectId}`) ?? [];
  return claims
    .filter((claim) => claim.field === field)
    .map((claim) => site.sourcesById.get(claim.sourceId))
    .filter((source): source is Source => source !== undefined);
}
