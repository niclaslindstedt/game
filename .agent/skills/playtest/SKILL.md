---
name: playtest
description: "Use to verify gameplay changes in the running game and to evaluate/tune game feel. Drives the real app in headless Chromium with the autoplay bot, screenshots it, and reads out run stats — the closing loop of every gameplay change."
---

# Playtesting

Engine tests prove rules; playtesting proves the game **works and feels
right at 60fps in the real renderer**. Every gameplay/rendering/input
change ends with a playtest before it ships.

## Tooling

| Piece | Role |
| --- | --- |
| `website/scripts/playtest.mjs` | Autoplay bot: starts a run, steers by strategy, screenshots, prints outcome + stats JSON |
| `?debug` URL param | Exposes the live `GameState` as `window.__game` (set in `GameScreen.tsx`) — the bot's (and your) window into the simulation |
| `website/assets-preview/playtest/` | Screenshots land here (gitignored) |

## Running

```sh
# one-time per session — playwright is deliberately not a repo dependency
npm install --no-save playwright

cd website && npx vite --port 5199 &     # dev server
node website/scripts/playtest.mjs --strategy kite   # from the repo root
```

Strategies:

- `kite` — competent play: holds ~180 units off the nearest enemy, inside
  weapon range. Should reliably WIN; if kiting dies, the game got too hard.
- `rush` — reckless play: steers into the nearest enemy. Should be
  DANGEROUS; if rushing wins comfortably, the game got too easy.
- `idle` — no input after start: pure survival clock; sanity-checks enemy
  pressure and that the game doesn't win/lose itself.

The bot prints stats JSON (`outcome`, `hp`, `kills`, `timeMs`, damage in
and out). **Look at the screenshots with the Read tool** (`title.png`,
`gameplay.png`, `end.png`) — visual regressions (HUD overlap, sprite
misalignment, tile patterns, unreadable text) only show up there.

## Evaluating game feel

Judge each run against these expectations, and tune
`src/game/config.ts` (only there — see the `engine-system` skill) until
they hold:

- Kite wins with hp to spare; rush is lethal or close to it. The gap
  between those two is the skill ceiling — keep it wide.
- A cleared level takes on the order of 30s–2min; sub-10s means enemies
  are too passive or the weapon too strong.
- Damage taken should trend > 0 even for kiting on some layouts —
  zero-pressure runs mean spawn distance or enemy speed is off.
- Medkits should sometimes matter: if `itemsCollected` is always 0, they
  spawn too far from the action or heal too little to bother.

For qualitative checks (does steering feel responsive? do sounds mix
well?), run headed: `make website-dev` and play in the browser.

## Extending the bot

New systems usually need a new probe: add a strategy to `playtest.mjs`
(one `case` in `act()`) rather than a separate script, so every behavior
stays runnable from one tool. Keep strategies tiny — a steering decision
per tick from the `window.__game` snapshot.

## Skill self-improvement

When a tuning session settles on a new feel-rule of thumb ("contact damage
above X makes rush unwinnable"), add it to the evaluation list above.
