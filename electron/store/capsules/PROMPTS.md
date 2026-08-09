# Capsule art — generation starting points

> The approved PNGs have been iterated beyond these starting prompts. Their
> sibling `<asset>.md` files are the canonical scene inventories and promise
> audits. Revisions must start from the approved raster plus those sidecars,
> not regenerate an obsolete scene from this document.

The capsules are the one store asset with no generator (`../../RELEASING.md`
§3): they are marketing art with the logo laid out per aspect ratio, and
nothing in this repo would produce something honest at 748×896. This file is
the next best thing — a paste-ready prompt per capsule, written from the game's
own sources of truth so a generated image lands in the same world the game is
drawn in.

Drop the finished PNGs in this directory as `<name>.png`. `make store-preflight`
names the ones still missing and **fails on one that is the wrong size** — Valve
is strict about the rasters and so is the checker.

---

## Before you generate anything

### The one rule that saves a redo

**Never let the model render the lettering.** Image models cannot spell
reliably, and a wordmark with a mangled apostrophe on the store page is worse
than no capsule at all. Generate every capsule as **art with empty space where
the logo goes**, then composite the real wordmark in afterwards — the game's own
pixel font, from the title screen. That also keeps the store lettering identical
to the lettering in the game, which is the whole point of a wordmark.

The prompts below are written that way: each one asks for a clear area and says
where.

### Reference images to attach

| File                             | What it gives the model                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `pwa/public/pwa-512x512.png`     | The bleeding red moon — the game's strongest single image      |
| `pwa/public/icon.svg`            | The same mark, clean vector                                    |
| `pwa/public/og-default.png`      | The existing social card — closest thing to key art already    |
| A screenshot of the title screen | The mint wordmark in the game's pixel font, and the starfield  |
| `../screenshots/*.png`           | What the game actually looks like, once `--only steam` has run |
| `header.png`                     | The canonical key-art style: conceptual, cohesive pixel poster |

Attach the moon icon to every generation. It is doing more brand work than
anything else the game ships.

Use `header.png` as the visual-style reference for every capsule after the
header. It establishes the intended distance from gameplay: recognizably the
same world, palette, hero, horde pressure, powers and loot loop, but composed as
conceptual key art rather than a counterfeit screenshot.

### One level of abstraction throughout

The capsule art must not mix literal in-game sprites with invented effects,
pickups or scenery. That lands in an uncanny middle where part of the image
claims to be gameplay and the rest breaks the claim.

Instead, reinterpret **every** element at the same concept-art level used by
`header.png`: chunky poster-like pixel clusters, simplified symbolic horde
shapes, broad terrain forms, and graphic attack and loot motifs. Preserve the
game's identity and loop, not the exact sprite grids. In particular:

- never copy a shipped sprite, tile, pickup or HUD element one-for-one;
- never frame the capsule as a gameplay screenshot or reproduce the HUD;
- keep the hero stocky, practical and ordinary, but allow a larger, more iconic
  three-quarter-overhead pose than the 16x16 gameplay doll;
- communicate combat, powers and rewards with abstract arcs, bolts, fragments,
  gems, discs and weapon silhouettes rather than fake inventory icons;
- use one consistent pixel density and degree of detail across characters,
  enemies, terrain, effects and props.

### The palette, verbatim

| Role              | Hex                               | Where it comes from                                |
| ----------------- | --------------------------------- | -------------------------------------------------- |
| Wordmark mint     | `#7ef0c8`                         | `styles.css` `--accent`, the title logo            |
| Void black        | `#0b0d10`                         | `--surface-3`, the app's background and `BRAND_BG` |
| Subtitle grey     | `#9aa3ad`                         | the tagline under the logo                         |
| Moon crimson      | `#c0392b` → `#e74c3c`             | the app icon                                       |
| Visor amber       | `#ffe3b6`                         | the hero's gold visor glow                         |
| Suit white / grey | `#f4f4f4` / `#d6dce4` / `#5c6474` | the hero's EVA suit                                |

Saturated color is **rare and earned** in this game (`docs/art-style.md`): muted
practical surroundings, then a handful of bright accents — the visor, the red
chest light, a weapon's glow. A capsule that is bright everywhere is off-brand.

### The hero, described once

Reused by every prompt below, so it stays the same man in all eight:

> A short, stocky, top-heavy astronaut with broad shoulders in a plain
> white-and-grey working EVA pressure suit — a big rounded helmet dome over a
> compact bulky torso and stubby boots, a boxy grey life-support unit on the
> chest with a single small red indicator light, and a horizontal gold visor
> band across the helmet glowing amber along its lower edge. Recovered working
> gear, not a sleek hero suit.

