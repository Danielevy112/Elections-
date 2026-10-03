# Working on this repo

Claude (Claude Code sessions) maintains this repository end to end: the data pipeline,
content, polls and the site. Changes reach `main` only through pull requests, and a pull
request merges only with CI green.

## Integrity rules

- No fact without a source. Every candidate list, status, poll, bio and photo carries the
  URL it came from; nothing is inferred, guessed or filled in to make a page look complete.
  A candidate with no public information is shown as such.
- A candidate is shown with a Knesset record only if `verifyKnessetLink`
  (`packages/schema/src/linkVerification.ts`) accepts the link:
  - an MK whose last term was the 21st Knesset or later is accepted on an exact name match;
  - an older MK needs identity evidence tying that person to the same list slot.
  - `npm run validate` fails the build on any link that doesn't pass
    (`stale-knesset-link`). Held-back links are listed in
    `data/review/knesset_links_quarantine.json`; the site and the database publish read
    that file, never a hand-copied list.
- `data/manual_overrides/knesset_links.json` is for **reviewed** links only: one entry per
  list slot, each with a `reason` a person could check. Never generated.
- A bill counts as passed only on a third reading (`StatusID` 118, "התקבלה בקריאה
  שלישית"). A bill merged into another one did not pass. An initiator row counts only when
  `IsInitiator` is true.
- A poll's `sourceUrl` is the publisher's own article, never an aggregator. Wikipedia may be
  used to find polls, not to cite them.
- List and candidacy status changes (approval, disqualification, withdrawal) carry the
  source of the decision. Press sources keep the dataset `preliminary`; only the Central
  Elections Committee's own publication makes it `real`.

## Data flow

- `data/snapshots/` is written by `npm run ingest` (or the scheduled sync), never by hand.
- The scheduled sync (`.github/workflows/sync.yml`) pushes fresh Knesset data to
  `data/sync`. Bring it in by taking its new `data/fixtures/` and re-running `npm run
  ingest` on top of `main`, not by merging the branch, which may predate later fixes.
- Sites this environment cannot reach are fetched through `fetch/*` branches
  (`.github/workflows/fetch.yml`): list URLs in `fetch/urls.txt`, push, read `fetch/out/`.
  `fetch/*` branches are never merged and are deleted after use.

## Before a pull request

`npm test`, `npm run validate`, `npm run typecheck`.
