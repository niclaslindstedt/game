// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE SESSION — the authoritative simulation, and the only thing in this
// codebase that is allowed to advance it once multiplayer is on.
//
// The renderer used to own the loop: `GameScreen` called `createGame`, held the
// `GameState`, and drove `step()` from `requestAnimationFrame`. From here on
// the host's renderer is JUST ANOTHER CLIENT — it sends input and applies
// snapshots exactly as a joiner does. That is not tidiness; it is the
// simplification every listen server from Quake onward makes, and it is why
// this plan has no "and also, when you are the host…" clauses anywhere in it.
//
// THE CLOCK IS FIXED-TIMESTEP AND CALLER-DRIVEN. `advance(ms)` owes the
// simulation a number of whole `TICK_MS` slices and runs exactly that many;
// nothing here calls a timer. The process entry drives it with a real one and
// the tests drive it by hand, which is what lets a whole level be replayed
// deterministically in a unit test instead of in wall-clock time. The slice
// size is the browser loop's own 1000/60 and must stay that: changing it would
// change the physics.
//
// TWO SUBTLETIES THAT WOULD OTHERWISE BE SILENT BUGS:
//
//  1. **Events accumulate between publishes.** `state.events` is cleared by
//     every `step()`, the simulation runs at 60 Hz, and a snapshot goes out
//     every third tick — so publishing `state.events` directly would drop two
//     ticks of sound, gore, haptics and achievement bookkeeping out of three.
//     They are collected per tick and handed over together.
//  2. **A delta is coded against what the client ACKNOWLEDGED**, not against
//     the last thing sent. A client that missed a packet is coded against the
//     older baseline it still holds, so a loss costs one frame of smoothness
//     and can never desync — and every publish between two acks re-sends the
//     same ground, which is the redundancy that makes an unreliable transport
//     safe in PR 2.
//
//  3. **A client's FIRST baseline is the world at tick 0**, not an empty
//     state. The client built exactly that for itself from the SessionParams,
//     so the very first delta already omits the obstacles, the decor, the
//     canopy and the carve. That is the ~100 KB per level, per client, that
//     the static tier is supposed to save, and it is why no full snapshot is
//     ever sent in ordinary operation.

import {
  advanceIntro,
  advanceOutro,
  createGame,
  dismissIntro,
  setGeneratedMapSize,
  setGeneratedMapsEnabled,
  skipCutscene,
  skipDeathScene,
  skipIntro,
  skipOutro,
  skipStoryOpening,
  step,
  tapCutscene,
  type Difficulty,
  type GameInput,
  type GameState,
  type GeneratedMapSizeSetting,
  type Loadout,
} from "@game/core";

import { encodeFrame, encodeFrameJson } from "./wire/codec.ts";
import {
  diffState,
  patchState,
  type StatePatch,
  type WireState,
} from "./wire/delta.ts";
import {
  FRAME,
  isCommand,
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY_TICKS,
  TICK_MS,
  type CommandName,
  type SessionParams,
  type WelcomePayload,
} from "./wire/protocol.ts";
import {
  baselineFor,
  captureSnapshot,
  type Recipient,
} from "./wire/snapshot.ts";

/** How a session hands bytes to one client. The transport is somebody else's
 * problem — a `MessagePort` in PR 1, a Steam P2P packet or a UDP datagram in
 * PR 2 — and this signature is the whole of what they have to satisfy. */
export type SendFrame = (frame: ArrayBuffer) => void;

/** What was sent at one sequence, kept so an ack can advance the baseline to
 * it without the session storing a whole second copy of the world per frame. */
type Sent =
  { full: true; state: WireState } | { full: false; patch: StatePatch };

/** One connected client, as the session sees it. */
type Client = {
  id: number;
  slot: number;
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
   * What was sent at each unacknowledged sequence. Patches, not snapshots:
   * every delta since the last ack is coded against the SAME baseline, so an
   * ack for sequence N is satisfied by applying N's patch alone — no chain to
   * replay, and the map holds kilobytes rather than worlds.
   */
  history: Map<number, Sent>;
};

/**
 * How many unacknowledged publishes are remembered. Three seconds at the
 * publish rate — far past any round trip a playable session has, and a hard
 * bound so a client that stops acking cannot grow the host's memory. Past it
 * the oldest entries are dropped and the client simply stays baselined where
 * it was, which is still correct: every delta is coded from there.
 */
const MAX_UNACKED = 60;

