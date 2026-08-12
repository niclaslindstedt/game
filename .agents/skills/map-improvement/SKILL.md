---
name: map-improvement
description: "Use when improving the DESIGN and FEEL of an existing venue (not adding a new one) — the iterative render → evaluate → improve loop. It first CONFIRMS the venue's intended feel with the user (the YAML descriptions may be wrong!), rewrites the description to match, then reads a rendered CARVE + played heatmap, judges it against that intent, edits the venue's blueprint and mission, re-renders, and loops — presenting before/after maps for sign-off before shipping."
---

# Improving a Map's Design

The sibling of `art-improvement` (which hunts the worst art) — this one improves
how a venue *plays and feels*. A venue is two data files: the MISSION
(`content/levels/<id>.yaml` — story, ladder rung, hazards, loot) and the
BLUEPRINT its map is generated from per run (`content/maps/<id>.yaml`), both
compiled by `make levels`. **On a STATIC PARTS venue there IS a hand-drawn
layout to edit** — the blueprint's `parts:` deck: each room's size, sockets,
furniture and one-mob spawn markers are authored, and a feel fix is usually an
edit to a PART (move the posts, resize the room, add a prop) or to the deal
(`min`/`max`/`weight`/`count`) rather than to a density. On a legacy-carve
venue nothing is hand-drawn, so a geometry fix lands in the blueprint's areas,
object palette and horde. Either way a render shows ONE run's deal/carve, so
judge across seeds rather than off a single picture. Two renderers make it
legible:

- **`map-layout.mjs` — the VISUAL OVERVIEW.** A clean, high-res, top-down
  picture of one carve: a labelled coordinate grid for orientation
  (world x/y), every wall + gap, the zones, and every placed thing as a
  DISTINCT SHAPE (star=boss,
  diamond=elite, triangle=rare/unique, circle=spawn knot, cluster=pack,
  square=chest, …). Spawn points are **CON CIRCLES** — area ∝ mob count, colour
  = con (mob level vs the map's `intendedLevel` on the chosen difficulty:
  grey→green→yellow→orange→red), so an over/under-tuned difficulty ramp reads at
  a glance. It shows only what benefits from being SEEN; the numbers stay in the
  YAML. **Do BOTH before touching anything, every session:** read the level's
  two YAMLs AND `make map-layout LEVEL=<id>` (add `ARGS="--seed N"` for other
  carves, `--width` for a bigger map area) and study the images — the pictures give you the
  spatial/difficulty read, the YAMLs give you the exact values.
- **`map-preview.mjs` — the ANALYSIS view.** The design view (trigger rings,
  authored mob-density smear, derived path, tempo strip) plus `--actual` (the
  real scattered layout) and `--heatmap` (how the map actually PLAYS — dwell,
  mob density, spawns, kills, coverage %). This is how you judge the change.

This skill drives the loop that turns that visibility into better maps. Load the
`level-design` skill for the format, fields, and the cross-cutting wiring; this
skill is the *iteration method*.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs map-improvement --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## The whole design surface is on the table

Improving a map is **not** limited to nudging YAML knobs. When the map's problem
demands it, a real fix — up to a **complete redesign** — is expected, and every
lever below is fair game. Reach for the sibling skill when you cross into its
domain:

- **Geometry** — the blueprint's AREAS and `layout`: what kinds of place the
  venue is made of, how big a chamber is, how wide a doorway, how many loops,
  how coherent a district, which enclosure seals what. Reshaping the *space* is
  the highest-leverage fix for a traversal/pacing problem, and here it is done by
  changing the RULES the carve follows — see `mapgen-improvement` when the fix
  needs the generator itself to learn something new.
- **Enemies** (`enemy-design`) — add or rework minions/elites/bosses: their **hp,
  contact damage, level ranges, mechanics/phases, and capabilities**. A map that
  is unbeatable or trivial is often an ENEMY problem, not a count problem.
- **New sprites** (`pixel-assets`) — a new enemy, tile, obstacle, or biome look
  the redesign needs.
- **Weapons & loot** (`weapon-system`) — the drop pool, tiers, and any new
  weapon/unique the map should hand out.
- **Leveling & difficulty** (`leveling-balance`) — the XP curve, kills-per-level
  pacing, the per-map bands in `content/ladder.yaml` and the XP caps that keep
  the hero on the ladder.

Hold the result to **best-practice game design**: a legible read, a deliberate
tempo (build → release), fair-but-rising difficulty, teachable mechanics,
risk/reward that pays, and — the hard floor — **beatable and worth playing**
(prove it with `simulate-run` and `playtest`, not vibes). If the shipped design
is fundamentally at odds with that, propose the redesign to the user rather than
polishing a broken frame.

## Step 0 — LOOK, then CONFIRM THE INTENT (do this first, always)

