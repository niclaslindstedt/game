---
name: gore-system
description: "Use when working on GORE — blood spray and the floor it soaks, the hero's own bloodied coat and bootprints, a body coming apart (a CLEAVE by an edged weapon, a GIB by a mass), a new gib or organ, a new gore FAMILY (blood/ecto/sparks/cosmic), the overkill ladder that decides which death a blow earns, or the MATURE CONTENT / SFW gate any of it hangs off. Routes to docs/gore.md for the mechanism — the volume-vs-force split, the one-byte-per-tile floor grid, the anatomy bands a cut spills, the depth illusion, the four families and how they are re-hued rather than re-authored — and owns the workflow around it: how to MEASURE a gore rate on a real run instead of judging it from a diorama, what an addition costs, and the bar a change is held to."
---

# The gore system

Everything here is **presentation** — the engine emits a kill and a damage
event, and none of this changes what happens. It is also the part of the game
most easily made worse by a reasonable-sounding simplification, so a rule that
replaced a tempting wrong answer says which one, because that is the answer
somebody will propose again.

**READ [`docs/gore.md`](../../../docs/gore.md) BEFORE CHANGING ANY OF IT.** That
document is the mechanism and the file map: the volume-vs-force split every blow
is priced by, the one-byte-per-tile floor and the four rules that make a grid of
squares read as spilled blood, the hero's soak and the trail his boots carry out,
the overkill ladder and the cleave/gib it decides between, the anatomy bands a
cut spills and the depth illusion behind an oblique one, and the four families
and how they are re-hued rather than re-authored. Almost every way this system
gets broken is by a change made without one of those rules in view. This skill is
the WORKFLOW around it — how to measure it, how to judge it, what an addition
costs, and what a change is held to before it ships.

