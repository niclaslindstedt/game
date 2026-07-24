---
name: visual-effects
description: "Use when creating or tuning a transient VISUAL EFFECT — an explosion, muzzle flash, hit splash, aura, screen flash, weather, a death/spawn flourish, or any short-lived combat/world FX. Covers the two FX systems (world-anchored canvas effects and screen-space CSS DOM overlays), how an engine event drives a drawn effect, the ?debug preview-hook + Playwright screenshot loop, and the craft rules (t-driven timelines, additive light, determinism, layering, reduced-motion, performance) that make an effect read as spectacular instead of muddy."
---

# Authoring & tuning visual effects

Transient FX are **presentation only** — the engine (`src/`) knows nothing of
them. It emits an EVENT; the app turns that event into a short-lived drawn
effect. Keep every effect out of the simulation: an effect must never change
what happens, only how it looks.

There are **two rendering surfaces**. Pick by what the effect is anchored to:

| Surface | Use for | Lives in |
| --- | --- | --- |
| **Canvas** (`drawEffects`) | WORLD-anchored FX that pan with the camera, ride a specific mob/spot, or spawn in the dozens (hit splashes, corpses, embers, shockwave rings, per-mob incineration, novas, muzzle flashes) | `pwa/src/game/render/effects.ts` (the `Effect` union + one draw branch per `kind`) |
| **CSS DOM overlay** | SCREEN-space atmosphere that wants blur, blend modes, bloom, god-rays, or a full-screen wash — usually ONE instance at a time (the nuke flash, a damage vignette, a level-clear glow) | an imperative driver in `pwa/src/game/game-screen/*-fx.ts` + keyframes in `pwa/src/styles.css` + a layer div in `ScreenChrome.tsx` |

Signature per-weapon/spell looks are their own catalogs — **use the dedicated
skill** instead: `weapon-fx.ts` (slash/muzzle styles → `weapon-system` skill),
`spell-fx.ts` (cast blooms → `spell-fx` skill).

## The flow: event → effect → draw

1. **The engine emits an event.** Add/extend a variant in
   `src/game/types/events.ts` and push it from the step where it happens
   (`state.events.push({ type: "…", pos, … })`). Carry only DATA the app needs
   (position, a size, a style tag). To mark a subset of an existing event (e.g.
   "this kill was a nuke kill"), thread a boolean **through the call chain onto
   the event** — see how `incinerated` rides `hitEnemy → killEnemy →
   enemyKilled` for the nuke.
2. **The app turns the event into an `Effect`.** In
   `pwa/src/game/game-screen/event-fx.ts`, push an `Effect` with a `kind`, a
   `pos`, `untilMs = state.stats.timeMs + LIFE`, `durationMs = LIFE`, and any
   per-effect fields (`sprite`, `seed`, `angle`, a style). Reuse existing
   `Effect` fields before adding new ones.
3. **`drawEffects` renders it every frame** by progress `t = 1 − (untilMs −
   timeMs) / durationMs` (0→1 over its life). Add one `if (effect.kind ===
   "…")` branch. The clock is `state.stats.timeMs` (the SIM clock — a frozen or
   slowed run slows the effect with it).

For a CSS overlay the flow is the same up to step 2, but instead of pushing an
`Effect` you call an imperative driver from GameScreen's event pass (see the
nuke: `if (event.type === "nuke") nukeFx.fire(clientX, clientY)`), and the
animation is CSS keyframes, not a per-frame draw.

## Adding a CSS DOM overlay (the nuke pattern)

Mirror `createNukeFx` (`game-screen/nuke-fx.ts`) / `createTapFx`
(`game-screen/bot-feedback.ts`):

1. A factory `createXFx(ref)` that appends a burst node to a layer div and
   `setTimeout`s its removal after the longest sub-animation. Set ground zero as
   CSS custom props (`--nx`/`--ny` in px) so every layer's radial gradients and
   `transform-origin` pin to it. Generate varied children (flames, puffs) with
   inline `--vars` + `animationDelay` — `Math.random` is fine here (cosmetic
   DOM, not a deterministic per-frame draw).
2. A layer div in `ScreenChrome.tsx` (`<div ref={xFxRef} className="x-fx-layer"
   aria-hidden />`), `pointer-events: none`, a `z-index` that sits where you
   want it in the stack (the nuke washes over the HUD at 95, under the modals it
   can never fire under).
3. Keyframes in `styles.css`. Use `mix-blend-mode: screen` for light/fire so it
   ADDS over the dark field (white → white-out, black → nothing), `soft-light`
   for a color grade, `filter: blur()` for softness. Always add a
   `@media (prefers-reduced-motion: reduce)` variant that collapses to a brief
   flash.
4. Wire the ref through GameScreen (`useRef` → `createXFx` → pass to
   ScreenChrome → `.fire()` in the event pass → `.dispose()` in teardown).

## The iterate loop — build a preview, then LOOK

Never tune an effect blind. Give yourself a way to fire it on demand and
screenshot it in the REAL game:

1. **Add a `?debug` hook** in `run-setup.ts` (guarded by `params.has("debug")`)
   that triggers the effect, mirroring `window.__cast` / `window.__nuke`. If the
   trigger is an engine event consumed each tick, latch a flag on `tuning` and
   fire it POST-STEP in GameScreen's loop (a console push into `state.events` is
   wiped by the next `step()`'s `state.events = []`). Document the hook in
   `docs/configuration.md`'s `?debug` row.
