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

  it("rejects a biography URL or name-only manual reason as identity evidence", () => {
    expect(verifyKnessetLink(19).accepted).toBe(false);
    expect(verifyKnessetLink(19, { identitySourceUrl: "https://example.org/person" }).accepted).toBe(false);
    expect(verifyKnessetLink(19, { identityReview: "same person" }).accepted).toBe(false);
  });

  it("requires a reviewed identity source to link an older MK", () => {
    expect(verifyKnessetLink(19, { identitySourceUrl: "https://example.org/person", identityReview: "Independent page identifies the candidate and former MK" })).toMatchObject({ accepted: true, basis: "reviewed" });
  });
});
