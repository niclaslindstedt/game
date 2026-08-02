# Capsule art — the generation prompts

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

Attach the moon icon to every generation. It is doing more brand work than
anything else the game ships.

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

> High-resolution pixel-art key art for a 16-bit top-down survival action-RPG.
> Hard-edged pixel rendering, no anti-aliasing on the shapes, no gradients, no
> airbrushed glow, no 3D render, no photorealism. Muted, practical, grounded
> sci-fi — desaturated surroundings with a few small saturated accents that pop
> because everything around them is dull. Palette anchored on near-black
> `#0b0d10`, crimson `#c0392b`, mint `#7ef0c8`, amber `#ffe3b6`. Cinematic and
> readable at a glance. **No text, no lettering, no logo, no watermark anywhere
> in the image.**

The "no text" line is not optional. It is what makes the composite step work.

---

## `header` — 920 × 430

Top of the store page, above the fold. The single most-seen capsule.

> [shared preamble]
>
> Composition: [the hero] stands in the RIGHT third, seen from behind and
> three-quarters, looking up and away at a huge blood-red cratered moon hanging
> low in a black starfield. The moon bleeds — thin dark red rivulets running
> down off its lower limb into the dark. Desaturated grey regolith underfoot,
> hard black shadows, cold vacuum light. The LEFT half is open sky and stars,
> deliberately empty and uncluttered for a logo to sit in. Wide cinematic
> framing.

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

The store front-page carousel. **This is the co-op shot** — the desktop build is
the one with multiplayer, and it is what the 49 SEK buys.

> [shared preamble]
>
> Composition: FOUR astronauts in mismatched white-and-grey EVA pressure suits
> stand together on grey lunar regolith, seen from behind and slightly above,
> facing away toward the horizon — a loose squad, not a posed line-up. Each
> carries a different weapon: a rifle, a heavy blade, a glowing energy staff, a
> shotgun. Their visors and chest lights glow amber and red in the dark. Ahead
> of them a horde of small ragged silhouettes swarms out of the dark toward the
> horizon, and beyond it a huge bleeding red moon. Bottom third is open dark
> ground for a logo. Cinematic, wide, epic in scale but grounded and grimy.

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

The wordmark alone, laid over the hero image. **Do not generate this one.**

Compose it from the game's own pixel font — mint `#7ef0c8`, the same hard drop
shadow the title screen uses (`0 5px 0 rgba(0,0,0,0.55)`), on full transparency.
Capture it from the title screen or redraw it from the font atlas. Every other
capsule can tolerate a model's interpretation; the wordmark cannot, and this one
is nothing but wordmark.

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
2. **Composite the wordmark**, in the game's own pixel font, into the space each
   prompt reserved.
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
