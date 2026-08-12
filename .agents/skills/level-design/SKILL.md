---
name: level-design
description: "Use when adding a new level/mission to the game or substantially reworking one — the TWO files a venue is (the mission's YAML and the blueprint its map is carved from), their compile pipeline, the renderers for reading a carve, campaign registration and unlock order, the cumulative loot-pool rule, XP/intended-level pacing wiring, and the checker + test battery a new venue must pass before it ships."
---

# Designing a Level

A venue is **two files, and they answer different questions**:

- `content/levels/<id>.yaml` — the **MISSION**: who is here, why, what it pays.
  Its name, story, ladder rung, hazards, merchant, loot pools, thought pins. It
  has **no geometry at all** — a mission that authors a wall, a spawn, a prop, a
  zone or any coordinate fails the build, and the message names the field that
  replaces it.
- `content/maps/<id>.yaml` — the **BLUEPRINT** its map is carved from, fresh on
  every run's own seed. Areas, an object palette, the horde's density and
  breeds, the cast, its extents, the compass regions the boss may hide in.

So the geometry half of designing a level is a blueprint, and its own skill is
**`mapgen-improvement`** (the carve, the area rules, the render → crop → judge
loop). THIS skill is the rest: the mission file, and the cross-cutting wiring —
pacing caps, drop windows, checker tables, tests — that every other venue already
participates in. Load the `enemy-design` skill for the roster, `pixel-assets`
for tiles/sprites, `weapon-system` for loot, and `sound-effects` for the score.
To improve an EXISTING venue's feel (rather than add one), use the
**`map-improvement`** skill — it confirms the intended feel with the user first,
then iterates render → evaluate → improve.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs level-design --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## The YAML format + compile pipeline

- **Author** a mission as `content/levels/<id>.yaml` (the file stem MUST
  equal the level `id`). It carries every `MissionDef` field (documented at the
  type, `engine/game/defs/levels/types.ts` — `LevelDef` minus the geometry) plus
  three authoring keys:
  - `description:` free-text design intent (documentation + the map renderer).
  - `campaign: true` → joins the ordered campaign (`LEVEL_ORDER`), or
    `secret: true` → an off-campaign venue (`SECRET_LEVEL_ORDER`). Exactly one.
- **Compile:** `make levels` (or `npm run levels`; also runs inside
  `make assets`) parses the tree, VALIDATES it against the live engine catalogs
  (unknown enemy/weapon/gear/thought/story id, bad band, off-map zone, a locked
  door with no key all FAIL the build), and writes `engine/generated/levels.ts`
  (gitignored, regenerated on build — like the atlas). `index.ts` reads it.