He is a laid-off shipbuilder chasing his girlfriend Ada off-planet — an ordinary
man in hostile places, never a chrome space marine.

### The shared preamble

Paste this above every prompt that follows:

> Cohesive high-resolution pixel-art poster for a 16-bit top-down survival
> action-RPG. Conceptual key art, deliberately not a gameplay screenshot:
> reinterpret every character, enemy, prop, effect and terrain form at one
> consistent level of abstraction, following the attached `header.png`. Use
> deliberately chunky pixel clusters, crisp stepped silhouettes and a limited
> palette; flat graphic shading with two or three tones per form; no smooth
> gradients, airbrushed glow, 3D rendering or photorealism. Muted, practical,
> grounded sci-fi — desaturated surroundings with a few small saturated accents
> that pop because everything around them is dull. Palette anchored on
> near-black `#0b0d10`, crimson `#c0392b`, mint `#7ef0c8`, amber `#ffe3b6`.
> Cinematic and readable at a glance. Never copy an in-game sprite or UI icon
> one-for-one. **No text, no lettering, no logo, no watermark anywhere in the
> image.**

The "no text" line is not optional. It is what makes the composite step work.

---

## `header` — 920 × 430

Top of the store page, above the fold. The single most-seen capsule.

> [shared preamble]
>
> Composition: a wide conceptual combat tableau matching the attached
> `header.png`. [The hero] occupies the RIGHT half in a compact
> three-quarter-overhead poster pose, cutting a path through a spiral of
> simplified horde silhouettes. Broad lunar slabs dissolve into black space.
> Graphic mint attack arcs, angular bolts, crimson impact fragments and a few
> abstract loot relics communicate the game's automatic combat and reward loop
> without resembling literal UI icons. A huge bleeding red cratered moon anchors
> the upper-right. The LEFT 42% is open near-black sky, deliberately calm and
> uncluttered for the real wordmark. Everything shares one pixel density and one
> concept-art abstraction; it must not resemble a gameplay capture.

Composite the mint wordmark into that left half.

## `small` — 462 × 174

Search results and top-seller rows, shown tiny. Ruthless simplicity — anything
with more than two elements turns to mud at this size.

> [shared preamble]
>
> Composition: an extreme close-up of a single astronaut helmet — a rounded
> white-and-grey dome with a horizontal gold visor band glowing amber — filling
> the RIGHT third of a very wide, short banner. Reflected in the visor, small
> and clear: a red cratered moon. The rest is flat near-black `#0b0d10` with a
> scatter of faint stars, empty and clean. Extremely high contrast; must stay
> legible shrunk to thumbnail size.

Wordmark goes in the empty left two-thirds. Check it at 25% zoom before you
accept it — that is roughly how it will be seen.

## `main` — 1232 × 706

The store front-page carousel. **This is the co-op shot** — the desktop build
supports up to eight players, while four figures keep the capsule readable and
must not be described as the player cap.

> [shared preamble]
>
> Composition: FOUR of the possible EIGHT astronauts in mismatched
> white-and-grey EVA pressure suits make a loose cooperative stand on cratered
> lunar regolith, seen from behind and slightly above. They use the shipped
> Surplus Carbine, Scrap Greatsword, Pulsar Rod plus the separate Storm Call
> talent, and Blunderbuss. A varied Moon horde surrounds them: common ghosts,
> wisps, lost cosmonauts, purple wraiths, the prospector and quarantine medic,
> with the elite Selene Drowned in its antique brass diving helmet. The
> Flagbearer boss lurks at the dark horizon beside its flag. Ada is a tiny,
> unarmed figure beyond the enemy line—a narrative destination, never a party
> member. Earth hangs above the lunar horizon; do not place another moon in the
> sky or reflect one on the ground. Pale mint ectoplasm, compact muzzle flashes,
> one cleave, narrow amber loot beams, and Storm Call are the only effects.
> Bottom ground remains calm enough for the real wordmark. Cinematic and wide,
> but grounded in the shipped roster and mechanics.

## `vertical` — 748 × 896

Seasonal sale pages. Tall portrait, so the composition stacks rather than
spreads.

> [shared preamble]
>
> Composition: a TALL vertical poster. The huge bleeding red cratered moon fills
> the upper half against a black starfield, its red rivulets running down toward
> the middle. Below it, small and alone at the bottom, [the hero] stands on a
> grey regolith ridge seen from behind, dwarfed by the moon above him, his amber
> visor and red chest light the only warm points in the frame. Strong vertical
> flow from the moon down to the tiny figure. The lower quarter is dark and open
> for a logo.

