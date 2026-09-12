# Data sources

Every fact the site shows resolves to a row in `sources.json` through a row in
`claims.json`. This document says where those sources come from and which of them is
authoritative when two disagree.

## Precedence

When sources conflict, the higher one wins and the lower one is not silently discarded —
it stays in `sources.json` so the disagreement is visible:

1. **Central Elections Committee** — candidate lists, list status, ballot letters, results.
2. **Knesset** — anything that happened inside the Knesset: terms, factions, committees,
   bills, initiators.
3. **The party's own official material** — leadership, logo, website.
4. **Wikidata / Wikipedia** — biographical detail only, never a parliamentary record.

## Adapters

| Source | Endpoint | Adapter | Supplies |
| --- | --- | --- | --- |
| Knesset OData | `https://knesset.gov.il/Odata/ParliamentInfo.svc` | `packages/ingest/src/adapters/knesset.ts` | persons, terms, factions, committees, bills, bill initiators |
| data.gov.il (CKAN) | `https://data.gov.il/api/3/action` | `packages/ingest/src/adapters/datagov.ts` | candidate lists (`candidates-lists` dataset) |
| Manual overrides | `data/manual_overrides/` | `packages/ingest/src/adapters/manual.ts` | 26th-Knesset lists, polls, corrections |

Candidate-list precedence, enforced in `resolveLists` (`packages/ingest/src/build.ts`):
data.gov.il outranks the manual layer for any party it covers, a party the feed omits keeps
its manual list so a page never vanishes mid-election, and a party in the feed we have never
seen gets a list created for it.

### What the first live sync established

The adapters were written blind, against a host the build environment cannot reach. The
first scheduled runs settled the open questions, and the responses they recorded are now the
offline corpus in `data/fixtures/`. The findings, because they are not obvious:

- **Pages are capped at 100 rows**, whatever `$top` asks for, and the service continues with
  `odata.nextLink` carrying a `$skiptoken` — a continuation cursor, not an offset. Paging by
  `$skip` and stopping on a short page, as the first version did, silently truncated every
  entity set to its first 100 rows. `odataCollect` now follows the links.
- **`KNS_Bill` has no status text.** It carries a numeric `StatusID`; the words live in the
  `KNS_Status` lookup. `SubTypeDesc` — which the first version read as a status — is the
  bill's *type* (`ממשלתית` / `פרטית`). When the lookup is unavailable a bill's status stays
  `unknown`, and unknown is never counted as a passed law.
- **`KNS_Person` has no image path.** Candidate photos need another source; none is claimed
  meanwhile, and the candidate page renders correctly without one.
- **`KNS_PersonToPosition` did not carry committee data** in the sampled rows (`DutyDesc` and
  `CommitteeID` were empty), so committee memberships do not come from it. They are left
  empty rather than inferred.
- `KNS_BillInitiator` marks a real initiator with `IsInitiator`; `Ordinal` is the position in
  the signature list, so lead authorship is `Ordinal === 1`, not `IsInitiator` alone.

Every read still goes through `pick()` with a `FieldReport` that names the alias upstream
actually used and the fields that never arrived, so the next surprise is reported rather than
absorbed.

### Fetching only what is needed

`KNS_Bill` and `KNS_BillInitiator` run to hundreds of thousands of rows, which at 100 rows a
request is thousands of calls. Instead of pulling them whole and discarding almost all of it,
the join is pushed to the service: initiators are fetched filtered to the Knesset persons the
candidate lists resolve to, then bills are fetched filtered to the ids those rows name
(`idFilterChunks` in `packages/ingest/src/odata.ts` builds the chunked `$filter` clauses).

## The cutover to official lists

The 26th-Knesset lists are not in the `candidates-lists` dataset yet. Rather than have
someone check the portal by hand, the sync watches for them:

1. Every six-hourly sync runs `npm run probe`, which lists the dataset's resources and says
   whether one covers the 26th Knesset. Its output goes into the sync PR body.
2. The moment a matching resource appears, the same run ingests it. Official rows outrank
   the manual layer automatically — no code change needed.
3. `dataset` stays `"example"` until a human flips it in
   `data/manual_overrides/election.json`. That flip drops the banner, opens indexing and
   populates the sitemap in one edit, and `validate.ts` refuses it while example-sourced
   rows are still present.

Two deliberate limits on the automatic half:

- **Resource matching never falls back to the nearest election.** If no resource names the
  26th Knesset, the probe reports "not covered". Ingesting the 25th Knesset's lists as the
  26th's would be far worse than reporting an absence.
- **List status is never inferred from the feed.** The dataset names candidates; it does not
  say whether the Elections Committee approved the list. An ingested list is `submitted`
  unless a manual override carries a sourced status. Approval we cannot cite is not claimed.

### How far behind the candidate-list dataset actually runs

The first live probe recorded what `candidates-lists` holds: resources for the **19th to
24th** Knesset, and nothing newer. The 24th Knesset's file was uploaded in **November 2024**,
roughly three and a half years after that election, and the 25th Knesset — elected in
November 2022 — is still absent.

So the 26th-Knesset lists are very unlikely to appear on this portal before the election on
27 October 2026. The cutover stays armed and costs nothing, but it should not be treated as
the plan for getting real candidate data onto the site in time.

Every resource is published as an XLSX upload that the portal then indexes; the source format
is therefore not a useful signal, and `datastore_active` is what decides whether the rows can
be read. The probe reports it, and an un-indexed resource is called out rather than counted
as zero rows.

## Why the 26th-Knesset lists and the polls are entered by hand

This is a deliberate design decision, not a gap:

- **Lists.** They were filed on 7–8 September 2026. The CEC publishes them on its own site
  first; the machine-readable `candidates-lists` dataset historically lags by weeks and
  currently covers earlier elections. Waiting for it would mean shipping nothing during the
  period the data matters most. The `datagov` adapter takes over automatically once the
  dataset carries the 26th Knesset.
- **Polls.** Israel has no public polling API. Poll numbers are published as broadcast
  graphics and article text by each outlet.

Hand-entered data is held to exactly the same standard as scraped data: `sourceUrl` is
required on every poll, `sourceTitle` on every override, and `validate.ts` rejects a
snapshot marked `real` that still contains example rows.

## Fixtures

`data/fixtures/` holds recorded upstream responses. A live run writes them; an offline run
replays them. This is what lets the project be developed and tested without reaching the
Israeli government hosts, and it doubles as a regression corpus — once a response is
recorded, its parsing is testable forever.

## Sources considered and not used in v1

- **Open Knesset (hasadna)** — cleaned mirrors of the same Knesset data. Useful as a
  cross-check to detect gaps, but it is a secondary source; the official service stays
  authoritative. Worth adding as a validation input later.
- **State budget (מפתח התקציב), CBS (הלמ"ס)** — valuable for the claim-checking features
  sketched for milestone 2, out of scope while the fact layer is being established.