/** What the session was told to build. */
export type SessionOptions = {
  params: SessionParams;
  /** The engine build both ends compare at the handshake. */
  build: string;
  /** The session's mod ids, in load order. */
  mods?: string[];
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
  /** Attach a client. Sends it a `welcome` immediately; it is baselined on the
   * world at tick 0 and receives a delta from there at the next publish. */
  addClient(id: number, send: SendFrame, ownsPlayer: boolean): void;
  removeClient(id: number): void;
  /** One decoded frame from a client. */
  receive(id: number, type: number, seq: number, payload: unknown): void;
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
const MAX_TICKS_PER_ADVANCE = 240;

export function createSession(options: SessionOptions): Session {
  const { params } = options;
  // The engine's generated-maps toggle is a process-global FLAG, not a
  // `createGame` argument — which is precisely why one session per process is
  // the topology (see the plan's §1.2, reason 2). Applied here so the carve a
  // client rebuilds from the same `SessionParams` matches the server's.
  setGeneratedMapsEnabled(params.generatedMaps);
  setGeneratedMapSize(params.generatedMapSize as GeneratedMapSizeSetting);

  const state = createGame(
    params.seed,
    params.levelId,
    params.difficulty as Difficulty,
    (params.loadout as Loadout | null) ?? undefined,
    params.respec,
    params.clearedLevels,
    params.merchantDiscovered,
  );

  /**
   * The world at tick 0, frozen — the state every client's first delta is
   * coded against.
   *
   * Through JSON rather than by reference, and that is the point: the live
   * state is about to change, and a baseline aliasing it would compare the
   * running world against itself. The rng closures cannot survive the trip and
   * do not need to (the wire never carries them; a client has its own from the
   * same seed), and `explored` arrives back as an index-keyed object, which
   * the differ's byte strategy reads as bytes on purpose.
   */
  const genesis = JSON.parse(
    JSON.stringify(
      captureSnapshot(
        state as unknown as Record<string, unknown>,
        { ownsPlayer: true },
        [],
      ),
    ),
  ) as Record<string, unknown>;

  const clients = new Map<number, Client>();
  const inputs = new Map<number, GameInput>();
  /** Every event since the last publish, in the order the ticks produced them. */
  let pendingEvents: unknown[] = [];
  let tick = 0;
  let seq = 0;
  let sinceSnapshot = 0;
  let closed = false;

  function stepOnce(): void {
    // PR 1 simulates one hero, so there is one input and it is the owner's.
    // PR 3 turns this into a loop over the party; the shape is already right.
    const input = inputs.get(0) ?? IDLE_INPUT;
    step(state, input, TICK_MS);
    tick++;
    if (state.events.length) pendingEvents.push(...state.events);
    // A discrete edge is consumed by the tick it was sampled for. Left set, a
    // single tap would jump on every tick until the next input frame arrived —
    // which at 60 Hz simulation and (say) 30 Hz input is a double jump the
    // player never asked for.
    clearEdges(input);
  }

  function publish(): void {
    seq++;
    for (const client of clients.values()) {
      const snapshot = captureSnapshot(
        state as unknown as Record<string, unknown>,
        client.recipient,
        pendingEvents,
      );
      const patch = diffState(client.baseline, snapshot);
      // Serialized ONCE and used twice: as the frame's bytes, and — parsed
      // back — as the history entry. The parse is what makes the entry safe to
      // keep: `diffState` puts LIVE references in the patch (it copies
      // nothing, deliberately), and a baseline holding live objects would
      // compare the running state against itself next publish and find nothing
      // changed. That bug is silent and total: the client simply stops
      // receiving updates.
      const json = JSON.stringify(patch);
      client.history.set(seq, {
        full: false,
        patch: JSON.parse(json) as StatePatch,
      });
      trimHistory(client);
      client.send(
        encodeFrameJson(
          { type: FRAME.delta, seq, ack: client.ackedSeq, tick },
          json,
        ),
      );
    }
    // Every client that exists has been handed these; one that joins after
    // this point starts from the genesis baseline and owes nothing.
    pendingEvents = [];
  }

  /** Drop the oldest unacknowledged entries once the bound is passed. */
  function trimHistory(client: Client): void {
    while (client.history.size > MAX_UNACKED) {
      const oldest = client.history.keys().next();
      if (oldest.done) return;
      client.history.delete(oldest.value);
    }
  }

  return {
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },

    advance(ms) {
      if (closed || !Number.isFinite(ms) || ms <= 0) return 0;
      const owed = Math.min(Math.floor(ms / TICK_MS), MAX_TICKS_PER_ADVANCE);
      for (let i = 0; i < owed; i++) {
        stepOnce();
        if (++sinceSnapshot >= SNAPSHOT_EVERY_TICKS) {
          sinceSnapshot = 0;
          publish();
        }
      }
      return owed;
    },

    addClient(id, send, ownsPlayer) {
      const recipient: Recipient = { ownsPlayer };
      const client: Client = {
        id,
        slot: ownsPlayer ? 0 : clients.size,
        send,
        recipient,
        // THE GENESIS BASELINE, cut for this recipient. The client builds
        // exactly this for itself out of the SessionParams, so nothing the two
        // already agree on ever reaches the wire — which is the ~100 KB per
        // level, per client, that the static tier is supposed to save. Cut per
        // recipient because a spectator's own `createGame` invented private
        // fields the server must never confirm or deny.
        baseline: baselineFor(genesis, recipient),
        ackedSeq: 0,
        history: new Map(),
      };
      clients.set(id, client);
      if (ownsPlayer) inputs.set(0, { ...IDLE_INPUT });
      const welcome: WelcomePayload = {
        handshake: {
          protocol: PROTOCOL_VERSION,
          build: options.build,
          mods: options.mods ?? [],
        },
        params,
        slot: client.slot,
        ownsPlayer,
      };
      send(encodeFrame({ type: FRAME.welcome, seq, ack: 0, tick }, welcome));
    },

    removeClient(id) {
      clients.delete(id);
    },

    receive(id, type, frameSeq, payload) {
      const client = clients.get(id);
      if (!client) return;
      if (type === FRAME.ack) {
        // Only ever move FORWARD. A reordered or duplicated ack naming an
        // older sequence would re-baseline the client onto a state it has
        // already moved past, and every delta after it would be wrong.
        if (frameSeq <= client.ackedSeq) return;
        const sent = client.history.get(frameSeq);
        // An ack for something no longer remembered (a client that went quiet
        // for three seconds) is ignored rather than trusted: the baseline stays
        // where it is and the next delta is coded from there, which is still
        // correct — just larger.
        if (!sent) return;
        if (sent.full) client.baseline = sent.state;
        else patchState(client.baseline, sent.patch);
        client.ackedSeq = frameSeq;
        for (const held of [...client.history.keys()]) {
          if (held <= frameSeq) client.history.delete(held);
        }
        return;
      }
      // Only the hero's owner may steer him or act for him. A spectator
      // driving somebody else's character is the cheapest possible griefing,
      // and the check belongs HERE — the one place a client cannot argue with
      // it.
      if (!client.recipient.ownsPlayer) return;
      if (type === FRAME.input) {
        applyInput(inputs, client.slot, payload);
        return;
      }
      if (type === FRAME.command) {
        runCommand(state, (payload as { name?: unknown } | null)?.name);
      }
    },

    close(reason, detail) {
      if (closed) return;
      closed = true;
      for (const client of clients.values()) {
        client.send(
          encodeFrame(
            { type: FRAME.bye, seq, ack: 0, tick },
            { reason, detail },
          ),
        );
      }
      clients.clear();
    },
  };
}

