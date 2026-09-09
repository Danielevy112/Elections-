import { describe, expect, it } from "vitest";
import type { Election, Poll, PollResult } from "@elections26/schema";
import {
  allocateSeats,
  aggregateByParty,
  bandForPosition,
  project,
  selectRecentPolls,
  thresholdSeats,
} from "./projection";

const election: Election = {
  id: "election:26",
  knessetNumber: 26,
  electionDate: "2026-10-27",
  totalSeats: 120,
  thresholdPct: 3.25,
};

const ASOF = new Date("2026-09-09T00:00:00Z");

function poll(id: string, pollster: string, publishedAt: string): Poll {
  return {
    id,
    electionId: election.id,
    pollster,
    publisher: "test",
    publishedAt,
    sourceUrl: "https://example.com/poll",
  };
}

function result(pollId: string, partyId: string, mandates: number, below = false): PollResult {
  return { id: `${pollId}:${partyId}`, pollId, partyId, mandates, belowThreshold: below };
}

describe("selectRecentPolls", () => {
  it("keeps only the newest poll per pollster", () => {
    const polls = [
      poll("p1", "midgam", "2026-09-01"),
      poll("p2", "midgam", "2026-09-08"),
      poll("p3", "panels", "2026-09-05"),
    ];
    const selected = selectRecentPolls(polls, { asOf: ASOF, windowDays: 14, maxPolls: 5 });
    expect(selected.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("drops polls outside the window and in the future", () => {
    const polls = [
      poll("old", "a", "2026-08-01"),
      poll("future", "b", "2026-09-20"),
      poll("ok", "c", "2026-09-07"),
    ];
    const selected = selectRecentPolls(polls, { asOf: ASOF, windowDays: 14, maxPolls: 5 });
    expect(selected.map((p) => p.id)).toEqual(["ok"]);
  });

  it("caps at maxPolls, most recent first", () => {
    const polls = ["a", "b", "c", "d"].map((n, i) =>
      poll(`p${n}`, n, `2026-09-0${i + 3}`),
    );
    const selected = selectRecentPolls(polls, { asOf: ASOF, windowDays: 14, maxPolls: 2 });
    expect(selected.map((p) => p.id)).toEqual(["pd", "pc"]);
  });

  it("orders deterministically when two polls share a date", () => {
    const polls = [poll("zz", "a", "2026-09-05"), poll("aa", "b", "2026-09-05")];
    const forward = selectRecentPolls(polls, { asOf: ASOF, windowDays: 14, maxPolls: 5 });
    const reversed = selectRecentPolls([...polls].reverse(), {
      asOf: ASOF,
      windowDays: 14,
      maxPolls: 5,
    });
    expect(forward.map((p) => p.id)).toEqual(reversed.map((p) => p.id));
  });
});

describe("aggregateByParty", () => {
  it("averages only over polls that reported the party", () => {
    const polls = [poll("p1", "a", "2026-09-08"), poll("p2", "b", "2026-09-07")];
    const results = [result("p1", "x", 20), result("p2", "x", 24), result("p1", "y", 5)];
    const aggregates = aggregateByParty(polls, results);

    expect(aggregates.get("x")).toMatchObject({ pollCount: 2, mean: 22, min: 20, max: 24 });
    expect(aggregates.get("y")).toMatchObject({ pollCount: 1, mean: 5, min: 5, max: 5 });
  });

  it("ignores results belonging to unselected polls", () => {
    const aggregates = aggregateByParty(
      [poll("p1", "a", "2026-09-08")],
      [result("p1", "x", 10), result("p9", "x", 99)],
    );
    expect(aggregates.get("x")).toMatchObject({ pollCount: 1, mean: 10 });
  });
});

describe("thresholdSeats", () => {
  it("rounds 3.25% of 120 up to 4 seats", () => {
    expect(thresholdSeats(election)).toBe(4);
  });
});

describe("allocateSeats", () => {
  it("always distributes exactly the house size", () => {
    const weights = new Map([["a", 23.4], ["b", 21.8], ["c", 11.2], ["d", 8.6], ["e", 4.1]]);
    const seats = allocateSeats(weights, 120);
    const total = [...seats.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(120);
  });

  it("gives leftover seats to the largest remainders", () => {
    // Quotas are 3.33 / 3.33 / 3.33 of 10 -> floors 3,3,3 with one seat left over.
    const seats = allocateSeats(new Map([["a", 1], ["b", 1], ["c", 1]]), 10);
    expect([...seats.values()].reduce((sum, n) => sum + n, 0)).toBe(10);
    expect(Math.max(...seats.values()) - Math.min(...seats.values())).toBe(1);
  });

  it("ignores zero and negative weights", () => {
    const seats = allocateSeats(new Map([["a", 10], ["b", 0]]), 120);
    expect(seats.get("a")).toBe(120);
    expect(seats.has("b")).toBe(false);
  });

  it("returns nothing when no party qualifies", () => {
    expect(allocateSeats(new Map(), 120).size).toBe(0);
  });
});

describe("project", () => {
  const polls = [
    poll("p1", "midgam", "2026-09-08"),
    poll("p2", "panels", "2026-09-06"),
    poll("p3", "lazar", "2026-09-04"),
  ];
  const results = [
    result("p1", "big", 24), result("p2", "big", 22), result("p3", "big", 23),
    result("p1", "mid", 12), result("p2", "mid", 11), result("p3", "mid", 13),
    result("p1", "tiny", 0, true), result("p2", "tiny", 0, true), result("p3", "tiny", 3, true),
    result("p1", "edge", 5), result("p2", "edge", 4), result("p3", "edge", 0, true),
    result("p1", "rest", 84), result("p2", "rest", 87), result("p3", "rest", 84),
  ];

  const projection = project(election, polls, results, {
    asOf: ASOF,
    windowDays: 14,
    maxPolls: 5,
  });

  it("treats the poll set as covering the full house", () => {
    expect(projection.partialCoverage).toBe(false);
    expect(projection.coveredSeats).toBeGreaterThan(108);
  });

  it("projects seats summing to the house size", () => {
    const total = [...projection.byParty.values()].reduce(
      (sum, p) => sum + p.projectedSeats,
      0,
    );
    expect(total).toBe(120);
  });

  it("marks a sub-threshold party as not qualifying with zero seats", () => {
    const tiny = projection.byParty.get("tiny");
    expect(tiny?.qualifies).toBe(false);
    expect(tiny?.projectedSeats).toBe(0);
    expect(tiny?.belowThresholdCount).toBe(3);
  });

  it("bands positions from the observed poll range", () => {
    const big = projection.byParty.get("big")!;
    expect(big.safeThrough).toBe(22);
    expect(big.borderlineThrough).toBeGreaterThanOrEqual(24);
    expect(bandForPosition(big, 22)).toBe("safe");
    expect(bandForPosition(big, 23)).toBe("borderline");
    expect(bandForPosition(big, 99)).toBe("out");
  });

  it("never bands the headline seat count as out", () => {
    for (const party of projection.byParty.values()) {
      if (!party.qualifies) continue;
      expect(bandForPosition(party, party.projectedSeats)).not.toBe("out");
    }
  });

  it("puts every position of a sub-threshold party out", () => {
    const tiny = projection.byParty.get("tiny")!;
    expect(tiny.max).toBe(0);
    expect(bandForPosition(tiny, 1)).toBe("out");
  });

  it("discards the mandate count of a poll that flags a party below threshold", () => {
    // p3 printed 3 seats for "tiny" while flagging it out; that 3 must not reach the range.
    expect(projection.byParty.get("tiny")!.min).toBe(0);
  });

  it("keeps a party polling at the threshold in, with its bubble seats borderline", () => {
    // "edge" polls 5 / 4 / out -> mean 3, below the 4-seat threshold.
    const edge = projection.byParty.get("edge")!;
    expect(edge.qualifies).toBe(false);
    expect(edge.projectedSeats).toBe(0);
    // Two of three polls did seat it, so those positions are genuinely on the bubble.
    expect(bandForPosition(edge, 1)).toBe("borderline");
    expect(bandForPosition(edge, 5)).toBe("borderline");
    expect(bandForPosition(edge, 6)).toBe("out");
  });

  it("reports the newest poll date", () => {
    expect(projection.latestPollDate).toBe("2026-09-08");
  });

  it("yields an empty projection when no poll is recent enough", () => {
    const stale = project(election, polls, results, {
      asOf: new Date("2027-01-01T00:00:00Z"),
      windowDays: 14,
      maxPolls: 5,
    });
    expect(stale.polls).toHaveLength(0);
    expect(stale.byParty.size).toBe(0);
    expect(stale.latestPollDate).toBeNull();
  });

  it("treats an unknown party as out rather than throwing", () => {
    expect(bandForPosition(undefined, 1)).toBe("out");
  });

  it("does not inflate parties when the polls cover only part of the field", () => {
    // Only two parties, worth ~35 seats between them: scaling that to 120 would report a
    // 23-seat party as holding 79.
    const partial = project(
      election,
      polls,
      results.filter((r) => r.partyId === "big" || r.partyId === "mid"),
      { asOf: ASOF, windowDays: 14, maxPolls: 5 },
    );

    expect(partial.partialCoverage).toBe(true);
    const big = partial.byParty.get("big")!;
    expect(big.projectedSeats).toBeGreaterThanOrEqual(22);
    expect(big.projectedSeats).toBeLessThanOrEqual(25);

    const total = [...partial.byParty.values()].reduce((sum, p) => sum + p.projectedSeats, 0);
    expect(total).toBe(Math.round(partial.coveredSeats));
  });
});
