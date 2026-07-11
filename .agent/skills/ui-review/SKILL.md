---
name: ui-review
description: "Use for a fit-and-finish pass over the game's UI — screens, modals, popups, toasts. Drives the screenshot-audit loop: capture every surface at the nine reference viewports (phones down to the SE floor, iPads and iPad mini in both orientations, desktop), evaluate against the quality bar, unify anything that drifted off the shared window skin, fix what clips or overflows, and verify with re-captures."
---

# UI Review — audit and consolidate every screen

The game's UI drifts the way all game UI drifts: new modals ship with ad-hoc
dressing, a new row makes a menu taller than a landscape phone, a caption
gets added at a size that reads on desktop and vanishes on a phone. This
skill is the periodic sweep that catches all of it at once — **look at every
surface, judge it, fix it, look again**. Never evaluate UI from code alone;
the failures (clipping, overlap, bleed-through, tiny text) only show up in
pixels.

## Tooling

| Piece | Role |
| --- | --- |
| `website/scripts/ui-shots.mjs` | The capture harness: screenshots EVERY screen/modal/popup/toast at all nine viewports into `website/assets-preview/ui-review/<viewport>/` (gitignored) |
| `?debug` + `window.__game` | Forces the rare in-game phases (levelup, respec, shop, dialogue, choice, victory, defeat) without waiting for organic triggers |
| `?bot=kite` | Plays for real so the organic surfaces (pickup cards, feed, achievement toasts, a loot-filled bag) exist to capture |
| `?cutscene=<id>` | Deterministic cutscene capture via the standalone workbench |
| Read tool on the PNGs | The evaluation itself — every judgement is made on a screenshot, not on source |

## Running

```sh
npm install --no-save playwright          # once per session — not a repo dep
cd website && npx vite --port 5199 &      # dev server
node website/scripts/ui-shots.mjs         # all nine viewports (~25 min)
node website/scripts/ui-shots.mjs --only land             # just the reference
node website/scripts/ui-shots.mjs --only padl,padp,minil,minip  # tablets
```

The nine viewports and what each is for:

- **`land` 844×390** — the mobile-first reference (AGENTS.md). Every
  fits/reads judgement is made here FIRST; a surface that fails here is
  broken, full stop.
- **`port` 390×844** — vertical phone: narrow columns, stacked layouts, the
  bottom-edge docks.
- **`sel` 667×375 / `sep` 375×667** — the small-phone floor (iPhone SE
  class): the tightest 1× layouts. Anything tuned to *exactly* fit the
  844×390 reference (wide folds, three-button rows, long labels) runs out
  of room here first.
- **`padl` 1180×820** — iPad landscape. Past the 2× UI-scale breakpoint
  (`UI_SCALE_BREAKPOINT_PX`), so its *effective* layout space is 590×410 —
  **narrower than the landscape phone**. Anything that fits 844×390 only
  because of horizontal room breaks here first.
- **`padp` 820×1180** — iPad portrait. Also 2×-scaled: effective 410×590,
  **much shorter than the portrait phone** — tall single-column stacks that
  fit an 844px-tall phone must scroll or fold here, never clip.
- **`minil` 1133×744 / `minip` 744×1133** — iPad mini, both orientations.
  The harshest 2× cases: effective 566×372 landscape and 372×566 portrait —
  *smaller than every phone layout in both axes*. If a surface survives the
  mini, it survives every tablet.
- **`desk` 1440×900** — the 2× root-font breakpoint at desktop size:
  confirms the rem-scaled UI grows in lockstep and nothing depends on
  physical pixels.

The tablet viewports are the harsh cases of the 2× regime: they pass the
`≥700px on both axes` gate like a desktop, but after doubling they have
*less* effective room than the phone baseline. Judge them like a cramped
phone, not like a desktop — and remember media queries see the *physical*
CSS viewport (1180×820), so width/height-gated rules written for phones
silently miss the iPad even when its effective space matches a phone's.

Steps are tolerant: a surface that can't be reached logs `FAILED <step>` and
the sweep continues. Two captures are content-coupled and may need flags or a
one-off tweak: the SPARE/KILL choice needs a spareable elite def id
(`--spareable`, default `nikola_tesla`), and the PWA **update prompt** has no
organic dev trigger — to verify it, temporarily OR a URL-param check into
`needRefresh` in `App.tsx`, screenshot, and revert before committing.

## The quality bar

Judge every screenshot against this list. It is the distilled outcome of
past sweeps — extend it when a new rule of thumb settles.