**Read both YAMLs and render the overview before anything else:** open
`content/levels/<id>.yaml` (the mission) and `content/maps/<id>.yaml` (the
blueprint its map is carved from) for the exact values, AND `make map-layout
LEVEL=<id>` — plus a couple more seeds — and study the
images for the geometry, where every knot/encounter sits, and the con read (the
spawn circles' size + colour). Check the con across difficulties
(`--difficulty hard`, etc.). Judging a generator off ONE carve is how a session
tunes for a seed instead of for a map. If a venue has no `intendedLevel` in
`content/ladder.yaml`, add it (the con anchor) as part of the pass.

**Then confirm the intent — the `description` may not capture it.** Both files
carry one (the mission says what the venue IS, the blueprint says how its map
should READ); they describe the place, not always what it should *feel* like. Do not tune toward a description
you can't trust. Use `AskUserQuestion` to confirm the map's intended feel with the
user:

- **The fantasy / read** — what is this place, what should the player feel walking
  it (dread, a power fantasy, a frantic escape, a careful clear)?
- **Tempo** — a steady grind, or build-and-release (a mid climax, a breather, a
  final surge)? Where are the peaks and the lulls?
- **Difficulty arc** — a gentle onboarding, a wall at the boss, spikes at elites?
- **Space** — should the WHOLE map be traversed, or are there deliberate dead
  ends? Any safe pockets (rest / merchant), any dead zones (chests + a lone
  unique) worth a detour?
- **Movement** — cleared by walking through packs, or survived from a standstill?
  Should walls funnel the player down a path?

Then **rewrite the `description`** to state that intent plainly (it becomes the
yardstick for the rest of the loop, and the renderer prints it on the map). If
the user confirms the existing description is right, say so and keep it.

## The loop

1. **Render** the current state and LOOK:
   - `node scripts/map-layout.mjs <id>` — the VISUAL OVERVIEW of one carve
     (grid, walls + gaps, zones, and the CON CIRCLES: spawn size = count,
     colour = con). The picture you keep open (with the YAMLs) while editing;
     re-render at two or three seeds before believing any of it.
   - `node scripts/map-preview.mjs <id>` — the design view (path,
     encounters, zones, walls, tempo, legend).
   - `node scripts/map-preview.mjs <id> --actual --seed 1` — the real
     scattered layout (do the walls + rocks funnel the player as intended?).
   - `node scripts/map-preview.mjs <id> --heatmap --seed 1 --difficulty easy`
     — the played dwell + mob density + spawns + kills, and the `COVERAGE: N%`
     readout.
   - `node scripts/map-layout.mjs <id> --seed <seed> --highlight-file report.json`
     — the layout with the simulator's failure overlays: magenta X's where the
     bot got STUCK and red †'s where it DIED (see "Death areas" below).
   Send the images to the user when a judgement is visual.
2. **Evaluate against the confirmed intent.** Concrete questions:
   - Does the hero path route through the encounters you want, in order?
   - Does the **coverage %** match intent — is dead space deliberate, or is half
     the map wasted? Does **dwell** cluster where the fights should be?
   - Does **mob density** land where the packs/waves/geometry should put pressure
     — and stay OUT of any dead/safe zone?
   - Does the **tempo strip** build and release the way the user described, or is
     it flat?
   - Do the **walls** (design view) actually funnel the player, or does the
     `--actual` scatter leave an open field?
3. **Improve** the YAML — retune walls/packs/tempo, add or move a safe/quiet
   zone, place a chest + a pinned unique in a dead pocket, adjust merchant spawns,
   reshape the path, **or retune the map's row in `content/ladder.yaml`** (see
   below).
   Change one lever at a time so the next render attributes the effect.

   **Difficulty tuning is `content/ladder.yaml`, and a level may NOT author its
   own.** A top-level `mobLevels`/`intendedLevel` on a level YAML is a build
   error ("owned by ladder.yaml" — `scripts/level-data/load-yaml.mjs`); the
   loader stamps both onto the `LevelDef` from the ladder's one cell per
   [difficulty × map]. A spawn point or a pinned set-piece names a RAMP
   (`meek`…`monstrous`, `endgame`/`apex`) and the loader expands it against
   THIS map's band — see the `level-design` skill's "Mob levels come from the
   LADDER" section for the shape and the full lever list. The ladder is **hero
   character levels**, start→finish: easy 1 → ~30, medium 1 → ~33, hard
   1 → ~37, nightmare 42 → ~55 (opens HIGH — a grind gate, mobs 42+ even on
   map 1); JESUS is deliberately absent, staying player-relative. Retune a map
   by moving its ladder CELL, so the con system self-regulates the hero onto
   the ladder.
4. **Re-render, re-evaluate, loop** until it matches the intent.
5. **Present before/after.** Show the user the before and after design maps (and
   heatmaps if pacing changed) side by side, and get sign-off before shipping.

## Death areas — SEE where (and why) the map kills the player

The simulator books every death with its **cause** (the killer's enemy defId,
or a `hazard:*` tag) and **world coordinates**, clustered into areas
(`report.deathLog` in `engine/sim/simulate.ts`) — so "this map is too hard" turns
into a specific spot on the picture with a named killer. Drive it as a loop:

1. **Measure with a mortal run** at the map's intended arrival level (an
   under-levelled hero dies everywhere and tells you nothing):

   ```sh
   node scripts/simulate-run.mjs --level <id> --difficulty <d> \
     --start-level <N> --mortal --json deaths.json
   ```

   `--mortal` makes a death START THE LEVEL OVER (a real player's run, not the
   immortal calibration revive), and `--max-deaths` (default 10 under
   `--mortal`) ABORTS the run (outcome `dead`) once the limit is hit — the
   sim's own verdict that the map defeats the bot. Deaths are booked in
   immortal runs too, so any existing `--json` dump already carries them.
2. **Read the DEATHS table** it prints: one row per clustered area,
   `(x, y) ×N [cause×n, …]`. **A repeated cause at one spot is the finding** —
   e.g. `(315, 565) ×6 [intern×5]` says the hero dies again and again to the
   same pack at the same choke. The table ends with a ready-to-paste
   visualize command.
3. **Look at it on the map**: paste that command
   (`map-layout.mjs <id> --seed <seed> --deaths "x,y:cause;…"`), or pass the
   dump straight in with `--highlight-file deaths.json` (draws the death †'s
   AND the stuck X's for every matching run). Death markers are red † discs —
   area ∝ deaths in the cluster — labelled `D1 <killer>`, with a DEATH row in
   the key. Judge by visual inspection: is the cluster at a choke with no
   escape route, on a pack that out-levels the ramp, inside an elite's arena,
   on a hazard lane?
4. **Fix the design, not the symptom**, with the usual levers: the spawner's
   count / the map's ladder band, the elite/boss hp + damage (`enemy-design`),
   the geometry (widen the choke, add an escape route or a safe pocket),
   hazard placement — then re-run the mortal sim and confirm the cluster
   dissolves (and the run stops aborting).

An aborted run (`RUN ABORTED — N/N deaths`) is the strongest signal: the bot
cannot get past that spot at all. If the map is beatable at its intended
arrival level but aborts in a full-campaign sweep, the fix is UPSTREAM
leveling, not this map (see "Measure the map AT ITS INTENDED LEVEL" below).

## Shipping the change (it's a real content edit)

A shipped level is content — treat the change like `level-design` says:

- `make levels` compiles clean; then **accept the new baseline** for the
  round-trip guard: `node scripts/update-level-snapshot.mjs` (review the snapshot
  diff — it's the record of exactly what you changed).
- **RE-TUNE XP after the redesign (required if you touched the roster).** Changing
  counts, spawner mix, or mob bands changes how much XP a clear pays, so the hero
  drifts off the intended ladder. Run the programmatic full-clear check and drive
  every rung to OK (the targets live in `scripts/leveling-curve.mjs` — easy 31 /
  medium 33 / hard 37 / nightmare 55 / jesus 69):

  ```sh
  node scripts/leveling-curve.mjs --targets
  ```

  Levers, cheapest first: the map's `mob` band in `content/ladder.yaml`, then
  `XP_CAP.capByDifficulty` (`engine/game/config/leveling.ts`), then mob totals (~800–1200 killable per map), then the global con
  slopes / kills-per-level curve (touch last). See the `level-design` skill's
  "Re-tune XP after EVERY map redesign" section for the full procedure.
- Re-run the rest of the pacing wiring if you touched population/loot
  (`scripts/weapon-stats.mjs --coverage`).
- If you changed any dialogue/story text, `docs/manuscript.md` + `docs/story.md`
  update in the same change (user-confirmed — CLAUDE.md "Story & dialogue").
- **Measure the map AT ITS INTENDED LEVEL, not with the under-levelled campaign
  bot.** A whole-campaign `simulate-run` under-clears the early maps, so the hero
  arrives late maps below the ladder — a map can look "unbeatable" only because
  the bot showed up 7 levels light. To judge THIS map, drop a realistic hero in
  at its arrival level: `simulate-run --level <id> --start-level <N> --gear-tier
  magic` (N = the map's ladder `hero`; `--start-level` mints a levelled + rolled-
  gear arrival). If it's beatable there but not in the full run, the fix is
  UPSTREAM leveling (why the hero arrives light), not this map's mobs.
- **Ramp the con up the path** (see `level-design` "RAMP THE CON UP"): the
  `map-layout` con circles should read green → yellow → red START → boss, and the
  key's HERO-IF-CLEARED projection should show mobs keeping pace then pulling
  ahead. A flat or inverted ramp is a design smell.
- `playtest` at 844×390 to feel it in the running game, not just on the map image.
- `make test`, `make lint` green; a changelog fragment (`type: Changed`).

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the loop above.

```sh
node scripts/skill-lessons.mjs map-improvement --list
```

Worth recording here: a tell in the heatmap, a lever that reliably fixes a feel
problem.
