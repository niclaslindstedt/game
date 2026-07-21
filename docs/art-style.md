# Art style — the house style for _Gone in Space_

> The single prose source for **how this game's art looks and why**. It sits
> above the machine-readable style anchors (which the tools actually consume)
> and the pixel-assets workflow (which says how to build a sprite). Read this
> first to understand the _feel_; then use `pixel-assets` to make one.

All in-game graphics are **generated pixel art**, never hand-drawn binaries:
one self-describing YAML per sprite (a char `grid` + a concrete-hex `palette` +
a `description`) under `scripts/sprites/`, packed into a single atlas at
build time. This document is about the _look_ those grids should add up to. The
mechanics of authoring a grid — the generate → look → evaluate → loop cycle and
the pass/fail checklist — live in the [`pixel-assets` skill](../.agent/skills/pixel-assets/SKILL.md).

## The feel

_Gone in Space_ is **grounded, working-man sci-fi**. The hero is a laid-off
shipbuilder in a salvaged EVA suit chasing his girlfriend across the moon,
Mars, a rift between universes, and a knockoff western — an ordinary man in
hostile places, not a chrome space marine. The art carries that: **flat 16-bit
pixel art, muted and practical, no fantasy gloss, no neon sheen for its own
sake.** Everyday objects look everyday; the sci-fi is corporate and worn, not
heroic.

The mood travels with the story. The playable world is **cold and hostile** —
desaturated lunar greys, rust-red Martian oxide, the void-black-and-violet rift
— and it is bracketed by **warm, domestic** moments: the earth suburb, the
lantern-lit merchant, the cutscene tableaux. That warm/cold axis is the
emotional through-line of the palette. Saturated color is **rare and earned**:
a handful of bright accents (the hero's gold visor and red chest light, a
weapon's signature glow, a boss's tell) pop precisely because everything around
them is muted.

Each biome and roster is a **family** with its own one-line `style:` anchor —
the mood in a sentence — but the medium and the read never change between them.
The families are the authority on their own color world:

| Family                          | The mood, in a line                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `hero`                          | Grounded working-man look; practical clothes and gear, muted realistic colors, no fantasy flourish. |
| `spacez`                        | Corporate HQ: sleek brand whites and chrome, cool blue accents, clean product-design surfaces.      |
| `moon`                          | Desaturated regolith greys, hard black shadow, cold vacuum light.                                   |
| `mars`                          | Rust-red oxide and dust, riveted weathered metal, thin cold light.                                  |
| `rift`                          | Void blacks shot through with unnatural violet and teal glow, nothing quite solid.                  |
| `eastworld`                     | Knockoff robot western: dusty sun-bleached tans, weathered wood and tin, a synthetic sheen.         |
| `earth` / `merchant` / `scenes` | The warm bracket: domestic greens and browns, lantern tones, cinematic domestic staging.            |
| `effects` / `icons` / `markers` | Function over material: pure light for VFX, one clean pictogram for items, bold UI signage for nav. |

The live set is whatever `ls scripts/sprites/` shows; each `_family.yaml`
carries the canonical `style:` line. When this document and a family anchor
disagree on that family's mood, **fix the anchor and this table together** — the
anchor is what the prompt generator reads.

## The one constraint that drives every rule: tiny, on a phone, in motion

This is a **mobile-first, landscape** game. The reference device is a phone held
horizontally — a ~844×390 CSS viewport, about **422×195 world units** at the
app's `VIEW_SCALE` of 2. A character sprite is **16×16**. So on the screen the
player actually holds, the hero is a _thumbnail_, usually moving, often mobbed
by a dozen enemies and their projectiles.

Everything below follows from that. There is no room for fine detail, texture,
or a third shade of grey — it turns to mush at 16px on a phone and disappears
the moment the sprite moves. **Design for the silhouette and two or three color
reads, and nothing else survives the trip to the screen.** Judge every sprite at
that viewport (the playtest harness defaults to it), not zoomed in on a preview.

## The shared look — what every sprite obeys

These are the fixed constraints baked into the generator's `STYLE_PREAMBLE`
(`scripts/asset-tools/prompt.mjs`) — the constant top of every
image-generation prompt, and the non-negotiable house rules whether a sprite is
generated or hand-drawn:

- **Flat 16-bit pixel art.** Hard-edged pixels — no anti-aliasing, no gradients,
  no dithering, no outline glow.
- **A single subject, centered, filling the frame.** Drawn **front-facing and
  orthographic** — no perspective, no foreshortening.
- **No baked shadow or ground plane.** The blob shadow is its own sprite
  (`hero/shadow`) that the renderer places and lifts on a jump; sprites
  themselves are on a **fully transparent background**.
- **A handful of flat colors** with a **bold, high-contrast silhouette that
  stays readable shrunk to a tiny icon at phone distance.**

`STYLE_PREAMBLE` is the machine-readable form of this section; keep the two in
step. Everything after this point is _how_ to hit that bar.

## Design best practices

1. **Silhouette first.** Block the shape in one color and ask: could you name it
   from the outline alone at 1×? A reader recognizes the domed helmet, the
   hunched wraith, the barrel of a rover before they see any interior detail.
   Author descriptions the same way — lead with the outline read, not a parts
   list. (See the `player_*` descriptions for the pattern: helmet dome → visor
   band → chest light, in order of what survives at small size.)

2. **Budget the color pops.** A sprite is a **muted body plus one or two
   saturated accents** that carry its identity — the hero's gold visor and red
   light, a unique weapon's elemental glow, a boss's signature tell. If
   everything is bright, nothing reads. New saturated color needs a reason.

