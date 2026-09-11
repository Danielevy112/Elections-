import { describe, expect, it } from "vitest";
import { checkPoll, parseSeats, pollKey, toManualPoll, type PollInput } from "./add-poll";

const context = {
  partyKeys: new Set(["ofek", "yachad-kadima", "bayit-yarok"]),
  totalSeats: 120,
  existingKeys: new Set(["midgam-2026-09-08"]),
  today: "2026-09-11",
};

function poll(overrides: Partial<PollInput> = {}): PollInput {
  return {
    pollster: "מדגם",
    publisher: "חדשות 12",
    publishedAt: "2026-09-10",
    sourceUrl: "https://example.org/poll",
    seats: { ofek: { mandates: 24, belowThreshold: false } },
    ...overrides,
  };
}

describe("parseSeats", () => {
  it("parses party=seats pairs", () => {
    expect(parseSeats("ofek=24,yachad-kadima=21")).toEqual({
      ofek: { mandates: 24, belowThreshold: false },
      "yachad-kadima": { mandates: 21, belowThreshold: false },
    });
  });

  it("treats a trailing ! as below threshold and zeroes the seats", () => {
    // Whatever number the broadcast printed, a party under the threshold wins nothing.
    expect(parseSeats("bayit-yarok=3!")).toEqual({
      "bayit-yarok": { mandates: 0, belowThreshold: true },
    });
  });

  it("tolerates spaces and trailing commas", () => {
    expect(Object.keys(parseSeats(" ofek=24 , bayit-yarok=0! ,"))).toEqual([
      "ofek",
      "bayit-yarok",
    ]);
  });

  it("rejects a malformed entry rather than guessing", () => {
    expect(() => parseSeats("ofek:24")).toThrow(/bad --seats entry/);
    expect(() => parseSeats("ofek=twenty")).toThrow(/bad --seats entry/);
  });
});

describe("checkPoll", () => {
  it("accepts a well-formed poll", () => {
    expect(checkPoll(poll(), context)).toEqual([]);
  });

  it("refuses a poll with no source", () => {
    expect(checkPoll(poll({ sourceUrl: "" }), context)).toContainEqual(
      expect.stringContaining("no sourceUrl"),
    );
  });

  it("refuses a non-http source", () => {
    expect(checkPoll(poll({ sourceUrl: "somewhere.txt" }), context)).toContainEqual(
      expect.stringContaining("http(s) URL"),
    );
  });

  it("refuses an unknown party key and names the valid ones", () => {
    const problems = checkPoll(
      poll({ seats: { nope: { mandates: 10, belowThreshold: false } } }),
      context,
    );
    expect(problems[0]).toContain("unknown party key");
    expect(problems[0]).toContain("ofek");
  });

  it("refuses a seat total above the house size", () => {
    const problems = checkPoll(
      poll({
        seats: {
          ofek: { mandates: 90, belowThreshold: false },
          "yachad-kadima": { mandates: 90, belowThreshold: false },
        },
      }),
      context,
    );
    expect(problems).toContainEqual(expect.stringContaining("more than the 120"));
  });

  it("refuses a below-threshold row claiming seats", () => {
    // Reachable through the JSON/stdin path, which bypasses parseSeats' coercion.
    const problems = checkPoll(
      poll({ seats: { "bayit-yarok": { mandates: 5, belowThreshold: true } } }),
      context,
    );
    expect(problems).toContainEqual(expect.stringContaining("below threshold but claims 5"));
  });

  it("refuses a future-dated poll", () => {
    expect(checkPoll(poll({ publishedAt: "2027-01-01" }), context)).toContainEqual(
      expect.stringContaining("in the future"),
    );
  });

  it("refuses fieldwork ending after publication", () => {
    expect(
      checkPoll(poll({ fieldworkEnd: "2026-09-11" }), context),
    ).toContainEqual(expect.stringContaining("fieldwork ends after"));
  });

  it("refuses a malformed date", () => {
    expect(checkPoll(poll({ publishedAt: "10/09/2026" }), context)).toContainEqual(
      expect.stringContaining("YYYY-MM-DD"),
    );
  });

  it("refuses a duplicate of a poll already recorded", () => {
    const problems = checkPoll(
      poll({ pollster: "midgam", publishedAt: "2026-09-08" }),
      context,
    );
    expect(problems).toContainEqual(expect.stringContaining("already recorded"));
  });

  it("refuses a poll with no seats at all", () => {
    expect(checkPoll(poll({ seats: {} }), context)).toContainEqual(
      expect.stringContaining("no --seats"),
    );
  });
});

describe("toManualPoll", () => {
  it("produces a row the manual schema accepts", () => {
    const row = toManualPoll(poll({ sampleSize: 751 }));
    expect(row.key).toBe(pollKey(poll()));
    expect(row.sampleSize).toBe(751);
    expect(row.results).toEqual([
      { partyKey: "ofek", mandates: 24, belowThreshold: false },
    ]);
  });

  it("builds a key from pollster and date", () => {
    expect(pollKey(poll({ pollster: "פאנלס פוליטיקס" }))).toBe("פאנלס-פוליטיקס-2026-09-10");
  });
});
