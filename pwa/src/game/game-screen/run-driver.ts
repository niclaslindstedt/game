// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO ADVANCES THE RUN — the seam the cutover turns on.
//
// `GameScreen` used to call `step()` itself, which is the one thing that cannot
// survive the simulation moving into a session server. It drives a DRIVER now,
// and there are two:
//
//   LOCAL  `step(state, input, dt)`, in this process, exactly as before. What a
//          browser, a phone and a desktop single-player run all do.
//   NET    send the input and let the server step; snapshots arrive on their
//          own and patch the state in place. What a Steam session does.
//
// **THE INTERFACE IS THREE METHODS AND THAT IS DELIBERATE.** Everything else in
// the run loop — the render pass, the HUD model, the effects, the overlays, the
// sound bus, the achievement ledger, the checkpoint capture — reads a
// `GameState` and is untouched by which driver is behind it. If one of them ever
// has to know, that is a finding worth writing down rather than patching past.
//
// TWO THINGS HERE WOULD FAIL SILENTLY, AND BOTH ARE THE WHOLE REASON THIS FILE
// EXISTS RATHER THAN AN `if` IN THE LOOP:
//
//  1. **`state.events` is cleared by `step()` on the local path and by NOBODY
//     on the net one.** The server publishes every third tick, so a loop that
//     did not clear the list after consuming it would replay every sound, gore
//     burst and haptic three times over — a bug that reads as "the audio is
//     distorted" rather than as a replication fault. `endTick` is where the net
//     driver clears it, and the local driver deliberately does not (the next
//     `step` owns that, and clearing twice would drop a tick's events entirely
//     when the loop runs two steps in one frame).
//  2. **A net driver is not ready the instant it is created.** The session has
//     to fork and answer with a welcome, so `advance` does nothing until it
//     does. The run is on its prelude at that moment and nobody is steering,
//     which is the only reason this is acceptable rather than a stall.

import {
  error,
  freezeRun,
  generatedMapSizeSetting,
  step,
  type GameInput,
  type GameState,
  type RunParams,
} from "@game/core";
import type { SessionParams } from "@game/wire/protocol.ts";

import { activeDefOverrides, activeMods } from "../mod-state.ts";
import { createNetDriver } from "../net/driver.ts";
import type { SessionLink } from "../net/session-link.ts";
import { takeHostIntent } from "../session-intent.ts";
import type { RunSession } from "./run-setup.ts";

export type RunDriver = {
  /**
   * The session behind this run, or null when there is none.
   *
   * Null on the LOCAL path, which is the answer for every browser, every phone
   * and every desktop single-player game — and the reason the chat overlay and
   * the session panel are mounted from this one field rather than from a
   * platform check: a surface that exists only when there is a session to talk
   * to cannot be drawn over a game that has none.
   */
  readonly session?: SessionLink | null;
  /**
   * The doors were armed for this run — HOST GAME's open-doors bit, consumed
   * by the driver that opened them. Read by the crossing decision (§6.4): a
   * host with the doors open travels IN-SESSION even before anybody joins,
   * because tearing the session down to travel is what would close them.
   */
  readonly hosting?: boolean;
  /**
   * Advance the run by one fixed slice.
   *
   * The LOCAL driver steps the simulation here; the NET driver hands the input
   * over and returns, because the server owns the clock. Either way the caller
   * has done its part of the tick when this returns — what it must not do is
   * assume the state moved.
   */
  advance(input: GameInput, dtMs: number): void;
  /**
   * The app has finished reading this tick's `state.events`.
   *
   * Called once per simulated slice, after every consumer has run. See the note
   * above about why only one of the two drivers does anything with it.
   */
  endTick(): void;
  /**
   * Is the run actually being advanced?
   *
   * False on the net path until the session answers. The loop uses it for
   * nothing but diagnostics — a driver that is not ready simply does not
   * advance, and the run sits on the frame it is on.
   */
  readonly live: boolean;
  /**
   * Register the app's reaction to an IN-SESSION CROSSING (§6.4) — called
   * with the OLD state, before the incoming full snapshot moves the world,
   * which is the one moment the local hero can still be banked off the level
   * being left. Net drivers implement it; the local driver has no session to
   * travel with and leaves it undefined.
   */
  setTravelHook?(hook: (state: GameState) => void): void;
  dispose(): void;
};

/**
 * The run simulates here, in this process — what the game has always done.
 *
 * This is not a fallback and it is not a stub. It is the path every browser and
 * every phone takes, and the one a desktop single-player run takes when it is
 * not hosting: a session per run costs a process, and running one in the
 * renderer would put the snapshot capture, the diff and the JSON round trip on
 * the same thread as the frame, twenty times a second, on a phone.
 */
