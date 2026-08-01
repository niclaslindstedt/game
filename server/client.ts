// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLIENT — what replaces `createGame` + a local `step()` in the run loop.
//
// It builds the level for itself, applies what the server sends, and hands the
// app **the same `GameState`-shaped object the renderer has always read**. That
// last part is the whole design goal: `render.ts`, the HUD model, the effects,
// the overlays, the sound bus and the achievement ledger are untouched by
// multiplayer, because from where they sit nothing changed. One object, mutated
// in place, for the life of the run — exactly as the engine mutated it.
//
// THE STATIC TIER COSTS ZERO BYTES, and the mechanism is worth stating because
// it looks like a trick: the client calls `createGame` with the SessionParams
// the welcome carried, so it holds the same obstacles, decor, canopy, spawner
// layout and carved geometry the server does. The server's first delta is coded
// against ITS OWN freshly-created state, so everything the two already agree on
// is simply absent from the patch. Nothing has to be listed as static for it to
// be free; `split.ts` lists it only so the differ need not compare it.
//
// **The bet underneath is bit-for-bit determinism across two processes on the
// same build**, and it is tested rather than believed —
// `tests/engine/net_determinism_test.ts`. If it ever fails, the fallback is
// already scoped: static state joins the wire and costs ~100 KB once per level.
//
// **IT SITS IN `server/` AND KNOWS NOTHING ABOUT A PAGE**, which is the whole
// reason it moved out of `pwa/src/game/net/`. It is the only thing in the repo
// that turns snapshots back into a run, and a BOT CLIENT — a headless process
// that joins a session and plays off replicated state (multiplayer plan §7.2.5)
// — needs exactly that and has no renderer to put it in. A second client
// written beside this one would be the drift the plan warns about: what the bot
// proves playable has to be what the page actually reads. So the ONE app-shaped
// thing it used to do — telling `local-seat.ts` which chair the server gave us
// — is now the `onSeat` callback, and the page passes `setLocalSeat` to it.
//
// It is reached through the `@game/client` alias, which resolves to this file
// in all four config maps (root tsconfig, pwa tsconfig, vitest, vite).
//
// **THE 200 KB CRITICAL-PATH BUDGET IS A LIVE HAZARD HERE.** This module imports
// `@game/core`, so nothing on the app's startup path may import it: the HOST and
// JOIN screens are title-menu screens and must reach `@game/menu` and the
// import-free `@game/wire/*` leaves alone. `pwa/scripts/check-seo.mjs` is what
// catches the mistake; do not raise the number.

import {
  createRunFromParams,
  type GameState,
  type GameInput,
} from "@game/core";
import {
  setGeneratedMapSize,
  type CommandArg,
  type GeneratedMapSizeSetting,
} from "@game/core";

import { decodeFrame, encodeFrame } from "./wire/codec.ts";
import { patchState, type StatePatch, type WireState } from "./wire/delta.ts";
import { FRAME, type CommandName } from "./wire/frames.ts";
import {
  PROTOCOL_VERSION,
  refuseHandshake,
  type ByePayload,
  type ChatLine,
  type ChatPayload,
  type CommandPayload,
  type Handshake,
  type RefusalReason,
  type RosterEntry,
  type RosterPayload,
  type SessionParams,
  type WelcomePayload,
} from "./wire/protocol.ts";
import { baselineFor, stripPrivate } from "./wire/snapshot.ts";

/** The pipe, whatever it is. A `MessagePort` in phase 1; a Steam P2P peer or a
 * UDP connection in phase 2. The client knows nothing else about it — which is
 * the point of writing the seam here rather than inside the transport. */
export type ClientTransport = {
  send(frame: ArrayBuffer): void;
  /** Install the receiver. Called once, at construction. */
  onFrame(listener: (frame: ArrayBuffer) => void): void;
  close(): void;
};

