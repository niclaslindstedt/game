---
name: level-design
description: "Use when adding a new level/mission to the game or substantially reworking one — the LevelDef anatomy, campaign registration and unlock order, spawn/wave budgets, the cumulative loot-pool rule, XP/arrow-cap pacing wiring, tiles/music/story surfaces, and the checker + test battery a new map must pass before it ships."
---

# Designing a Level

A level is **data**: one `LevelDef` module plus the roster, sprites, score,
and story text it references. The def itself is easy; what makes a level
*correct* is the cross-cutting wiring — pacing caps, drop windows, checker
tables, tests — that every other map already participates in. This skill is
the map of that wiring. Load the `enemy-design` skill for the roster, the
`pixel-assets` skill for tiles/sprites, the `weapon-system` skill for loot,
and the `sound-effects` skill for the score.

**Before starting, read past lessons:** `node scripts/skill-lessons.mjs level-design`.

## Where everything lives

| Piece | File |
| --- | --- |
| The level def | `src/game/defs/levels/<id>.ts` — one exported `LevelDef` (use `mars.ts` as the reference) |
| Field reference | `src/game/defs/levels/types.ts` — every field documented at the type |
| Registration + story order | `src/game/defs/levels/index.ts` — import, add to `ORDERED` (or `SECRET`); `LEVEL_ORDER` drives everything downstream |
| Unlock chain | **Derived, not authored** — `website/src/game/characters.ts` unlocks each level when its `LEVEL_ORDER` predecessor is cleared |
| Difficulty ladder | `src/game/defs/difficulties.ts` — a new level needs NO edits there |
| Enemy roster | `src/game/defs/enemies/<roster>.ts`, merged in `enemies/index.ts` (`mergeRosters`) — see the `enemy-design` skill |
| Tiles + field sprites | a `website/scripts/sprite-data/<name>.mjs` family module, registered in `sprite-data/index.mjs` `FAMILIES` |
| Music | `website/src/game/music/<name>.ts` + a `LEVEL_TRACKS` entry (`music/index.ts`); the def's `music` id keys it (missing id = default theme) |
| Story text | `intro`/`outro` pages, `foes` label, merchant `greeting`, `prelude` cutscene (`defs/cutscenes.ts`), thought pins (`defs/thoughts.ts`), lore items (`defs/story.ts`) — ALL manuscript-governed |
| Per-level achievements | **Auto-generated** from `LEVEL_ORDER` (`website/src/game/achievement-defs.ts`); check `achievement-totals.ts`'s last-level trigger still points at the intended finale |
| Content tests | `tests/content/<id>_test.ts` (model on `mars_test.ts`); `tests/content/catalog_test.ts` picks the level up automatically |

## The def, in authoring order

Every field is documented in `levels/types.ts` — read it. The load-bearing
groups:

1. **Identity & world**: `id`, `index` (story order; secret levels share a
   campaign peer's index), `name`, `width`/`height`, `gravity` (the feel
   lever: moon float vs deck snap), `biome`, `tiles` (common/rare ground
   sprites, optional `zones` rects for split-terrain maps), `heroSuited`.
2. **Layout**: `playerSpawn`, `landmarks` (story props), `obstacles`
   (scattered solids; `jumpable`, `rockSizes`+`cell` for rect rocks),
   `walls` (segments), optional `wells` (gravity wells), `doors` (locked by
   a story-item key whose `unlocks` names the id), `gates` (latent travel
   to another level), `decor`.
3. **Population**: `spawns` (placed at creation — banded
   `{enemy, count, band: [lo, hi]}` along spawn→objective, or pinned
   `{enemy, at}`; `minDifficulty` gates entries), `waves`
   (`rampDurationMs`, `maxAlive`, `minAlive`, `moveSpawnEvery`, `budget`
   windows), `packs` (fixed clusters pinned at `{at}` that SLEEP until the
   hero nears them then boil up and give chase — `{at, members:[{enemy,
   count}], triggerRadius?, spawnRadius?}`; a member `count` is a base
   auto-scaled per difficulty, or a `{easy, hard, …}` record for exact per-rung
   control; the movement-driven counter to the wave horde — build a map to be
   CLEARED BY MOVING through its packs rather than farmed from a standstill,
   and on a `clearAll` level every pack must be reached and wiped to win),
   `objective` (`killBoss` | `clearAll` | `reachExit`), `openingStrike` (the
   scripted "draw your weapon" beat).