3. **Palette discipline: ~2–5 colors plus outline.** Paint from the family's
   scope (the shared core in `_core.yaml` + the family-local palette). The
   single-character palette namespace is **per family**, so the same letter can
   mean different colors in two families — always check availability on
   `assets-preview/palette.png`.

4. **Outline convention.** A **dark — not pure black — exterior outline** wraps
   every sprite; interior detail lines are a shade _lighter_ than the exterior.
   Pure black reads as a hole; the near-black `#1a1c2c` is the shared outline
   color across families.

5. **Light from the top-left, always.** Highlights on the upper-left faces,
   shadow on the lower-right, consistently across every sprite so the world
   feels lit by one source.

6. **No orphan pixels.** Every lit pixel belongs to a deliberate cluster. A lone
   floating pixel reads as noise — or dirt on the screen — at 1×.

7. **Contrast against the _family ground_, not just a checker.** A sprite that
   pops on a checkerboard can vanish on its own tiles. The generator warns below
   an edge-contrast floor; borderline cases still need eyes on the
   `family_<family>.png` contact sheet, which composites the sprite over its own
   ground.

8. **Frames share a spine; animate only what moves.** For a walk cycle, keep the
   torso and head **identical** across frames and move only the legs — a
   whole-body bob shrinks the stable-pixel canvas the derived wound/worn
   generators rely on, and makes overlays flicker. The **anchor** (feet, center
   of mass) must **not drift** between frames; check the onion-skin cell on the
   `<name>_strip.png` film strip (a double image there means the anchor moved).

## The description is the acceptance target

Every sprite YAML carries a `description`: **what the sprite is supposed to look
like, in words.** It is the contract. It **outranks any reference image** (one
fallible realization of it) and the pixels are always re-derivable from it — when
an image and the description disagree, the description wins and you fix the grid.

Write the description **first and well**, because it is also what the
prompt generator (`sprite-author.mjs prompt <name>`) turns into an
image-generation prompt, alongside the family anchor, size, and palette. A good
description for a 16px sprite:

- **leads with the silhouette read** and names the two or three things that
  survive at phone scale, in priority order;
- **states the build/proportion** (this game's characters are short, stocky,
  slightly top-heavy dolls) so sibling frames can't drift apart;
- **names constraints, not just appearance** — e.g. the hero body dolls are a
  _layer-friendly base_ (empty low hands, symmetric, no props) because worn
  armor and a held weapon composite on top;
- **grounds the subject in the story** where it matters — the manuscript
  ([`docs/manuscript.md`](manuscript.md)) and [`docs/story.md`](story.md) are the
  authority on what a character or object should be.

## The family system — commonality plus a local color world

A **family** is a biome or roster: a directory under `sprites/` with a
`_family.yaml` that pins its `style:` anchor, its `ground` tile, its local
palette scope, and its animations. Families are how the game stays coherent
across wildly different settings — every sprite shares the medium and the read;
only the color world changes.

Families also make new content **cheap**, and the existing ones show the paths:

- **Recolor a sibling biome.** `mars` builds its rocks and craters as
  `swapPalette` calls over the `moon` grids — a red desert cost zero terrain
  redraws.
- **One chassis, many accents.** The `eastworld` GROK controllers are one drawn
  body with palette-swapped accent colors for the variants.
- **One body, many costumes.** The `merchant` and `hero` costumes share a single
  16×16 body plan and foot anchor, so a costume swap is new grids only — no
  renderer or anchor work.

Reach for a recolor or a shared chassis before drawing a new sprite from
scratch; it keeps a family visually unified for free.

## Derived art — don't hand-draw what the catalog generates

Two whole classes of sprite are **generated from game data**, never drawn by
hand, and must stay that way:

- **Worn gear** — every armor piece derives `worn_<id>` overlays from
  `GEAR_DEFS`, recolored off the piece's icon; a new armor piece needs a def and
  an icon, then `make assets`.
- **Battle damage** — every enemy's `hurt`/`wrecked`/`dying` variants are
  derived from `ENEMY_DEFS` and the enemy's `gore` style; a new enemy needs only
  its def and base frames.

Both are **seeded and frame-stable** so the atlas only diffs when the source
does. When you retune a base sprite, its overlays and wounds regenerate with it.
The one thing to watch is **overlay contrast against the local body color** (a
dark wound on a dark body is invisible) — see [`GAME_NOTES.md`](../.agent/skills/pixel-assets/GAME_NOTES.md)
for this game's wound→effect color pairings.

## Where the sources of truth live

| Concern                                              | Source of truth                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| The feel, the why, the design principles             | **this document**                                                    |
| The fixed medium/framing/read (machine form)         | `STYLE_PREAMBLE` in `scripts/asset-tools/prompt.mjs`                 |
| A family's mood, ground, palette scope               | that family's `_family.yaml` `style:` + `palette`                    |
| What one sprite should look like                     | that sprite's `description` (the acceptance target)                  |
| How to build/iterate a sprite (workflow + checklist) | [`pixel-assets` skill](../.agent/skills/pixel-assets/SKILL.md)       |
| This game's per-family art learnings                 | [`GAME_NOTES.md`](../.agent/skills/pixel-assets/GAME_NOTES.md)       |
| Finding and replacing the worst art                  | [`art-improvement` skill](../.agent/skills/art-improvement/SKILL.md) |

When two tiers disagree, the more specific machine-readable one wins for its own
scope (a family anchor owns that family's mood; a description owns that sprite),
and this document owns the principles that span all of them. A change to the
shared look means editing `STYLE_PREAMBLE` **and** this document together.
