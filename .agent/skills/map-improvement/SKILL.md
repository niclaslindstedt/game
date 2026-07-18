---
name: map-improvement
description: "Use when improving the DESIGN and FEEL of an existing level (not adding a new one) — the iterative render → evaluate → improve loop. It first CONFIRMS the map's intended feel with the user (the auto-generated YAML descriptions may be wrong!), rewrites the description to match, then reads the annotated map + played heatmap, judges it against that intent, edits the YAML, re-renders, and loops — presenting before/after maps for sign-off before shipping."
---

# Improving a Map's Design

The sibling of `art-improvement` (which hunts the worst art) — this one improves
how a level *plays and feels*. A level is data (`website/scripts/levels/<id>.yaml`,
compiled by `make levels`). Two renderers make it legible:

- **`map-layout.mjs` — the VISUAL OVERVIEW.** A clean, high-res, top-down
  picture of the AUTHORED layout: a labelled coordinate grid for orientation
  (world x/y you read straight off for editing), every wall + gap, the numbered
  hero path, the zones, and every placed thing as a DISTINCT SHAPE (star=boss,
  diamond=elite, triangle=rare/unique, circle=spawn knot, cluster=pack,
  square=chest, …). Spawn points are **CON CIRCLES** — area ∝ mob count, colour
  = con (mob level vs the map's `intendedLevel` on the chosen difficulty:
  grey→green→yellow→orange→red), so an over/under-tuned difficulty ramp reads at
  a glance. It shows only what benefits from being SEEN; the numbers stay in the
  YAML. **Do BOTH before touching anything, every session:** read the level's
  YAML AND `make map-layout LEVEL=<id>` and study the image — the picture gives
  you the spatial/difficulty read, the YAML gives you the exact values.
- **`map-preview.mjs` — the ANALYSIS view.** The design view (trigger rings,
  authored mob-density smear, derived path, tempo strip) plus `--actual` (the
  real scattered layout) and `--heatmap` (how the map actually PLAYS — dwell,
  mob density, spawns, kills, coverage %). This is how you judge the change.

This skill drives the loop that turns that visibility into better maps. Load the
`level-design` skill for the format, fields, and the cross-cutting wiring; this
skill is the *iteration method*.

**Before starting, read past lessons:** `node scripts/skill-lessons.mjs map-improvement`.

## The whole design surface is on the table

Improving a map is **not** limited to nudging YAML knobs. When the map's problem
demands it, a real fix — up to a **complete redesign** — is expected, and every
lever below is fair game. Reach for the sibling skill when you cross into its
domain:

- **Geometry** — move, add, remove, or reshape walls/ridges/gaps; re-cut the
  basins; re-route or re-author the `path`; add/remove safe & quiet zones, chests,
  merchant spawns, landmarks. Reshaping the *space* is the highest-leverage fix
  for a traversal/pacing problem.
- **Enemies** (`enemy-design`) — add or rework minions/elites/bosses: their **hp,
  contact damage, level ranges, mechanics/phases, and capabilities**. A map that
  is unbeatable or trivial is often an ENEMY problem, not a count problem.
- **New sprites** (`pixel-assets`) — a new enemy, tile, obstacle, or biome look
  the redesign needs.
- **Weapons & loot** (`weapon-system`) — the drop pool, tiers, and any new
  weapon/unique the map should hand out.
- **Leveling & difficulty** (`leveling-balance`) — the XP curve, kills-per-level
  pacing, the per-map `mobLevels` bands and XP caps that keep the hero on the
  ladder.

Hold the result to **best-practice game design**: a legible read, a deliberate
tempo (build → release), fair-but-rising difficulty, teachable mechanics,
risk/reward that pays, and — the hard floor — **beatable and worth playing**
(prove it with `simulate-run` and `playtest`, not vibes). If the shipped design
is fundamentally at odds with that, propose the redesign to the user rather than
polishing a broken frame.

## Step 0 — LOOK, then CONFIRM THE INTENT (do this first, always)

**Read the YAML and render the overview before anything else — do both:** open
`website/scripts/levels/<id>.yaml` for the exact values AND `make map-layout
LEVEL=<id>` and study the image for the geometry, the path, where every spawn
point/encounter sits, and the con read (the spawn circles' size + colour). Check
the con across difficulties (`--difficulty hard`, etc.). This is how you build an
accurate mental model of the map before you form an opinion about it. If a map
has no `intendedLevel`, add it (the con anchor) as part of the pass.

**Then confirm the intent — the YAML `description` may not capture it.** The
shipped descriptions were seeded from old code comments; they describe what the
map *is*, not always what it should *feel* like. Do not tune toward a description
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
   - `node website/scripts/map-layout.mjs <id>` — the VISUAL OVERVIEW (grid,
     walls + gaps, authored path, zones, and the CON CIRCLES: spawn size = count,
     colour = con). The picture you keep open (with the YAML) while editing.
   - `node website/scripts/map-preview.mjs <id>` — the design view (path,
     encounters, zones, walls, tempo, legend).
   - `node website/scripts/map-preview.mjs <id> --actual --seed 1` — the real
     scattered layout (do the walls + rocks funnel the player as intended?).
   - `node website/scripts/map-preview.mjs <id> --heatmap --seed 1 --difficulty easy`
     — the played dwell + mob density + spawns + kills, and the `COVERAGE: N%`
     readout.
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
   reshape the path, **or retune the per-difficulty `mobLevels`** (see below).
   Change one lever at a time so the next render attributes the effect.

   **Difficulty tuning is `mobLevels`, not global config.** Below JESUS every
   mob's level is HARD-CODED in the level spec (level-default tuple + per-spawner
   override; pinned elites/bosses hard-code `level` + base `hp`) — see the
   `level-design` skill's "Mob levels are HARD-CODED per difficulty" section for
   the shape and the full lever list. The ladder is **hero character levels**,
   start→finish: Easy 1→32, Medium 1→34, Hard 1→36, Nightmare 40→56 (opens HIGH —
   a grind gate, mobs ~40 even on map 1), Jesus 58→70 (player-relative, never
   authored). Author each map's `mobLevels` to the hero's intended level band ON
   that map so the con system self-regulates the hero onto the ladder.
4. **Re-render, re-evaluate, loop** until it matches the intent.
5. **Present before/after.** Show the user the before and after design maps (and
   heatmaps if pacing changed) side by side, and get sign-off before shipping.

## Shipping the change (it's a real content edit)

A shipped level is content — treat the change like `level-design` says:

- `make levels` compiles clean; then **accept the new baseline** for the
  round-trip guard: `node scripts/update-level-snapshot.mjs` (review the snapshot
  diff — it's the record of exactly what you changed).
- **RE-TUNE XP after the redesign (required if you touched the roster).** Changing
  counts, spawner mix, or mob bands changes how much XP a clear pays, so the hero
  drifts off the intended ladder. Run the programmatic full-clear check and drive
  every rung to OK (±1 of easy 32 / medium 34 / hard 36 / nightmare 56):

  ```sh
  node scripts/leveling-curve.mjs --targets
  ```

  Levers, cheapest first: the map's `mobLevels` band, then `XP_CAP.capByDifficulty`
  (config.ts), then mob totals (~800–1200 killable per map), then the global con
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

Record a new heuristic (a tell in the heatmap, a lever that reliably fixes a feel
problem) as a lesson fragment under `.lessons/` (see [`../LESSONS.md`](../LESSONS.md));
read past ones with `node scripts/skill-lessons.mjs map-improvement` before
starting.
