import type { Election, Poll, PollResult } from "@elections26/schema";

export interface PollSelection {
  /** Reference instant for "recent". Injected so tests and builds are deterministic. */
  asOf: Date;
  /** Only polls published within this many days of `asOf` are eligible. */
  windowDays: number;
  /** At most this many polls, one per pollster, most recent first. */
  maxPolls: number;
}

export const DEFAULT_SELECTION: Omit<PollSelection, "asOf"> = {
  windowDays: 14,
  maxPolls: 5,
};

export interface PartyAggregate {
  partyId: string;
  /** How many of the selected polls actually reported this party. */
  pollCount: number;
  mean: number;
  min: number;
  max: number;
  /** Selected polls that placed the party under the electoral threshold. */
  belowThresholdCount: number;
}

export type SeatBand = "safe" | "borderline" | "out";

export interface PartyProjection extends PartyAggregate {
  /** Whether the party clears the threshold on its polling average. */
  qualifies: boolean;
  /** Normalised seats. Across all parties these sum to exactly `election.totalSeats`. */
  projectedSeats: number;
  /** Positions 1..safeThrough are `safe`. */
  safeThrough: number;
  /** Positions safeThrough+1..borderlineThrough are `borderline`; beyond is `out`. */
  borderlineThrough: number;
}

export interface Projection {
  /** Polls the projection is based on, most recent first. */
  polls: Poll[];
  byParty: Map<string, PartyProjection>;
  /** Most recent publication date among the selected polls, if any. */
  latestPollDate: string | null;
  /** Seats the qualifying parties actually account for, before normalisation. */
  coveredSeats: number;
  /**
   * True when the selected polls do not account for a full house. The projection then
   * reports the seats the polls actually measured instead of scaling them up to 120.
   */
  partialCoverage: boolean;
}

/**
 * How much of the house the polls must account for before scaling to the full 120 is
 * meaningful. Real polls list every party and land within a seat or two of the house
 * size; a set that covers far less is measuring a subset of the field, and stretching it
 * to 120 would inflate every party on the page.
 */
export const FULL_COVERAGE_RATIO = 0.9;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/**
 * Most recent poll per pollster within the window, capped at `maxPolls`.
 *
 * One poll per pollster stops a single prolific institute from dominating the average,
 * which is the most common way a poll aggregate goes quietly wrong.
 */
export function selectRecentPolls(polls: Poll[], selection: PollSelection): Poll[] {
  const eligible = polls.filter((p) => {
    const published = new Date(`${p.publishedAt}T00:00:00Z`);
    if (Number.isNaN(published.getTime())) return false;
    if (published.getTime() > selection.asOf.getTime()) return false;
    return daysBetween(published, selection.asOf) <= selection.windowDays;
  });

  const newestByPollster = new Map<string, Poll>();
  for (const poll of eligible) {
    const held = newestByPollster.get(poll.pollster);
    if (!held || comparePolls(poll, held) < 0) newestByPollster.set(poll.pollster, poll);
  }

  return [...newestByPollster.values()].sort(comparePolls).slice(0, selection.maxPolls);
}

/** Most recent first; id breaks ties so ordering never depends on input order. */
function comparePolls(a: Poll, b: Poll): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function aggregateByParty(
  polls: Poll[],
  results: PollResult[],
): Map<string, PartyAggregate> {
  const pollIds = new Set(polls.map((p) => p.id));
  const buckets = new Map<string, PollResult[]>();

  for (const result of results) {
    if (!pollIds.has(result.pollId)) continue;
    const bucket = buckets.get(result.partyId);
    if (bucket) bucket.push(result);
    else buckets.set(result.partyId, [result]);
  }

  const aggregates = new Map<string, PartyAggregate>();
  for (const [partyId, rows] of buckets) {
    // A poll that places a party under the threshold awards it no seats, whatever number
    // it printed alongside. Normalising here keeps one contradictory row from inflating
    // the range and lighting up candidates who are not in fact on the bubble.
    const mandates = rows.map((r) => (r.belowThreshold ? 0 : r.mandates));
    const sum = mandates.reduce((total, n) => total + n, 0);
    aggregates.set(partyId, {
      partyId,
      pollCount: rows.length,
      mean: sum / rows.length,
      min: Math.min(...mandates),
      max: Math.max(...mandates),
      belowThresholdCount: rows.filter((r) => r.belowThreshold).length,
    });
  }
  return aggregates;
}

