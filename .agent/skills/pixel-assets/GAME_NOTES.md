# pixel-assets — game-specific notes

Sprite families and per-family learnings for **this** game. The generate →
look → evaluate → loop workflow and the quality checklist live in `SKILL.md`;
this file records what is specific to this game's art. A sequel resets this
file (and its `sprites/*` families).

## Families

Discover the live set with `ls website/scripts/sprites/` (each directory is a
family). As of 2026-07 this game ships: `hero`, `moon`, `spacez`, `prelude`,
`earth`, `effects`, `icons`, `markers`, `mars`, `rift`, `eastworld`,
`bunker`, `merchant`, `scenes`. A new roster or biome is a new `<family>/`
directory with a `_family.yaml`.

The `merchant` family shows the one-subject-many-costumes path: all four
looks (hooded default, vendor, moon, mars) share the hero's 16×16 body plan
and foot anchor, so the per-level costume swap (`Merchant.sprite`, from
`LevelDef.merchant`) needs no renderer or anchor work — only new grids.

The `mars` family shows the cheap-recolor path for a sibling biome: its
rocks/craters are `swapPalette` calls over the moon family's grids (import
the moon module and remap only the chars that differ; chars shared by name
resolve to THIS family's palette automatically), so a red desert cost zero
redraws for its terrain furniture.

The `eastworld` family (2026-07) adds two more cheap paths: BUILDING-scale
sprites (the town's 48–80 px houses) are generated from a recipe function
inside the family module — plank rows, roof band, door and windows built by
plain JS, deterministic so the atlas only diffs when the recipe does — and a
same-chassis enemy trio (the GROK controllers) is one drawn body plus
`swapPalette` accent swaps (`Q` cyan → `I` magenta / `U` amber). Walk-frame
lesson: keep the torso rows IDENTICAL across frames and animate only the
legs (a whole-body one-row bob shrinks the wound generator's stable-pixel
canvas below the visibility lint's floor on small-bodied mobs).

## Worn-gear overlays (derived from `GEAR_DEFS`)

The hero's outfit is generated, never drawn per piece: every armor def
derives `worn_<defId>` overlays (asset-tools/worn.mjs, applied in
`sprite-data/index.mjs`) — a per-slot silhouette template on the shared
16×16 hero body plan, recolored with a ramp off the piece's inventory
icon's dominant color (`GearDef.wornChar` overrides the pick when the
signature color is an accent, like the Apollo visor's gold mirror).
Head pieces choose their silhouette via `GearDef.worn`
(`cap`/`helm`/`visor`/`mask`); legs/feet ship `_0`/`_1` stride frames
(jump reuses `_0` legs and hides the feet). The app-side stacking order
and the held-weapon hand anchor live in `website/src/game/paper-doll.ts`
— evaluate changes on a composited hero, not on the bare overlays (the
family_worn sheet shows floating clothes; that is expected). A NEW ARMOR
PIECE therefore needs no sprite work — def + icon, then `make assets`;
`tests/content/worn_test.ts` fails until the overlays land in the atlas.
Weapon icons double as the in-hand sprites: draw them grip lower-left /
business end upper-right, or add left-pointing ones to
`LEFT_POINTING_ICONS` in paper-doll.ts.

## Wound-overlay contrast (derived from `ENEMY_DEFS`)

Battle-damage variants are derived from the enemy catalog, so the overlay
char must separate from each family's LOCAL body color (a dark-violet wound
on the dark-violet wraith is invisible). Reuse the color of the sibling
effect for coherence:

- **ghost-tier wounds** = the ecto splash's pale cyan (`c`/`C`/`U`/`N`
  overrides in the family `wounds` maps).
- **staff wounds** = the blood splash's red (`r` / `i` dried / `E` grime,
  from the core palette).

Verify on the `@8x` preview of EACH family — one overlay style rarely fits
all palettes.
