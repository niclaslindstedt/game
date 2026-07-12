---
name: enemy-design
description: "Use when adding a new enemy (minion/elite/boss) or reworking one — the EnemyDef anatomy, how to pick hp/damage numbers against the scaling model, mechanics/phases, dialogue and lastWords (manuscript-governed), spareable companions, loot signatures, the auto-derived wound sprites, and the content tests that bite when any piece is missing."
---

# Designing an Enemy

An enemy is one `EnemyDef` plus two sprite frames — everything else (wound
stages, achievements, scaling, XP) derives from the def. The craft is in
picking numbers that sit right on the scaling model, and in wiring the story
surfaces the roles demand: elites and bosses speak, and what they say is
manuscript canon. Load `pixel-assets` for the sprites, `level-design` for
the map wiring, `weapon-system` for named drops.

**Before starting, read past lessons:** `node scripts/skill-lessons.mjs enemy-design`.

## Where everything lives

| Piece | File |
| --- | --- |
| The def | `src/game/defs/enemies/<roster>.ts` (one roster module per biome; `mars.ts` is the reference) — merged in `enemies/index.ts` `mergeRosters` (duplicate ids throw) |
| Field reference | `src/game/defs/enemies/types.ts` — every field documented at the type |
| Sprites | `website/scripts/sprite-data/<family>.mjs` — frames named exactly `<sprite>_0`/`<sprite>_1`; **minions 16×16, elites 24×24, bosses 48×48** |
| Wound stages | **Auto-derived** by `sprite-data/index.mjs` from `role` (minion `hurt`; elite +`wrecked`; boss +`dying`) and `gore` (`blood`/`ecto`/`sparks`); a family `wounds` override only when the default splat can't contrast the body |
| Mechanics engine | `src/game/mechanics.ts` — `charge`, `slam`, `enrage`, `summon`; `phases` (hp-gated mechanic swaps) |
| Companions (spareable elites) | `src/game/defs/companions.ts` (`COMPANION_DEFS`); resolution in `src/game/companions.ts` |
| Inner monologues | `src/game/defs/thoughts.ts` + a `firstKillThoughts`/`firstSightThoughts` pin on the level |
| Scaling | `src/game/create.ts` (`spawnEnemy` stamps hp/mlvl/contact), `src/game/menace.ts` (`mobLevelFor`, `maybePowerScale` re-stamp on elite/boss engagement) |
| Content tests | `tests/content/`: `wounds_test.ts`, `last_words_test.ts`, `last_stand_test.ts`, `aggro_test.ts`, `catalog_test.ts`, `companions_test.ts`, the per-level suites |

## The def, by concern

Read `enemies/types.ts` for the full contract. The groups:

- **Identity**: `id`, `name` (HUD/boss bar), `role` (minion/elite/boss),
  `sprite`, `gore` (`blood` default, `ecto`, `sparks` for machines — drives
  hit splashes AND wound-frame style).
- **Combat stats**: `hp`, `speed` (world px/s; minions usually below the
  hero's walk so kiting works), `radius` (collision — a deliberate,
  separate decision from sprite size), `contactDamage`, `critChance`,
  `contactCooldownMs`, `dodgeChance`.
- **Level presence**: `levelBonus` — levels above the horde baseline
  (elites ~3, bosses ~5); it reaches `LOOT.tierUnlockMlvl` gates early, so
  it's a loot lever too.
