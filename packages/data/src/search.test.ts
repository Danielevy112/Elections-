import { describe, expect, it } from "vitest";
import { buildSearchIndex, parseSearchQuery, searchIndex } from "./search";

const index = buildSearchIndex([
  { kind: "party", slug: "likud", name: "הליכוד עם בנימין נתניהו לראשות הממשלה" },
  { kind: "candidate", slug: "bennett", name: "נפתלי בנט", filedName: "בנט נפתלי", partyName: "ביחד", position: 1, band: "safe" },
  { kind: "candidate", slug: "katz", name: "ישראל כץ", filedName: "כץ ישראל", partyName: "הליכוד", position: 6, band: "safe" },
  { kind: "candidate", slug: "katz-other", name: "כץ ישראל", partyName: "רשימה אחרת", position: 40, band: "out" },
  { kind: "candidate", slug: "katznelson", name: "כצנלסון דן", partyName: "רשימה", position: 3, band: "borderline" },
  { kind: "candidate", slug: "ben-gvir", name: "איתמר בן גביר", filedName: "בן-גביר איתמר", position: 1, band: "safe" },
]);

const slugs = (q: string) => searchIndex(index, q).map((r) => r.slug);

describe("searchIndex", () => {
  it("finds a name typed in either order", () => {
    expect(slugs("נפתלי בנט")[0]).toBe("bennett");
    expect(slugs("בנט נפתלי")[0]).toBe("bennett");
  });

  it("matches word prefixes while typing", () => {
    expect(slugs("נפת")).toEqual(["bennett"]);
    expect(slugs("נפתלי ב")).toEqual(["bennett"]);
  });

  it("ignores niqqud, final letters and hyphens", () => {
    expect(slugs("נַפְתָּלִי")[0]).toBe("bennett");
    expect(slugs("בן גביר")).toContain("ben-gvir");
    expect(slugs("בן-גביר")).toContain("ben-gvir");
  });

  it("puts a whole-word hit above a prefix hit, and projected seats first", () => {
    expect(slugs("כץ")).toEqual(["katz", "katz-other", "katznelson"]);
  });

  it("finds a list by any word of its name", () => {
    expect(slugs("הליכוד")[0]).toBe("likud");
    expect(slugs("ליכוד")[0]).toBe("likud"); // without the definite article
    expect(slugs("נתניהו")[0]).toBe("likud");
  });

  it("needs a distinct name word for each query word", () => {
    expect(slugs("כץ כץ")).toEqual([]);
  });
});

describe("parseSearchQuery", () => {
  it("accepts names, and trims and collapses whitespace", () => {
    expect(parseSearchQuery("  נפתלי   בנט ")).toBe("נפתלי בנט");
    expect(parseSearchQuery('ש"ס')).toBe('ש"ס');
  });

  it("rejects what no name contains, and anything too short or too long", () => {
    for (const bad of [undefined, null, "", "א", "x".repeat(41), "'; DROP TABLE persons; --", "<script>", "a/b", "%"]) {
      expect(parseSearchQuery(bad as string)).toBeUndefined();
    }
  });
});
