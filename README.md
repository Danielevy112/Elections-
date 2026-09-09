# בחירות 2026 — Knesset 26 elections dashboard

A dashboard for the elections to the 26th Knesset (27 October 2026): every candidate list,
the full ordering, each candidate's parliamentary record, a poll average, and a visual
answer to the question that actually matters when you vote for a list —

> **which of these people am I putting in the Knesset?**

Positions are banded by the range the polls themselves give the list: **צפוי להיכנס** /
**על הגבול** / **כרגע מחוץ לכנסת**.

Every figure on the site resolves to the document it came from.

## Status

Milestone 1: data layer plus a working site. The repo currently ships an **example
dataset** — fictional parties, candidates and polls — so the whole pipeline is runnable
before real data is loaded. The site shows a standing banner while `meta.dataset` is
`example`, and `validate.ts` refuses to let example rows into a snapshot marked `real`.

## Quick start

```bash
npm install
npm test                                     # 62 tests
npm run ingest -- --offline --skip-knesset   # rebuild snapshots from the manual layer
npm run validate                             # schema + referential integrity + provenance
npm run dev                                  # http://localhost:3000
```

## How it fits together

```
Manual overrides (K26 lists, polls) ─┐
Knesset OData (history, bills)  ─────┼─→ ingest → normalise → match → validate
data.gov.il CKAN (candidate lists) ──┘                                  │
                                                                        ▼
                                              data/snapshots/*.json (committed, reviewed)
                                                                        ▼
                                        packages/data (read + projection) → apps/web
```

The site never calls an upstream source at request time. It reads committed snapshots at
build time, so a data change is a reviewable git diff and a bad upstream response can
never reach a visitor.

| Path | What lives there |
| --- | --- |
| `packages/schema` | zod entity schemas — the single source of truth for shape |
| `packages/data` | snapshot loader, joins, and the projection engine |
| `packages/ingest` | adapters, Hebrew name matching, snapshot writer |
| `apps/web` | Next.js static site (RTL) |
| `data/snapshots` | the canonical committed data |
| `data/manual_overrides` | hand-maintained rows, each with a source |
| `data/fixtures` | recorded upstream responses for offline runs |
| `scripts/validate.ts` | the QA gate |

## Loading real data

1. Put the filed lists into `data/manual_overrides/lists.json` and the polls into
   `polls.json`, each with its `sourceUrl` / `sourceTitle`.
2. Set `"dataset": "real"` in `data/manual_overrides/election.json`.
3. Run the sync from a network that can reach the Israeli government hosts:
   `npm run ingest -- --live`. GitHub Actions works; many corporate and sandboxed networks
   do not.
4. Resolve anything in `data/unmatched.json` by adding entries to
   `person_links.json`. Never loosen the matcher to make an unmatched name go away.
5. `npm run validate`, then commit the snapshot diff.

The `Sync data` workflow does steps 3–5 every six hours and opens a **pull request** rather
than pushing, so a human reviews each data change before it reaches the public site.

## Documentation

- [`docs/methodology.md`](docs/methodology.md) — exactly how every number is computed
- [`docs/sources.md`](docs/sources.md) — where the data comes from and which source wins

## Design decisions worth knowing

- **Provenance is structural.** `claims` and `sources` are first-class collections keyed
  by `(subjectType, subjectId, field)`; the UI resolves citations through them. The same
  shape drops into Postgres unchanged.
- **Filing is not approval.** `candidateList.status` is required with no default and is
  rendered everywhere a list appears.
- **Names are never matched by guesswork.** Exact normalised match or an explicit mapping;
  anything else goes to `data/unmatched.json` for a human. Attaching one politician's
  voting record to another is the worst failure this product could produce.
- **No generated prose about candidates.** Counts and facts only, in this milestone.