Load `visual-effects` for how a transient effect reaches the screen at all,
`docs/rendering.md` for the projection every one of these passes draws through,
`pixel-assets` for authoring a new gib sprite, and `enemy-design` for the
`gore` / `anatomy` / `locomotion` fields on the def.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs gore-system --list`,
and `node scripts/skill-lessons.mjs visual-effects --concepts=blood-floor` for the
neighbouring fragments about the blood floor and measuring soak rates. Reading
them here and reflecting on them before the commit is the **`skill-reflection`**
skill's job — load it at both ends of the session.

## What a change touches

The file map is `docs/gore.md` → **Where everything lives**. The four seams worth
knowing before you open anything:

| The change is about | It is decided in |
| --- | --- |
| How much blood a blow is worth | `game-screen/blood-hit.ts` (`bloodBlow`) — VOLUME saturates, FORCE does not |
| Whether the body comes apart | `game-screen/overkill.ts`, applied in `kill-presentation.ts` |
| What a body of THIS kind is made of | `game-screen/gore.ts` — one row per family, never an edit to the spray/burst/cleave/floor |
| Whether any of it happens at all | `game-screen/gore-gate.ts` — asked where the effect is DECIDED, never at the draw |

## Measuring and judging it

**A DIORAMA CANNOT SHOW YOU A CURVE.** Every rate in this system is a function
of a map's worth of kills against a hero whose damage is climbing — the share of
deaths that come apart, how filthy a melee build is by the boss, how far a
trail reaches. Judging any of them from a staged exhibit gives you one sample of
a distribution.

| Instrument | Answers |
| --- | --- |
| `node scripts/gore-rate.mjs` | Plays campaigns and replays every kill through the shipped ladder — the gib rate, read as a SPREAD across the rungs rather than as an average (`docs/gore.md` → THE RATE IS A READOUT) |
| The `playtest` / `simulate-run` skills | The soak and trail rates, which are only honest over a real run's kill count and positions |
| EFFECTS GALLERY (`?effects=<id>`, or DEVELOPER → GALLERIES → EFFECTS) | One effect per screen, staged as a real fullscreen situation and replayed on a loop; `S` steps it down to ⅛× SLOW MOTION, which is the only way to judge a burst that is over in a fifth of a second |
| `make gallery ARGS="--only <id> --strip N"` | A filmstrip of a whole exhibit composited into one contact sheet — what a review actually reads. It starts and stops its own dev server unless `--url` names one; add `--speed 0.125` for the slow motion a burst needs |

The exhibits that belong to this skill: `cleave` (CLEAVED IN TWO), `gib` (BURST
INTO PIECES), `gore-ecto` / `gore-sparks` / `gore-cosmic` (each family's cut and
burst side by side — the only way to judge the claim that a ghost comes apart as
a ghost rather than as a person in green), `blood-soaked` (DRENCHED) and
`blood-tracks` (BLOODY BOOTPRINTS). The last two are the soak and the trail's
gallery, and neither can be judged there alone: measure their rates on a real
autopilot run.

**THE RARE CUTS ARE PINNED SO THEY CAN BE LOOKED AT.** Everything about a cleave
is rolled, which is the feature and also what makes its rare cuts impossible to
study — an oblique slice comes up about a fifth of the time. `Exhibit.cut` pins
a PARTIAL cut over the roll for the length of a show (`pinCleaveCut`, cleared
when the gallery stops so it can never reach a real run): `cleave-behead` and
`cleave-legs` pin the two ends of the limb rule, `cleave-oblique` and
`cleave-slab` the two ends of the depth one. **Pin the ONE axis the exhibit is
about and let the rest go on rolling** — a diorama showing the same picture every
take would misreport a system whose whole point is that it does not.

## Adding to it

| Adding | Costs |
| --- | --- |
| A gore PIECE a burst throws | `content/sprites/effects/gib_<part>.yaml` (it must be something that was INSIDE) + its entry in that family's `signature` / `filler` list in `game-screen/gore.ts`, plus its name in `bouncy` if it is dense and in `humanOnly` if only a person has one |
| An ORGAN a cut can spill | the sprite + the family `bands` entry it lives in (`game-screen/gore.ts`). Every cut through that band spills it from then on — nobody writes the combinations down |
| A gore FAMILY | one row in `gore.ts` (bands, signature ladder, filler, ramp, cloud colour, what bounces, whether it `stains`, what it BURNS DOWN TO) + its art. Never an edit to the spray, the burst, the cleave, the floor and the effect pass |
| A burned body's REMAINS | `content/sprites/effects/charred_<what>.yaml` + its name in that family's `remains` pool in `gore.ts`. The pool is picked from on the KILL'S OWN SEED, so a second entry is what stops a nuked screenful leaving one decal forty times |
| A KIND of dismemberment | a switch in `KIND_SWITCH` + the settings row; the fallback for a refusal is always the ORDINARY corpse, never the other kind |
| A mature feature of any sort | a `nsfwAllowed()` check — **never a new setting**. `docs/gore.md` → ONE GATE has the three refusal shapes |

## Checklist

- [ ] Priced off the victim's own healthbars (`damage / maxHp`), not off a raw
      damage figure — or it drowns the late game in gore as the numbers grow.
- [ ] VOLUME saturates, FORCE does not. Check both ends: a feeble tap and a
      hundred-fold overkill.
- [ ] Gated where the thing is DECIDED, not where it is drawn — nothing may
      accumulate invisibly while a switch is off.
- [ ] Fails open: no native module, an Android build, a browser, a malformed
      payload all play the full game.
- [ ] A boss never comes apart. It has last words to say over its own body.
- [ ] Nothing that doesn't bleed comes apart as though it did — a wisp has no
      halves, a rover has no intestines.
- [ ] Deterministic: seeded off the item/victim hash or the blow, never
      `state.rng()` (a presentational draw shifts every roll after it).
- [ ] Judged in the gallery in SLOW MOTION, and the RATE measured on a real run.
- [ ] New `EnemyDef` field? Add it to `canonicalEnemyDef` (`defs/enemies/index.ts`)
      or it silently reads `undefined` with every check still green.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the rules and
checklist above.

```sh
node scripts/skill-lessons.mjs gore-system --list
```
