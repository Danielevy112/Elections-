import { describe, expect, it } from "vitest";
import { verifyKnessetLink } from "./linkVerification";

// The cases are the real ones found on the 2026 lists (24.9.2026).
describe("verifyKnessetLink", () => {
  it("accepts a serving or recent MK on the name match alone", () => {
    expect(verifyKnessetLink(25)).toMatchObject({ accepted: true, basis: "recent" });
    expect(verifyKnessetLink(21)).toMatchObject({ accepted: true, basis: "recent" });
  });

  it("rejects a 2026 candidate matched only by name to an MK of the 1950s", () => {
    // אפרתי יוסף, #69 on הדמוקרטים, matched a member of Knessets 1–5.
    const verdict = verifyKnessetLink(5);
    expect(verdict.accepted).toBe(false);
    if (!verdict.accepted) expect(verdict.reason).toContain("כנסת ה-5");
  });

  it("rejects a link with no recent term and nothing else behind it", () => {
    expect(verifyKnessetLink(undefined).accepted).toBe(false);
    expect(verifyKnessetLink(20).accepted).toBe(false);
  });

  it("accepts an older MK with a reviewed manual link", () => {
    // חנין דב בוריס → דב חנין (Knessets 17–20), linked by hand with a reason.
    expect(verifyKnessetLink(20, { manualReason: "אותו אדם; נבדק מול דף המפלגה" })).toMatchObject({
      accepted: true,
      basis: "manual",
    });
    expect(verifyKnessetLink(20, { manualReason: "   " }).accepted).toBe(false);
  });

  it("accepts an older MK when a sourced bio ties the record to this list slot", () => {
    // פייגלין משה זלמן (Knesset 19), whose bio on this slot describes the same person.
    expect(verifyKnessetLink(19, { bioSourcePage: "https://he.wikipedia.org/wiki/משה_פייגלין" })).toMatchObject({
      accepted: true,
      basis: "bio",
    });
  });
});