4. **Story beats**: `intro` (the hero's opening monologue), optional
   `outro`/`prelude`, `firstKillThoughts`/`firstSightThoughts` pinned to
   `THOUGHT_DEFS` entries, the per-level `merchant` persona, `placedItems`
   for hand-laid story pickups.
5. **Loot**: `weaponPool`/`gearPool`/`abilityPool`, `earlyDrops`,
   `allClearWeapon`, `worldUniques`, `worldDropMult`,
   `arrowCapByDifficulty`. **The cumulative-pool rule (the bunker idiom):
   later maps re-list every earlier stage's bases** so revisit rungs keep
   live bases in their drop window — never author a pool with only the new
   map's bases. Forge any new base via the `weapon-system` skill.

## The cross-cutting wiring — where new maps actually break

- **Pacing caps come from the calculator, not intuition.** Run
  `node scripts/leveling-curve.mjs --by-level` and read the hero's level at
  the start/end of the new map's clears: that sizes
  `loot.arrowCapByDifficulty` (the level a normal single run ends at, per
  rung) and any `worldUniques` `minPlayerLevel` gate. Adding a campaign
  level also shifts the `XP_CAP.capByDifficulty` interpolation
  (`config.ts`; intermediate maps interpolate via `levelPosition`) — verify
  first visits still forfeit ~no XP (`xpLost` in the `simulate-run`
  summary).
- **The weapon checker has per-map tables.** `scripts/weapon-stats.mjs`
  needs a `LEVEL_MLVL_BANDS` entry for the new map (it warns "no
  LEVEL_MLVL_BANDS entry" otherwise) and `--coverage` needs its
  `CAMPAIGN_LANDINGS` column — both re-read from `leveling-curve.mjs
  --by-level`. Coverage must hold ≥4 weapons / ≥3 gear in-window.
- **Dev-warp loadouts are derived** (`levelsBefore` → `deriveArrivalLoadout`
  in `src/game/arrival.ts`) — nothing to author, but the derived-loadout
  floors in other maps' content tests can shift when the order changes.

## Workflow

1. **Place it in the campaign**: pick the `index`, write the def module,
   register it in `levels/index.ts`. `catalog_test.ts` now asserts every id
   the def references resolves — let it drive the wiring.
2. **Roster** — the `enemy-design` skill (new roster file or extend a
   neighbor's).
3. **Author layout + population**, keeping the mobile viewport in mind
   (≈422×195 world units visible): spawn distances, boss stand-off, and
   landmark spacing are judged at phone scale.
4. **Loot pools** — cumulative, plus the map's own new bases; `earlyDrops`
   for the scripted first finds.
5. **Pacing wiring** — the caps/checker tables above.
6. **Presentation** — sprite family + tiles (`pixel-assets`; check the
   tiling strip for seams), the score (`sound-effects`), `foes` label.
7. **Story** — intro/thoughts/merchant/lore. Every spoken or found line is
   transcribed in `docs/manuscript.md` in the same change — and manuscript
   edits need user confirmation (CLAUDE.md "Story & dialogue").
8. **Tests** — write `tests/content/<id>_test.ts` (story index, roster
   composition, key wiring, thought triggers, obstacle-vs-gravity
   viability — mirror `mars_test.ts`), then `make test`.
9. **Measure and feel** — `node scripts/simulate-run.mjs --difficulty easy
   --level <id> --full` (blows-to-kill, drops, xpLost), then the `playtest`
   skill at the phone viewport; eyeball the art in place with
   `node website/scripts/art-audit.mjs level <id>`.

## After you're done — the checklist

- [ ] Registered in `levels/index.ts`; `catalog_test.ts` green (ids, index
      ordering).
- [ ] `node scripts/leveling-curve.mjs --by-level` re-read →
      `arrowCapByDifficulty` + `XP_CAP` bands still land where runs end.
- [ ] `scripts/weapon-stats.mjs --coverage` clean, `LEVEL_MLVL_BANDS` +
      `CAMPAIGN_LANDINGS` entries added.
- [ ] `node scripts/unique-check.mjs` clean if the map hosts world uniques.
- [ ] `make assets` + family sheet looked at; music track registered.
- [ ] `docs/game-content.md` walkthrough entry; `docs/manuscript.md`
      transcribes all new lines (user-confirmed).
- [ ] Per-level content test written; `make test`, `make lint` green.
- [ ] Changelog fragment (`.changes/unreleased/`, type `Added`).
- [ ] Simulated (`simulate-run`) and playtested (`playtest`) at 844×390.

## Skill self-improvement

When a pass teaches a new wiring point (a checker table you had to extend, a
derived surface that shifted unexpectedly), record it as a lesson fragment
under `.lessons/` (see [`../LESSONS.md`](../LESSONS.md)) — never by appending
to this file. Read past ones with `node scripts/skill-lessons.mjs
level-design` before starting. During a consolidation pass, promote proven
wiring points into the tables above.
