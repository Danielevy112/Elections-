import { describe, expect, it } from "vitest";
import { loadSnapshot } from "./loader";
import { bandForPosition } from "./projection";
import { buildSite } from "./views";

describe("buildSite: withdrawn candidacies", () => {
  const site = buildSite(loadSnapshot(undefined, { omit: ["bills", "bill_initiators"] }));

  it("gives a withdrawn candidate no seat and moves everyone below up one place", () => {
    const view = site.parties.find((p) => p.party.id === "party:k26-35");
    expect(view).toBeDefined();
    const rows = view!.candidates;
    const withdrawn = rows.filter((r) => r.withdrawn);
    expect(withdrawn.map((r) => r.candidacy.position)).toEqual([3]);
    expect(withdrawn[0]!.band).toBe("out");

    // Filed slot 4 now holds seat 3, slot 5 seat 4, and so on.
    for (const row of rows.filter((r) => r.candidacy.position > 3)) {
      expect(row.band).toBe(bandForPosition(view!.projection, row.candidacy.position - 1));
    }
  });

  it("carries the withdrawal date and the candidacy id to the candidate page", () => {
    const candidate = site.candidates.find((c) => c.withdrawnAt !== undefined);
    expect(candidate?.candidacyId).toBe("candidacy:list:26:k26-35:3");
    expect(candidate?.withdrawnAt).toBe("2026-10-02");
  });
});
