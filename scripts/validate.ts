import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot, repoRoot, snapshotDir } from "@elections26/data";
import { verifyKnessetLink, type Snapshot } from "@elections26/schema";

/**
 * The QA gate. Schema validity is necessary but nowhere near sufficient for a product
 * whose only real asset is that its numbers are right, so this also checks the things a
 * schema cannot express: that references resolve, that list orderings are intact, that
 * displayed facts carry a source, and that example data can never be published as real.
 *
 * Run in CI on every PR and before any snapshot is committed by the sync workflow.
 */
export interface Problem {
  rule: string;
  detail: string;
}

export function validateSnapshot(snapshot: Snapshot): Problem[] {
  const problems: Problem[] = [];
  const fail = (rule: string, detail: string) => problems.push({ rule, detail });

  const ids = <T extends { id: string }>(rows: T[]) => new Set(rows.map((r) => r.id));
  const personIds = ids(snapshot.persons);
  const partyIds = ids(snapshot.parties);
  const listIds = ids(snapshot.candidate_lists);
  const electionIds = ids(snapshot.elections);
  const pollIds = ids(snapshot.polls);
  const billIds = ids(snapshot.bills);
  const committeeIds = ids(snapshot.committees);
  const sourceIds = ids(snapshot.sources);

  // ---- unique ids ----------------------------------------------------------------
  for (const [name, rows] of Object.entries(snapshot)) {
    if (!Array.isArray(rows)) continue;
    const seen = new Set<string>();
    for (const row of rows as { id: string }[]) {
      if (seen.has(row.id)) fail("duplicate-id", `${name}: ${row.id} appears more than once`);
      seen.add(row.id);
    }
  }

  // ---- referential integrity -----------------------------------------------------
  const ref = (
    ok: boolean,
    rule: string,
    detail: string,
  ) => { if (!ok) fail(rule, detail); };

  for (const list of snapshot.candidate_lists) {
    ref(partyIds.has(list.partyId), "dangling-ref", `candidate_list ${list.id} -> party ${list.partyId}`);
    ref(electionIds.has(list.electionId), "dangling-ref", `candidate_list ${list.id} -> election ${list.electionId}`);
    if (list.status === "disqualified" && !list.statusNote) {
      fail("unexplained-disqualification", `candidate_list ${list.id} is disqualified with no statusNote`);
    }
  }
  for (const candidacy of snapshot.candidacies) {
    ref(listIds.has(candidacy.listId), "dangling-ref", `candidacy ${candidacy.id} -> list ${candidacy.listId}`);
    ref(personIds.has(candidacy.personId), "dangling-ref", `candidacy ${candidacy.id} -> person ${candidacy.personId}`);
  }
  for (const membership of snapshot.knesset_memberships) {
    ref(personIds.has(membership.personId), "dangling-ref", `membership ${membership.id} -> person ${membership.personId}`);
  }
  for (const membership of snapshot.committee_memberships) {
    ref(personIds.has(membership.personId), "dangling-ref", `committee_membership ${membership.id} -> person`);
    ref(committeeIds.has(membership.committeeId), "dangling-ref", `committee_membership ${membership.id} -> committee ${membership.committeeId}`);
  }
  for (const initiator of snapshot.bill_initiators) {
    ref(billIds.has(initiator.billId), "dangling-ref", `bill_initiator ${initiator.id} -> bill ${initiator.billId}`);
    ref(personIds.has(initiator.personId), "dangling-ref", `bill_initiator ${initiator.id} -> person ${initiator.personId}`);
  }
  for (const result of snapshot.poll_results) {
    ref(pollIds.has(result.pollId), "dangling-ref", `poll_result ${result.id} -> poll ${result.pollId}`);
    ref(partyIds.has(result.partyId), "dangling-ref", `poll_result ${result.id} -> party ${result.partyId}`);
  }
  for (const party of snapshot.parties) {
    if (party.leaderPersonId) {
      ref(personIds.has(party.leaderPersonId), "dangling-ref", `party ${party.id} -> leader ${party.leaderPersonId}`);
    }
  }
  for (const claim of snapshot.claims) {
    ref(sourceIds.has(claim.sourceId), "dangling-ref", `claim ${claim.id} -> source ${claim.sourceId}`);
  }

  // ---- list orderings ------------------------------------------------------------
  const byList = new Map<string, number[]>();
  for (const candidacy of snapshot.candidacies) {
    const bucket = byList.get(candidacy.listId);
    if (bucket) bucket.push(candidacy.position);
    else byList.set(candidacy.listId, [candidacy.position]);
  }
  for (const [listId, positions] of byList) {
    const sorted = [...positions].sort((a, b) => a - b);
    const duplicates = sorted.filter((p, i) => i > 0 && p === sorted[i - 1]);
    if (duplicates.length > 0) {
      fail("duplicate-position", `list ${listId} has two candidates at position(s) ${[...new Set(duplicates)].join(", ")}`);
    }
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i] !== i + 1) {
        fail("non-contiguous-list", `list ${listId} jumps from ${sorted[i - 1] ?? 0} to ${sorted[i]}; positions must run 1..N`);
        break;
      }
    }
  }

  // ---- polls ---------------------------------------------------------------------
  for (const poll of snapshot.polls) {
    ref(electionIds.has(poll.electionId), "dangling-ref", `poll ${poll.id} -> election ${poll.electionId}`);
    if (!poll.sourceUrl) fail("unsourced-poll", `poll ${poll.id} has no sourceUrl`);
    if (poll.fieldworkEnd && poll.fieldworkEnd > poll.publishedAt) {
      fail("impossible-poll-dates", `poll ${poll.id} finished fieldwork after it was published`);
    }
  }
  for (const result of snapshot.poll_results) {
    if (result.belowThreshold && result.mandates > 0) {
      fail("contradictory-poll-result", `poll_result ${result.id} is flagged below threshold but claims ${result.mandates} seats`);
    }
  }
  const seatTotals = new Map<string, number>();
  for (const result of snapshot.poll_results) {
    seatTotals.set(result.pollId, (seatTotals.get(result.pollId) ?? 0) + result.mandates);
  }
  const election = snapshot.elections[0];
  for (const [pollId, total] of seatTotals) {
    if (election && total > election.totalSeats) {
      fail("oversubscribed-poll", `poll ${pollId} distributes ${total} seats, more than the ${election.totalSeats} available`);
    }
  }

  // ---- provenance ----------------------------------------------------------------
  const claimed = new Set(snapshot.claims.map((c) => `${c.subjectType}:${c.subjectId}:${c.field}`));
  for (const candidacy of snapshot.candidacies) {
    if (!claimed.has(`candidacy:${candidacy.id}:position`)) {
      fail("unsourced-fact", `candidacy ${candidacy.id} has no claim backing its list position`);
    }
  }
  for (const list of snapshot.candidate_lists) {
    if (!claimed.has(`candidateList:${list.id}:status`)) {
      fail("unsourced-fact", `candidate_list ${list.id} has no claim backing its status`);
    }
  }

  // ---- example data must never be published as real -------------------------------
  if (snapshot.meta.dataset !== "example") {
    const exampleSources = snapshot.sources.filter(
      (s) => s.kind === "manual" && /דוגמה|example|placeholder/i.test(s.title),
    );
    for (const source of exampleSources) {
      fail("example-data-in-real-snapshot", `source ${source.id} ("${source.title}") is example data but the snapshot is marked ${snapshot.meta.dataset}`);
    }
    const unsourced = snapshot.sources.filter((s) => !s.url && s.kind !== "manual");
    for (const source of unsourced) {
      fail("unretrievable-source", `source ${source.id} ("${source.title}") has no URL in a ${snapshot.meta.dataset} snapshot`);
    }
  }
  // A final snapshot cannot rest on press copies of the lists: once "real", list positions
  // and statuses must come from the Elections Committee (or its data.gov.il feed).
  if (snapshot.meta.dataset === "real") {
    const pressSources = new Set(snapshot.sources.filter((s) => s.kind === "press").map((s) => s.id));
    for (const claim of snapshot.claims) {
      if (claim.subjectType === "candidacy" && claim.field === "position" && pressSources.has(claim.sourceId)) {
        fail("press-sourced-list-in-real-snapshot", `candidacy ${claim.subjectId} position rests on a press source; keep the dataset "preliminary" until official lists are loaded`);
        break;
      }
    }
  }

  // ---- counts match reality --------------------------------------------------------
  for (const [name, count] of Object.entries(snapshot.meta.counts)) {
    const rows = (snapshot as unknown as Record<string, unknown>)[name];
    if (Array.isArray(rows) && rows.length !== count) {
      fail("stale-meta", `meta.counts.${name} says ${count} but ${name}.json holds ${rows.length}`);
    }
  }

  return problems;
}

