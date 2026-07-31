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
  hostSession,
  netBridgeAvailable,
  onSessionPort,
  stopSession,
} from "../../app/net-bridge.ts";
import type { SessionParams } from "@game/wire/protocol.ts";
import { setCommandSink } from "../run-commands.ts";
import type { RunDriver } from "../game-screen/run-driver.ts";
import { createNetClient, type ClientTransport } from "./client.ts";

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
  }).then((result) => {
    if (!result.ok && !disposed) {
      options.onClosed?.("error", result.reason);
    }
  });

  return {
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

/**
 * A `ClientTransport` over the shell's `MessagePort`.
 *
 * The buffer is TRANSFERRED rather than copied — it is the whole reason the
 * frames travel on their own port instead of down the JSON control channel,
 * and at twenty snapshots a second the copy would be the most expensive thing
 * in the feature.
 */
function portTransport(port: MessagePort): ClientTransport {
  let onFrame: ((frame: ArrayBuffer) => void) | null = null;
  port.onmessage = (event: MessageEvent) => {
    const data = event.data as ArrayBuffer | undefined;
    if (data instanceof ArrayBuffer) onFrame?.(data);
  };
  port.start();
  return {
    send(frame) {
      port.postMessage(frame, [frame]);
    },
    onFrame(listener) {
      onFrame = listener;
    },
    close() {
      port.onmessage = null;
      port.close();
    },
  };
}