export type NetClientOptions = {
  transport: ClientTransport;
  /** This build's engine version, compared with the host's at the handshake. */
  build: string;
  /** The mods this client has applied, in load order. */
  mods?: string[];
  /**
   * Use THIS object as the run instead of building one.
   *
   * A HOST's renderer already holds a `GameState` — its own run setup built it,
   * from the very parameters the session was hosted with — and every helper in
   * the run loop closes over that object. Building a second one here would
   * leave the renderer drawing a world nothing ever patches. So the host hands
   * its own in and the client corrects it in place; a remote joiner passes
   * nothing and gets one built from the welcome's parameters.
   *
   * It is the caller's job that this object and the session's agree. For a host
   * that is free (one `RunParams`, one `createRunFromParams`, both ends); it is
   * not a licence to hand in an arbitrary state.
   */
  adopt?: GameState | null;
  /** The run is live: the state is built and the first snapshot has landed. */
  onReady?: (state: GameState, params: SessionParams) => void;
  /** The session ended, or the join was refused. */
  onClosed?: (reason: ByePayload["reason"], detail?: string) => void;
  /**
   * Lines were said.
   *
   * APPENDED, never replacing — the server sends the whole log once, on
   * arrival, and single lines after that. A consumer that treated every frame
   * as the full log would show a spectator the backlog and then, one line
   * later, nothing but the newest thing anybody said.
   */
  onChat?: (lines: ChatLine[]) => void;
  /** Who is in the session. This one IS the whole list every time: a roster is
   * a state rather than a stream, and merging one would leave a player who
   * quit on the party frames for ever. */
  onRoster?: (entries: RosterEntry[]) => void;
  /**
   * WHICH CHAIR THE SERVER GAVE US, the moment the welcome says — and null on
   * dispose, because a stale seat outliving its session would point the next
   * run's camera at somebody who is not there.
   *
   * A callback rather than a direct write to `local-seat.ts`, because that
   * module is the PAGE's answer to "which hero is this screen about" and this
   * client also runs in processes that have no screen (a bot client). The app
   * passes `setLocalSeat`; a headless joiner reads the seat itself.
   */
  onSeat?: (seat: number | null) => void;
  /**
   * AN IN-SESSION CROSSING IS ABOUT TO MOVE THE WORLD (§6.4): the incoming
   * full snapshot names a different level than the state on screen. Fired
   * with the OLD state, BEFORE anything is overwritten — the one moment the
   * app can still bank its hero as they stood on the level being left. The
   * state object itself survives (same reference, new world), which is what
   * lets the renderer and every loop helper carry on across the swap.
   */
  onTravel?: (state: GameState) => void;
};

export type NetClient = {
  /**
   * The run, as the renderer reads it — or null until the welcome lands.
   *
   * It is the same object for the life of the session. Hold the reference;
   * never re-read it expecting a new one.
   */
  readonly state: GameState | null;
  /**
   * The chair the server seated us in, or null for a spectator (and before the
   * welcome). The page reads the same answer through `localHero`; a headless
   * joiner has no such module and reads it here — it is which hero in
   * `state.players` this process is entitled to steer, and the ONLY one whose
   * private tier (the bag, the purse, the build) it actually holds.
   */
  readonly seat: number | null;
  /** The server tick the last applied snapshot was taken on. */
  readonly tick: number;
  /** Hand the server this frame's input. Called once per rendered frame. */
  sendInput(input: GameInput): void;
  /**
   * Ask the server to run one named command — turning a page of the opening
   * monologue, equipping the sword in bag cell 4, buying the merchant's third
   * row, placing a stat point.
   *
   * The run loop used to call these straight onto a local `GameState`. Now they
   * travel, and they travel as names from a closed list (`COMMANDS`) with
   * SCALAR arguments whose shapes the engine declares beside each verb, so the
   * channel can never widen into "call any engine function with anything".
   *
   * Fire and forget: there is no reply and no acknowledgement. What the command
   * did shows up in the next snapshot, like everything else the server decides.
   */
  sendCommand(name: CommandName, args?: readonly CommandArg[]): void;
  /** Say something, or run a slash command. The parse and every decision about
   * what it may DO are the server's — see `server/wire/chat.ts` for why the
   * client is not entitled to an opinion about `/kick`. */
  sendChat(text: string): void;
  /**
   * The net graph's client half: what the state stream is costing, measured
   * where it arrives. Clock-free on purpose — the window is counted in server
   * ticks off the frames themselves, so the same numbers come out of a page,
   * a bot client and a test without anybody injecting a clock.
   */
  netStats(): NetStats;
  dispose(): void;
};

/** What `netStats` reports. All zeros until two snapshots have landed. */
export type NetStats = {
  /** State bytes per second, over the recent snapshot window. */
  rate: number;
  /** Snapshots (full or delta) per second over the same window. */
  perSec: number;
  /** The last applied state frame's size in bytes. */
  lastBytes: number;
};