/** What the reviewed overrides say about Knesset links, keyed by list slot ("k26-17:69"). */
export interface LinkEvidenceFiles {
  manualReasonBySlot: Map<string, string>;
  bioPageBySlot: Map<string, string>;
  knessetTermsById: Map<number, number[]>;
}

export function readLinkEvidence(root = repoRoot()): LinkEvidenceFiles {
  const read = (file: string): any => {
    const path = join(root, "data", "manual_overrides", file);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  };
  const slot = (r: { partyKey: string; position: number }) => `${r.partyKey}:${r.position}`;
  return {
    manualReasonBySlot: new Map((read("knesset_links.json")?.links ?? []).map((l: any) => [slot(l), l.reason])),
    bioPageBySlot: new Map((read("bios.json")?.bios ?? []).map((b: any) => [slot(b), b.sourcePage])),
    knessetTermsById: new Map(
      Object.values(read("knesset_profiles.json")?.profiles ?? {}).map((p: any) => [p.knessetPersonId, p.knessetTerms]),
    ),
  };
}

/**
 * stale-knesset-link: every candidate the snapshot links to a Knesset person must pass the
 * same verifyKnessetLink rule the site applies. A name match to an MK whose last term was
 * the 20th Knesset or earlier, with no reviewed link or sourced bio behind it, fails the
 * build — it would show a 2026 candidate with someone else's record.
 */
