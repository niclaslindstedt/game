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
| `src/game/bot.ts` | The engine autopilot: strategies that turn `GameState` into `GameInput`. One source of truth — headless tests (`tests/engine/bot_test.ts`) and the browser harness both drive THIS code |
| `?bot=<strategy>` URL param | Hands the run to the autopilot in the real app (`GameScreen.tsx`): it dismisses the intro, steers, jumps, and spends level-ups itself |
| `website/scripts/playtest.mjs` | Thin Playwright launcher/observer: opens `?debug&bot=<strategy>`, screenshots, prints outcome + stats JSON |
| `?debug` URL param | Exposes the live `GameState` as `window.__game` (set in `GameScreen.tsx`) — the harness's (and your) window into the simulation |
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
- `boss` — beelines for the boss (or his landmark) and holds at the equipped
  weapon's range: the boss-fight probe, and the fastest route to a clear.
- `survivor` — plays the whole level like a survivors run: farms the horde,
  detours for pickups, pushes for the boss once leveled. The default probe
  for "wander the level and see everything" checks (art passes, tiles).

The bot prints stats JSON (`outcome`, `hp`, `kills`, `timeMs`, damage in
and out). **Look at the screenshots with the Read tool** (`title.png`,
`gameplay.png`, `end.png`) — visual regressions (HUD overlap, sprite
misalignment, tile patterns, unreadable text) only show up there.

The harness runs at a **phone-landscape viewport (844×390)** — the game is
mobile-first (see AGENTS.md) and every "does it fit / can you see it"
judgement must be made at that size, not on a roomy desktop window.

## Evaluating game feel

Judge each run against these expectations, and tune
`src/game/config.ts` (only there — see the `engine-system` skill) until
they hold:

- **Bots are probes, not proof of winnability** (owner's call, 2026-07):
  bot runs are NOT required to survive or win — the repo owner playtests
  winnability by hand, which is more realistic. Use bot runs to measure
  pressure (kills, survival time, damage flow), catch regressions, and read
  screenshots — do not tune the game so a bot wins.
- **This game's concrete feel targets** (run length, horde escalation,
  damage/pickup thresholds) live in [`GAME_NOTES.md`](./GAME_NOTES.md); a
  sequel judges against its own genre's numbers.

For qualitative checks (does steering feel responsive? do sounds mix
well?), run headed: `make website-dev` and play in the browser.

## Extending the bot

New systems usually need a new probe: add a strategy to the ENGINE bot
(`src/game/bot.ts` — a new `BotStrategy` name plus a case in `botAct`),
never to the Playwright script. That one strategy is then instantly
available to headless engine tests (see `tests/engine/bot_test.ts`'s `drive`
helper), to `?bot=` in the real app, and to this harness. Keep strategies
tiny and PURE — a steering decision per tick from the state, no state
mutation, no `state.rng` draws (determinism is the point). The `Bot`
object is the place for per-bot memory later (and the seed for an
AI-controlled second player).

## Skill self-improvement

When a tuning session settles on a new feel-rule of thumb ("contact damage
above X makes rush unwinnable"), record it as a lesson fragment under
`.lessons/` (see [`../LESSONS.md`](../LESSONS.md)) — never by appending to
this file, which conflicts across parallel sessions. Read past ones with
`node scripts/skill-lessons.mjs playtest` before evaluating. During a
consolidation pass, promote settled rules into the evaluation list above.
