---
name: boss-abilities
description: "Use when giving a boss or elite a new SET-PIECE MOVE, or reworking one — a charge, a slam, a beam, a summon, a bait drop, a shutter lockdown, an orbital strike. Covers the ability CATALOG (a named entry, not a widened union), the three beats every move obeys (TELL → CAST → RESOLVE) and which of them the orchestrator owns, the locked bearing that must travel as an argument, barks (which never freeze the run), difficulty gates that add moves rather than multiply numbers, and the sprite-not-primitive FX rule. Also the obstaclesVersion trap any move that changes the walls falls into."
---

# Boss abilities — a boss is a character, not four fields

A boss's set-piece moves used to be a CLOSED union of four, so every boss in
the game was a permutation of the same four and a new idea meant widening a
type the whole engine reads. An ability is now a NAMED entry in a catalog, and
adding one costs a variant in the authored union, a module beside its siblings,
and the boss YAML that names it — nothing else in the engine grows a member per
idea.

Load `enemy-design` for the def the ability hangs off, `update-story` before
writing a BARK (it is manuscript-governed like every other spoken line),
`visual-effects` for how the FX reach the screen, and `pixel-assets` for the
cast pose and the ground art.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs boss-abilities --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## Where everything lives

| Piece | File |
| --- | --- |
| The authored catalog | `engine/game/defs/enemies/abilities.ts` |
| One module per ability | `engine/game/mechanics/<id>.ts` |
| The registry | `engine/game/mechanics/catalog.ts` (registered by id) |
| The orchestrator | `stepEnemyMechanics` — owns the TELL and the RESOLVE for every entry |
| Which boss has which | `content/enemies/<biome>/<id>.yaml` (`mechanics:`, `phases:`) |
| The FX | `pwa/src/game/render/boss-fx.ts` + `event-fx.ts` |
| The cast pose | `content/sprites/…/<sprite>_cast_0` / `_cast_1` (resolved by naming convention) |

## The catalog seam

`AbilityDef.kind` is a LABEL, never a dispatch key. The four originals
(`charge`, `slam`, `enrage`, `summon`) stay named fields because a pile of
content authors them that way; they are the catalog's grandfathered entries,
not its future. `kind` names the effect a power leads with, for the surfaces
that need one word for a whole move; the engine steps whichever blocks are
present.

## The three beats

**Every ability obeys the same THREE BEATS, and the orchestrator owns two of
them** — which is what makes a fight learnable rather than a coin flip:

1. **TELL** — the boss strikes its OWN authored CAST POSE (`<sprite>_cast_0/1`,
   resolved by naming convention like the wound stages, so a boss earns the
   treatment by shipping two frames and nothing is registered anywhere) for a
   fixed, never-rolled `windupMs`. `stepEnemyMechanics` starts the windup, so no
   ability in the catalog can ever ship without one.
2. **CAST** — the move commits to a marker that is a THING IN THE FICTION. The
   bearing LOCKED at the tell reaches the handler as `AbilityCtx.lockedDir`, and
   it has to travel that way: the orchestrator clears the telegraph the instant
   the windup ends (that is what un-roots the mob), so an ability reaching back
   for `mech.telegraph` inside `cast` finds nothing, silently re-aims onto the
   hero, and quietly breaks the promise every tell in the game makes.
3. **RESOLVE** — damage lands, the cooldown starts (in the orchestrator, counted
   from the CAST, because the gap between casts is what a player learns to
   count), and the FIRST cast fires the ability's one-time `bark`.

## Barks

**A BARK IS NOT DIALOGUE.** Every other spoken line freezes the run into the
`dialogue` phase, which is exactly wrong for a line whose whole job is to name a
move WHILE it is being dodged. A bark is its own event (`bossBark`) the app
floats over the speaker; play never stops. Manuscript-governed like any other
line.

## Difficulty gates

