import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Fetcher } from "./http";
import {
  FieldReport,
  KNESSET_ODATA_BASE,
  idFilterChunks,
  nextLink,
  odataCollect,
  pickInt,
  pickString,
  resolveNextUrl,
  unwrap,
} from "./odata";

describe("unwrap", () => {
  it("reads the OData v3 {d:{results}} envelope", () => {
    expect(unwrap({ d: { results: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
  });

  it("reads the OData v3 {d:[]} envelope", () => {
    expect(unwrap({ d: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });

  it("reads the OData v4 {value:[]} envelope", () => {
    expect(unwrap({ value: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });

  it("returns empty for anything unrecognised rather than throwing", () => {
    expect(unwrap(null)).toEqual([]);
    expect(unwrap("<html>error</html>")).toEqual([]);
    expect(unwrap({ d: { results: "nope" } })).toEqual([]);
  });
});

describe("pick", () => {
  it("falls back through alias spellings", () => {
    expect(pickInt({ personId: 7 }, ["PersonID", "personId"])).toBe(7);
    expect(pickString({ NAME: "x" }, ["Name", "NAME"])).toBe("x");
  });

  it("skips null and empty values", () => {
    expect(pickString({ Name: "", name: "real" }, ["Name", "name"])).toBe("real");
    expect(pickInt({ Id: null, ID: 3 }, ["Id", "ID"])).toBe(3);
  });

  it("coerces numeric strings and stringified numbers", () => {
    expect(pickInt({ Id: "42" }, ["Id"])).toBe(42);
    expect(pickString({ Id: 42 }, ["Id"])).toBe("42");
  });

  it("returns undefined when nothing matches", () => {
    expect(pickInt({}, ["Missing"])).toBeUndefined();
  });
});

describe("FieldReport", () => {
  it("flags aliases that differ from the documented name", () => {
    const report = new FieldReport();
    pickInt({ personId: 1 }, ["PersonID", "personId"], report);
    expect(report.surprises).toEqual([{ canonical: "PersonID", actual: "personId" }]);
    expect(report.missing).toEqual([]);
  });

  it("records fields upstream never supplied", () => {
    const report = new FieldReport();
    pickString({}, ["GenderDesc"], report);
    expect(report.missing).toEqual(["GenderDesc"]);
  });

  it("does not report a field as missing once some row supplied it", () => {
    const report = new FieldReport();
    pickString({}, ["Name"], report);
    pickString({ Name: "found" }, ["Name"], report);
    expect(report.missing).toEqual([]);
  });
});

describe("nextLink", () => {
  it("reads the spelling this service actually uses", () => {
    expect(nextLink({ "odata.nextLink": "KNS_Person?$skiptoken=535" })).toBe(
      "KNS_Person?$skiptoken=535",
    );
  });

  it("reads the v4 and v3 spellings too", () => {
    expect(nextLink({ "@odata.nextLink": "a" })).toBe("a");
    expect(nextLink({ d: { __next: "b" } })).toBe("b");
  });

  it("returns undefined when the page is the last one", () => {
    expect(nextLink({ value: [] })).toBeUndefined();
    expect(nextLink(null)).toBeUndefined();
    expect(nextLink({ "odata.nextLink": "" })).toBeUndefined();
  });
});

describe("resolveNextUrl", () => {
  it("resolves a relative link against the service root", () => {
    const url = resolveNextUrl("KNS_Person?$skiptoken=535", KNESSET_ODATA_BASE);
    expect(url).toContain(`${KNESSET_ODATA_BASE}/KNS_Person`);
    expect(url).toContain("%24skiptoken=535");
  });

  it("re-adds $format=json, which the service omits from its own links", () => {
    // Following a generated link without it comes back as XML.
    expect(resolveNextUrl("KNS_Person?$skiptoken=1", KNESSET_ODATA_BASE)).toContain(
      "format=json",
    );
  });

  it("leaves an absolute link's host alone", () => {
    const url = resolveNextUrl("https://elsewhere.example/KNS_Person", KNESSET_ODATA_BASE);
    expect(url).toContain("elsewhere.example");
  });
});

/** Serves pages of `pageSize` rows, chained by odata.nextLink, like the real service. */
function pagedFetcher(
  total: number,
  pageSize = 100,
  opts: { omitNextLink?: boolean; top?: number } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "odata-"));
  const fetcher = new Fetcher("offline", dir);

  for (let offset = 0; offset < Math.max(total, 1); offset += pageSize) {
    const rows = Array.from({ length: Math.min(pageSize, total - offset) }, (_, i) => ({
      Id: offset + i,
    }));
    const url =
      offset === 0
        ? `${KNESSET_ODATA_BASE}/KNS_Thing?%24format=json&%24top=${opts.top ?? 50000}`
        : resolveNextUrl(`KNS_Thing?$skiptoken=${offset}`, KNESSET_ODATA_BASE);
    const more = offset + pageSize < total && !opts.omitNextLink;
    writeFileSync(
      fetcher.fixturePath(url),
      JSON.stringify({
        value: rows,
        ...(more ? { "odata.nextLink": `KNS_Thing?$skiptoken=${offset + pageSize}` } : {}),
      }),
      "utf8",
    );
  }
  return fetcher;
}

describe("odataCollect", () => {
  it("reads past the service's 100-row page cap", async () => {
    // The bug this pins: paging used to stop as soon as a page came back shorter than the
    // requested $top, so a service capping at 100 yielded exactly 100 rows of every entity.
    const rows = await odataCollect(pagedFetcher(450), "KNS_Thing");
    expect(rows).toHaveLength(450);
    expect(rows[449]).toEqual({ Id: 449 });
  });

  it("stops at the last page without a spurious extra request", async () => {
    const fetcher = pagedFetcher(200);
    const rows = await odataCollect(fetcher, "KNS_Thing");
    expect(rows).toHaveLength(200);
    expect(fetcher.log).toHaveLength(2);
  });

  it("stops when the service sends no continuation link", async () => {
    const rows = await odataCollect(pagedFetcher(450, 100, { omitNextLink: true }), "KNS_Thing");
    expect(rows).toHaveLength(100);
  });

  it("honours hardLimit as a ceiling", async () => {
    const fetcher = pagedFetcher(450, 100, { top: 250 });
    const rows = await odataCollect(fetcher, "KNS_Thing", { hardLimit: 250 });
    expect(rows).toHaveLength(250);
  });

  it("handles an empty entity set", async () => {
    const rows = await odataCollect(pagedFetcher(0), "KNS_Thing");
    expect(rows).toEqual([]);
  });
});

describe("idFilterChunks", () => {
  it("builds OData or-clauses", () => {
    expect(idFilterChunks("PersonID", [1, 2, 3])).toEqual([
      "PersonID eq 1 or PersonID eq 2 or PersonID eq 3",
    ]);
  });

  it("splits long id lists so the URL stays within limits", () => {
    const chunks = idFilterChunks("BillID", Array.from({ length: 95 }, (_, i) => i), 40);
    expect(chunks).toHaveLength(3);
  });

  it("deduplicates ids", () => {
    expect(idFilterChunks("PersonID", [7, 7, 7])).toEqual(["PersonID eq 7"]);
  });

  it("returns nothing for an empty id list", () => {
    expect(idFilterChunks("PersonID", [])).toEqual([]);
  });
});