- **Round-trip guard:** `tests/content/yaml_roundtrip_test.ts` pins the compiled
  catalog to `tests/content/fixtures/levels-snapshot.json`. When you INTENTIONALLY
  change a shipped level, regenerate the YAML then accept the new baseline:
  `npm run levels && node scripts/update-level-snapshot.mjs` (review the snapshot
  diff — it's the record of what changed).
- The loader/schema/generator live at `scripts/level-data/load-yaml.mjs`,
  `scripts/asset-tools/level-schema.mjs`, `scripts/generate-levels.mjs`.

## Read the map before you tune it — the renderers

**Start with the VISUAL OVERVIEW:** `node scripts/map-layout.mjs <id>`
(also `make map-layout LEVEL=<id>`) renders a clean, high-res top-down picture to
`pwa/assets-preview/map_<id>_layout.png` — a labelled coordinate grid for
orientation, every wall + gap, the numbered path, the zones, and every placed
thing as a distinct SHAPE. Spawn points are CON CIRCLES (area = mob count, colour
= con vs the map's `intendedLevel` on the chosen difficulty). It shows only what
benefits from being SEEN; read it ALONGSIDE the YAML (which holds the numbers).
It's the fastest way to understand a map's structure and difficulty ramp.

**Then the ANALYSIS view:** `node scripts/map-preview.mjs <id>` renders an
annotated top-down diagram to `pwa/assets-preview/map_<id>.png` (also `make
map LEVEL=<id>`). LOOK at it — it's the fastest way to judge how a level plays:

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

## The feel levers belong to the CARVE now

The breather pockets, the pressure envelope, the caches and the trader's pitch
are all decided per run by the generator, from the blueprint's own vocabulary —
so they are read, not authored:

- **A SAFE pocket** is the trader's stall (the horde is repelled out of it), and
  the **LANDING is QUIET rather than safe** — no ambient horde placed in it, but
  no wall either, so a hero who stands still is still found. Both are the carve's.
- **A CACHE** is a `chest` object dropped at a dead end with one of the
  blueprint's `guardians` on it — the reward that makes a detour worth walking.
- **PRESSURE** is a density: each cell takes as many knots as its floor is worth
  (`KNOT_DENSITY`), cut into bands so a hall gets a fight at either end. There is
  no authored tempo curve.
- **Breakable props** are still authored, but on the blueprint's object: a
  `crate`-type object with `loot.chance` (0..1) and `loot.drop` weights
  (health/stamina/gear), so a vending machine leans stamina drinks and a wine
  rack healing. Without `loot` a breakable is a supply crate (guaranteed spill,
  config `CRATES`).

## The mission, in authoring order

1. **Identity & world**: `id`, `index`, `name`, `campaign`/`secret`, `gravity`
   (the feel lever), `biome`, `tiles` (the venue's own ground — a DISTRICT's
   floor is the blueprint's), `heroSuited`, `music`.
2. **Rules of the place**: `objective` (its TYPE — where the exit stands is the
   carve's), `gates`, `exitTo`, the hazards (`asteroids`, `sandstorms`,
   `hayBalls`, `stampedes`), `canopy`, `decorClearance`.
3. **Story beats**: `intro`/`outro`/`prelude` (all three OPTIONAL — a venue the
   hero does not ARRIVE at, like the hub, ships no `intro` and lands straight on
   the level-name card; `intro: []` is a compile error, omit the key),
   `firstKillThoughts`/
   `firstSightThoughts`, the per-level `merchant` persona, `openingStrike` (the
   beat, not its spot), `placedItems` and `wells` (WHAT the venue leaves lying
   around and how hard its holes pull — the carve decides where).
4. **Loot**: `weaponPool`/`gearPool`/`abilityPool`, `earlyDrops`,
   `allClearWeapon`, `worldUniques`, `intendedLevelByDifficulty`. **The
   cumulative-pool rule (the bunker idiom): later maps re-list every earlier
   stage's bases.** Forge any new base via `weapon-system`.
5. **The map**, in `content/maps/<id>.yaml`: areas, objects, `horde`, `elites`,
   `guardians`, `bystanders`, `boss`, `sizes`, `layout` — see
   `mapgen-improvement` and `mod/FORMAT.md`.

## Mob levels come from the LADDER (`content/ladder.yaml`)

Below JESUS, a mob's level is **authored, not floated off the player's level** —
and the per-difficulty × per-map defaults live in ONE place: `ladder.yaml`. Each
`[difficulty][map]` cell holds `hero` (the intended hero level on that map — the
con anchor) and `mob: [start, end]` (the map's mob band — `start` = the first
mobs met, `end` = the level near the boss). `loadLevels()` stamps these onto
every def as `mobLevels` (the four [easy, medium, hard, nightmare] bands) and
`intendedLevel` (the four hero anchors), so the numbers are never copied into a
level file. JESUS is omitted (player-relative). Tune a map's whole difficulty by
editing its ladder cells; the con viz + engine both follow.

The per-difficulty RAMPS also live in `ladder.yaml` (its `ramps:` catalog), named
once and shared by every map. A ramp is RELATIVE to the map+difficulty's own band
(`fromStart: n` or `fromEnd: n`), so one definition yields the right absolute
level on every difficulty and map. Names are NEUTRAL and ORDERED — they describe
a mob's menace within the ramp, never the difficulty tier (a `meek` wave on
NIGHTMARE is still level 42+):

- **Wave tiers** `meek`→`bold`→`fierce`→`savage`→`brutal`→`merciless`→`monstrous`
  climb off the band **start** (`fromStart: 0..6`). **Boss-room ranks** `endgame`
  (band end) and `apex` (end + 2) sit off the band **end**.
- **The blueprint's horde names its ramps** (`horde.ramps`, shallow → deep): the
  carve hands them out along its own DEPTH axis, so a knot near the landing runs
  the first rung and one out by the boss the last. A mission MUST NOT declare a
  top-level `mobLevels`/`intendedLevel` (the loader errors); those belong to the
  ladder.
- **A blueprint's set pieces (`elites`, `guardians`, `boss`) name a `ramp:` + a
  single base `hp`** (the easy value). The map loader expands the ramp into the
  pinned `level` (single per difficulty → the `mlvl`, loot tier + con) and scales
  the base hp across the four rungs by the map's `hpCurves` entry (`pinnedHp`
  picks `standard`/`gentle`). Do NOT hard-code a per-difficulty `level`/`hp`
  tuple.

### RAMP THE CON UP along the path (green → yellow → red)

A good map gets **tougher as it progresses**: the `map-layout` con circles should
read GREEN near START, YELLOW mid, and ORANGE/RED at the boss. Mobs should track
the hero's own level as he climbs (killing the swarm levels him) and PULL A TOUCH
AHEAD toward the end, so the finale cons hot. Author it by RAMPING each spawn
point's `ramp:` (and the pinned elites/boss) UP the tier order in path order — a
`meek` opener cons even, an `endgame`/`apex` boss bay cons red.

Judge it deterministically, no sim: the `map-layout` decode key prints **HERO IF
CLEARED — the projected hero level at 25/50/75/100 % cleared** (XP is
deterministic: kills × `mobLevelXp`). Compare that rise to the con circles: mobs
should keep pace (con even) then pull ahead (con up). If the hero out-levels the
mobs, the tail greys out — raise the late bands; if mobs sprint away, the tail
goes solid red — ease them.

### The intended HERO ladder — mob levels TRACK it

The numbers below are **hero character levels** (start → finish per difficulty),
NOT abstract mob tiers. The campaign is meant to level the hero along this ladder:

The ladder itself is `content/ladder.yaml` (its header states the shape); the
finish targets the checker drives to are `TARGETS` in
`scripts/leveling-curve.mjs`.

| Rung | Hero start → finish | Notes |
| --- | --- | --- |
| Easy | **1 → ~30** | clear any of easy/medium/hard to unlock nightmare |
| Medium | **1 → ~33** | |
| Hard | **1 → ~37** | |
| Nightmare | **42 → ~55** | entered after a grind; mobs open at 42, not 1 |
| Jesus | ~58 → ~69 | player-relative; DELIBERATELY absent from `ladder.yaml` |

**Mob levels track the hero.** Slice each rung's start→finish across the
campaign maps and author every map's `mob:` band in `content/ladder.yaml` to
the hero's intended level ON that map (goodco_hq is easy `[1, 7]` / nightmare
`[42, 45]`; boot_hill easy `[26, 32]` / nightmare `[51, 55]`). A level YAML may
NOT carry its own `mobLevels`/`intendedLevel` — the loader errors.