**THE TOP RUNGS ADD MOVES, THEY DON'T JUST MULTIPLY NUMBERS.** Each entry carries
`minDifficulty` (compared on `DifficultyDef.index`) so NIGHTMARE and JESUS hand
the player a new thing to learn on a fight they already know, and
`windupFloorMs`, which squeezes a known move faster up the ladder but never below
an authored floor — a tell shorter than a reaction is not a tell, and the
build refuses a floor above its own windup.

## The FX

**THE SET-PIECE FX ARE SPRITES, NOT SHAPES.** What this replaced was a strobing
`ctx.arc` ring around the body, a stroked circle for the slam's footprint and a
`ctx.lineTo` for the charge's bearing — primitives in a game whose every other
pixel is authored, and a stroked circle reads as a debug overlay because that is
what it is. The read is carried instead by the cast pose on the mob, then by the
GROUND (`render/boss-fx.ts`): a slam pools a soft pressure shadow, a charge kicks
authored grit down its locked lane, a beam is an authored slice tiled along its
own axis, and burning floor is a mottled outline-free char sprite with flame
licks standing on it. Three engine events (`enemySlam`, `enemySummoned`,
`enemyEnraged`) were emitted and consumed by NOBODY — a boss's slam landed for
more than its contact damage with nothing on screen at all — and are answered in
`event-fx.ts` now, in authored dust rather than in expanding rings.

## Worked examples

**The catalog carries EIGHTEEN** — `airstrike`, `bait_drop`, `blink_strike`,
`call_horde`, `coin_cannon`, `ember_trail`, `flag_plant`, `laser_eyes`,
`lockdown`, `orbit_guard`, `quake_line`, `rally_cry`, `recompile`,
`seeker_volley`, `shock_pulse`, `siphon_tether`, `snare_field`, `ward_shield`
(`engine/game/defs/enemies/abilities.ts`; read it before adding, the shape you want
may already exist). The six below are the ones worth reading as examples,
because four of them exist to prove the seam holds:
an ability may reach the world through its own PROJECTILES (`coin_cannon` — a
fan of coins that RICOCHET, `Projectile.bouncesLeft`, so cover stops being the
answer and the room starts being the question), its own STATE LIST (`bait_drop`
— PUMP AND DUMP, piles that look exactly like loot and price the pickup reflex;
they arm on a delay long enough to walk out of and go cold on their own, which
is what keeps a nasty move fair), or — twice — through an EXISTING HAZARD
SYSTEM pointed at a boss's intent instead of a level's timer. That last one is
the most valuable trick in the file: `airstrike` (ORBITAL DELIVERY) drops pods
that ARE meteors (`Asteroid.sprite`/`hatch`), so it inherits the firming ground
shadow the player has already been taught to read and is legible the first time
it is used; `call_horde` (CALL OF INCELS) calls a STAMPEDE, so it inherits the
approach dust, the trample and the answer ("get out of the lane"). Prefer
pointing an existing system at a new author over building a second one.

**THE LAST TWO ARE SHAPED LIKE AN ANSWER RATHER THAN A THREAT**, which is the
pattern to copy when a move risks reading as a scolding. `recompile` is a boss healing itself — the oldest cheap trick there is,
because the only response to a rising bar is "hit harder", which is a scolding
rather than a decision. It becomes a mechanic by putting the repair OUTSIDE the
boss: a node goes up, a visible tether runs to it, and breaking the node beats
any amount of extra damage. `lockdown` drops blast shutters in a ring around the
hero with exactly ONE gap — not a trap, a corner. A sealed box is a damage
window; a box with a door is a question, and the gap's bearing is rolled so it
stays a search. Both reuse machinery whole: the node is another `structure`
EnemyDef like the planted flag, and the shutters are ORDINARY `state.obstacles`,
so collision, line of sight, shot-blocking and the renderer all came free.

The one thing that was NOT free is `state.obstaclesVersion`. The autopilot builds
its nav grid once per level and caches it, so a wall that appears mid-run is a
wall it cannot see — it routes straight through and grinds. Anything that adds
or removes an obstacle must bump that counter; `ensureRoute` rebuilds when it
moves. Any future dynamic obstacle inherits the fix.

