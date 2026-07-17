---
name: map-improvement
description: "Use when improving the DESIGN and FEEL of an existing level (not adding a new one) — the iterative render → evaluate → improve loop. It first CONFIRMS the map's intended feel with the user (the auto-generated YAML descriptions may be wrong!), rewrites the description to match, then reads the annotated map + played heatmap, judges it against that intent, edits the YAML, re-renders, and loops — presenting before/after maps for sign-off before shipping."
---

# Improving a Map's Design

The sibling of `art-improvement` (which hunts the worst art) — this one improves
how a level *plays and feels*. A level is data (`website/scripts/levels/<id>.yaml`,
compiled by `make levels`); the annotated **map renderer**
(`website/scripts/map-preview.mjs`) makes its design legible, and the **heatmap**
shows how it actually plays. This skill drives the loop that turns that
visibility into better maps. Load the `level-design` skill for the format,
fields, and the cross-cutting wiring; this skill is the *iteration method*.

**Before starting, read past lessons:** `node scripts/skill-lessons.mjs map-improvement`.

## Step 0 — CONFIRM THE INTENT (do this first, always)

**The YAML `description` may not capture the real design intent.** The shipped
descriptions were seeded from old code comments; they describe what the map *is*,
not always what it should *feel* like. Do not tune toward a description you can't
trust. Before any edit, use `AskUserQuestion` to confirm the map's intended feel
with the user:

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
- `simulate-run` + `playtest` at 844×390 to feel it in the running game, not just
  on the map image.
- `make test`, `make lint` green; a changelog fragment (`type: Changed`).

## Skill self-improvement

Record a new heuristic (a tell in the heatmap, a lever that reliably fixes a feel
problem) as a lesson fragment under `.lessons/` (see [`../LESSONS.md`](../LESSONS.md));
read past ones with `node scripts/skill-lessons.mjs map-improvement` before
starting.
