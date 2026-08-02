// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SESSION'S SHAPES AND PURE HELPERS — everything `session.ts` says about
// itself without closing over a running world.
//
// Split from `session.ts` by concern, not by whim: that module is the
// authoritative simulation loop and every line in it should be about ADVANCING
// and PUBLISHING a run. What lives here instead is the vocabulary both sides of
// that loop share — the option and client records, the public `Session`
// surface, and the handful of pure functions (genesis freezing, input folding,
// command dispatch) that read their arguments and touch nothing else. Nothing
// here owns state; nothing here may grow a closure.

import {
  applyRunCommand,
  isRunCommand,
  type FrozenRun,
  type GameInput,
  type GameState,
  type Player,
} from "@game/core";

import { type StatePatch, type WireState } from "./wire/delta.ts";
import { type RosterEntry, type SessionParams } from "./wire/protocol.ts";
import { captureSnapshot, type Recipient } from "./wire/snapshot.ts";

/** How a session hands bytes to one client. The transport is somebody else's
 * problem — a `MessagePort`, a Steam P2P packet or a UDP datagram — and this
 * signature is the whole of what they have to satisfy. */
export type SendFrame = (frame: ArrayBuffer) => void;

/** What was sent at one sequence, kept so an ack can advance the baseline to
 * it without the session storing a whole second copy of the world per frame. */
export type Sent =
  { full: true; state: WireState } | { full: false; patch: StatePatch };

/** One connected client, as the session sees it. */
export type Client = {
  id: number;
  slot: number;
  /** What the roster and the chat log call them. Sanitized by the hub before
   * it ever reaches here — a name arrives from a stranger. */
  name: string;
  /** This client is one of the session's OWN bot seats — an autopilot hero the
   * session created to fill an empty chair. It prices the horde like a
   * `/players` step, is never minted a reconnect ticket (a bot cannot drop),
   * and yields its seat when a person wants it. */
  bot: boolean;
  send: SendFrame;
  recipient: Recipient;
  /**
   * The state this client is KNOWN to hold — the one every delta is coded
   * against. It starts as a copy of the world at creation, which is the whole
   * trick behind the static tier: the client built exactly that for itself
   * from the SessionParams, so the very first delta already omits the
   * obstacles, the decor, the canopy and the carve.
   */
  baseline: WireState;
  /** The last sequence this client said it had applied. */
  ackedSeq: number;
  /**
   * The highest `InputPayload.seq` this client has sent that was APPLIED —
   * folded onto its seat's live input. Echoed in the `ack` field of every
   * state frame sent to this client, which is what the client's movement
   * prediction reconciles against: inputs at or below this number are the
   * server's business now, inputs above it are replayed locally. Tracking the
   * MAX (rather than the last seen) keeps the input fold latest-wins while a
   * reordered or duplicated frame can never move the echo backwards.
   */
  lastInputSeq: number;
  /**
   * This client has never been sent a world it can trust, so the next publish
   * owes it a FULL snapshot rather than a delta.
   *
   * True only for a session that ADOPTED its run: an ordinary session's client
   * built the genesis world for itself out of the same parameters, which is the
   * whole of why the static tier is free.
   */
  needsFull: boolean;
  /**
   * AN IN-SESSION CROSSING MOVED THE WORLD UNDER THIS CLIENT, and until
   * it acknowledges a post-travel snapshot every publish stays FULL. A delta
   * would be coded against a baseline from the OLD level — entity lists whose
   * ids the client no longer holds — and on an unreliable transport there is
   * no ordering to lean on. -1 until the first post-travel full is sent; then
   * that send's seq; deleted when an ack reaches it.
   */
  fullUntilAck?: number;
  /**
   * What was sent at each unacknowledged sequence. Patches, not snapshots:
   * every delta since the last ack is coded against the SAME baseline, so an
   * ack for sequence N is satisfied by applying N's patch alone — no chain to
   * replay, and the map holds kilobytes rather than worlds.
   */
  history: Map<number, Sent>;
  /** State bytes sent in the current measuring window. Snapshot and delta
   * frames only — control traffic is noise beside them. */
  sentWindow: number;
  /** When the window opened. */
  windowStart: number;
  /** The last completed window's rate, in bytes per second. What the roster
   * reports — a live counter would flicker with the publish beat. */
  sendRate: number;
};

/**
 * How many unacknowledged publishes are remembered. Three seconds at the
 * publish rate — far past any round trip a playable session has, and a hard
 * bound so a client that stops acking cannot grow the host's memory. Past it
 * the oldest entries are dropped and the client simply stays baselined where
 * it was, which is still correct: every delta is coded from there.
 */
export const MAX_UNACKED = 60;

/** Drop the oldest unacknowledged entries once the bound is passed. */
export function trimHistory(client: Client): void {
  while (client.history.size > MAX_UNACKED) {
    const oldest = client.history.keys().next();
    if (oldest.done) return;
    client.history.delete(oldest.value);
  }
}