export function createLocalDriver(state: GameState): RunDriver {
  return {
    advance(input, dtMs) {
      step(state, input, dtMs);
    },
    // `step()` clears `state.events` at the top of every slice, so the list the
    // app just read is the one the next step is about to replace. Clearing it
    // here as well would lose a tick's events whenever a frame runs two slices.
    endTick() {},
    live: true,
    dispose() {},
  };
}

/**
 * Pick this run's driver.
 *
 * The net driver is offered first and answers null wherever it cannot host — a
 * browser, a phone, a desktop build whose bridge is not up — so the local
 * driver is the answer nearly everywhere and the fallback nowhere. That order
 * matters: asking "am I on Steam?" here would put a platform test in the run
 * loop, and the bridge already answers a better question ("can a session
 * actually be started?").
 *
 * `?net=off` forces the local path. It exists because the session path is the
 * one thing in this feature that cannot be proved from a test — it needs a
 * forked process and a packaged shell — and a player who hits a bad session
 * should have a way back into their game that does not involve a new build.
 */
export function createRunDriver(session: RunSession): RunDriver {
  const local = () => createLocalDriver(session.state);
  if (new URLSearchParams(window.location.search).get("net") === "off") {
    return local();
  }
  // A run that was BUILT travels as its parameters and costs the wire nothing;
  // a run that was ADOPTED — a parked run, a checkpoint a RETRY dropped into —
  // has no parameters that describe it and travels as itself. The session then
  // sends every client a full first snapshot, which carries the terrain as
  // well, so a client that could not have built the world is still given one.
  const params = session.params;
  // HOST GAME armed this run, or nothing did. A run that nobody asked to host
  // still simulates in the session process — that is the cutover, not a
  // multiplayer feature — and must not bind a socket for it.
  const hosting = takeHostIntent();
  const net = createNetDriver({
    state: session.state,
    params: params
      ? wireParams(params)
      : adoptedParams(session.state, session.hardcore),
    adopt: params ? null : freezeRun(session.state),
    // THE MODS THIS RUN IS ACTUALLY PLAYING, in load order. They travel because
    // the handshake refuses a mismatch on them: a host with a conversion on and
    // a joiner without hold different catalogs, and the two worlds diverge on
    // the first spawn. A host that advertised none would admit exactly that
    // joiner and call the desync a replication bug.
    mods: activeMods().map((stamp) => stamp.id),
    // AND THE CATALOGS THEMSELVES (§4.4), for the process that simulates: the
    // page's `registerDefs` never reached the session, so without this a
    // modded host's horde spawns from the SHIPPED catalogs while the renderer
    // draws the mod. Null is the shipped game and costs the channel nothing.
    modDefs: activeDefOverrides(),
    listen: hosting
      ? {
          name: hosting.name,
          port: hosting.port,
          udp: hosting.udp,
          steam: hosting.steam,
          password: hosting.password,
          maxClients: hosting.maxPlayers,
        }
      : undefined,
    onClosed: (reason, detail) => {
      error(`session ended: ${reason}${detail ? ` — ${detail}` : ""}`);
    },
  });
  return net ?? local();
}

/**
 * A run's own parameters, as the wire says them.
 *
 * `RunParams` leaves the fields it defaults OPTIONAL — a caller building a run
 * says only what is not the plain case — while `SessionParams` requires them,
 * because a wire that let a field be absent would be a wire on which "absent"
 * and "false" are the same message. So the defaults are spelled out here, once,
 * on the way across.
 *
 * The two generated-map knobs are engine FLAGS rather than run arguments, so
 * they are not on `RunParams` at all: the client applies them before it builds,
 * exactly as the session does.
 */
function wireParams(params: RunParams): SessionParams {
  return {
    ...params,
    loadout: params.loadout ?? null,
    respec: params.respec ?? false,
    clearedLevels: [...(params.clearedLevels ?? [])],
    merchantDiscovered: params.merchantDiscovered ?? false,
    seenThoughts: [...(params.seenThoughts ?? [])],
    generatedMapSize: generatedMapSizeSetting(),
  };
}

/**
 * The parameters that stand in for a run nobody can describe.
 *
 * Only two of these are read for an adopted session — the level and the
 * difficulty, which `createSession` checks against the state it was handed so a
 * run cannot be hosted under the wrong map. The rest exist because the shape
 * requires them, and the SEED in particular is meaningless here: a client of an
 * adopted session never builds the world, it is sent one.
 */
function adoptedParams(state: GameState, hardcore: boolean): SessionParams {
  return {
    seed: 0,
    levelId: state.level.id,
    difficulty: state.difficulty,
    loadout: null,
    respec: false,
    clearedLevels: [],
    merchantDiscovered: false,
    generatedMapSize: generatedMapSizeSetting(),
    // §4.2's door gate is real for an adopted run too — a RETRY'd hardcore
    // checkpoint is still a hardcore game.
    hardcore,
  };
}
