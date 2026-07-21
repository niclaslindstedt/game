---
name: bot-improvement
description: "Use when improving the AUTOPILOT (src/game/bot.ts) — how the bot reads a fight and moves. Drives the iterate loop: reproduce the bad behaviour (headless sim or a real-render playtest), read the bot's own thought trail, form a hypothesis, edit the decision code and/or the bot.yaml knobs, then re-measure. The target is HUMAN capability — the bot should make the decisions a skilled human makes (approach a pack but hold at weapon reach, kill from a distance, retreat before it's swarmed), never something a human never would (dive an armed pack, hug melee range with a gun, stand in a telegraph). No artificial handicaps — just competent, deterministic play."
---

# Bot improvement

The autopilot in `src/game/bot.ts` is one source of truth: the headless engine
tests (`tests/engine/bot_test.ts`), the campaign simulator
(`scripts/simulate-run.mjs`), and the real-app `?bot=` autoplay all drive the
SAME `botAct(bot, state) → GameInput`. Improving the bot means improving that
function so a botted run plays like a **skilled human** — the yardstick for
every change.

## The target: human capability, no handicaps

Tune toward the decisions a good human makes, not toward superhuman reflexes and
not toward deliberate mistakes:

- **Do** approach a pack but hold at the equipped weapon's reach; kill from a
  distance; give ground before being surrounded; dodge a telegraphed slam/charge;
  heal/retreat when bleeding; push the objective when the lane is clear.
- **Don't** add artificial imperfection (reaction-delay jitter, aim noise). We
  want the bot to STOP doing dumb things, not to fake being bad.
- **Don't** let it do what a human never would: barge into the middle of an armed
  pack, hug melee range while holding a gun, backpedal into a corner forever, or
  eat a boss's rush while planted on it.

If a human wouldn't do it, the bot shouldn't. That is the whole spec.

## Determinism is non-negotiable

The bot is a PURE consumer of `state`: it never mutates it and never draws from
`state.rng`, so a botted run is exactly as reproducible as a recorded human one
(same seed + fresh bot → identical run — `bot_test.ts` asserts this). Keep it
that way:

- No `Math.random()`, no wall clock (`Date.now()`), no reads of `state.rng`.
- Per-bot memory (nav/route/content caches, `lastThought`) hangs off the `Bot`
  object, keyed off pure state — never on `GameState`.