2. **Write a Playwright preview** (`pwa/scripts/<x>-preview.mjs`) modelled on
   `nuke-preview.mjs` / `spell-preview.mjs`: boot into a level (menu walk +
   `?scenario=` to stage the situation), fire the hook, and screenshot a
   schedule of wall-clock offsets across the effect's life into
   `pwa/assets-preview/<x>/` (gitignored) + a `strip.html` contact sheet.
3. **Run it and READ the frames** with the image tools. Judge each stage; refine
   the worst; re-run. Repeat until every beat reads.

Run it (from `pwa/`, over a dev server with assets built):

```sh
npm run assets && npx vite --port 5199 &
node scripts/nuke-preview.mjs           # → pwa/assets-preview/nuke/
```

Gotchas the nuke work surfaced (also in `.lessons/`): `?scenario` `freeze:true`
STOPS the sim clock, so canvas effects (which animate on `state.stats.timeMs`)
freeze too — stage with `disarmed` + a spawn ring instead; a staged elite/boss
can trigger an arrival `dialogue` that parks the run, so drive with
`?bot=survivor` (it taps through) or tap `(422,195)` until `phase==="playing"`;
and screenshot latency (~40ms) drifts early frames later than their label, so
lean on the mid/late frames to judge fast stages.

## Craft rules — what makes it spectacular, not muddy

- **Multi-stage timeline.** A flat fade reads cheap. Drive distinct beats off
  `t`: a hard flash → a bloom → the body → the aftermath. Give each its own
  sub-window (`clamp01((t - a) / (b - a))`). A nuclear DOUBLE-flash (peak, dip,
  brighter peak, long decay) reads far better than one ramp.
- **Additive light.** Fire, flashes, muzzle glow, embers are LIGHT — draw them
  additively: canvas `ctx.globalCompositeOperation = "lighter"` (reset to
  `"source-over"` after), CSS `mix-blend-mode: screen`. Never a flat opaque disc
  over the scene — that punches a hole (the nuke's early "dark core" bug was an
  opaque scorch/smoke plug over the bright fireball; the fix was to delay the
  dark layers until AFTER the light peak).
- **Layer order = light under, dark/flash considered.** Paint the glow and
  fireball first, the smoke and the blinding flash last. Reveal aftermath (char,
  scorch, skeleton) only as the bright phase clears, not during it.
- **Determinism on canvas.** A draw runs every frame for the SAME `t`; it must
  look identical each time. Use `fract(seed + i*k)` / `shared.ts`'s helpers for
  scatter — **never `Math.random()` in a draw branch** (it reshuffles every
  frame and breaks pause/replay). Carry a `seed` on the `Effect` so a whole
  incinerated horde flickers out of step. (`Math.random` at effect-SPAWN time in
  `event-fx.ts`, or in a one-shot CSS driver, is fine.)
- **Ease, don't lerp.** `t*(2-t)` (ease-out) for a burst throwing outward,
  `1-(1-t)²` for a wipe settling in. Linear motion reads robotic.
- **Pixel crispness.** Round screen coords (`Math.round`), scale sprites by
  INTEGER factors (`Math.max(1, Math.round(h / sprite.height))`) so the pixel
  art stays sharp.
- **Cull, unless full-screen.** `drawEffects` culls off-screen effects by a
  reach margin; only a genuine whole-screen effect (the nuke flash) opts out.
- **Performance vs frequency.** A rare panic-button blast can be lavish (dozens
  of embers, per-mob fire+smoke); a per-hit splash or a proc nova fires
  constantly and must stay cheap. Size the budget to how often it plays.
- **Reduced motion.** Every screen-filling or flashing effect needs a
  `prefers-reduced-motion` fallback (a soft flash, no churn).
- **New sprites** for an effect go in `content/sprites/effects/<name>.yaml`
  (see `charred_skeleton` — a pixel grid + palette), regenerated with
  `make assets`; draw them via `spriteByName(assets.sprites, "<name>")`. Verify
  the sprite with `node scripts/sprite-preview.mjs names <name> --scale 14`
  before wiring it in (see the `pixel-assets` skill).

## Worked example — the screen-nuke

The nuke is the reference for a big, layered effect split across BOTH surfaces:

- **Canvas** (`effects.ts` `"nuke"` / `"incinerate"`): world-anchored shockwave
  rings, a spray of seeded embers, a scorch that fades in as the blast clears,
  and per-caught-mob incineration (the body burns and fades → a
  `charred_skeleton` sprite emerges → ember glow + rising smoke → fade).
- **CSS** (`nuke-fx.ts` + `styles.css` `.nuke-*`): the full-screen blinding
  double-flash, the expanding light bloom, rotating god-rays, the cooling
  fireball, licking flames, billowing smoke, and a hot color grade.
- **Engine tag**: `incinerated` threads `detonateNuke → hitEnemy → killEnemy →
  enemyKilled` so the app knows which kills to burn.
- **Preview**: `window.__nuke()` (`debugDetonateNuke`) + `nuke-preview.mjs`.

## Ship checklist

- [ ] Effect is presentation-only — no simulation state touched.
- [ ] Right surface (canvas for world/many, CSS for screen-space atmosphere).
- [ ] Timeline has distinct beats driven by `t`; light is additive; aftermath
      reveals after the bright peak.
- [ ] Canvas draw is deterministic (seeded, no per-frame `Math.random`); coords
      rounded, sprite scale integer.
- [ ] `prefers-reduced-motion` fallback for anything full-screen/flashing.
- [ ] A `?debug` hook + a `*-preview.mjs`, and you LOOKED at the frames.
- [ ] New event fields / sprites documented; `docs/configuration.md` updated for
      a new hook; a `.changes/unreleased/` fragment for the user-visible change.
- [ ] `make lint`, `make fmt-check`, `make test` green.
