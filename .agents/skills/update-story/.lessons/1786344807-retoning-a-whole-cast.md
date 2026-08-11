---
title: A RETONE of the whole cast is a five-file sweep and moves THREE snapshots — and the register decision belongs in the manuscript's rules or the next pass reverts it
date: 2026-08-10
scope: docs/manuscript.md, content/thoughts.yaml, content/enemies/, content/levels/
concepts: [retone, voice, snapshots, verification, manuscript]
---

"Make the dialogue sound more human" is not a `thoughts.yaml` edit. The hero's
voice is spread over FIVE homes and a pass that touches one misses most of him:
`content/levels/<id>.yaml` (`intro`/`outro`/`merchant.*`), `content/thoughts.yaml`
(pinned beats, the drive, the cap mutter, hellborn), `content/enemies/**`
(a `- hero:` page inside `dialogue`, and `deathBark` — his line as a boss falls),
`content/quest-givers.yaml` + `content/quests/`, and `placards.ts` for the road.
Sweep with `grep -rn "hero:" content/enemies/ -A2` and
`grep -rn -A3 "^deathBark:" content/enemies/` rather than reading files one by one.

THREE snapshots move, not one: `update-story-snapshot.mjs` (thoughts/cutscenes/
story items), `update-level-snapshot.mjs` (a changed `intro`/`outro`) AND
`update-enemy-snapshot.mjs` (dialogue/lastWords/deathBark). A text-only change
feels like it should move none; `yaml_roundtrip_test.ts` and
`enemy_roundtrip_test.ts` fail with 30+ cases until all three are refreshed.
`mod/catalog.json` does NOT move — no id changed.

TWO CHEAP PROOFS, both worth running. Grep every RETIRED phrasing across
`content/` + `docs/` in one script: any survivor is a tier that did not get the
edit, and the only legitimate hits are the ones you quoted as examples in the
manuscript's own rules. Then grep the BUILT library (`cd pwa && npm run library`)
for a new phrase, per the publishing lesson.

AND RECORD THE REGISTER WHERE THE SCRIPT LIVES. A retone that only changes lines
is undone by the next author, who has no idea the flatness was deliberate — so
the decision goes into `docs/manuscript.md`'s own rules section as a rule with a
tell→fix table, INCLUDING which characters are exempt. Here the machines
(PAYLOAD-1, the BROs, the WARDEN) plus THE FOUNDER and THE ARCHITECT talk in
slide decks on purpose; warming them up would have deleted the satire. Bump the
"four rules"/"five rules" heading and the intro sentence that counts them.
