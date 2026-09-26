import { describe, expect, it } from "vitest";
import type { Snapshot } from "@elections26/schema";
import { loadSnapshot } from "@elections26/data";
import { readLinkEvidence, validateKnessetLinks, validateSnapshot, type Problem } from "./validate";

/** The committed example snapshot, used as a known-good baseline to corrupt. */
const baseline = loadSnapshot();

function clone(): Snapshot {
  return structuredClone(baseline);
}

function rules(problems: Problem[]): string[] {
  return [...new Set(problems.map((p) => p.rule))].sort();
}

describe("validateSnapshot", () => {
  it("passes the committed snapshot", () => {
    expect(validateSnapshot(baseline)).toEqual([]);
  });

  it("catches a candidacy pointing at a person who does not exist", () => {
    const snapshot = clone();
    snapshot.candidacies[0]!.personId = "person:ghost";
    expect(rules(validateSnapshot(snapshot))).toContain("dangling-ref");
  });

  it("catches a claim citing a source that is not in the snapshot", () => {
    const snapshot = clone();
    snapshot.claims[0]!.sourceId = "source:missing";
    expect(rules(validateSnapshot(snapshot))).toContain("dangling-ref");
  });

  it("catches a gap in a list ordering", () => {
    const snapshot = clone();
    const listId = snapshot.candidacies[0]!.listId;
    const index = snapshot.candidacies.findIndex(
      (c) => c.listId === listId && c.position === 3,
    );
    snapshot.candidacies.splice(index, 1);
    expect(rules(validateSnapshot(snapshot))).toContain("non-contiguous-list");
  });

  it("catches two candidates sharing a list position", () => {
    const snapshot = clone();
    const listId = snapshot.candidacies[0]!.listId;
    const target = snapshot.candidacies.find((c) => c.listId === listId && c.position === 4)!;
    target.position = 3;
    expect(rules(validateSnapshot(snapshot))).toContain("duplicate-position");
  });

  it("catches a duplicated id", () => {
    const snapshot = clone();
    snapshot.persons.push({ ...snapshot.persons[0]! });
    expect(rules(validateSnapshot(snapshot))).toContain("duplicate-id");
  });

  it("catches a poll result that is below threshold yet claims seats", () => {
    const snapshot = clone();
    snapshot.poll_results[0]!.belowThreshold = true;
    snapshot.poll_results[0]!.mandates = 7;
    expect(rules(validateSnapshot(snapshot))).toContain("contradictory-poll-result");
  });

  it("catches a poll handing out more than 120 seats", () => {
    const snapshot = clone();
    const pollId = snapshot.polls[0]!.id;
    for (const result of snapshot.poll_results) {
      if (result.pollId === pollId) {
        result.mandates = 60;
        result.belowThreshold = false;
      }
    }
    expect(rules(validateSnapshot(snapshot))).toContain("oversubscribed-poll");
  });

  it("catches a list position with no claim behind it", () => {
    const snapshot = clone();
    const candidacyId = snapshot.candidacies[0]!.id;
    snapshot.claims = snapshot.claims.filter(
      (c) => !(c.subjectType === "candidacy" && c.subjectId === candidacyId),
    );
    expect(rules(validateSnapshot(snapshot))).toContain("unsourced-fact");
  });

  it("catches a disqualification with no stated reason", () => {
    const snapshot = clone();
    snapshot.candidate_lists[0]!.status = "disqualified";
    delete snapshot.candidate_lists[0]!.statusNote;
    expect(rules(validateSnapshot(snapshot))).toContain("unexplained-disqualification");
  });

  it("refuses to let example data be published outside the example dataset", () => {
    const snapshot = clone();
    snapshot.sources[0] = { ...snapshot.sources[0]!, kind: "manual", title: "נתוני דוגמה" };
    for (const dataset of ["preliminary", "real"] as const) {
      snapshot.meta.dataset = dataset;
      expect(rules(validateSnapshot(snapshot))).toContain("example-data-in-real-snapshot");
    }
  });

  it("keeps press-sourced lists out of a real snapshot", () => {
    const snapshot = clone();
    const pressId = snapshot.sources.find((s) => s.kind === "press")?.id ?? snapshot.sources[0]!.id;
    snapshot.sources = snapshot.sources.map((s) => (s.id === pressId ? { ...s, kind: "press" } : s));
    const claim = snapshot.claims.find((c) => c.subjectType === "candidacy" && c.field === "position")!;
    claim.sourceId = pressId;
    snapshot.meta.dataset = "preliminary";
    expect(rules(validateSnapshot(snapshot))).not.toContain("press-sourced-list-in-real-snapshot");
    snapshot.meta.dataset = "real";
    expect(rules(validateSnapshot(snapshot))).toContain("press-sourced-list-in-real-snapshot");
  });

  it("catches meta counts drifting from the actual rows", () => {
    const snapshot = clone();
    snapshot.meta.counts.persons = 9999;
    expect(rules(validateSnapshot(snapshot))).toContain("stale-meta");
  });

  it("catches fieldwork dated after publication", () => {
    const snapshot = clone();
    snapshot.polls[0]!.fieldworkEnd = "2099-01-01";
    expect(rules(validateSnapshot(snapshot))).toContain("impossible-poll-dates");
  });
});

describe("validateKnessetLinks", () => {
  const evidence = readLinkEvidence();

  it("passes the committed snapshot against the committed overrides", () => {
    expect(validateKnessetLinks(baseline, evidence)).toEqual([]);
  });

  it("fails a candidate linked by name alone to an MK of the 1950s", () => {
    const snapshot = clone();
    const candidacy = snapshot.candidacies.find((c) => c.listId.endsWith(":k26-17") && c.position === 69)!;
    const person = snapshot.persons.find((p) => p.id === candidacy.personId)!;
    person.knessetPersonId = 424242;
    const poisoned = { ...evidence, knessetTermsById: new Map([...evidence.knessetTermsById, [424242, [1, 2, 3, 4, 5]]]) };
    expect(rules(validateKnessetLinks(snapshot, poisoned))).toEqual(["stale-knesset-link"]);

    // A name-only note in the manual file does not enter validation evidence.
    expect(rules(validateKnessetLinks(snapshot, poisoned))).toEqual(["stale-knesset-link"]);
  });
});