export function validateKnessetLinks(snapshot: Snapshot, evidence: LinkEvidenceFiles): Problem[] {
  const problems: Problem[] = [];
  const lastKnesset = new Map<string, number>();
  for (const m of snapshot.knesset_memberships) {
    lastKnesset.set(m.personId, Math.max(lastKnesset.get(m.personId) ?? 0, m.knessetNumber));
  }
  const persons = new Map(snapshot.persons.map((p) => [p.id, p]));
  for (const candidacy of snapshot.candidacies) {
    const person = persons.get(candidacy.personId);
    if (person?.knessetPersonId === undefined) continue;
    const slot = `${candidacy.listId.split(":").at(-1)}:${candidacy.position}`;
    const terms = evidence.knessetTermsById.get(person.knessetPersonId) ?? [];
    const last = Math.max(lastKnesset.get(person.id) ?? 0, ...terms) || undefined;
    const verdict = verifyKnessetLink(last, {

    });
    if (!verdict.accepted) {
      problems.push({
        rule: "stale-knesset-link",
        detail: `${person.nameHe} (${slot}) is linked to Knesset person ${person.knessetPersonId}: ${verdict.reason}`,
      });
    }
  }
  return problems;
}

function main(): void {
  const dir = process.argv[2] ?? snapshotDir();
  let snapshot: Snapshot;
  try {
    snapshot = loadSnapshot(dir);
  } catch (error) {
    console.error(`validate: could not load snapshot from ${dir}\n`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const problems = [...validateSnapshot(snapshot), ...validateKnessetLinks(snapshot, readLinkEvidence())];
  const label = `${snapshot.meta.dataset} dataset, generated ${snapshot.meta.generatedAt}`;

  if (problems.length === 0) {
    console.log(`validate: OK — ${label}`);
    const total = Object.values(snapshot.meta.counts).reduce((sum, n) => sum + n, 0);
    console.log(`  ${total} rows across ${Object.keys(snapshot.meta.counts).length} collections`);
    if (snapshot.meta.dataset === "example") {
      console.log("  note: this is example data — the site will show a warning banner.");
    }
    return;
  }

  console.error(`validate: ${problems.length} problem(s) — ${label}\n`);
  const byRule = new Map<string, Problem[]>();
  for (const problem of problems) {
    const bucket = byRule.get(problem.rule);
    if (bucket) bucket.push(problem);
    else byRule.set(problem.rule, [problem]);
  }
  for (const [rule, rows] of byRule) {
    console.error(`  ${rule} (${rows.length})`);
    for (const row of rows.slice(0, 10)) console.error(`    - ${row.detail}`);
    if (rows.length > 10) console.error(`    ... and ${rows.length - 10} more`);
  }
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith("validate.ts")) main();