export function createNetClient(options: NetClientOptions): NetClient {
  const { transport } = options;
  let state: GameState | null = null;
  /** The last snapshot this client ACKNOWLEDGED, and the state it described.
   * The server codes its next delta against exactly this, so the two must
   * never disagree about which sequence it is. */
  let acked = 0;
  let baseline: WireState | null = null;
  let seat: number | null = null;
  let tick = 0;
  let inputSeq = 0;
  let disposed = false;
  /** The recent state frames, as (server tick, wire bytes) pairs — the net
   * graph's raw material. Bounded to ~2 s at the publish rate. */
  const received: { tick: number; bytes: number }[] = [];
  const RECEIVED_KEPT = 40;

  transport.onFrame((raw) => {
    if (disposed) return;
    const frame = decodeFrame(raw);
    // A frame that does not decode is dropped in silence. On the direct path
    // these bytes eventually come from strangers, and a session that can be
    // stopped by a malformed packet is not a session.
    if (!frame) return;
    if (frame.type === FRAME.welcome) {
      onWelcome(frame.payload as WelcomePayload);
      return;
    }
    if (frame.type === FRAME.bye) {
      const bye = (frame.payload ?? {}) as ByePayload;
      options.onClosed?.(bye.reason ?? "shutdown", bye.detail);
      return;
    }
    if (frame.type === FRAME.chat) {
      const lines = (frame.payload as ChatPayload | null)?.lines;
      if (Array.isArray(lines) && lines.length) options.onChat?.(lines);
      return;
    }
    if (frame.type === FRAME.roster) {
      const entries = (frame.payload as RosterPayload | null)?.entries;
      if (Array.isArray(entries)) options.onRoster?.(entries);
      return;
    }
    if (!state || !baseline) return; // nothing to apply it to yet
    if (frame.type === FRAME.snapshot) {
      applyWhole(frame.payload as WireState);
    } else if (frame.type === FRAME.delta) {
      patchState(state as unknown as WireState, frame.payload as StatePatch);
      patchState(baseline, frame.payload as StatePatch);
    } else {
      return;
    }
    tick = frame.tick;
    acked = frame.seq;
    received.push({ tick: frame.tick, bytes: raw.byteLength });
    if (received.length > RECEIVED_KEPT) received.shift();
    // ACK IMMEDIATELY, and only for what was actually applied. The server codes
    // its next delta against this sequence, so an ack sent optimistically — or
    // for a frame that failed to apply — is a desync with the shape of a
    // network problem.
    transport.send(
      encodeFrame({ type: FRAME.ack, seq: acked, ack: acked, tick }),
    );
  });

  function onWelcome(welcome: WelcomePayload): void {
    const mine: Handshake = {
      protocol: PROTOCOL_VERSION,
      build: options.build,
      mods: options.mods ?? [],
    };
    const refusal = refuseHandshake(welcome.handshake, mine);
    if (refusal) {
      options.onClosed?.(
        refusal,
        describeRefusal(refusal, welcome.handshake, mine),
      );
      transport.close();
      return;
    }
    state = options.adopt ?? buildLocalState(welcome.params);
    seat = welcome.seat ?? null;
    const recipient = { seat: welcome.seat };
    // WHICH HERO THIS SCREEN IS ABOUT. The seat is the server's answer and
    // arrives here; everything the app draws about "the hero" — the camera, the
    // health bar, the bag, the paper doll — reads it through `localHero`. A
    // spectator has no seat and watches the host's (see local-seat.ts).
    options.onSeat?.(welcome.seat ?? null);
    // A CLIENT THAT MAY NOT SEE THE BAG MUST NOT INVENT ONE. Its own
    // `createGame` just built a whole private hero — an empty inventory, a
    // starting purse, a fresh stat block — and none of that is real: the
    // server will never confirm or correct it, because it never sends it. Left
    // in place it would be drawn, and a spectator's HUD would report a bag
    // that belongs to nobody. So the fields the split withholds are removed
    // here as well, which also keeps the baseline honest.
    stripPrivate(state as unknown as Record<string, unknown>, recipient);
    // The baseline is this client's OWN creation, cut for this recipient —
    // which is what makes the static tier free: the server's first delta is
    // coded against the identical world and mentions none of it.
    baseline = baselineFor(
      state as unknown as Record<string, unknown>,
      recipient,
    );
    options.onReady?.(state, welcome.params);
  }

  /** A full snapshot: assign every field it carries, leaving the ones it does
   * not (the rng closures, the app's own view rect) exactly where they are. */
  function applyWhole(snapshot: WireState): void {
    if (!state) return;
    const target = state as unknown as WireState;
    // AN IN-SESSION CROSSING (§6.4): the world moved under us. The statics a
    // full snapshot carries (the level, the carve, the decor) move the client
    // wholesale — the same ~100 KB an adopted session costs, once per
    // crossing — but the hero being LEFT BEHIND has to be banked first, off
    // the state as it still stands. The one field the swap must not leave
    // stale is the request itself: the new world never carried one.
    const level = snapshot.level as { id?: unknown } | null | undefined;
    if (level && typeof level.id === "string" && level.id !== state.level.id) {
      options.onTravel?.(state);
      delete target.pendingTravel;
    }
    for (const [field, value] of Object.entries(snapshot)) {
      target[field] = value;
    }
    baseline = { ...snapshot };
  }

  return {
    get state() {
      return state;
    },
    get seat() {
      return seat;
    },
    get tick() {
      return tick;
    },
    sendInput(input) {
      if (disposed || !state) return;
      transport.send(
        encodeFrame(
          { type: FRAME.input, seq: ++inputSeq, ack: acked, tick },
          { seq: inputSeq, input: input as unknown as Record<string, unknown> },
        ),
      );
    },
    sendCommand(name, args) {
      if (disposed || !state) return;
      const payload: CommandPayload = { name };
      if (args?.length) payload.args = [...args];
      transport.send(
        encodeFrame(
          { type: FRAME.command, seq: ++inputSeq, ack: acked, tick },
          payload,
        ),
      );
    },
    sendChat(text) {
      // Deliberately NOT gated on `state`: a spectator refused at the
      // handshake, or one still waiting for a level to build, may still be in
      // the chat — which is most of what makes a session feel occupied while
      // somebody is loading.
      if (disposed) return;
      const payload: ChatPayload = { text };
      transport.send(
        encodeFrame(
          { type: FRAME.chat, seq: ++inputSeq, ack: acked, tick },
          payload,
        ),
      );
    },
    netStats() {
      const last = received[received.length - 1];
      const first = received[0];
      if (!last || !first || received.length < 2) {
        return { rate: 0, perSec: 0, lastBytes: last?.bytes ?? 0 };
      }
      // The span is measured in SERVER TICKS (60/s), read off the frames that
      // arrived — so a stalled connection reads as a falling rate rather than
      // a frozen one, and no clock had to be injected to get there.
      const spanSec = Math.max(1 / 60, (last.tick - first.tick) / 60);
      let bytes = 0;
      for (const entry of received) bytes += entry.bytes;
      return {
        rate: Math.round((bytes - first.bytes) / spanSec),
        perSec:
          Math.round(((received.length - 1) / spanSec) * 10) / 10,
        lastBytes: last.bytes,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      seat = null;
      // A stale seat outlives its session otherwise, and the next run — a
      // one-hero party — would point its camera at a seat that is not there.
      options.onSeat?.(null);
      transport.close();
    },
  };
}

/**
 * Build the RUN locally from the session parameters.
 *
 * The map SIZE is an engine FLAG rather than an argument, so it is applied
 * first — a client that carved with the host's seed but its own map-size
 * setting would build a different world and then spend the whole run being
 * corrected by deltas about geometry it should never have had.
 *
 * Everything else goes through `createRunFromParams`, the SAME function the
 * session used. That is the whole of why the first delta is empty: not that the
 * two happen to agree, but that one function built both. A field applied here
 * and not there (or there and not here) is sent as a "change" on the very first
 * publish, for a run whose entire design is that the two start identical.
 */
export function buildLocalState(params: SessionParams): GameState {
  setGeneratedMapSize(params.generatedMapSize as GeneratedMapSizeSetting);
  return createRunFromParams(params);
}

/** The refusal, in the terms the JOIN screen puts on screen. Both numbers are
 * always named: a mismatch a player can act on beats one they can only report. */
function describeRefusal(
  reason: RefusalReason,
  host: Handshake,
  mine: Handshake,
): string {
  if (reason === "protocol-mismatch") {
    return `protocol ${mine.protocol} here, ${host.protocol} there`;
  }
  if (reason === "build-mismatch") {
    return `build ${mine.build} here, ${host.build} there`;
  }
  if (reason === "mod-mismatch") {
    return `mods ${mine.mods.join(", ") || "none"} here, ${host.mods.join(", ") || "none"} there`;
  }
  return reason;
}
