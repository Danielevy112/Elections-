import { describe, expect, it } from "vitest";
import { FieldReport, pickInt, pickString, unwrap } from "./odata";

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
