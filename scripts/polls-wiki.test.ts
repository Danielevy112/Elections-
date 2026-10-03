import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPrimarySource, parseFieldwork, parseSeatCell, parseWikiPolls, sameArticle, toPollInput } from "./polls-wiki";

// The top of the 2026 seat table as recorded on 3.10.2026 (en.wikipedia, via a fetch/* branch).
const wikitext = readFileSync(join(__dirname, "fixtures", "enwiki-polls-2026-excerpt.wikitext"), "utf8");
const rows = parseWikiPolls(wikitext);

describe("parseWikiPolls", () => {
  it("reads every poll row and skips event rows", () => {
    // 14 polls between 22.9 and 1.10; the three event rows (court ruling, withdrawal,
    // surplus-vote deadline) and the half-row at the end of the excerpt are skipped.
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.pollster && r.publisher)).toBe(true);
  });

  it("gives every poll exactly 120 seats", () => {
    for (const row of rows) {
      const total = Object.values(row.seats).reduce((sum, s) => sum + s.mandates, 0);
      expect([row.pollster, row.fieldworkEnd, total]).toEqual([row.pollster, row.fieldworkEnd, 120]);
    }
  });

  it("matches the Midgam / Channel 12 poll of 22.9 entered by hand from the article", () => {
    const midgam = rows.find((r) => r.fieldworkEnd === "2026-09-22")!;
    const seats = Object.fromEntries(Object.entries(midgam.seats).filter(([, s]) => !s.belowThreshold).map(([k, s]) => [k, s.mandates]));
    expect(seats).toEqual({
      "k26-02": 23, "k26-29": 20, "k26-01": 13, "k26-17": 9, "k26-11": 9, "k26-37": 8, "k26-35": 7,
      "k26-19": 7, "k26-14": 6, "k26-31": 5, "k26-18": 5, "k26-06": 4, "k26-16": 4,
    });
    expect(midgam.seats["k26-30"]).toEqual({ mandates: 0, belowThreshold: true }); // (0.7%)
    expect(midgam.sourceUrl).toBe("https://www.mako.co.il/news-israel-elections/2026/Article-fad59e819c9c0a1027.htm");
    expect(midgam.sampleSize).toBe(501);
  });

  it("does not split cells inside templates", () => {
    // "{{Opdrts||1|Oct|2026}}" contains "||"; the row must still read pollster and sample.
    const direct = rows.find((r) => r.fieldworkEnd === "2026-10-01" && r.pollster === "Direct Polls")!;
    expect(direct.publisher).toBe("i24 News");
    expect(direct.sampleSize).toBe(504);
    expect(direct.seats["k26-29"]).toEqual({ mandates: 28, belowThreshold: false });
  });
});

describe("cells", () => {
  it("reads fieldwork ranges, including ones that cross a month", () => {
    expect(parseFieldwork("{{Opdrts||22|Sep|2026}}")).toEqual(["2026-09-22", "2026-09-22"]);
    expect(parseFieldwork("{{Opdrts|30|1|Oct|2026}}")).toEqual(["2026-09-30", "2026-10-01"]);
  });

  it("treats a printed share as below threshold and n/a as not polled", () => {
    expect(parseSeatCell("{{small|(1.4%)}}")).toEqual({ mandates: 0, belowThreshold: true });
    expect(parseSeatCell("style=\"background:#d0eafb\" |'''21'''")).toEqual({ mandates: 21, belowThreshold: false });
    expect(parseSeatCell("{{n/a}}")).toBeUndefined();
  });
});

describe("sources", () => {
  it("accepts only the publisher's own article", () => {
    const midgam = rows.find((r) => r.fieldworkEnd === "2026-09-22")!;
    expect(isPrimarySource(midgam)).toBe(true);
    // Maariv's poll as reported by the Jerusalem Post is not Maariv's article.
    const maariv = rows.find((r) => r.publisher === "Maariv")!;
    expect(maariv.sourceUrl).toContain("jpost.com");
    expect(isPrimarySource(maariv)).toBe(false);
  });

  it("never treats a broadcast page as a checkable source", () => {
    const ch16 = rows.find((r) => r.publisher === "Channel 16")!;
    expect(isPrimarySource(ch16)).toBe(false);
  });

  it("names the publisher in Hebrew and dates the poll by its article", () => {
    const input = toPollInput(rows.find((r) => r.fieldworkEnd === "2026-09-22")!);
    expect(input.publisher).toBe("חדשות 12");
    expect(input.publishedAt).toBe("2026-09-22");
  });

  it("recognises the same article behind a different query string", () => {
    expect(sameArticle("https://13tv.co.il/item/x/?pid=98577")).toBe(sameArticle("https://13tv.co.il/item/x/"));
  });
});