- A new heuristic must be a pure function of `state` (+ the bot's own memory).
  If you can't make it deterministic, don't add it.

## Thoughts are load-bearing — keep them in sync with the code

Every decision branch calls `think(bot, "LABEL")` (bot.ts). That label is the
hero's thought bubble in **BOT VIEW** (DEVELOPER menu) and under the FPS meter
(`GameScreen.tsx` draws `bot.lastThought`) — and it is the ONLY window into *why*
the bot did what it did. When you debug a bad run, the thought trail ("ARM UP" →
"KITE" → "GIVE GROUND" → "PUNCH OUT") IS the trace.

So treat the labels as part of the logic, not decoration:

- **Every branch that returns an input sets a thought.** A branch with no
  `think()` is a blind spot — you'll watch the hero do something and have no idea
  which code path chose it. Never leave one unlabelled.
- **Keep the label true to the branch.** If you split, merge, or repurpose a
  branch, update its label in the same edit. A "PRESS" label on a branch that now
  retreats is worse than no label — it lies to the next debugger.
- **Labels must render.** `PixelText` only has glyphs for caps, digits, and a few
  marks (`. , : - ( )`); anything else falls back to `?`. Keep labels short and
  in that set (a new glyph means editing the font — see the `pixel-assets` skill).
- The label is a pure annotation the sim never reads back, so it can't affect
  determinism — spend them freely.

## The knobs: `bot.yaml`

The positioning tunables live in `scripts/bot.yaml` — the hand-authored
source of truth, compiled to `src/generated/botTuning.ts` by
`scripts/generate-bot-tuning.mjs` (folded into `npm run levels` /
`make assets`), and resolved per level in `bot.ts` via `botTuningFor(state.level.id)`.
Mirrors `ladder.yaml`: a global `default:` layer plus per-level `levels:`
overrides.

```yaml
default:                 # shifts every level at once
  engageRangeFrac: 0.8
levels:                  # bend one map only (partial — the rest fall through)
  spacez_hq:
    armApproachStandoff: 150
```

- The engine schema + neutral defaults are `src/game/bot-tuning.ts`
  (`BotTuning`, `BOT_TUNING_DEFAULTS`). Defaults reproduce the shipped constants,
  so an un-overridden level plays identically.
- **Add a knob**: add the field to `BotTuning` + `BOT_TUNING_DEFAULTS`, read it in
  `bot.ts` at the ONE site that owns its rule, list it in `bot.yaml` `default:`,
  then `npm run levels`. Keep the type to knobs the code actually READS — a knob
  the decision code ignores is a lie in the YAML (the generator only validates key
  names, not that they're read).
- The generator FAILS the build on an unknown knob key or an unknown level id, so
  a typo can't silently no-op.

## The current combat model (so you don't re-derive it)

`survive()` (the `balanced`/`aggro`/`flee` postures) reads two distances, so a
ranged hero fights from range without stalling:

- **`dangerDist`** = `graspStandoff × standoffMul` — a body this close is a real
  threat → GIVE GROUND (full retreat toward the open side, path-biased).
- **`engageDist`** = reach-aware hold: ranged/magic hold at `range × engageRangeFrac`
  (floored at grasp) so they kill from distance; melee holds at its own swing
  range (so melee play is unchanged).
- Between them the hero **KITES FORWARD**: he steers the A* route toward the macro
  objective, blended with a push off the pack that grows as the nearest body
  closes but stays **below 1** so the heading is always net-forward — he pushes
  the map at reach instead of diving in OR backpedalling to the corner (the trap
  on a wave level, where something is always inside his reach).
- The DISARMED opening (`state.player.disarmed`) holds at `armApproachStandoff`
  short of the nearest foe — close enough to trip the level's first-sight beat so
  the scripted vanguard rushes in and draws the blade, but outside the swarm.

Known soft spots to iterate on: `flee` over-peels and can stall short of the boss
on a dense floor; a run that never rolls a weapon upgrade stays on the weak
starter and takes avoidable hits in the boss fight (a loot/economy interaction,
not pure positioning).

## The iterate loop

1. **Reproduce.** Headless is fastest:
   `node scripts/simulate-run.mjs --difficulty easy --level spacez_hq --strategy balanced --class auto --seed 1 --max-minutes 8`
   — read deaths / kills / dmgIn / whether the boss is reached. For NAVIGATION
   failures, read the **STUCK AREAS** table (on by default, `--stuck-limit`):
   every wedge/loiter books world coordinates, a run that racks up enough
   penalty cancels (outcome `stuck`), and the printed
   `map-layout.mjs --seed N --highlight "x,y"` command renders the exact
   failure spots on the map — look at WHAT the bot ground against before
   hypothesizing. The hero is
   immortal there (deaths are BOOKED, never run-ending), so deaths + damage-in are
   the "how much would a real player have died" gauge. For the real look-and-feel,
   playtest in headless Chromium (below).
2. **Read the thought trail.** Turn on BOT VIEW (DEVELOPER menu) or `?debug`, or
   probe `window.__game` — watch which labels fire when the hero misbehaves.
3. **Hypothesize, then edit** `bot.ts` (logic) and/or `bot.yaml` (a knob). Prefer
   moving a magic number into `bot.yaml` over hard-coding it, so it's tunable next
   time.
4. **Re-measure and COMPARE.** `simulate-run --json before.json` once, then
   `--compare before.json` after — it prints deaths/kills/boss-reach deltas. Sweep
   a knob across a few seeds AND postures (`--strategy aggro,balanced,flee`); one
   lucky seed proves nothing.
5. **Playtest the real render** at the phone viewport (below) and eyeball it — the
   thought bubble should read as sane decisions, and the hero should hold at range
   and push the map, not bury himself in the pack.
6. Loop until the botted run plays like a competent human across seeds.

## Tools

| Piece | Role |
| --- | --- |
| `src/game/bot.ts` | The autopilot — `botAct`, `survive`, `pushBoss`, `dodgeTelegraph`, `botAllocate`. The one place decisions live |
| `src/game/bot-tuning.ts` | The `BotTuning` schema + neutral `BOT_TUNING_DEFAULTS` + `resolveBotTuning` |
| `scripts/bot.yaml` | Hand-authored knob source of truth (default + per-level); `npm run levels` compiles it |
| `?bot=<strategy>` / `?botProfile=<build>` | Hands the real app to the autopilot (`GameScreen.tsx`) |
| `scripts/simulate-run.mjs` | Headless campaign simulator — deaths/kills/boss-reach, `--compare`, `--balance`, `--stuck-limit` (STUCK AREAS: penalty-cancelled runs + failure coordinates) |
| `scripts/map-layout.mjs --seed N --highlight "x,y;…"` | Renders the sim's stuck coordinates on the map (seed-matched scatter rocks included) — SEE what the bot wedged on |
| `website/scripts/playtest.mjs` | Playwright launcher: `?debug&bot=<strategy>`, screenshots + stats |
| `tests/engine/bot_test.ts` | The determinism + behaviour guardrails — run after every edit |
| BOT VIEW (DEVELOPER menu) | Draws `bot.lastThought` over the hero — the live decision trace |

### Running a playtest

```sh
npm install --no-save playwright                 # once per session
cd website && npm run assets && npm run extract  # generate the app's assets first
npx vite --port 5199 &                           # dev server (background)
node website/scripts/playtest.mjs --strategy survivor --level spacez_hq --difficulty easy
```

This environment ships Chromium at `/opt/pw-browsers/chromium-<v>/chrome-linux/chrome`;
if `chromium.launch()` complains about a version mismatch, launch with that
`executablePath`. Shots land in `website/assets-preview/playtest/` (gitignored).

## After a change

- `make lint && make test` green (bot tests included).
- A user-visible behaviour change gets a `.changes/unreleased/` fragment.
- Record any gotcha as a lesson fragment (`.agent/skills/bot-improvement/.lessons/`,
  see `.agent/skills/LESSONS.md`) — never append to this file from a parallel run.
