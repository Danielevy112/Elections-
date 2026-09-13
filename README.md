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
npm test                                     # 102 tests
npm run ingest -- --offline --skip-knesset   # rebuild snapshots from the manual layer
npm run validate                             # schema + referential integrity + provenance
npm run dev                                  # http://localhost:3000

npm run probe                                # has data.gov.il published the K26 lists yet?
npm run add-poll -- --help                   # record a new poll
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

Candidate lists arrive on their own. The six-hourly `Sync data` workflow probes
data.gov.il, reports coverage in its PR body, and ingests the official lists the moment the
26th Knesset appears there — at which point they outrank the manual layer automatically.

Polls never arrive on their own; Israel has no polling API. Record one with:

```bash
npm run add-poll -- --pollster "מדגם" --publisher "חדשות 12"   --date 2026-09-10 --sample 751 --source "https://..."   --seats "ofek=24,yachad-kadima=21,bayit-yarok=0!"
```

A trailing `!` marks a party below the threshold. Every rule `validate.ts` applies to a
finished snapshot is checked here first, so a missing source or a 130-seat total is rejected
before anything is written.

### Going from example data to real data

1. Wait for a sync PR whose probe reports the 26th Knesset **is** covered; that PR already
   carries the official lists.
2. Review the `data/snapshots/` diff, and resolve anything in `data/unmatched.json` by
   adding entries to `person_links.json`. Never loosen the matcher to make a name go away.
3. Flip `"dataset": "real"` in `data/manual_overrides/election.json`.
4. `npm run ingest -- --offline && npm run validate`, then merge.

Step 3 drops the example banner, switches `robots.txt` from `Disallow: /` to allow, emits
the sitemap and removes `noindex` — one edit, no second switch to forget. `validate.ts`
refuses the flip while example-sourced rows remain, and because `vercel.json` runs
`validate` before the build, a premature flip fails the deploy rather than publishing
fiction as fact.

## Deployment

Production builds from `main` on Vercel; every PR gets a preview. The build command is
`npm run validate && npm run build -w apps/web`, so **the deploy gate is the same gate as
CI** — a snapshot that fails referential integrity cannot reach the public site.

Everything Vercel needs is in `vercel.json`, so importing the repo at `vercel.com/new` needs
no settings typed by hand. Leave **Root Directory** at the repo root; the values it should
pick up are:

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Install Command | `npm ci` |
| Build Command | `npx tsx scripts/validate.ts && npm run build -w apps/web` |
| Output Directory | `apps/web/out` |

The build command calls `tsx` directly rather than going through the root `validate` npm
script. npm 12 expands `npm run <script>` across every workspace, and `apps/web` has no
`validate` script of its own, so that workspace's miss failed the whole command. A binary
invocation has no script name for npm to resolve. `engines.node` is pinned to `22.x` for the
same reason: CI and local development both run Node 22, and a deployment should not be the
only place this code meets a different package manager.

The preset is deliberately **Other**, not Next.js. `apps/web/next.config.mjs` sets
`output: "export"`, so the build produces a plain static site in `apps/web/out` rather than
the `.next` directory the Next.js preset looks for. The site has no server-side behaviour at
all — it reads committed snapshots at build time — so serving it as static files is an
accurate description rather than a workaround.

While `meta.dataset` is `example` the site is reachable by link but carries `noindex` and a
`Disallow: /` robots.txt, so fictional candidate data cannot turn up in a search result.

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