Mobs near the hero's level make the WoW-style con system
(`levelDiffXpMult`, config `LEVELING.xpAbove/BelowPlayerPerLevel`) self-regulate:
fighting up pays a bonus, fighting down decays to a grey-mob pittance, so the
hero's level converges to the map's mob band and replaying an outgrown map barely
levels him (anti-farm). Ramp the per-spawner `ramp:` tier up within a map (a
`meek` opener → a hotter boss bay); the map's `mob: [start, end]` band sets the
default a rampless spawn rolls. **Nightmare
mobs on the first map are 42, not ~12** — nightmare is a separate high band, not
a multiplier on the early game.

### Re-tune XP after EVERY map redesign (required)

Changing a map's roster (counts, spawner mix, mob bands) changes how much XP a
clear pays, so the hero drifts off the ladder. After any redesign, RE-TUNE so a
full clear lands the finish levels, using the programmatic full-clear check:

```sh
node scripts/leveling-curve.mjs --targets   # full clears per difficulty vs the ladder
```

It prints each rung's per-map landing and the finish vs target (OK / LOW / HIGH).
Drive every rung to **OK** against the script's own `TARGETS` (easy 31 /
medium 33 / hard 37 / nightmare 55 / jesus 69) by turning these levers,
cheapest first:

- **Mob bands** (the ladder's `mob: [start, end]` cell) — the primary lever. Nudge
  a map's band up/down so the hero converges onto the intended level there (the
  con system does the rest); the named ramps shift with it automatically.
- **Per-map XP caps** (`XP_CAP.capByDifficulty` in `engine/game/config/leveling.ts`) — the `first`→`last`
  band interpolated across the campaign; set each rung a touch ABOVE its finish so
  the soft-cap fade doesn't clamp the hero UNDER target.
- **Mob totals** — aim ~800–1200 killable mobs per map (a full-clear battle); the
  cap, not the head-count, bounds leveling, so more mobs ≠ more levels past the cap.
  A spawner's big `count` is its whole QUEUE, not what stands at once: each point
  holds only `maxAlive` (default `SPAWNERS.maxAlive`, ~15) live members IN ITS ZONE
  (`triggerRadius`) and drips a replacement per kill while the hero is in range, so
  a 100-count point reads as steady local pressure rather than a dumped pile. A
  member that drifts out of the zone (chases the hero off) counts as gone and is
  replaced, keeping the fight populated where the hero stands.
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
(`create.ts`, `step/spawner.ts`, the wave/pack spawners in `step/`); the schema
that refuses a level authoring its own bands is `level-schema.mjs`.

