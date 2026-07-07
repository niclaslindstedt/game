# pixel-assets — game-specific notes

Sprite families and per-family learnings for **this** game. The generate →
look → evaluate → loop workflow and the quality checklist live in `SKILL.md`;
this file records what is specific to this game's art. A sequel resets this
file (and its `sprite-data/*` families).

## Families

Discover the live set with `ls website/scripts/sprite-data/*.mjs` (all but
`core.mjs` / `index.mjs`). As of 2026-07 this game ships: `hero`, `moon`,
`spacez`, `prelude`, `earth`, `effects`, `icons`. A new roster or biome is a
new family module registered in `sprite-data/index.mjs`.

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
