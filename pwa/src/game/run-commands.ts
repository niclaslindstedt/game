// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ONE PLACE THE APP ACTS ON A RUN.
//
// Every screen in the game that does something to the state — the bag, the
// counter, the level-up chooser, the talent picker, the errand box, the pause
// menu, the AUTO PILOT panel — used to call an engine function directly on a
// `GameState` it was holding. That was correct for exactly as long as the state
// lived in this process. MULTIPLAYER moves the simulation into a session server
// (docs/multiplayer.md), so every one of those calls now goes through here and
// this module decides how it reaches the run:
//
//   LOCAL   — apply it now, in this process, with `applyRunCommand`. What a
//             browser, a phone and a desktop single-player run all do, and it
//             is byte-for-byte the call the screen used to make.
//   NET     — send it as a NAME plus SCALAR ARGUMENTS down the command channel
//             and let the server perform it. What a Steam session does.
//
// **THE SINK IS MODULE-GLOBAL, AND THAT IS A DECISION RATHER THAN A SHORTCUT.**
// The alternative is threading a dispatcher prop through some sixty call sites
// across four dozen components, which is a large diff that then has to be
// maintained by everyone who adds a screen — and the thing being threaded is
// singular anyway: the app plays ONE run at a time (`GameScreen` is one mount),
// exactly as the engine's own runtime toggles in `src/game/flags.ts` are
// process-global for the same reason. The run driver installs a sink when it
// starts and clears it when it stops, so a stale sink cannot outlive the run
// that set it.
//
// **THE RETURN VALUE IS THE HAZARD, AND THE ANSWER IS TO APPLY OPTIMISTICALLY.**
// Half the call sites read what the verb returned — `if (equipFromInventory(…))
// playSound()` — and a command that has travelled cannot answer synchronously.
// So on the net path the command is BOTH applied to the local replica AND sent:
// the caller gets its answer, and the server's next snapshot overwrites the
// field either way, because the client's state is server-authoritative and a
// delta is coded against what the client acknowledged. If the two disagree the
// server wins within a frame (20 Hz). This is deliberately NOT the input
// prediction PR 3 owns — there is no rollback, no reconciliation and no replay
// here, only a UI verb applied twice and corrected by the ordinary snapshot.
//
// Two rules follow from that, and both matter:
//
//  1. **A caller may treat the answer as a hint, never as a fact.** It is right
//     whenever the client and the server agree about the state the verb ran
//     against, which is nearly always and is not guaranteed. Play the sound,
//     bump the UI, close the panel — do not bank a character on it.
//  2. **A verb that ROLLS must not be trusted locally.** The client's rng is
//     its own; an optimistic roll produces a different item than the server's
//     and would be visibly corrected. Nothing reads those answers today (the
//     rolling verbs' returns are used only as "did anything happen"), and this
//     note is here so the next one that does is written knowingly.

import { applyRunCommand, type GameState } from "@game/core";
import type { CommandArg, RunCommandName } from "@game/core";

/**
 * Where a command goes when the run is not simulating in this process.
 *
 * Installed by the run driver (`pwa/src/game/net/`), which is the only thing
 * entitled to say a run lives elsewhere.
 */
export type CommandSink = (
  name: RunCommandName,
  args: readonly CommandArg[],
) => void;

let sink: CommandSink | null = null;
let optimistic = true;

/**
 * Route commands to `next` as well as applying them locally. Pass null to go
 * back to a purely local run. The driver owns both calls.
 *
 * `optimistic` is what a SPECTATOR turns off, and it is the exception the
 * header's whole argument rests on: applying locally is right because the
 * server will confirm it, and for a watcher the server will do no such thing —
 * every verb they could reach is refused by `session.receive`, so a local apply
 * would edit a replica of somebody else's hero and stay edited until the server
 * happened to touch the same field. The screens then read as dead, which is
 * exactly what a spectator's bag IS.
 */
export function setCommandSink(
  next: CommandSink | null,
  opts: { optimistic?: boolean } = {},
): void {
  sink = next;
  optimistic = opts.optimistic ?? true;
}

/** True when this run's authority is somewhere else. Read by the handful of
 * app paths that legitimately have to know — nothing that merely acts on the
 * run should ask. */
export function runIsRemote(): boolean {
  return sink !== null;
}

/**
 * Do one thing to the run.
 *
 * The name and the arguments are the wire's, whether or not there is a wire:
 * the local path runs them through the SAME `applyRunCommand` the server does,
 * so a verb cannot behave one way in single-player and another in a session,
 * and an argument the server would refuse is refused here too. That shared
 * dispatch is the whole reason this is one function rather than a wrapper per
 * verb.
 *
 * Returns whatever the verb returned, with anything absent normalized to
 * `null`. **THAT NORMALIZATION IS NOT COSMETIC**: several verbs answer
 * `number | null` or `VaultRefusal | null` and their call sites read that as
 * `!== null`, so a refusal arriving as `undefined` would read as SUCCESS and
 * the shop would play its confirm chime over a sale that never happened. One
 * shape for "the run said no", whether the no came from the verb or from the
 * argument check in front of it.
 */
export function runCommand(
  state: GameState | null,
  name: RunCommandName,
  ...args: CommandArg[]
): unknown {
  if (!state) return null;
  const applied = optimistic ? applyRunCommand(state, name, args) : undefined;
  sink?.(name, args);
  return applied ?? null;
}

/** `runCommand`, read as a boolean — the shape most call sites want, and the
 * one that keeps `if (…)` at the call site honest about the hint above. */
export function runCommandOk(
  state: GameState | null,
  name: RunCommandName,
  ...args: CommandArg[]
): boolean {
  return runCommand(state, name, ...args) === true;
}
