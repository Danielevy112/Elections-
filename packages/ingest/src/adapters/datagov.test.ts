import { describe, expect, it } from "vitest";
import { Fetcher } from "../http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeProbe,
  fetchCandidateLists,
  findElectionResource,
  hebrewNumeral,
  probeCandidateLists,
  resourceMatchesKnesset,
  type CkanResource,
} from "./datagov";

/** Write CKAN-shaped fixtures so the offline Fetcher can replay them. */
function fixtureFetcher(responses: Record<string, unknown>): Fetcher {
  const dir = mkdtempSync(join(tmpdir(), "ckan-"));
  const fetcher = new Fetcher("offline", dir);
  for (const [url, body] of Object.entries(responses)) {
    writeFileSync(fetcher.fixturePath(url), JSON.stringify(body), "utf8");
  }
  return fetcher;
}

const BASE = "https://data.gov.il/api/3/action";

describe("hebrewNumeral", () => {
  it("renders Knesset numbers", () => {
    expect(hebrewNumeral(25)).toBe("כה");
    expect(hebrewNumeral(26)).toBe("כו");
    expect(hebrewNumeral(21)).toBe("כא");
  });
});

describe("resourceMatchesKnesset", () => {
  it("matches digits", () => {
    expect(resourceMatchesKnesset("רשימות המועמדים לכנסת ה-26", 26)).toBe(true);
    expect(resourceMatchesKnesset("candidates_26.csv", 26)).toBe(true);
  });

  it("matches the Hebrew numeral with or without gershayim", () => {
    expect(resourceMatchesKnesset('הכנסת ה-כ"ו', 26)).toBe(true);
    expect(resourceMatchesKnesset("הכנסת הכו", 26)).toBe(true);
  });

  it("does not confuse one Knesset for another", () => {
    expect(resourceMatchesKnesset("רשימות המועמדים לכנסת ה-25", 26)).toBe(false);
    expect(resourceMatchesKnesset('הכנסת ה-כ"ה', 26)).toBe(false);
  });

  it("does not match a number that is part of a longer one", () => {
    expect(resourceMatchesKnesset("dataset_260_rows", 26)).toBe(false);
    expect(resourceMatchesKnesset("archive_1926", 26)).toBe(false);
  });
});

describe("findElectionResource", () => {
  const resources: CkanResource[] = [
    { id: "r19", name: "רשימות המועמדים לכנסת ה-19", format: "CSV", datastoreActive: true },
    { id: "r25", name: "רשימות המועמדים לכנסת ה-25", format: "CSV", datastoreActive: true },
  ];

  it("finds the right election", () => {
    expect(findElectionResource(resources, 25)?.id).toBe("r25");
  });

  it("returns undefined rather than the nearest match", () => {
    // Ingesting the 25th Knesset's lists as the 26th's would be far worse than reporting
    // that the data is not published yet.
    expect(findElectionResource(resources, 26)).toBeUndefined();
  });
});