/**
 * What the session may ask of the layer that owns the peers.
 *
 * All three are things the session decides and cannot do: it knows a chat line
 * said `/kick`, and the hub is the only thing holding a socket to kick with.
 * Every one has a no-op default, so a session with no networking under it —
 * a MessagePort-only listen server's, and every test's — still runs the whole
 * chat path.
 */
export type SessionPeers = {
  /** Remove a client. The session has already decided it should happen. */
  kick(clientId: number, reason: string): void;
  /** Open the platform's invite panel. False when this build has none. */
  invite(): boolean;
  /** Round trip in ms, or -1 when nothing can measure one. */
  ping(clientId: number): number;
};

/** What the session was told to build. */
export type SessionOptions = {
  params: SessionParams;
  /** The engine build both ends compare at the handshake. */
  build: string;
  /** The session's mod ids, in load order. */
  mods?: string[];
  /** Seats, host included. */
  maxClients?: number;
  peers?: Partial<SessionPeers>;
  /**
   * NOBODY OWNS THIS SESSION — it is a DEDICATED SERVER's (`dedicated.ts`),
   * standing empty until players connect to it, rather than a game somebody is
   * playing.
   *
   * **THE BUG THIS EXISTS FOR IS SUBTLE AND WAS FOUND BY RUNNING ONE.** The
   * host is identified below by being the FIRST client to ask for a seat, which
   * is true only because in the shipped topology the host's own renderer always
   * connects first, over a `MessagePort`, before any socket is open. A dedicated
   * server has no such renderer — so the first person to join over the network
   * was mistaken for the host, seated on the run's existing seat-0 hero, and
   * handed a DEFAULT character instead of the one they brought.
   *
   * Three things follow, and each is a rule rather than a workaround:
   *
   *  1. **No client is the host.** Seat 0 starts DEPARTED, so `nextFreeSeat`
   *     offers it to the first arrival like any other seat and `seatHero`
   *     dresses it in their own loadout.
   *  2. **An empty server does not simulate.** With seat 0 departed and nobody
   *     in, every hero is out of play and `partyWiped` would end a run nobody
   *     has played. It also happens to be right on its own terms: a server with
   *     nobody on it should cost nothing.
   *  3. **The run is a PARTY run from the first tick.** The operator of
   *     a machine you connect to has exactly the standing a listen server's
   *     host has — full control of the simulation — so a record set on one is
   *     worth what a record set on the other is.
   */
  ownerless?: boolean;
  /** A line for the host's own log. Optional, and every caller inside a test
   * omits it — the same shape `net/hub.ts` uses. */
  log?(message: string): void;
  /**
   * The per-session secret RECONNECT TICKETS are derived from.
   *
   * Passed in for the same reason the hub's challenge secret is: this module
   * has no randomness of its own, and the engine's seeded rng is emphatically
   * not a source for one — that stream is the simulation's, every draw from it
   * is load-bearing for a replay, and a secret taken from a seed a client was
   * TOLD is not a secret. `server/main.ts` rolls it once per process and hands
   * the same number to both.
   *
   * Zero (the default) still produces distinct tickets per seat and per
   * occupancy; what it costs is unguessability, which only matters against a
   * stranger on the wire, and every caller that has one passes it.
   */
  secret?: number;
  /**
   * Monotonic ms, for the reconnect grace window — the ONE thing in this module
   * measured in wall clock rather than in ticks.
   *
   * A grace window counted in ticks would run at the speed of the simulation,
   * so a host whose machine hitched would hold seats longer than it meant to,
   * and a paused session would hold them for ever. Defaulted so every test that
   * does not care about reconnecting need not supply one.
   */
  now?(): number;
  /**
   * A run to ADOPT instead of building one from `params` — a parked run, or a
   * checkpoint the player just retried into.
   *
   * **IT COSTS THE STATIC TIER, so pass one only when there is no alternative.**
   * A client builds the terrain from the parameters and is sent only what
   * differs from it; a client whose server adopted a state cannot build
   * anything that matches, so every client is sent a FULL first snapshot
   * instead (~100 KB per level, per client, that a parameter-built session
   * never carries).
   *
   * The parameters still travel and still matter: they are what the client
   * builds ITS OWN world from, so an adopted state must be handed the
   * parameters it was originally built from. Hand it somebody else's and the
   * client carves different terrain — which nothing will ever correct, because
   * the static tier is never sent.
   */
  adopt?: FrozenRun | null;
};