/** What the simulation is handed when nobody is steering — a hero standing
 * still, which is what a client with a screen open contributes from PR 3 on. */
const IDLE_INPUT: GameInput = {
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
 * what makes it the natural home for PR 5's validation. What it enforces today
 * is only the shape: an input that is not an object is dropped rather than
 * spread onto the slot, because a `null` here would be a crash inside `step`
 * on the host's own machine.
 */
function applyInput(
  inputs: Map<number, GameInput>,
  slot: number,
  payload: unknown,
): void {
  if (!payload || typeof payload !== "object") return;
  const frame = (payload as { input?: unknown }).input;
  if (!frame || typeof frame !== "object") return;
  const current = inputs.get(slot) ?? { ...IDLE_INPUT };
  inputs.set(slot, { ...current, ...(frame as Partial<GameInput>) });
}

/**
 * Run one named command against the run.
 *
 * The name is checked against the closed `COMMANDS` list before anything is
 * dispatched, and the dispatch itself is a `switch` over that union rather
 * than a lookup in a table of functions. Both halves matter: the list keeps a
 * client from naming an engine function nobody offered it, and the explicit
 * switch keeps a future refactor from quietly widening the list by making some
 * module's exports reachable.
 */
function runCommand(state: GameState, name: unknown): void {
  if (!isCommand(name)) return;
  const command: CommandName = name;
  switch (command) {
    case "advanceIntro":
      advanceIntro(state);
      return;
    case "skipIntro":
      skipIntro(state);
      return;
    case "dismissIntro":
      dismissIntro(state);
      return;
    case "advanceOutro":
      advanceOutro(state);
      return;
    case "skipOutro":
      skipOutro(state);
      return;
    case "skipCutscene":
      skipCutscene(state);
      return;
    case "tapCutscene":
      tapCutscene(state);
      return;
    case "skipStoryOpening":
      skipStoryOpening(state);
      return;
    case "skipDeathScene":
      skipDeathScene(state);
      return;
  }
}

/** Clear the one-shot edges after the tick that consumed them. */
function clearEdges(input: GameInput): void {
  input.jump = false;
  input.useItem = false;
  delete input.moveItem;
  delete input.dropItemIndex;
}
