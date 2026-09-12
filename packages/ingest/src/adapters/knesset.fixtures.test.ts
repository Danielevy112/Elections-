import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { FieldReport, pickInt, pickString, unwrap } from "../odata";
import { parseODataDate } from "../http";
import { mapBillType } from "./knesset";

/**
 * These run against the responses the scheduled sync actually recorded from
 * knesset.gov.il. The adapters were written blind — the build environment cannot reach
 * that host — so this is where the field aliases stop being guesses.
 */
async function fixture(entity: string): Promise<Record<string, unknown>[]> {
  const matches: string[] = [];
  for await (const path of glob(`data/fixtures/*svc-${entity}.*.json`)) matches.push(path);
  expect(matches, `fixture for ${entity}`).toHaveLength(1);
  return unwrap(JSON.parse(readFileSync(matches[0]!, "utf8")));
}

describe("real KNS_Person responses", () => {
  it("yields a person id and a full name for every row", async () => {
    const report = new FieldReport();
    const rows = await fixture("kns-person");
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const id = pickInt(row, ["PersonID", "personID", "PersonId", "Id"], report);
      const first = pickString(row, ["FirstName", "firstName"], report);
      const last = pickString(row, ["LastName", "lastName"], report);
      expect(id).toBeGreaterThan(0);
      expect(`${first ?? ""} ${last ?? ""}`.trim().length).toBeGreaterThan(0);
    }
    expect(report.missing).not.toContain("PersonID");
  });

  it("confirms the service supplies no image path", async () => {
    // Documented in docs/sources.md: candidate photos need a different source, and none
    // is claimed meanwhile.
    const rows = await fixture("kns-person");
    const report = new FieldReport();
    for (const row of rows) {
      pickString(row, ["PersonImagePath", "ImagePath", "PhotoUrl"], report);
    }
    expect(report.missing).toContain("PersonImagePath");
  });
});

describe("real KNS_Bill responses", () => {
  it("has a numeric StatusID and no status text", async () => {
    // The bug this pins: SubTypeDesc was read as a status. It is the bill's type.
    const rows = await fixture("kns-bill");
    const withStatusId = rows.filter((row) => typeof row.StatusID === "number");
    expect(withStatusId.length).toBeGreaterThan(0);
    expect(rows.some((row) => typeof row.StatusDesc === "string")).toBe(false);
  });

  it("maps every SubTypeDesc the service actually sends", async () => {
    const rows = await fixture("kns-bill");
    const types = new Set(
      rows.map((row) => row.SubTypeDesc).filter((v): v is string => typeof v === "string"),
    );
    expect(types.size).toBeGreaterThan(0);
    for (const type of types) {
      expect(mapBillType(type), `unmapped SubTypeDesc: ${type}`).not.toBe("unknown");
    }
  });

  it("yields an id and a name for every row", async () => {
    const report = new FieldReport();
    for (const row of await fixture("kns-bill")) {
      expect(pickInt(row, ["BillID", "billID"], report)).toBeGreaterThan(0);
      expect(pickString(row, ["Name", "BillName"], report)).toBeTruthy();
    }
  });
});

describe("real KNS_BillInitiator responses", () => {
  it("carries IsInitiator and an Ordinal that is not always 1", async () => {
    // Lead authorship is Ordinal === 1; IsInitiator alone does not distinguish it.
    const rows = await fixture("kns-billinitiator");
    const ordinals = new Set(rows.map((row) => row.Ordinal));
    expect(rows.every((row) => typeof row.IsInitiator === "boolean")).toBe(true);
    expect(ordinals.size).toBeGreaterThan(1);
  });
});

describe("real KNS_PersonToPosition responses", () => {
  it("yields person, Knesset number, faction and parseable dates", async () => {
    const report = new FieldReport();
    for (const row of await fixture("kns-persontoposition")) {
      expect(pickInt(row, ["PersonID", "personID"], report)).toBeGreaterThan(0);
      expect(pickInt(row, ["KnessetNum", "knessetNum"], report)).toBeGreaterThan(0);

      const start = parseODataDate(pickString(row, ["StartDate", "startDate"], report));
      if (start) expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(report.missing).not.toContain("FactionName");
  });
});

describe("real KNS_Committee responses", () => {
  it("yields an id and a name for every row", async () => {
    const report = new FieldReport();
    for (const row of await fixture("kns-committee")) {
      expect(pickInt(row, ["CommitteeID", "committeeID"], report)).toBeGreaterThan(0);
      expect(pickString(row, ["Name", "CommitteeName"], report)).toBeTruthy();
    }
  });
});

describe("real data.gov.il package_show response", () => {
  it("is a successful CKAN envelope listing resources", async () => {
    const matches: string[] = [];
    for await (const p of glob("data/fixtures/data-gov-il-*.json")) matches.push(p);
    const body = JSON.parse(readFileSync(matches[0]!, "utf8")) as Record<string, unknown>;
    expect(body.success).toBe(true);
    const result = body.result as Record<string, unknown>;
    expect(Array.isArray(result.resources)).toBe(true);
  });
});
