// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NET DRIVER — the run loop's other half, and the thing the whole feature
// has been building toward.
//
// It hosts a session in the desktop shell's utility process, wires this
// renderer to it as a CLIENT, and hands the run loop a `RunDriver` that sends
// input instead of stepping. From the loop's side that is the only difference;
// `render.ts`, the HUD model, the effects, the overlays and the sound bus are
// untouched, because they read a `GameState` and one is still there.
//
// **THE HOST HANDS IN ITS OWN STATE RATHER THAN LETTING THE CLIENT BUILD ONE.**
// The renderer already holds a run — its own setup built it, from the very
// `RunParams` the session is being hosted with — and every helper in the loop
// closes over that object. A second one built here would leave the renderer
// drawing a world nothing ever patches. So the client adopts the app's object
// and corrects it in place. A remote joiner, who has no such object, keeps the
// ordinary path and builds from the welcome's parameters.
//
// **NOTHING ADVANCES UNTIL THE SESSION ANSWERS**, and that is why this is
// synchronous to construct and asynchronous to become live. Forking a process
// and building a level is real work; `advance` is a no-op until the welcome
// lands. The run is on its prelude at that moment and nobody is steering, which
// is the only reason a pause there is acceptable rather than a stall — the day
// something can be hosted mid-fight, this needs a real answer.
//
// **IT REFUSES RATHER THAN DEGRADES.** No shell, no Steam build, a session that
// would not start: `createNetDriver` answers null and the caller runs locally.
// A driver that half-worked — sending input nobody simulates — would be a run
// that silently stopped responding to the player.

import type { GameState } from "@game/core";
import { engineVersion } from "@game/core";

import {
  connectSession,
  hostSession,
  listenSession,
  netBridgeAvailable,
  onSessionPort,
  stopSession,
  type ConnectOptions,
  type ListenOptions,
} from "../../app/net-bridge.ts";
import type { SessionParams } from "@game/wire/protocol.ts";
import { setCommandSink } from "../run-commands.ts";
import type { RunDriver } from "../game-screen/run-driver.ts";
import { createNetClient } from "@game/client";
import { setLocalSeat } from "../local-seat.ts";
import { portTransport } from "./port-transport.ts";
import { createSessionLink } from "./session-link.ts";

export type NetDriverOptions = {
  /** The run this renderer already built, and the object the loop reads. */
  state: GameState;
  /** What the session builds ITS run from. The same parameters that built
   * `state`, or the client's own world will not match the server's. */
  params: SessionParams;
  /**
   * A frozen run for the session to ADOPT instead of building one — a parked
   * run or a checkpoint restore, neither of which any parameters describe.
   *
   * It costs the static tier, so it is passed only when there is one. See
   * `SessionOptions.adopt`.
   */
  adopt?: unknown | null;
  /** The mods this run has applied, in load order. */
  mods?: string[];
  /**
   * Open the doors once the session is up, and on which of them.
   *
   * Absent for every ordinary run, which is the common case and the reason
   * this is separate from hosting at all: a single-player game on Steam still
   * simulates in the session process, and it must not bind a socket, ask a
   * router for a mapping or advertise a lobby for that.
   */
  listen?: ListenOptions & { password?: string; maxClients?: number };
  /** The session ended under us — a crashed fork, a refused handshake. The run
   * loop has no state to fall back to, so the caller decides what to say. */
  onClosed?: (reason: string, detail?: string) => void;
};

/**
 * Host this run in a session and drive it from there, or answer null.
 *
 * Null means "there is nothing here to host with" — a browser, a phone, a
 * desktop build without the net bridge up — and the caller falls back to the
 * local driver. It is not an error and must not be reported as one: it is the
 * ordinary answer everywhere except a Steam build.
 */