describe("fetchCandidateLists", () => {
  function datastoreUrl(resourceId: string, offset = 0): string {
    return `${BASE}/datastore_search?resource_id=${resourceId}&limit=1000&offset=${offset}`;
  }

  it("reads Hebrew column names", async () => {
    const fetcher = fixtureFetcher({
      [datastoreUrl("r26")]: {
        success: true,
        result: {
          records: [
            { "שם הרשימה": "אופק", "שם המועמד": "דנה אלמוג", "מיקום": 1, "אות": "אפ" },
            { "שם הרשימה": "אופק", "שם המועמד": "אלה נחמיאס", "מיקום": 2, "אות": "אפ" },
          ],
        },
      },
    });

    const { rows } = await fetchCandidateLists(fetcher, "r26");
    expect(rows).toEqual([
      { partyName: "אופק", candidateName: "דנה אלמוג", position: 1, ballotLetters: "אפ" },
      { partyName: "אופק", candidateName: "אלה נחמיאס", position: 2, ballotLetters: "אפ" },
    ]);
  });

  it("joins a name split across two columns", async () => {
    const fetcher = fixtureFetcher({
      [datastoreUrl("r-split")]: {
        success: true,
        result: {
          records: [
            { "שם רשימה": "קול העם", "שם פרטי": "רונן", "שם משפחה": "אבוטבול", "מקום": 1 },
          ],
        },
      },
    });

    const { rows } = await fetchCandidateLists(fetcher, "r-split");
    expect(rows[0]).toMatchObject({ candidateName: "רונן אבוטבול", position: 1 });
  });

  it("reports the column names upstream really used", async () => {
    const fetcher = fixtureFetcher({
      [datastoreUrl("r-alias")]: {
        success: true,
        result: {
          records: [{ list_name: "אופק", candidate_name: "דנה אלמוג", position: 1 }],
        },
      },
    });

    const { report } = await fetchCandidateLists(fetcher, "r-alias");
    expect(report.surprises).toEqual(
      expect.arrayContaining([{ canonical: "שם הרשימה", actual: "list_name" }]),
    );
  });

  it("skips rows missing a party, a name or a position instead of emitting junk", async () => {
    const fetcher = fixtureFetcher({
      [datastoreUrl("r-partial")]: {
        success: true,
        result: {
          records: [
            { "שם הרשימה": "אופק", "שם המועמד": "דנה אלמוג", "מיקום": 1 },
            { "שם הרשימה": "אופק", "מיקום": 2 },
            { "שם המועמד": "מישהו", "מיקום": 3 },
            { "שם הרשימה": "אופק", "שם המועמד": "ללא מיקום" },
          ],
        },
      },
    });

    const { rows } = await fetchCandidateLists(fetcher, "r-partial");
    expect(rows).toHaveLength(1);
  });

  it("surfaces a CKAN failure envelope rather than treating 200 as success", async () => {
    const fetcher = fixtureFetcher({
      [datastoreUrl("r-bad")]: { success: false, error: { message: "Not found" } },
    });
    await expect(fetchCandidateLists(fetcher, "r-bad")).rejects.toThrow(/reported failure/);
  });
});

describe("probeCandidateLists", () => {
  it("reports that a Knesset is not covered yet", async () => {
    const fetcher = fixtureFetcher({
      [`${BASE}/package_show?id=candidates-lists`]: {
        success: true,
        result: {
          resources: [
            { id: "r25", name: "רשימות המועמדים לכנסת ה-25", format: "XLSX", datastore_active: true },
          ],
        },
      },
    });

    const probe = await probeCandidateLists(fetcher, 26);
    expect(probe.matched).toBeUndefined();
    expect(probe.rowCount).toBe(0);
    expect(probe.resources).toHaveLength(1);
  });

  it("reports a resource that exists but cannot be queried", async () => {
    // An upload the portal has not indexed would otherwise report zero rows and look
    // exactly like an empty list.
    const fetcher = fixtureFetcher({
      [`${BASE}/package_show?id=candidates-lists`]: {
        success: true,
        result: {
          resources: [
            { id: "r26", name: "רשימות המועמדים לכנסת ה-26", format: "XLSX", datastore_active: false },
          ],
        },
      },
    });

    const probe = await probeCandidateLists(fetcher, 26);
    expect(probe.matched?.datastoreActive).toBe(false);
    expect(probe.rowCount).toBe(0);
    expect(describeProbe(probe)).toContain("not queryable");
  });

  it("reports coverage and a row count once the resource appears", async () => {
    const fetcher = fixtureFetcher({
      [`${BASE}/package_show?id=candidates-lists`]: {
        success: true,
        result: {
          resources: [
            { id: "r26", name: "רשימות המועמדים לכנסת ה-26", format: "XLSX", datastore_active: true },
          ],
        },
      },
      [`${BASE}/datastore_search?resource_id=r26&limit=1000&offset=0`]: {
        success: true,
        result: {
          records: [{ "שם הרשימה": "אופק", "שם המועמד": "דנה אלמוג", "מיקום": 1 }],
        },
      },
    });

    const probe = await probeCandidateLists(fetcher, 26);
    expect(probe.matched?.id).toBe("r26");
    expect(probe.rowCount).toBe(1);
  });
});
