import { describe, expect, it } from "vitest";
import { matchPerson, normalizeHebrewName, slugifyHebrew, uniqueSlug } from "./match";

describe("normalizeHebrewName", () => {
  it("strips niqqud", () => {
    expect(normalizeHebrewName("נַפְתָּלִי")).toBe(normalizeHebrewName("נפתלי"));
  });

  it("folds gershayim and ascii quotes to the same form", () => {
    expect(normalizeHebrewName('ח"כ')).toBe(normalizeHebrewName("ח״כ"));
    expect(normalizeHebrewName("בן־גוריון")).toBe(normalizeHebrewName("בן גוריון"));
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeHebrewName("  מירב   כהן  ")).toBe(normalizeHebrewName("מירב כהן"));
  });

  it("folds final letters so a mid-name form still matches", () => {
    expect(normalizeHebrewName("בן־גוריון")).toBe(normalizeHebrewName("בנ גוריונ"));
  });

  it("keeps genuinely different names apart", () => {
    expect(normalizeHebrewName("מירב כהן")).not.toBe(normalizeHebrewName("מירב מיכאלי"));
    expect(normalizeHebrewName("יאיר לפיד")).not.toBe(normalizeHebrewName("יאיר גולן"));
  });
});

describe("slugifyHebrew", () => {
  it("produces an ascii kebab slug", () => {
    const slug = slugifyHebrew("נפתלי בנט", "fallback");
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("falls back when a name transliterates to nothing", () => {
    // Junk or blank name fields upstream must still yield a routable slug.
    expect(slugifyHebrew("", "person-7")).toBe("person-7");
    expect(slugifyHebrew("   ", "person-7")).toBe("person-7");
    expect(slugifyHebrew("...", "person-7")).toBe("person-7");
  });

  it("reads vowel-less Hebrew into something recognisable", () => {
    expect(slugifyHebrew("אופק", "x")).toBe("aopk");
    expect(slugifyHebrew("קול העם", "x")).toBe("kol-hm");
    expect(slugifyHebrew("דנה אלמוג", "x")).toBe("dna-almog");
  });

  it("is stable across niqqud differences", () => {
    expect(slugifyHebrew("נַפְתָּלִי בֶּנֶט", "x")).toBe(slugifyHebrew("נפתלי בנט", "x"));
  });
});

describe("uniqueSlug", () => {
  it("suffixes collisions", () => {
    const taken = new Set<string>();
    expect(uniqueSlug("cohen", taken)).toBe("cohen");
    expect(uniqueSlug("cohen", taken)).toBe("cohen-2");
    expect(uniqueSlug("cohen", taken)).toBe("cohen-3");
  });
});

describe("matchPerson", () => {
  const targets = [
    { id: "person:1", nameNormalized: normalizeHebrewName("נפתלי בנט") },
    { id: "person:2", nameNormalized: normalizeHebrewName("מירב כהן") },
    { id: "person:3", nameNormalized: normalizeHebrewName("מירב כהן") },
  ];

  it("matches exactly despite formatting differences", () => {
    expect(matchPerson("נַפְתָּלִי  בנט", targets)).toEqual({
      kind: "matched",
      personId: "person:1",
      via: "exact",
    });
  });

  it("refuses to guess between two people with the same name", () => {
    const outcome = matchPerson("מירב כהן", targets);
    expect(outcome).toMatchObject({ kind: "unmatched", reason: "ambiguous" });
  });

  it("lets an explicit override settle an ambiguous name", () => {
    const outcome = matchPerson("מירב כהן", targets, { "מירב כהן": "person:2" });
    expect(outcome).toEqual({ kind: "matched", personId: "person:2", via: "override" });
  });

  it("reports an unknown name instead of inventing a match", () => {
    expect(matchPerson("אדם לא קיים", targets)).toMatchObject({
      kind: "unmatched",
      reason: "no-candidate",
    });
  });

  it("never matches a merely similar name", () => {
    expect(matchPerson("נפתלי בנטון", targets).kind).toBe("unmatched");
  });
});
