import { describe, expect, it } from "vitest";
import { truncate, visualRtl } from "./bidi";

describe("visualRtl", () => {
  it("reverses Hebrew into visual order", () => {
    expect(visualRtl("ישראל כץ")).toBe("ץכ לארשי");
  });

  it("keeps numbers, ranges and percentages left-to-right", () => {
    expect(visualRtl("מקום 6 בליכוד")).toBe("דוכילב 6 םוקמ");
    expect(visualRtl("טווח 18–32")).toBe("18–32 חווט");
    expect(visualRtl("3.25%")).toBe("3.25%");
  });

  it("mirrors brackets", () => {
    expect(visualRtl("(18–32)")).toBe("(18–32)");
    expect(visualRtl("א (ב)")).toBe("(ב) א");
  });

  it("keeps a Latin phrase as one left-to-right unit", () => {
    expect(visualRtl("רשימה Yesh Atid")).toBe("Yesh Atid המישר");
  });
});

describe("truncate", () => {
  it("cuts on a word boundary with an ellipsis", () => {
    expect(truncate("הליכוד עם בנימין נתניהו", 17)).toBe("הליכוד עם בנימין…");
    expect(truncate("הליכוד עם בנימין נתניהו", 16)).toBe("הליכוד עם…");
    expect(truncate("קצר", 10)).toBe("קצר");
  });
});