export type Session = {
  /** The authoritative state. Read by the host's own diagnostics and by the
   * tests; NOTHING outside this module may write it. */
  readonly state: GameState;
  /** Ticks elapsed since the session started. */
  readonly tick: number;
  /** Owe the simulation `ms` of wall clock and run the whole `TICK_MS` slices
   * it buys. Returns how many ticks actually ran. */
  advance(ms: number): number;
  /** Seats taken, host included. */
  readonly clientCount: number;
  /**
   * Attach a client. Sends it a `welcome` immediately; it is baselined on the
   * world at tick 0 and receives a delta from there at the next publish.
   *
   * `seat` decides whether this client STEERS a hero or only watches. A player
   * gets a seat of their own — a whole `Player` built by the same function seat
   * 0 was, dressed in the `loadout` they brought — and the seat number is the
   * server's answer, never a claim the client made. A spectator gets `false`
   * and no hero at all. `bot: true` marks one of the session's OWN autopilot
   * seats — only the session's bot creation passes it; the hub never forwards
   * a joiner's claim.
   */
  addClient(
    id: number,
    send: SendFrame,
    seat:
      | boolean
      | { play: boolean; loadout?: unknown; resume?: string; bot?: boolean },
    name?: string,
  ): void;
  removeClient(id: number): void;
  /** One decoded frame from a client. */
  receive(id: number, type: number, seq: number, payload: unknown): void;
  /** How many of the seated clients are the session's own BOTS. The hub reads
   * it so its seat-cap check counts only people — a bot yields its seat to an
   * arriving player, so a session full of bots is not full. */
  readonly botClients: number;
  /** Everyone seated, as everybody else may see them. */
  roster(): RosterEntry[];
  /** Tell every client the session is over, then drop them. */
  close(reason: string, detail?: string): void;
};

/**
 * The most simulation one `advance` call may run.
 *
 * The spiral-of-death backstop the browser loop already has, for the same
 * reason and with the same shape: a host whose machine hitched must not try to
 * pay a second of debt inside one timer callback, because the tick that pays it
 * is the tick that stops answering clients. Four seconds of simulation, far
 * above anything an ordinary schedule asks for.
 */
export const MAX_TICKS_PER_ADVANCE = 240;

/**
 * A state frozen for use as the genesis baseline.
 *
 * Through JSON rather than by reference, and that is the point: the live
 * state is about to change, and a baseline aliasing it would compare the
 * running world against itself. The rng closures cannot survive the trip and
 * do not need to (the wire never carries them; a client has its own from the
 * same seed), and `explored` arrives back as an index-keyed object, which
 * the differ's byte strategy reads as bytes on purpose.
 */
export function frozenGenesis(state: GameState): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(
      captureSnapshot(
        state as unknown as Record<string, unknown>,
        { seat: 0 },
        [],
      ),
    ),
  ) as Record<string, unknown>;
}

/** What the simulation is handed when nobody is steering — a hero standing
 * still, which is what a client with a screen open contributes. */
export const IDLE_INPUT: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
  useItem: false,
};

/**
 * Fold one client's input frame into the slot's live input.
 *
 * The wire carries a plain record, so this is where it becomes a `GameInput`
 * — and it is the ONE place a client's bytes reach the simulation, which is
 * what makes it the natural home for deeper input validation. What it enforces
 * today is only the shape: an input that is not an object is dropped rather
 * than spread onto the slot, because a `null` here would be a crash inside
 * `step` on the host's own machine.
 *
 * Returns whether the frame was actually folded, so the caller can advance the
 * applied-input-seq echo only for payloads that reached the simulation.
 */
export function applyInput(
  inputs: Map<number, GameInput>,
  slot: number,
  payload: unknown,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const frame = (payload as { input?: unknown }).input;
  if (!frame || typeof frame !== "object") return false;
  const current = inputs.get(slot) ?? { ...IDLE_INPUT };
  inputs.set(slot, { ...current, ...(frame as Partial<GameInput>) });
  return true;
}

/**
 * Run one named command against the run.
 *
 * TWO CLOSED LISTS, ONE BEHIND THE OTHER, and both are load-bearing. The name
 * is checked here against the ENGINE's table (`isRunCommand`) before anything
 * is dispatched, and the dispatch itself — `applyRunCommand` — is an explicit
 * `switch` over that union rather than a lookup in a table of functions, so no
 * future refactor can widen the channel by making some module's exports
 * reachable. The ARGUMENTS are checked the same way, against the arity and
 * types declared beside each verb: a client on an open UDP port gets to choose
 * them, and "an index" that arrives as an object is how a host is crashed by a
 * stranger.
 *
 * Nothing is done with the return value, deliberately. A command is
 * fire-and-forget on the wire and every caller is written to that contract —
 * see the dispatcher's note in `pwa/src/game/run-commands.ts` about why the
 * app may not depend on the difference between "refused" and "returned
 * nothing".
 */
export function runCommand(
  state: GameState,
  name: unknown,
  args: unknown,
  actor: Player | undefined,
): void {
  if (!isRunCommand(name)) return;
  applyRunCommand(state, name, Array.isArray(args) ? args : [], actor);
}

/** Clear the one-shot edges after the tick that consumed them. */
export function clearEdges(input: GameInput): void {
  input.jump = false;
  input.useItem = false;
  delete input.moveItem;
  delete input.dropItemIndex;
}