- **Behavior**: `ai` (`aggroRadius`, `leashRadius`, `rushSpeed` — the
  elite's pre-dialogue closing speed), `phasing` (through walls),
  `ranged` (projectile block; `takesCover`), `shieldedBy` (invulnerable
  while guardian ids live), `flees` (escapes at 0 hp toward a landmark —
  the recurring-villain pattern), `apparition` (dialogue-only, unhittable).
- **Mechanics** (elites/bosses): `mechanics` + `phases` (descending
  `belowHpFrac`, each REPLACES the base mechanics — enrage stacking is
  what `last_stand_test.ts` audits).
- **XP**: default is hp-proportional for minions, a level-bar share for
  elites/bosses (`LEVELING.eliteXpBarShare`/`bossXpBarShare`); `xp` /
  `xpBarShare` override only for deliberate exceptions.
- **Loot**: minions get `dropProfile` (sweetens the level-table roll);
  elites/bosses get `loot` (signature `items`, `storyItems`, per-tier
  `tierDrops` pledges) and bosses `uniquesByDifficulty` (see the
  `weapon-system` skill's unique section).
- **Story**: `dialogue` (arrival scene pages; `{ hero: [...] }` for
  replies), `lastWords` (one short dying page — elites/bosses should have
  them; `last_words_test.ts` audits), `spareable: { companion }` for the
  kneel-and-join flow.

## Picking the numbers — the scaling model in one paragraph

Author `hp`/`contactDamage` as the **level-1-hero, offset-0 baseline**;
scaling does the rest. At spawn, hp is multiplied by
`mobHpScaleFor(playerLevel, difficulty)` and contact damage by a gentle
`mobContactScaleFor(mlvl)` ramp, where
`mlvl = player level + difficulty's mobLevelOffset + levelBonus`.
Elites/bosses additionally re-stamp on first engagement (`maybePowerScale`)
against the hero's POWER level, so a hot-geared hero meets a harder elite.
The anchor to state numbers against is **`LEVELING.refMobHp` (the "typical
wave minion" hp)** — keep common minions near it or the kills-per-level
model drifts (see the `leveling-balance` skill). Sanity-check the result
empirically: `node scripts/simulate-run.mjs --full` prints, per mob type,
average hp, monster level, contact damage, the hero's average blow, and
blows-to-kill.

## Workflow

1. **Write the def** in the roster module (new roster file → import +
   `mergeRosters` entry in `enemies/index.ts`). Reference it from the
   level's `spawns`/`waves` (`level-design` skill) —
   `catalog_test.ts` fails on any dangling id.
2. **Draw the two frames** (`pixel-assets` skill) at the role's canvas
   size, named `<sprite>_0`/`_1`; `make assets`. Wound frames derive
   automatically; `tests/content/wounds_test.ts` fails until the frames
   land in the atlas. Heed the wound-visibility lint — a dark body may
   need a family `wounds` override.
3. **Story surfaces** (elites/bosses): `dialogue` + `lastWords`, a
   `firstKillThoughts` pin if the kill deserves a monologue, a
   `COMPANION_DEFS` entry if spareable. **Every line is transcribed in
   `docs/manuscript.md` in the same change** — manuscript edits need user
   confirmation (CLAUDE.md "Story & dialogue").
4. **No sound work** — audio keys off generic engine events
   (`enemyKilled`, telegraphs); `gore` only affects visuals. Only a new
   *mechanic* that deserves its own audio moment adds an event (see
   `engine-system` + `sound-effects`).
5. **Tests**: the per-level content suite asserts roster composition;
   engine *rules* (a new mechanic, a new behavior flag) get
   `tests/engine/` suites on synthetic fixtures — never on the shipped id.
6. **Verify**: stage it with the `test-scenario` skill — a frozen pose
   ring showing fresh/hurt/wrecked (`hpFrac` 1/0.4/0.2) over its level
   ground, next to the hero for hierarchy; then `simulate-run` for the
   numbers and `playtest` for feel at 844×390.

## After you're done — the checklist

- [ ] Def registered; `catalog_test.ts` + the level suite green.
- [ ] Frames + auto-wounds in the atlas (`make assets`,
      `wounds_test.ts` green); family sheet looked at (silhouette,
      ground contrast, size hierarchy vs role).
- [ ] Elites/bosses: `dialogue` + `lastWords` written AND transcribed in
      `docs/manuscript.md` (user-confirmed); `last_words_test.ts` green.
- [ ] Numbers sanity: minion hp near `LEVELING.refMobHp`;
      `simulate-run --full` blows-to-kill neither ~1 nor walled.
- [ ] Boss drops wired (`uniquesByDifficulty` → `unique-check.mjs` clean).
- [ ] `make test`, `make lint`; changelog fragment; `docs/game-content.md`
      roster entry.

## Skill self-improvement

Record new patterns (a mechanic combination, a scaling gotcha, a wound
override case) as lesson fragments under `.lessons/` (see
[`../LESSONS.md`](../LESSONS.md)) — never by appending to this file. Read
past ones with `node scripts/skill-lessons.mjs enemy-design` before
starting; promote proven ones into the tables above during a consolidation
pass.
