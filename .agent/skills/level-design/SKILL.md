---
name: level-design
description: "Use when adding a new level/mission to the game or substantially reworking one — the YAML level format and its compile pipeline, the annotated map renderer for reading a map's design, the design-zone systems (safe/quiet zones, tempo, chests, merchant spawns), campaign registration and unlock order, spawn/wave/pack budgets, the cumulative loot-pool rule, XP/arrow-cap pacing wiring, and the checker + test battery a new map must pass before it ships."
---

# Designing a Level

A level is **data**: one YAML file under `website/scripts/levels/<id>.yaml`,
compiled into the engine's `LevelDef` catalog (the map/atlas equivalent for
levels — like the sprite YAML tree compiles to the atlas). The def itself is
easy; what makes a level *correct* is the cross-cutting wiring — pacing caps,
drop windows, checker tables, tests — that every other map already participates
in. This skill is the map of that wiring. Load the `enemy-design` skill for the
roster, `pixel-assets` for tiles/sprites, `weapon-system` for loot, and
`sound-effects` for the score. To improve an EXISTING map's feel (rather than
add one), use the **`map-improvement`** skill — it confirms the intended feel
with the user first, then iterates render → evaluate → improve.

**Before starting, read past lessons:** `node scripts/skill-lessons.mjs level-design`.

## The YAML format + compile pipeline

- **Author** a level as `website/scripts/levels/<id>.yaml` (the file stem MUST
  equal the level `id`). It carries every `LevelDef` field (documented at the
  type, `src/game/defs/levels/types.ts`) plus three authoring keys:
  - `description:` free-text design intent (documentation + the map renderer).
  - `campaign: true` → joins the ordered campaign (`LEVEL_ORDER`), or
    `secret: true` → an off-campaign venue (`SECRET_LEVEL_ORDER`). Exactly one.
- **Compile:** `make levels` (or `npm run levels`; also runs inside
  `make assets`) parses the tree, VALIDATES it against the live engine catalogs
  (unknown enemy/weapon/gear/thought/story id, bad band, off-map zone, a locked
  door with no key all FAIL the build), and writes `src/generated/levels.ts`
  (gitignored, regenerated on build — like the atlas). `index.ts` reads it.