THE FLAGBEARER carries the catalog's first two. **LASER EYES** sweeps a beam one way
across a locked arc and leaves the regolith it crossed ON FIRE (`state.scorches`,
stepped in `hazards.ts`): the beam is one dodge, but the floor it leaves is what
makes a long fight cost the player their room. Two rules keep it honest — the
fire BITES ONCE PER CADENCE however many patches overlap (a sweep lays a band
several patches deep, so billing per patch would turn a readable hazard into a
spike set by how finely the beam sampled its own lane), and it BURNS OUT: a boss
may carve the floor, never delete it. **FLAG PLANT** (nightmare+) is the summon
with an ANSWER — the adds come out of a real, stationary, killable body
(`the_planted_flag`, an ordinary `EnemyDef` marked `structure: true` and paying
no xp) rather than out of the boss, so "break the thing making these" is a right
answer the player can find. Reach and arc are sized against the PHONE viewport
and judged in the EFFECTS GALLERY's own BOSSES shelf, never guessed — a sweep
that covers the whole visible floor is not a hazard, it is a wall.


## Adding one

1. **Author the entry** in `engine/game/defs/enemies/abilities.ts` — a variant in
   the authored union with its `windupMs`, its cooldown, its reach, its
   `minDifficulty` and `windupFloorMs` if it is a top-rung move, and its `bark`.
2. **Write the module** in `engine/game/mechanics/<id>.ts` beside its siblings and
   register it by id in `catalog.ts`. It implements CAST only — the
   orchestrator already owns the tell and the cooldown.
3. **Prefer pointing an existing system at a new author** over building a
   second one. `airstrike` drops pods that ARE meteors, so it inherits the
   firming ground shadow the player has already been taught to read;
   `call_horde` calls a STAMPEDE, so it inherits the approach dust, the trample
   and the answer ("get out of the lane"). This is the most valuable trick in
   the file — a move built on a system the player already reads is legible the
   first time it is used.
4. **Shape it like an ANSWER where you can.** A boss healing itself is the
   oldest cheap trick there is, because the only response to a rising bar is
   "hit harder", which is a scolding rather than a decision — `recompile` becomes
   a mechanic by putting the repair OUTSIDE the boss, on a visible tethered node
   that can be broken. `lockdown` is a ring of shutters with exactly ONE gap: a
   sealed box is a damage window, a box with a door is a question.
5. **Name it and give it a line.** The bark is spoken once, on the first cast,
   and it is manuscript canon — walk the `update-story` chain.
6. **Draw it in authored art**, never in `ctx.arc`/`ctx.lineTo` (below).
7. **Bump `state.obstaclesVersion`** if it adds or removes an obstacle (below).
8. **Judge it in the EFFECTS GALLERY's BOSSES shelf**, at the PHONE viewport.
   Reach and arc are sized against ~422×260 world units, never guessed — a
   sweep that covers the whole visible floor is not a hazard, it is a wall.

## Checklist

- [ ] The TELL is fixed and never rolled, and long enough to react to on every
      rung it can appear on (`windupFloorMs` is a floor, and the build refuses a
      floor above its own `windupMs`).
- [ ] CAST reads `AbilityCtx.lockedDir`, never `mech.telegraph`.
- [ ] The cooldown is counted from the CAST — that gap is what a player learns.
- [ ] The marker is a THING IN THE FICTION, drawn in sprites.
- [ ] `minDifficulty` set if this is a rung's new thing to learn.
- [ ] The bark floats; it does not raise the `dialogue` phase.
- [ ] `obstaclesVersion` bumped if the walls changed.
- [ ] Every event the ability emits is CONSUMED by `event-fx.ts` — three of the
      engine's own boss events sat emitted and unanswered for a long time, which
      is a slam that lands for its contact damage with nothing at all on screen.
- [ ] The def's cast frames exist in the atlas.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the beats, tables and checklist above.

```sh
node scripts/skill-lessons.mjs boss-abilities --list
```
