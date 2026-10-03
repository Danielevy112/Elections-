import { describe, expect, it } from "vitest";
import { quarantinedKnessetNames } from "./quarantine";

describe("quarantinedKnessetNames", () => {
  it("reads every held-back link from the review file", () => {
    const names = quarantinedKnessetNames();
    // The seven names once hard-coded in the site, plus the rest of the file.
    for (const name of ["אזולאי דוד", "לוי דוד", "אפרתי יוסף", "בירן מיכל", "חיים יהודה", "פלד משה", "שטרן אברהם"]) {
      expect(names.has(name)).toBe(true);
    }
    expect(names.size).toBeGreaterThan(7);
  });

  it("is empty when there is no review file", () => {
    expect(quarantinedKnessetNames("/nonexistent").size).toBe(0);
  });
});