- **Round-trip guard:** `tests/content/yaml_roundtrip_test.ts` pins the compiled
  catalog to `tests/content/fixtures/levels-snapshot.json`. When you INTENTIONALLY
  change a shipped level, regenerate the YAML then accept the new baseline:
  `npm run levels && node scripts/update-level-snapshot.mjs` (review the snapshot
  diff — it's the record of what changed).
- The loader/schema/generator live at `website/scripts/level-data/load-yaml.mjs`,
  `website/scripts/asset-tools/level-schema.mjs`, `website/scripts/generate-levels.mjs`.

## Read the map before you tune it — the renderer

`node website/scripts/map-preview.mjs <id>` renders an annotated top-down
diagram to `website/assets-preview/map_<id>.png` (also `make map LEVEL=<id>`).
LOOK at it — it's the fastest way to judge a level's design:

- **design view** (default, from YAML): the hero path (START → elites →
  objective), boss/elite markers, mob packs with trigger rings, safe/quiet
  zones, chests, merchant spawns, SOLID walls + door gaps (the deterministic
  path-formers), the tempo strip, and a legend with the rare/unique roster.
- `--actual --seed N`: the REAL scattered layout from `createGame` — obstacles
  at true blocking size (solid barriers filled, jumpable cover outlined), so the
  navigable corridors the scatter + walls leave are legible. Use this to check
  whether the map funnels the hero where you intend.
- `--heatmap [--seed N --difficulty easy]`: runs the sim and overlays the hero's
  **dwell** (where the map was used), **mob density** (where the horde formed
  and moved), **spawns**, and **kills**, plus a `COVERAGE: N% of map` readout —
  the direct read for "is the whole map used, or is there dead space?".

## The design-zone systems (the feel levers)

Optional `LevelDef` fields (all neutral when omitted; see `src/game/zones.ts`):

- **`safeZones`** (rect/circle): no procedural spawns inside AND the minion horde
  is repelled out — a genuine breather pocket (rest spot, merchant nook, the calm
  before the boss). Author clear of pinned set pieces (they aren't repelled).
- **`quietZones`** (dead areas): no ambient wave/pack spawns, but authored content
  still lives there (a `chest`, a pinned rare/unique). The reward for exploring
  off the main line, without going soft.
- **`tempo`**: keyframes `{ at (0..1 of the wave ramp), intensity }` that scale
  the wave pressure envelope over the run — build and release pressure instead of
  a flat ramp (1 = baseline; config `TEMPO` clamps it).
- **`chests`**: placed breakable containers that spill a richer, guaranteed haul
  than a scattered crate (config `CHESTS`) — the payoff that makes a dead zone
  worth the detour.
- **`merchantSpawns`**: authored points the wandering trader first appears at.

## The def, in authoring order

1. **Identity & world**: `id`, `index`, `name`, `campaign`/`secret`,
   `width`/`height`, `gravity` (the feel lever), `biome`, `tiles`
   (common/rare + optional `zones` for split terrain), `heroSuited`.
2. **Layout**: `playerSpawn`, `landmarks`, `obstacles`, `walls` (the path-formers
   — verify with the renderer), `doors` (locked by a story-item key), `wells`,
   `gates`, `decor`, plus the new `safeZones`/`quietZones`/`chests`/`merchantSpawns`.
3. **Population**: `spawns` (banded or pinned `at`; `minDifficulty` gates),
   `waves` (ramp/caps/budget windows), `packs` (dormant clusters woken by
   proximity — build a map to be CLEARED BY MOVING through its packs; on a
   `clearAll` level every pack must be reached and wiped), `objective`,
   `openingStrike`, `tempo`.
4. **Story beats**: `intro`/`outro`/`prelude`, `firstKillThoughts`/
   `firstSightThoughts`, the per-level `merchant` persona, `placedItems`.
5. **Loot**: `weaponPool`/`gearPool`/`abilityPool`, `earlyDrops`,
   `allClearWeapon`, `worldUniques`, `arrowCapByDifficulty`. **The
   cumulative-pool rule (the bunker idiom): later maps re-list every earlier
   stage's bases.** Forge any new base via `weapon-system`.

## Mob levels are HARD-CODED per difficulty (`mobLevels`)

Below JESUS, a mob's level is **authored in the level spec, not floated off the
player's level.** Every level MUST declare a `mobLevels` tuple — the checker
rejects one that doesn't — and JESUS alone keeps the old player-relative
scaling (a JESUS hero has out-levelled every hand-authored number).

- **Shape:** `mobLevels: [easy, medium, hard, nightmare]` — four entries, one per
  non-JESUS rung in ladder order. Each entry is an exact level (`5`) or a rolled
  `[min, max]` range (`[3, 4]`), rolled per spawn. The resolved level drives BOTH
  the mob's HP (via `mobHpLevelFactor`) and its loot (tier gates, dropped ilvl),
  so a spawn is internally consistent.
- **Level default + per-spawner override:** the level's top-level `mobLevels` is
  the default every regular spawn reads (the opening scatter, `waves`, `packs`,
  and any spawn point without its own). A `spawners:` point may set its own
  `mobLevels` to RAMP within the map — a light opener, a hotter boss bay.
- **Pinned elites/bosses (`spawns` with `at`) hard-code BOTH `level` and `hp`**,
  each a per-difficulty tuple (JESUS relative). `level` sets the set piece's
  `mlvl`; `hp` is its BASE healthbar, which the live power-match still multiplies
  on top. Both are required on every pinned set piece.

### The intended HERO ladder — mob levels TRACK it

The numbers below are **hero character levels** (start → finish per difficulty),
NOT abstract mob tiers. The campaign is meant to level the hero along this ladder:

| Rung | Hero start → finish | Notes |
| --- | --- | --- |
| Easy | **1 → 32** | clear any of easy/medium/hard to unlock nightmare |
| Medium | **1 → 34** | |
| Hard | **1 → 36** | |
| Nightmare | **40 → 56** | entered after a grind (36→40); mobs open at ~40, not 1 |
| Jesus | 58 → 70 | player-relative; do NOT author mob levels for it |

**Mob levels track the hero.** Slice each rung's start→finish across the five
campaign maps and author every map's `mobLevels` to the hero's intended level
band ON that map (spacez ≈ easy 1–7 / nightmare 40–43; eastworld ≈ easy 26–32 /
nightmare 53–56). Mobs near the hero's level make the WoW-style con system
(`levelDiffXpMult`, config `LEVELING.xpAbove/BelowPlayerPerLevel`) self-regulate:
fighting up pays a bonus, fighting down decays to a grey-mob pittance, so the
hero's level converges to the map's mob band and replaying an outgrown map barely
levels him (anti-farm). Ramp the per-spawner `mobLevels` up within a map (light
opener → hotter boss bay); set the level default near the map's band. **Nightmare
mobs on level 1 are ~40, not ~12** — nightmare is a separate high band, not a
multiplier on the early game.

### Re-tune XP after EVERY map redesign (required)

Changing a map's roster (counts, spawner mix, mob bands) changes how much XP a
clear pays, so the hero drifts off the ladder. After any redesign, RE-TUNE so a
full clear lands the finish levels, using the programmatic full-clear check:

```sh
node scripts/leveling-curve.mjs --targets   # full clears per difficulty vs the ladder
```

It prints each rung's per-map landing and the finish vs target (OK / LOW / HIGH).
Drive every rung to **OK** (±1 of easy 32 / medium 34 / hard 36 / nightmare 56)
by turning these levers, cheapest first:

- **Mob bands** (`mobLevels`) — the primary lever. Nudge a map's band up/down so
  the hero converges onto the intended level there (the con system does the rest).
- **Per-map XP caps** (`XP_CAP.capByDifficulty` in config.ts) — the `first`→`last`
  band interpolated across the campaign; set each rung a touch ABOVE its finish so
  the soft-cap fade doesn't clamp the hero UNDER target.
- **Mob totals** — aim ~800–1200 killable mobs per map (a full-clear battle); the
  cap, not the head-count, bounds leveling, so more mobs ≠ more levels past the cap.
- **The con slopes / kills-per-level curve** (`LEVELING`) — global; touch last, it
  moves every rung and JESUS.

Then confirm with a real sim (`scripts/simulate-run.mjs --full`), not just the
calculator. Keep the calculator honest: `killOne` (analytic.ts) and the roster
walk both resolve mob level through the hard-coded bands — if you add a new spawn
SOURCE, teach both.

Verify a spawn dump too (`createGame(seed, id, "nightmare")` → read `enemy.mlvl`):
nightmare lands in-band, `"jesus"` still reads player-relative.

The engine plumbing lives in `menace.ts` (`resolveMobScaling`, `rollMobLevel`,
`hardMobHpScale`, `mobLevelMidpoint`), stamped at every spawn site
(`create.ts`, `spawners.ts`, the wave/pack spawners in `step.ts`); the schema
enforcing the tuples is `level-schema.mjs`.

## The cross-cutting wiring — where new maps actually break

- **Pacing caps come from the calculator, not intuition.** Run
  `node scripts/leveling-curve.mjs --by-level` and read the hero's level at the
  start/end of the new map's clears: that sizes `loot.arrowCapByDifficulty` and
  any `worldUniques` `minPlayerLevel` gate. Adding a campaign level also shifts
  the `XP_CAP.capByDifficulty` interpolation (`config.ts`) — verify first visits
  still forfeit ~no XP (`xpLost` in the `simulate-run` summary).
- **The weapon checker has per-map tables.** `scripts/weapon-stats.mjs` needs a
  `LEVEL_MLVL_BANDS` entry and `--coverage` needs its `CAMPAIGN_LANDINGS` column.
  Coverage must hold ≥4 weapons / ≥3 gear in-window.
- **Dev-warp loadouts are derived** (`deriveArrivalLoadout`) — the derived floors
  in other maps' content tests can shift when the order changes.

## Workflow

1. **Place it in the campaign**: pick `index`, write the YAML, set
   `campaign`/`secret`. `make levels` validates every referenced id; `catalog_test.ts`
   asserts they resolve.
2. **Roster** — the `enemy-design` skill.
3. **Author layout + population**, keeping the mobile viewport in mind
   (≈422×195 world units visible). **Render the design view and LOOK at it.**
4. **Loot pools** — cumulative, plus the map's own new bases; `earlyDrops`.
5. **Pacing wiring** — the caps/checker tables above.
6. **Presentation** — sprite family + tiles (`pixel-assets`), the score
   (`sound-effects`), `foes` label.
7. **Story** — intro/thoughts/merchant/lore. Every spoken/found line is
   transcribed in `docs/manuscript.md` in the same change (user-confirmed —
   CLAUDE.md "Story & dialogue").
8. **Tests** — write `tests/content/<id>_test.ts` (model on `mars_test.ts`), then
   `make test`.
9. **Measure and feel** — `node scripts/simulate-run.mjs --difficulty easy --level
   <id> --full`, render `--heatmap` and read the coverage/density, then the
   `playtest` skill at the phone viewport.

## After you're done — the checklist

- [ ] YAML compiles clean (`make levels`); `catalog_test.ts` green.
- [ ] `yaml_roundtrip_test.ts` green (or snapshot intentionally updated).
- [ ] `node scripts/leveling-curve.mjs --by-level` re-read →
      `arrowCapByDifficulty` + `XP_CAP` bands land where runs end.
- [ ] `scripts/weapon-stats.mjs --coverage` clean, `LEVEL_MLVL_BANDS` +
      `CAMPAIGN_LANDINGS` entries added.
- [ ] `node scripts/unique-check.mjs` clean if the map hosts world uniques.
- [ ] `make assets` + family sheet looked at; music track registered.
- [ ] Design map + `--heatmap` rendered and read (path, zones, tempo, coverage).
- [ ] `docs/game-content.md` walkthrough entry; `docs/manuscript.md` transcribes
      new lines (user-confirmed).
- [ ] Per-level content test written; `make test`, `make lint` green.
- [ ] Changelog fragment (`.changes/unreleased/`, type `Added`).
- [ ] Simulated (`simulate-run`) and playtested (`playtest`) at 844×390.

## Skill self-improvement

When a pass teaches a new wiring point, record it as a lesson fragment under
`.lessons/` (see [`../LESSONS.md`](../LESSONS.md)) — never by appending to this
file. Read past ones with `node scripts/skill-lessons.mjs level-design` before
starting. A consolidation pass promotes proven wiring points into the tables above.