1. **Nothing clips or overlaps at 844×390.** Tall content must scroll (or
   compress via a landscape fold) — never silently overflow a fixed-center
   flex column. Watch for flex children shrinking INTO each other: any
   scrollable column needs `flex-shrink: 0` on its rows and spacer-based
   centering (`::before/::after { flex: 1 }`) or `margin: auto` so it centers
   when it fits and scrolls when it doesn't.
2. **One window skin.** Every modal/panel/prompt wears the FF6 window skin —
   the `--panel-*` tokens in `styles.css` (fill gradient, rail borders,
   radius, shadow). A flat slab with its own border color is drift; re-skin
   it. Full-screen browsers must not let the screen underneath paint through
   (hide the underlying layer; don't just crank backdrop opacity).
3. **Essential text ≥ pixel-scale 2.** Scale 1 (~7 CSS px on a phone) is
   only for true captions (version footer, dates, per-slot labels squeezed
   under small cells). Section headers, button labels, empty-state hints,
   and anything the player must read to act: scale 2 minimum. Don't inflate
   everything either — small captions are part of the look.
4. **Landscape folds, portrait stacks.** The short axis is ~390px in
   landscape: fold long single columns into 2–3 column grids under
   `@media (min-aspect-ratio: 4/3)` (stat buttons, respec rows, splash
   stats, info panels all do this). Portrait gets the single column back.
5. **Backdrop dim must beat the moon floor.** The play field is bright;
   text floating over a frozen frame needs ~0.85+ dark backdrop or its own
   panel. Check victory/defeat especially.
6. **Buttons look pressable.** Primary actions are `pixel-button` (mint,
   chunky shadow), secondary actions `pixel-button secondary` — not bare
   text rows. CLOSE/BACK labels match across modals (same scale, same
   family).
7. **Safe areas + reduced motion.** Anything pinned to a screen edge uses
   `env(safe-area-inset-*)`; every decorative animation has a
   `prefers-reduced-motion` fallback that keeps the information.
8. **Scroll state resets.** A screen that swaps content in a shared scroll
   container must scroll back to the top on change (a `scrollIntoView` on a
   selected row can otherwise land a fresh screen mid-scroll).

## Process

1. **Capture the baseline.** Run the harness on a clean tree; skim EVERY
   PNG with the Read tool, landscape first. List findings in two buckets:
   *broken* (clips, overlaps, bleed-through, unreachable) and *drift*
   (off-skin, undersized, inconsistent). Note the surfaces that are already
   strong — they define the bar, and the list proves the sweep was total.
2. **Fix structurally, not per-symptom.** Prefer the shared fix (a scroll
   wrapper, the panel tokens, a fold breakpoint) over per-screen nudges;
   most drift exists because a surface predates a shared pattern. New CSS
   goes next to the component's existing block in `styles.css` with the
   comment style around it.
3. **Re-capture and re-look.** Same harness, same viewports. Diff by eye
   against the baseline; a fix that helps landscape can break portrait.
4. **Gates + ship.** `make build && make test && make lint && make
   fmt-check`, a changeset fragment when anything user-visible changed,
   then the `commit` skill. Presentation-only passes rarely need new tests;
   engine untouched means the suite should be green unmodified.

## Forcing the rare phases (how the harness does it)

The engine state is live at `window.__game` under `?debug`; phases are
plain mutations because rendering reads state every frame:

| Surface | Force |
| --- | --- |
| Level-up chooser | `g.player.pendingStatPoints = 1; g.levelUpFxMs = 1` (next playing tick opens it) |
| Respec | `g.player.pendingStatPoints = N; g.phase = "respec"` |
| Shop | `g.merchant.discovered = true; g.phase = "shop"` |
| Dialogue | `g.dialogue = { source: { kind: "merchant", levelId: g.level.id }, page: 0 }; g.phase = "dialogue"` (a real def on every level, so the portrait resolves) |
| Choice + companion | Push a synthetic 0-hp enemy with a spareable `defId` onto `g.enemies`, set `g.choice`, `g.phase = "choice"`, then click SPARE — the join dialogue and companion panel follow for free |
| Victory / defeat | `g.phase = "victory"` / `g.player.hp = 0` |
| Developer menu / warp / arsenal | Pre-seed `localStorage` `<storagePrefix>:settings` with `{"developerUnlocked": true}` before load |

Keep the harness in sync: a new overlay, a renamed aria-label, or a new
`GamePhase` gets a step (or a fixed selector) in `ui-shots.mjs` in the same
change that ships it — a surface the harness can't reach is a surface no
sweep will ever look at.

## Skill self-improvement

When a sweep settles a new quality rule ("essential text ≥ scale 2",
"legendary glow is reserved"), add it to **The quality bar** above. When a
new surface or trigger lands, add the row to the forcing table and the step
to the harness.