## The cross-cutting wiring — where new maps actually break

- **Pacing caps come from the calculator, not intuition.** Run
  `node scripts/leveling-curve.mjs --by-level` and read the hero's level at the
  start/end of the new map's clears: that sizes `loot.intendedLevelByDifficulty` and
  any `worldUniques` `minPlayerLevel` gate. Adding a campaign level also shifts
  the `XP_CAP.capByDifficulty` interpolation (`engine/game/config/leveling.ts`) — verify first visits
  still forfeit ~no XP (`xpLost` in the `simulate-run` summary).
- **The weapon checker has per-map tables.** `scripts/weapon-stats.mjs` needs a
  `LEVEL_MLVL_BANDS` entry and `--coverage` needs its `CAMPAIGN_LANDINGS` column.
  Coverage must hold ≥4 weapons / ≥3 gear in-window.
- **Dev-warp loadouts are derived** (`deriveArrivalLoadout`) — the derived floors
  in other maps' content tests can shift when the order changes.

## Two import rules that bite

**THE RUN READS ITS OWN MAP — `runLevelDef(state)`, never `levelDef(state.level.id)`.**
`createGame` resolves the level once, but a run keeps ASKING the level questions
for as long as it lasts: which zones suppress spawns, whose lair this door is,
where the exit stands, what is scattered here. Every one of those used to go back
to the CATALOG, which now holds a MISSION with no geometry on it at all — so
those reads have nowhere to land, and the type system says so (`levelDef()`
answers a `MissionDef`, whose geometry is optional). The carve travels on the
state (`GameState.carvedLevel`) and `runLevelDef` is the ONE accessor; the rule
is flat — inside a run, nothing reads the catalog for its own level.

**Nothing outside a run may import `mapgen/`.** The menus reach levels through
`defs/levels/summary.ts`; pulling the generator onto the startup path would put
the whole level catalog and the carve in the app's critical-path budget.

LOOK at a map rather than reading its JSON: `node scripts/level-render.mjs <id>
--seed 3 --dormant` draws one run's carve with the real sprites and
the real horde standing in it, and `scripts/map-layout.mjs <id> --seed 3` gives
the schematic with con colours. Both render a CARVE, because there is nothing
else to render — change the seed to see another run's map.


## Workflow

1. **Place it in the campaign**: pick `index`, write the MISSION yaml, set
   `campaign`/`secret`. `make levels` validates every referenced id; `catalog_test.ts`
   asserts they resolve.
2. **Roster** — the `enemy-design` skill.
3. **Write the BLUEPRINT** (`content/maps/<id>.yaml`): the areas the venue is
   made of, the object palette, the horde's density and breeds, the cast, its
   `size`. Keep the mobile viewport in mind (≈422×260 world units visible).
   **Render a carve and LOOK at it** — see `mapgen-improvement`.
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

- [ ] Both YAMLs compile clean (`make levels`); `catalog_test.ts` green.
- [ ] The venue ships a blueprint — a mission with none cannot be played
      (`generated_maps_test.ts` asserts one per mission).
- [ ] `yaml_roundtrip_test.ts` green (or snapshot intentionally updated).
- [ ] `node scripts/leveling-curve.mjs --by-level` re-read →
      `intendedLevelByDifficulty` + `XP_CAP` bands land where runs end.
- [ ] `scripts/weapon-stats.mjs --coverage` clean, `LEVEL_MLVL_BANDS` +
      `CAMPAIGN_LANDINGS` entries added.
- [ ] `node scripts/unique-check.mjs` clean if the map hands world uniques.
- [ ] `make assets` + family sheet looked at; music track registered.
- [ ] A carve rendered at several seeds and read (`--seed`), plus `--heatmap`
      for coverage.
- [ ] `docs/manuscript.md` transcribes new lines (user-confirmed). The venue
      itself needs no doc entry — the YAML and the generated library ARE the
      record; touch `docs/game-content.md` only if the venue introduces a RULE
      (a new objective kind, a new carry-over, a new economy) it doesn't state.
- [ ] Per-level content test written; `make test`, `make lint` green.
- [ ] Changelog fragment (`.changes/unreleased/`, type `Added`).
- [ ] Simulated (`simulate-run`) and playtested (`playtest`) at 844×390.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the tables above.

```sh
node scripts/skill-lessons.mjs level-design --list
```

A new wiring point a pass had to discover is the thing most worth recording
here.
