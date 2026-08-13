---
title: A RETONE of the whole cast is driven from ONE old→new table applied to both tiers at once — and it moves FOUR snapshots, not three
date: 2026-08-10
scope: docs/manuscript.md, content/thoughts.yaml, content/enemies/, content/levels/
concepts: [retone, voice, snapshots, verification, manuscript, tooling]
---

"Make the dialogue sound more human" is not a `thoughts.yaml` edit. The hero's
voice alone is spread over FIVE homes: `content/levels/<id>.yaml`
(`intro`/`outro`/`merchant.*`), `content/thoughts.yaml` (pinned beats, the
drive, the cap mutter, hellborn), `content/enemies/**` (a `- hero:` page inside
`dialogue`, and `deathBark`), `content/quest-givers.yaml` + `content/quests/`,
and `placards.ts` for the road.

**DO NOT HAND-EDIT THE TWO TIERS SEPARATELY.** Write one JSON table of
`{old, new}` pairs and apply it to `docs/manuscript.md` AND `content/**` in a
single pass, reporting a per-pair match count and any pair that matched
NOTHING. That buys three things a file-by-file sweep does not: the manuscript
and the data cannot drift on a line, a typo'd `old` string shows up as a MISS
instead of a silent no-op, and re-running the table is the "no retired phrasing
survives" proof for free (every pair should then report zero matches). ~50 pairs
per pass is comfortable.

FOUR snapshots move, not three: `update-story-snapshot.mjs` (thoughts/cutscenes/
story items), `update-level-snapshot.mjs` (`intro`/`outro`/`merchant`),
`update-enemy-snapshot.mjs` (dialogue/lastWords/deathBark) AND
`update-companion-snapshot.mjs` — `joinWords`/`killQuotes` live in
`content/companions.yaml`, so any retone touching a spareable rift unique fails
`companion_roundtrip_test` until it is refreshed. `mod/catalog.json` does NOT
move — no id changed.

TWO HARD CAPS are enforced by the generator, not by a test, so they surface as a
failed `npm run levels` rather than a red suite: `lastWords` ≤ 60 chars, and a
`deathBark` line ≤ 62 (it floats unwrapped over the field on a phone).

AND RECORD THE REGISTER WHERE THE SCRIPT LIVES — `docs/manuscript.md`'s own
rules section, with a tell→fix table and WHO IS EXEMPT. A retone that only
changes lines is undone by the next author, who has no idea the flatness was
deliberate.