## `library` — 600 × 900

The player's own library grid — seen by someone who already owns it, so it can
be moodier and less salesy than the store capsules.

> [shared preamble]
>
> Composition: a tall vertical portrait. [the hero] stands centered, facing the
> viewer, framed from the knees up, helmet dome catching a rim of cold light,
> gold visor band glowing amber, one red chest indicator lit. He holds a
> weathered rifle low across his body. Behind him, out of focus and dark: a red
> moon low on a black horizon and the faint silhouettes of a ragged horde.
> Portrait-poster framing, quiet and grim rather than action-packed. Clear dark
> space across the bottom fifth for a logo.

## `library-header` — 920 × 430

Shown in the recent-games row. Same raster as `header`, so it can reuse that
art — but a second, quieter composition reads better next to other owned games.

> [shared preamble]
>
> Composition: a wide banner. [the hero] walks LEFT to RIGHT across grey lunar
> regolith in profile, mid-stride, small in the frame, casting a long hard black
> shadow. A red bleeding moon sits low and large behind him on the right. Wide
> empty sky above. Lonely, travelling, unhurried — a man following a trail.
> Right third kept dark and clear for a logo.

## `library-hero` — 3840 × 1240

The library detail page's banner. **No text at all** — Valve overlays the
`library-logo` on top of this, so any lettering baked in collides with it. It is
also extremely wide, and the sides get cropped on narrower windows: keep
everything that matters in the middle third.

> [shared preamble]
>
> Composition: an ultra-wide panoramic vista, no figures dominant. A vast grey
> lunar plain under a black star-dense sky, a colossal bleeding red moon rising
> dead CENTER on the horizon, its red rivulets running down into the dust.
> Scattered wreckage and a half-buried lander in the mid-ground. Four tiny
> astronaut silhouettes walk toward the moon, small enough to read as scale
> rather than as characters. Everything important held in the middle third of
> the frame; the far left and right edges are empty plain and sky. Deep
> atmospheric perspective. Absolutely no text.

## `library-logo` — 1280 × 720, transparent PNG

The wordmark alone, laid over the hero image. **Do not generate this one — a
script draws it:**

```sh
node scripts/generate-steam-library-logo.mjs   # → capsules/library-logo.png
```

It renders `ADA'S TRAIL` from the same glyph source the title screen uses, in
mint `#7ef0c8` over the same hard drop shadow (`0 5px 0 rgba(0,0,0,0.55)`),
centred on full transparency. Every other capsule can tolerate a model's
interpretation; the wordmark cannot, and this one is nothing but wordmark.

Optional: set the bleeding red moon beside or above the lettering as a mark.

## `page-background` — 1438 × 810 (optional)

Not required. If you want one, Valve's own guidance is that it should be
unobtrusive — the store page's content sits on top of it.

> [shared preamble]
>
> Composition: a dark, low-contrast background texture — a near-black starfield
> with a faint red glow bleeding in from one corner and a suggestion of grey
> regolith along the bottom edge. Almost empty. Nothing sharp, nothing centered,
> no figures. Designed to sit behind text and UI without competing with it.

---

## After you generate

1. **Check the raster exactly.** `make store-preflight` fails on a capsule that
   is one pixel off. Crop or re-render rather than letting an upscaler guess.
2. **Composite the wordmark** into the space each prompt reserved — a script
   does it, from the game's own pixel font, so the lettering cannot drift:

   ```sh
   node scripts/composite-steam-wordmarks.mjs
   ```

   It writes over `header`, `small`, `main`, `vertical`, `library` and
   `library-header` **in place**, so run it exactly once against fresh art-only
   rasters; the per-capsule scale and position are the `specs` table at the top
   of the script, and a re-composed capsule is where you change them.

3. **Look at each one small.** The `small` capsule at thumbnail size and the
   `library` capsule in a grid of other games are the two real tests.
4. **Declare the AI use.** Valve's content survey has a section for
   AI-generated content and it is surfaced on the store page. Store art counts.
   Fill it in — it is a checkbox, not a stigma, and omitting it is a problem.
5. **Keep them honest.** A capsule that misrepresents the game gets rejected,
   and a painted illustration over a pixel game converts badly besides — players
   click through, see something else, and bounce.

The art these prompts describe is the game in `docs/art-style.md`: grounded,
working-man sci-fi, muted and practical, no fantasy gloss and no neon sheen for
its own sake. When a generation comes back glossy, chrome and heroic, that is
the thing to correct — it is the failure mode every model defaults to.