/** Seats a list must win to clear the threshold: 3.25% of 120 rounds up to 4. */
export function thresholdSeats(election: Election): number {
  return Math.ceil((election.totalSeats * election.thresholdPct) / 100);
}

/**
 * Distribute `totalSeats` across parties in proportion to their polling averages using
 * the largest-remainder method, so the projection always sums to exactly the house size.
 * Raw poll averages never do, and a table of seats that adds up to 118 or 123 is the
 * fastest way to lose a reader's trust.
 */
export function allocateSeats(
  weights: Map<string, number>,
  totalSeats: number,
): Map<string, number> {
  const entries = [...weights.entries()].filter(([, w]) => w > 0);
  const allocation = new Map<string, number>();
  if (entries.length === 0) return allocation;

  const totalWeight = entries.reduce((total, [, w]) => total + w, 0);
  const exact = entries.map(([id, w]) => {
    const quota = (w / totalWeight) * totalSeats;
    return { id, quota, floor: Math.floor(quota), remainder: quota - Math.floor(quota) };
  });

  for (const row of exact) allocation.set(row.id, row.floor);

  let remaining = totalSeats - exact.reduce((total, row) => total + row.floor, 0);
  const byRemainder = [...exact].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    if (b.quota !== a.quota) return b.quota - a.quota;
    return a.id < b.id ? -1 : 1;
  });

  let index = 0;
  while (remaining > 0 && byRemainder.length > 0) {
    const row = byRemainder[index % byRemainder.length]!;
    allocation.set(row.id, (allocation.get(row.id) ?? 0) + 1);
    remaining -= 1;
    index += 1;
  }
  return allocation;
}

export function project(
  election: Election,
  polls: Poll[],
  results: PollResult[],
  selection: PollSelection,
): Projection {
  const selected = selectRecentPolls(polls, selection);
  const aggregates = aggregateByParty(selected, results);
  const minSeats = thresholdSeats(election);

  const weights = new Map<string, number>();
  for (const [partyId, aggregate] of aggregates) {
    if (aggregate.mean >= minSeats) weights.set(partyId, aggregate.mean);
  }

  const coveredSeats = [...weights.values()].reduce((total, mean) => total + mean, 0);
  const partialCoverage =
    coveredSeats < election.totalSeats * FULL_COVERAGE_RATIO;
  // With partial coverage, round to what the polls measured rather than scaling up to a
  // full house — reporting 46 seats for a party polling 24 would be worse than useless.
  const seats = allocateSeats(
    weights,
    partialCoverage ? Math.round(coveredSeats) : election.totalSeats,
  );

  const byParty = new Map<string, PartyProjection>();
  for (const [partyId, aggregate] of aggregates) {
    const qualifies = weights.has(partyId);
    const projectedSeats = qualifies ? (seats.get(partyId) ?? 0) : 0;

    // Widen the observed range to include the headline number so the banding can never
    // contradict the seat count printed above it.
    const safeThrough = qualifies ? Math.min(aggregate.min, projectedSeats) : 0;
    const borderlineThrough = Math.max(aggregate.max, projectedSeats, safeThrough);

    byParty.set(partyId, {
      ...aggregate,
      qualifies,
      projectedSeats,
      safeThrough,
      borderlineThrough,
    });
  }

  return {
    polls: selected,
    byParty,
    latestPollDate: selected[0]?.publishedAt ?? null,
    coveredSeats,
    partialCoverage,
  };
}

/** Which band a list position falls into for a given party. */
export function bandForPosition(
  projection: PartyProjection | undefined,
  position: number,
): SeatBand {
  if (!projection) return "out";
  if (position <= projection.safeThrough) return "safe";
  if (position <= projection.borderlineThrough) return "borderline";
  return "out";
}
