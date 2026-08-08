---
title: A per-player rule ships as a latch flag + a sweep, and must be an exact no-op at one hero
date: 2026-08-01
scope: src/game/
concepts: [party, multiplayer, latch, no-op]
---

Per-player death (§4.2, `downed.ts`) crystallized the pattern every co-op rule
in this repo now follows, and three traps worth carrying:

1. **Latch + sweep, wipe path first.** A transition that fires "when hp hits 0"
   has a dozen call sites (contact, hazards, projectiles). Don't hook them —
   sweep at the END of `step()` over `hp <= 0 && !latched` heroes, and gate the
   whole sweep on `!partyWiped(state)`. Solo, one hero at 0 hp IS the wipe, so
   the sweep never runs and the legacy path is byte-identical without a single
   `players.length === 1` special case. The latch (`Player.downed`) is what
   makes the sweep idempotent AND what lets the later wipe toll skip a hero who
   already paid at their fall — one flag, three jobs.

2. **A run COMMAND may not emit events.** Verbs run BETWEEN ticks; the next
   `step()` replaces `state.events` before the session collects them, so an
   event pushed by a verb reaches nobody — not the local app past this frame,
   and never a client. Design the verb so the STATE CHANGE is the cue (respawn:
   hero at spawn, full hp, flag cleared), or move the emission into a step pass.
   Events pushed inside `step()` (the down sweep, the recovery pass) replicate
   for free.

3. **Anything that can strand player gear needs a fold at the banking funnel.**
   Gear parked outside the hero (a corpse) is lost at every path that calls
   `extractLoadout` (victory, travel, defeat) unless that one function folds it
   back in — the vault is the right shelf (its charter is not-chosen losses),
   deliberately past its cap, because the cap disciplines the bot's sweep and
   must not delete a player's kit. One funnel covers every banking path at once;
   per-transition reclaim hooks would miss the next one added.

Also mechanical: an additive `GameState` array (`corpses`) needs no
SAVE_VERSION bump — default it in `loadSavedRun` like `merchant.buyback` — but
DOES need the shape-guard lists in `tests/saved_run_test.ts`, and a new event
type regenerates `mod/catalog.json` (the drift test reads the EVENT list, which
is easy to forget since nothing about events feels like "content").