export function createNetDriver(options: NetDriverOptions): RunDriver | null {
  if (!netBridgeAvailable()) return null;

  const { state } = options;
  let client: ReturnType<typeof createNetClient> | null = null;
  let live = false;
  let disposed = false;
  // The HOST steers the hero, so its own seat is not a spectator's.
  const link = createSessionLink((text) => client?.sendChat(text), false);

  // REGISTERED BEFORE THE HOST REQUEST, ALWAYS. The shell hands the port over
  // with the same message that starts the session, so a listener installed
  // afterwards misses the welcome and leaves a run that never begins.
  onSessionPort((port) => {
    if (disposed) return;
    client = createNetClient({
      transport: portTransport(port),
      build: engineVersion,
      mods: options.mods,
      // The renderer's own object. See the header.
      adopt: state,
      onReady: () => {
        live = true;
      },
      onClosed: (reason, detail) => {
        live = false;
        options.onClosed?.(reason, detail);
      },
      onChat: (lines) => link.receive(lines),
      onRoster: (entries) => link.seat(entries),
      // WHICH HERO THIS SCREEN IS ABOUT. The client is shared with headless
      // joiners now (`server/client.ts`), so the seat arrives as a callback and
      // the PAGE is what knows `local-seat.ts` exists.
      onSeat: setLocalSeat,
    });
    // FROM HERE THE APP'S VERBS TRAVEL. `run-commands.ts` still applies each
    // one locally as well — the call sites read what a verb returned, and a
    // command that has crossed a process cannot answer synchronously — and the
    // server's next snapshot is what settles any disagreement.
    setCommandSink((name, args) => client?.sendCommand(name, args));
  });

  void hostSession({
    params: options.params,
    adopt: options.adopt ?? undefined,
    mods: options.mods,
    password: options.listen?.password,
    maxClients: options.listen?.maxClients,
  }).then((result) => {
    if (!result.ok) {
      if (!disposed) options.onClosed?.("error", result.reason);
      return;
    }
    // THE DOORS OPEN AFTER THE SESSION IS UP, and are their own round trip:
    // binding a socket, advertising a lobby and asking a router are all things
    // that can fail without stopping a run, and a player whose port was busy
    // should be told that while playing rather than instead of playing.
    if (!options.listen || disposed) return;
    void listenSession(options.listen);
  });

  return {
    session: link.link,
    advance(input) {
      // No stepping here, ever. The server owns the clock; this hands over what
      // the player did and the next snapshot says what came of it.
      if (!live) return;
      client?.sendInput(input);
    },
    endTick() {
      // **THE EVENTS MUST BE CLEARED HERE AND NOWHERE ELSE.** `step()` is what
      // empties the list on the local path and it is not running in this
      // process. A snapshot arrives every third tick, so a list left in place
      // would be re-read by every frame until the next one landed — every
      // sound, gore burst, blood soak and haptic played three times over, which
      // reads as broken audio rather than as a replication fault.
      if (state.events.length) state.events.length = 0;
    },
    get live() {
      return live;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      live = false;
      // The app's verbs go back to being local before anything else is torn
      // down: a sink outliving its client is a command posted into a closed
      // port on the next screen the player opens.
      setCommandSink(null);
      client?.dispose();
      client = null;
      void stopSession();
    },
  };
}

export type JoinDriverOptions = ConnectOptions & {
  /**
   * The session welcomed us and the world is built.
   *
   * THE STATE ARRIVES HERE AND NOWHERE ELSE, which is the difference between
   * this and the host path in one line: a host already holds the run its own
   * setup built, and a joiner has nothing at all until the welcome lands. The
   * run loop is what waits — see `GameScreen`'s join gate.
   */
  onReady(state: GameState, params: SessionParams): void;
  /** The join was refused, or the session ended. */
  onClosed?: (reason: string, detail?: string) => void;
};

/**
 * JOIN a session — the driver a joining PLAYER runs.
 *
 * It is the host driver with two things removed and one added. Removed: the
 * `hostSession` call (somebody else is simulating) and the `adopt` (there is no
 * local run to correct — `createNetClient` builds the world from the welcome's
 * parameters, which is the ordinary path its static tier was designed for).
 * Added: the state has to be handed OUT, because nothing in this process built
 * it.
 *
 * The command sink is installed NON-OPTIMISTICALLY, and it stays that way now
 * that a joiner has a seat. The reason changed but the answer did not: a
 * spectator's verbs are refused outright by the session, and a SEATED player's
 * are accepted — but the server is authoritative over the result, so applying
 * one locally would draw an outcome the next snapshot may not agree with. The
 * verb travels; the correction comes back.
 */
export function createJoinDriver(options: JoinDriverOptions): RunDriver | null {
  if (!netBridgeAvailable()) return null;

  let client: ReturnType<typeof createNetClient> | null = null;
  let state: GameState | null = null;
  let live = false;
  let disposed = false;
  const link = createSessionLink((text) => client?.sendChat(text), true);

  // BEFORE the connect request, for the same reason the host path registers
  // before hosting: the shell hands the port over with the message that starts
  // the work, and a listener installed afterwards misses the welcome.
  onSessionPort((port) => {
    if (disposed) return;
    client = createNetClient({
      transport: portTransport(port),
      build: engineVersion,
      mods: options.mods,
      onReady: (ready, params) => {
        state = ready;
        live = true;
        options.onReady(ready, params);
      },
      onClosed: (reason, detail) => {
        live = false;
        options.onClosed?.(reason, detail);
      },
      onChat: (lines) => link.receive(lines),
      onRoster: (entries) => link.seat(entries),
      // WHICH HERO THIS SCREEN IS ABOUT. The client is shared with headless
      // joiners now (`server/client.ts`), so the seat arrives as a callback and
      // the PAGE is what knows `local-seat.ts` exists.
      onSeat: setLocalSeat,
    });
    setCommandSink((name, args) => client?.sendCommand(name, args), {
      optimistic: false,
    });
  });

  void connectSession({
    address: options.address,
    peer: options.peer,
    name: options.name,
    password: options.password,
    mods: options.mods,
  }).then((result) => {
    if (result.ok || disposed) return;
    options.onClosed?.(result.reason, result.detail);
  });

  return {
    session: link.link,
    advance(input) {
      // The session decides whether this steering counts: a seated player's is
      // applied to THEIR hero, a spectator's is dropped at the one place that
      // may drop it. Sending it either way keeps that judgement in the one
      // process entitled to make it.
      if (!live) return;
      client?.sendInput(input);
    },
    endTick() {
      if (state?.events.length) state.events.length = 0;
    },
    get live() {
      return live;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      live = false;
      setCommandSink(null);
      client?.dispose();
      client = null;
      state = null;
      // The same `stop` a host sends: it is the session PROCESS being asked to
      // go away, and in the joiner role that process is holding a socket rather
      // than a simulation.
      void stopSession();
    },
  };
}
