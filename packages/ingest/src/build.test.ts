import { describe, expect, it } from "vitest";
import type { ManualBundle } from "./adapters/manual";
import type { CandidateListRow } from "./adapters/datagov";
import { resolveLists } from "./build";

const manual: ManualBundle = {
  election: {
    dataset: "example",
    knessetNumber: 26,
    electionDate: "2026-10-27",
    totalSeats: 120,
    thresholdPct: 3.25,
    sourceTitle: "test",
  },
  parties: [
    { key: "ofek", nameHe: "אופק", leaderName: "דנה אלמוג", sourceTitle: "manual" },
    { key: "kol", nameHe: "קול העם", datagovName: "רשימת קול העם", sourceTitle: "manual" },
  ],
  lists: [
    {
      partyKey: "ofek",
      status: "approved",
      submittedAt: "2026-09-07",
      sourceTitle: "manual",
      candidates: [{ position: 1, nameHe: "דנה אלמוג" }],
    },
    {
      partyKey: "kol",
      status: "submitted",
      sourceTitle: "manual",
      candidates: [{ position: 1, nameHe: "רונן אבוטבול" }],
    },
  ],
  polls: [],
  personLinks: {},
  knessetLinks: [],
  bioPages: new Map(),
  knessetTermsById: new Map(),
  parliamentary: undefined,
};

function row(partyName: string, candidateName: string, position: number): CandidateListRow {
  return { partyName, candidateName, position, ballotLetters: undefined };
}

describe("resolveLists", () => {
  it("uses the manual layer when data.gov.il has nothing", () => {
    expect(resolveLists(manual, undefined).origin).toBe("manual");
    expect(resolveLists(manual, []).origin).toBe("manual");
    expect(resolveLists(manual, []).lists).toBe(manual.lists);
  });

  it("lets the official feed replace a hand-entered list", () => {
    const resolved = resolveLists(manual, [
      row("אופק", "דנה אלמוג", 1),
      row("אופק", "מישהי חדשה", 2),
    ]);

    expect(resolved.origin).toBe("datagov");
    const ofek = resolved.lists.find((l) => l.partyKey === "ofek")!;
    expect(ofek.candidates.map((c) => c.nameHe)).toEqual(["דנה אלמוג", "מישהי חדשה"]);
  });

  it("keeps a sourced approval status from the manual override", () => {
    // The dataset lists candidates but does not say whether the list was approved, so a
    // status we already have a source for must survive the handover.
    const resolved = resolveLists(manual, [row("אופק", "דנה אלמוג", 1)]);
    expect(resolved.lists.find((l) => l.partyKey === "ofek")?.status).toBe("approved");
  });

  it("defaults an unknown party's list to submitted, never approved", () => {
    const resolved = resolveLists(manual, [row("מפלגה חדשה", "אדם כלשהו", 1)]);
    const fresh = resolved.lists.find((l) => l.partyKey.startsWith("datagov-"))!;
    expect(fresh.status).toBe("submitted");
  });

  it("creates a party for a filing we have never seen", () => {
    const resolved = resolveLists(manual, [row("מפלגה חדשה", "אדם כלשהו", 1)]);
    expect(resolved.parties.some((p) => p.nameHe === "מפלגה חדשה")).toBe(true);
  });

  it("matches a party through its datagovName alias", () => {
    const resolved = resolveLists(manual, [row("רשימת קול העם", "רונן אבוטבול", 1)]);
    expect(resolved.lists.some((l) => l.partyKey === "kol")).toBe(true);
    expect(resolved.lists.some((l) => l.partyKey.startsWith("datagov-"))).toBe(false);
  });

  it("keeps a known party whose list the feed omitted", () => {
    // A gap upstream must not make a party page disappear mid-election.
    const resolved = resolveLists(manual, [row("אופק", "דנה אלמוג", 1)]);
    expect(resolved.lists.some((l) => l.partyKey === "kol")).toBe(true);
  });

  it("orders candidates by position regardless of row order", () => {
    const resolved = resolveLists(manual, [
      row("אופק", "שלישית", 3),
      row("אופק", "ראשונה", 1),
      row("אופק", "שנייה", 2),
    ]);
    const ofek = resolved.lists.find((l) => l.partyKey === "ofek")!;
    expect(ofek.candidates.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it("tolerates formatting differences in the party name", () => {
    const resolved = resolveLists(manual, [row("  אופק  ", "דנה אלמוג", 1)]);
    expect(resolved.lists.some((l) => l.partyKey === "ofek")).toBe(true);
  });
});
