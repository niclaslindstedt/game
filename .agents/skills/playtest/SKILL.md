---
name: playtest
description: "Use to verify gameplay changes in the running game and to evaluate/tune game feel. Drives the real app in headless Chromium with the autoplay bot, screenshots it, and reads out run stats — the closing loop of every gameplay change."
---

# Playtesting

Engine tests prove rules; playtesting proves the game **works and feels
right at 60fps in the real renderer**. Every gameplay/rendering/input
change ends with a playtest before it ships.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs playtest --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## Tooling

| Piece | Role |
| --- | --- |
| `engine/game/bot/index.ts` | The engine autopilot: strategies that turn `GameState` into `GameInput`. One source of truth — headless tests (`tests/engine/bot_test.ts`) and the browser harness both drive THIS code |
| `?bot=<strategy>` URL param | Hands the run to the autopilot in the real app (`pwa/src/game/game-screen/bot-driver.ts`): it dismisses the intro, steers, jumps, and spends level-ups itself. **It does NOT start a run** — see below |
| `pwa/scripts/playtest.mjs` | Thin Playwright launcher/observer: opens `?debug&bot=<strategy>`, WALKS THE MENUS into a run, screenshots, prints outcome + stats JSON |
| `?debug` URL param | Exposes the live `GameState` as `window.__game` (stamped in `pwa/src/game/game-screen/run-setup.ts`) — the harness's (and your) window into the simulation |
| `pwa/assets-preview/playtest/` | Screenshots land here (gitignored) |

### `?bot=` DOES NOT START A RUN, and a canvas is not proof that one started

Navigating to `?debug&bot=balanced&level=boot_hill` lands on the TITLE MENU and
stays there. The param says who steers a run once there is one; something still
has to press NEW GAME, name a hero, pick a rung and pick a level. That is the
menu walk in the middle of `playtest.mjs`, and it is most of what that script
is — so **drive a run through `playtest.mjs`, or copy its walk. Never hand-roll
a `page.goto` and assume you are in one.**

The reason this is worth a section rather than a footnote is how it fails:
**silently, and looking like a result.** The title backdrop is a `<canvas>`, so
`waitForSelector("canvas")` resolves on the menu; a screenshot looks like a game
because the menu is pretty; and a benchmark reports plausible, stable, entirely
meaningless numbers. It cost this repo one confident "35% less CPU per frame"
that was really the title screen versus the title screen. The same trap swallows
any STAGED precondition — a door held shut, a hero left unarmed, a mob parked in
a doorway — so assert the state in the probe and fail loudly when it does not
hold, rather than trusting a screenshot to look wrong. Wait for something
only a RUN has — `window.__game` (`?debug`), the HUD, a mob — and if you are
measuring, print a run statistic (kills, damage) beside the measurement so a
reading taken on the menu is obviously wrong rather than quietly wrong.

## Running

```sh
# playwright is a devDependency — `npm ci` installs it. Only its browser
# binaries are separate, and this environment already ships one: launch with
# `executablePath` (playtest.mjs defaults to /opt/pw-browsers/chromium), and
# never run `playwright install`.

cd pwa && npx vite --port 5199 &     # dev server
node pwa/scripts/playtest.mjs --strategy kite   # from the repo root

# every mission's map is carved per run, at the one size its blueprint prices
node pwa/scripts/playtest.mjs --strategy survivor --level goodco_hq

# how LONG the run is given is `--timeout`, in SECONDS (default 120) — there is
# no `--seconds`, and an unknown flag is silently ignored rather than refused
node pwa/scripts/playtest.mjs --strategy idle --level goodco_hq --timeout 20
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
- `aggro` / `flee` / `balanced` — the three POSTURES, the same horde-survival
  read at three aggression levels. `balanced` is exactly `survivor` (kept as an
  alias); `aggro` closes and holds tight, tolerating more bodies before it
  punches out; `flee` holds far and disengages early. The full list is
  `BOT_STRATEGIES` in `engine/game/bot/state.ts` — eight names.

The bot prints stats JSON (`outcome`, `hp`, `kills`, `timeMs`, damage in
and out). **Look at the screenshots with the Read tool** (`title.png`,
`gameplay.png`, `end.png`) — visual regressions (HUD overlap, sprite
misalignment, tile patterns, unreadable text) only show up there.

The harness runs at a **phone-landscape viewport (844×390)** — the game is
mobile-first (see AGENTS.md) and every "does it fit / can you see it"
judgement must be made at that size, not on a roomy desktop window.

## Evaluating game feel

Judge each run against these expectations, and tune
`engine/game/config/` (only there — see the `engine-system` skill) until
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
(`engine/game/bot/index.ts` — a new `BotStrategy` name plus a case in `botAct`),
never to the Playwright script. That one strategy is then instantly
available to headless engine tests (see `tests/engine/bot_test.ts`'s `drive`
helper), to `?bot=` in the real app, and to this harness. Keep strategies
tiny and PURE — a steering decision per tick from the state, no state
mutation, no `state.rng` draws (determinism is the point). The `Bot`
object is the place for per-bot memory later (and the seed for an
AI-controlled second player).

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the evaluation list above.

```sh
node scripts/skill-lessons.mjs playtest --list
```

A settled feel-rule of thumb ("contact damage above X makes rush unwinnable")
is exactly the kind of thing worth recording — read the past ones before you
evaluate, not after.
