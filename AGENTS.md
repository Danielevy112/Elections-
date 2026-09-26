# Working on this repo (humans and agents)

Two agents work here in parallel, **Claude** (Claude Code sessions) and **Instinct**, on
separate branches. Neither can message the other, so the repository is the coordination
channel: this file sets who owns what, and open questions go in the coordination issue.

## Lanes

| Lane | Owner | Files |
|---|---|---|
| Content: photos, bios, list corrections, poll entry | Instinct | `data/manual_overrides/{photos,bios,lists,polls}.json`, `apps/web/public/photos/`, `scripts/*_photos.py`, `scripts/party_bios.py`, `scripts/wiki_bios.py`, `scripts/knesset_profiles.py` |
| Parliamentary record: link verification, the ingest/sync pipeline, the record on the candidate page | Claude | `packages/ingest`, `packages/data`, `packages/schema/src/linkVerification.ts`, `scripts/validate.ts`, `data/review/` |
| Search, share cards | Claude | new routes and components under `apps/web` |
| Shared | both, section by section | `apps/web/src/app/layout.tsx`, `apps/web/src/app/candidate/[slug]/page.tsx`, `packages/db`, `apps/web/src/lib/*` |

A shared file is edited only in the section of your own lane. If a change needs someone
else's section, say so in the coordination issue instead of editing it.

## Rules

- Branches: Claude on `claude/*`, Instinct on `instinct/*`. Every change reaches `main`
  through a pull request. Never force-push another agent's branch.
- `data/manual_overrides/knesset_links.json` is for **reviewed** links only: one entry per
  list slot, each with a `reason` a person could check. Never generated.
- A candidate is shown with a Knesset record only if `verifyKnessetLink`
  (`packages/schema/src/linkVerification.ts`) accepts the link:
  - an MK whose last term was the 21st Knesset or later is accepted on an exact name match;
  - an older MK needs a reviewed manual link, or a sourced bio for that same list slot.
  - `npm run validate` fails the build on any link that doesn't pass
    (`stale-knesset-link`). Held-back links are listed in
    `data/review/knesset_links_quarantine.json` for review.
- A bill counts as passed only on a third reading (`StatusID` 118, "התקבלה בקריאה
  שלישית"). A bill merged into another one did not pass. An initiator row counts only when
  `IsInitiator` is true.
- `data/snapshots/` is written by `npm run ingest` (or the scheduled sync), never by hand.
- Before a PR: `npm test`, `npm run validate`, `npm run typecheck`.
