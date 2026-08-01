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
//     safe in phase 2.
//
//  3. **A client's FIRST baseline is the world at tick 0**, not an empty
//     state. The client built exactly that for itself from the SessionParams,
//     so the very first delta already omits the obstacles, the decor, the
//     canopy and the carve. That is the ~100 KB per level, per client, that
//     the static tier is supposed to save, and it is why no full snapshot is
//     ever sent in ordinary operation.

import {
  adoptRun,
  applyRunCommand,
  bankCampaignQuests,
  createRunFromParams,
  departHero,
  extractLoadout,
  isRunCommand,
  nextFreeSeat,
  releaseSeat,
  resumeHero,
  seatHero,
  seatOf,
  setBalanceTuning,
  setGeneratedMapSize,
  step,
  validateLoadout,
  type GameInput,
  type GameState,
  type FrozenRun,
  type Loadout,
  type Player,
  type GeneratedMapSizeSetting,
} from "@game/core";

import { createChatRoom, type ChatRoom } from "./chat-room.ts";
import { hash32 } from "./wire/handshake.ts";
import { encodeFrame, encodeFrameJson } from "./wire/codec.ts";
import { playerScaling } from "./wire/players.ts";
import {
  diffState,
  patchState,
  type StatePatch,
  type WireState,
} from "./wire/delta.ts";
import {
  FRAME,
  MAX_CLIENTS,
  RECONNECT_GRACE_MS,
  SNAPSHOT_EVERY_TICKS,
  TICK_MS,
} from "./wire/frames.ts";
import {
  PROTOCOL_VERSION,
  type ChatLine,
  type ChatPayload,
  type RosterEntry,
  type RosterPayload,
  type SessionParams,
  type WelcomePayload,
} from "./wire/protocol.ts";
import {
  baselineFor,
  captureSnapshot,
  type Recipient,
} from "./wire/snapshot.ts";

/** How a session hands bytes to one client. The transport is somebody else's
 * problem — a `MessagePort` in phase 1, a Steam P2P packet or a UDP datagram in
 * phase 2 — and this signature is the whole of what they have to satisfy. */
export type SendFrame = (frame: ArrayBuffer) => void;

/** What was sent at one sequence, kept so an ack can advance the baseline to
 * it without the session storing a whole second copy of the world per frame. */
type Sent =
  { full: true; state: WireState } | { full: false; patch: StatePatch };

/** One connected client, as the session sees it. */
type Client = {
  id: number;
  slot: number;
  /** What the roster and the chat log call them. Sanitized by the hub before
   * it ever reaches here — a name arrives from a stranger. */
  name: string;
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
   * This client has never been sent a world it can trust, so the next publish
   * owes it a FULL snapshot rather than a delta.
   *
   * True only for a session that ADOPTED its run: an ordinary session's client
   * built the genesis world for itself out of the same parameters, which is the
   * whole of why the static tier is free.
   */
  needsFull: boolean;
  /**
   * AN IN-SESSION CROSSING (§6.4) MOVED THE WORLD UNDER THIS CLIENT, and until
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
};

/**
 * How many unacknowledged publishes are remembered. Three seconds at the
 * publish rate — far past any round trip a playable session has, and a hard
 * bound so a client that stops acking cannot grow the host's memory. Past it
 * the oldest entries are dropped and the client simply stays baselined where
 * it was, which is still correct: every delta is coded from there.
 */
const MAX_UNACKED = 60;

/**
 * What the session may ask of the layer that owns the peers.
 *
 * All three are things the session decides and cannot do: it knows a chat line
 * said `/kick`, and the hub is the only thing holding a socket to kick with.
 * Every one has a no-op default, so a session with no networking under it —
 * phase 1's, and every test's — still runs the whole chat path.
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
   * NOBODY OWNS THIS SESSION — it is a DEDICATED SERVER's (plan §5.5), standing
   * empty until players connect to it, rather than a game somebody is playing.
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
   *  3. **The run is a PARTY run from the first tick** (§5.3). The operator of
   *     a machine you connect to has exactly the standing a listen server's
   *     host has — full control of the simulation — so a record set on one is
   *     worth what a record set on the other is.
   */
  ownerless?: boolean;
  /** A line for the host's own log. Optional, and every caller inside a test
   * omits it — the same shape `net/hub.ts` uses. */
  log?(message: string): void;
  /**
   * The per-session secret RECONNECT TICKETS are derived from (plan §5.4).
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
   * and no hero at all.
   */
  addClient(
    id: number,
    send: SendFrame,
    seat: boolean | { play: boolean; loadout?: unknown; resume?: string },
    name?: string,
  ): void;
  removeClient(id: number): void;
  /** One decoded frame from a client. */
  receive(id: number, type: number, seq: number, payload: unknown): void;
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
const MAX_TICKS_PER_ADVANCE = 240;

export function createSession(options: SessionOptions): Session {
  // MUTABLE, because an in-session crossing (§6.4) replaces the run: the
  // params are what a LATER joiner's welcome carries, so after a travel they
  // must describe the level the party is actually on.
  let params = options.params;
  // The map SIZE is a process-global FLAG, not a `createGame` argument — which
  // is precisely why one session per process is the topology (see the plan's
  // §1.2, reason 2). Applied here so the carve a client rebuilds from the same
  // `SessionParams` matches the server's.
  setGeneratedMapSize(params.generatedMapSize as GeneratedMapSizeSetting);

  // TWO DOORS INTO A RUN, and which one was used decides what an arriving
  // client is sent.
  //
  // BUILT — `createGame` builds the world; a RUN is that plus everything the
  // app used to do to it before the first tick: the campaign chain, the purse,
  // the thoughts already read, an opening already watched, a bot run's dialogue
  // mute, and an AUTO PILOT flight's build baseline. ONE function performs all
  // of it, here and in the client, which is what makes an arriving client's
  // first delta empty rather than a list of corrections.
  //
  // ADOPTED — a parked run or a checkpoint restore, which no set of parameters
  // describes. The client cannot rebuild it, so it gets a full snapshot.
  const adopted = options.adopt ?? null;
  let state = adopted ? adoptRun(adopted) : createRunFromParams(params);
  const ownerless = options.ownerless === true;
  if (ownerless) {
    // Seat 0 is a body nobody is behind until somebody joins — see
    // `SessionOptions.ownerless`. `seatZero` is passed because THIS is the
    // session the seat-0 rule was written to exclude: there is no host here to
    // lose, so seat 0 is an ordinary seat.
    departHero(state, 0, { seatZero: true });
    state.party = { seats: state.party?.seats ?? state.players.length };
  }

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
  /**
   * The world at tick 0, frozen — the state every client's first delta is
   * coded against. See {@link frozenGenesis} for why it goes through JSON.
   * Mutable because an in-session crossing (§6.4) replaces the world, and the
   * genesis a later joiner is baselined on has to be the NEW one.
   */
  let genesis = frozenGenesis(state);

  // WHAT THE ADOPTED STATE CLAIMS TO BE has to match what the parameters will
  // make a client build, and there is no delta that could ever reconcile them:
  // the terrain is the STATIC tier and is never sent, so a client would carve
  // one map and walk around inside another for the whole run. Caught here,
  // loudly, rather than shipped as a hero clipping through walls his server
  // does not have.
  //
  // The LEVEL and the DIFFICULTY are what the state can be asked; the SEED it
  // was carved from is not on a `GameState`, so this is a guard rather than a
  // proof. It catches the mistake somebody actually makes — hosting a parked
  // run under the parameters of the level they were about to start — and the
  // rest is on `SessionOptions.adopt`'s own contract.
  if (
    adopted &&
    (state.level.id !== params.levelId ||
      state.difficulty !== params.difficulty)
  ) {
    throw new Error(
      `adopted a ${state.level.id}/${state.difficulty} run into a ` +
        `${params.levelId}/${params.difficulty} session`,
    );
  }

  const clients = new Map<number, Client>();
  const inputs = new Map<number, GameInput>();
  /**
   * SEATS BEING KEPT FOR SOMEBODY WHO DROPPED (plan §5.4), by their ticket.
   *
   * A dropped connection and a player quitting are the same event as far as a
   * socket is concerned, and only one of them should cost somebody the run they
   * are an hour into. So a departure holds the seat for `RECONNECT_GRACE_MS`
   * and the person who left holds the only ticket back into it.
   *
   * Bounded by the seat count, since a seat can be held once — which is why
   * this is keyed by ticket and swept by seat rather than being a list.
   */
  const held = new Map<string, { seat: number; expiresAt: number }>();
  /** Bumped for every ticket minted, so a seat's SECOND occupant never gets the
   * ticket its first one was given — a stale ticket must not open a seat it no
   * longer names. */
  let ticketNonce = 0;
  /** The live ticket each seated client was handed, so a DEPARTURE can put the
   * right one in `held` — the ticket is minted at the welcome, long before
   * anybody knows whether it will be needed. */
  const tickets = new Map<number, string>();
  const secret = options.secret ?? 0;
  const now = options.now ?? (() => 0);
  /** Every event since the last publish, in the order the ticks produced them. */
  let pendingEvents: unknown[] = [];
  let tick = 0;
  let seq = 0;
  let sinceSnapshot = 0;
  let closed = false;

  const maxClients = options.maxClients ?? MAX_CLIENTS;
  /** What the session may ask of whatever owns the sockets. Every one has a
   * no-op default, so a session with no networking under it — phase 1's, and
   * every engine test's — still runs the whole chat path rather than a
   * second, less-tested copy of it. */
  const peers: SessionPeers = {
    kick: options.peers?.kick ?? (() => {}),
    invite: options.peers?.invite ?? (() => false),
    ping: options.peers?.ping ?? (() => -1),
  };

  /**
   * The lowest free seat.
   *
   * `clients.size` was the phase 1 answer and it is wrong the moment anybody
   * leaves: with slots 0, 1 and 2 taken, slot 1 quitting and a fourth person
   * joining, the size is 2 and the newcomer is seated on top of slot 2 — two
   * clients sharing a seat, two roster rows with one number, and (from phase 3)
   * two heroes steered by one input. A seat is a position, not a count.
   */
  function nextSlot(): number {
    const taken = new Set([...clients.values()].map((client) => client.slot));
    for (let slot = 0; slot < maxClients; slot++) {
      if (!taken.has(slot)) return slot;
    }
    return maxClients;
  }

  function rosterEntries(): RosterEntry[] {
    return [...clients.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((client) => ({
        slot: client.slot,
        name: client.name,
        playing: client.recipient.seat !== null,
        seat: client.recipient.seat,
        // The host's own renderer reaches this process over a MessagePort
        // inside the same machine; there is no wire to time, and -1 is the
        // seam's word for that rather than a flattering 0.
        ping: client.slot === 0 ? -1 : peers.ping(client.id),
      }));
  }

  /**
   * Remove a client by display name, on the host's say-so.
   *
   * The owner cannot be kicked — a host kicking themselves out of their own
   * session is not a command, it is a way to lose a run — and the match is on
   * the name as it is DRAWN, because that is the only string the person typing
   * it can see.
   */
  function kickByName(name: string): string | null {
    const wanted = name.trim().toUpperCase();
    for (const client of clients.values()) {
      if (client.slot === 0) continue;
      if (client.name.toUpperCase() !== wanted) continue;
      peers.kick(client.id, "kicked by the host");
      clients.delete(client.id);
      return client.name;
    }
    return null;
  }

  const chat: ChatRoom = createChatRoom({
    roster: rosterEntries,
    setPlayers(n) {
      const scale = playerScaling(n);
      // BOTH knobs, always. Kill XP here is level-based, so a hp-scaled mob is
      // tougher and pays exactly the same XP for its level; scaling `mobHp`
      // alone would make `/players 8` strictly punishing rather than the
      // risk/reward trade it is meant to be. See `wire/players.ts`.
      setBalanceTuning(scale);
      return scale.mobHp;
    },
    kick: kickByName,
    invite: () => peers.invite(),
  });

  /**
   * The seat a `resume` ticket opens, or null.
   *
   * The ticket is CONSUMED whether or not the seat is still resumable: a ticket
   * is good for one return, and leaving a spent one in the table is leaving a
   * second way into a seat somebody may by then be sitting in.
   */
  function claimHeldSeat(ticket: unknown): number | null {
    if (typeof ticket !== "string" || !ticket) return null;
    const record = held.get(ticket);
    if (!record) return null;
    held.delete(ticket);
    // Expired between the sweep and here, or the hold was released for some
    // other reason. `resumeHero` refuses a seat that is not being held, so
    // this is belt and braces rather than the check itself.
    if (now() > record.expiresAt) return null;
    return resumeHero(state, record.seat) ? record.seat : null;
  }

  /** Give up every hold whose window has lapsed, so the seat can be handed to
   * the next arrival. Swept from `advance` — the session's own clock is the
   * only one this feature has. */
  function sweepHeldSeats(): void {
    if (held.size === 0) return;
    const at = now();
    for (const [ticket, record] of held) {
      if (at <= record.expiresAt) continue;
      held.delete(ticket);
      releaseSeat(state, record.seat);
      options.log?.(`net: seat ${record.seat} released — nobody came back`);
    }
  }

  /**
   * The ticket this seated client comes back with (`WelcomePayload.resume`).
   *
   * Derived rather than stored so nothing is remembered until somebody actually
   * leaves: the same reasoning the challenge cookie is built on. The nonce is
   * what stops a seat's previous occupant holding a key to it.
   */
  function mintTicket(seat: number): string {
    ticketNonce++;
    return hash32(`${secret >>> 0}|${seat}|${ticketNonce}|${params.seed}`)
      .toString(36)
      .padStart(7, "0");
  }

  function chatFrame(lines: ChatLine[]): ArrayBuffer {
    const payload: ChatPayload = { lines };
    return encodeFrame({ type: FRAME.chat, seq, ack: 0, tick }, payload);
  }

  function broadcastChat(lines: ChatLine[]): void {
    if (!lines.length) return;
    const frame = chatFrame(lines);
    for (const client of clients.values()) client.send(frame);
  }

  function broadcastRoster(): void {
    const payload: RosterPayload = { entries: rosterEntries() };
    const frame = encodeFrame(
      { type: FRAME.roster, seq, ack: 0, tick },
      payload,
    );
    for (const client of clients.values()) client.send(frame);
  }

  /** Reused across ticks: one slot per seat, so the per-tick input array is not
   * a fresh allocation sixty times a second. */
  const frame: GameInput[] = [];

  function stepOnce(): void {
    // ONE FRAME PER SEAT, index-aligned with `state.players` — which is exactly
    // what `PartyInput` is. A seat whose owner has sent nothing (a player with a
    // screen open, a dropped packet, an empty chair) contributes IDLE rather
    // than repeating its last frame: a lost packet must not leave a hero
    // walking into the horde until the next one arrives.
    frame.length = state.players.length;
    for (let seat = 0; seat < frame.length; seat++) {
      frame[seat] = inputs.get(seat) ?? IDLE_INPUT;
    }
    step(state, frame, TICK_MS);
    tick++;
    if (state.events.length) pendingEvents.push(...state.events);
    // A discrete edge is consumed by the tick it was sampled for. Left set, a
    // single tap would jump on every tick until the next input frame arrived —
    // which at 60 Hz simulation and (say) 30 Hz input is a double jump the
    // player never asked for.
    for (const seated of inputs.values()) clearEdges(seated);
  }

  /** How many crossings this session has performed — folded into each new
   * seed so travelling A → B → A does not rebuild B's first carve. */
  let travels = 0;

  /**
   * AN IN-SESSION CROSSING (§6.4): tear the level down and carry the party
   * through together.
   *
   * The request arrived as the `travelTo` run command (seat 0 only — the host
   * chooses the road) and was parked on `state.pendingTravel` for THIS moment:
   * between ticks, where no frame is half-applied. Every seat's loadout is
   * extracted from the authoritative run (the same funnel every bank uses, an
   * unrecovered corpse's gear included), the destination is built from the
   * session's own parameters with a derived seed, and the party is re-seated
   * in the SAME ORDER — a seat is an index every in-flight frame names, so
   * the rebuild may not renumber anybody. Departed and held seats keep their
   * flags: a body nobody is behind is still nobody's on the next level, and a
   * reconnect ticket must still name a real chair.
   *
   * Every client is then re-baselined: full snapshots until one is
   * acknowledged (`fullUntilAck`), because a delta against a baseline from
   * the old level would name entity ids the client no longer holds. The
   * params are REPLACED so a later joiner's welcome builds the new level.
   */
  function performTravel(): void {
    const request = state.pendingTravel;
    delete state.pendingTravel;
    if (!request) return;
    const seats = state.players.map((hero) => ({
      loadout: extractLoadout(state, hero),
      departed: hero.departed === true,
      held: hero.held === true,
    }));
    const nextParams: SessionParams = {
      ...params,
      seed: hash32(`${params.seed}|${request.to}|${++travels}`),
      levelId: request.to,
      loadout: seats[0]!.loadout,
      // The run's own campaign chain travels with it — each client's app
      // banks the same chain to its own character beside this.
      campaignQuests: bankCampaignQuests(state),
      seenThoughts: [...state.thoughtsSeen],
      // The loadout's banked purse IS the purse: the wealth fold happened
      // when the run was first built.
      coins: null,
      // The session has no roster to ask (a per-character fact) — the
      // destination's merchant starts undiscovered, and each app still banks
      // the meeting for its own hero when he is found.
      merchantDiscovered: false,
      respec: false,
      openingSkip: request.skip,
      // A flight in progress crosses with the run (the refund must revert to
      // the pre-FLIGHT build, not the pre-level one).
      autopilotBuild: state.autopilot.build ?? null,
    };
    let fresh: GameState;
    try {
      fresh = createRunFromParams(nextParams);
    } catch (err) {
      // A destination this build cannot carve. The verb validated the id, so
      // this is belt and braces — refused loudly rather than killing the
      // session process mid-run.
      options.log?.(`net: travel to ${request.to} refused — ${String(err)}`);
      return;
    }
    // The PARTY STAMP survives the crossing — a run more than one person has
    // played does not get its records back by walking through a door.
    if (state.party) fresh.party = { ...state.party };
    for (let seat = 1; seat < seats.length; seat++) {
      seatHero(fresh, seats[seat]!.loadout);
    }
    for (const [seat, info] of seats.entries()) {
      const hero = fresh.players[seat];
      if (!hero) continue;
      if (info.departed) hero.departed = true;
      if (info.held) hero.held = true;
    }
    state = fresh;
    params = nextParams;
    genesis = frozenGenesis(state);
    for (const client of clients.values()) {
      client.needsFull = true;
      client.fullUntilAck = -1;
      client.history.clear();
      client.baseline = baselineFor(genesis, client.recipient);
    }
    inputs.clear();
    for (const client of clients.values()) {
      if (client.recipient.seat !== null) {
        inputs.set(client.recipient.seat, { ...IDLE_INPUT });
      }
    }
    options.log?.(`net: travelled to ${request.to} (${travels})`);
    broadcastChat([chat.announce(`TRAVELLING TO ${request.to.toUpperCase()}`)]);
  }

  function publish(): void {
    seq++;
    for (const client of clients.values()) {
      const snapshot = captureSnapshot(
        state as unknown as Record<string, unknown>,
        client.recipient,
        pendingEvents,
      );
      // A CLIENT THAT CANNOT REBUILD THE WORLD IS SENT ALL OF IT, ONCE. Only a
      // session that ADOPTED its run ever takes this branch: everybody else
      // built the genesis world for themselves from the same parameters, which
      // is the whole of why the static tier costs nothing.
      const full = client.needsFull || client.fullUntilAck !== undefined;
      const payload = full ? snapshot : diffState(client.baseline, snapshot);
      // Serialized ONCE and used twice: as the frame's bytes, and — parsed
      // back — as the history entry. The parse is what makes the entry safe to
      // keep: `diffState` puts LIVE references in the patch (it copies
      // nothing, deliberately), and a baseline holding live objects would
      // compare the running state against itself next publish and find nothing
      // changed. That bug is silent and total: the client simply stops
      // receiving updates. A full snapshot is `captureSnapshot`'s own output
      // and holds live references for exactly the same reason, so it is parsed
      // back for exactly the same reason.
      const json = JSON.stringify(payload);
      client.history.set(
        seq,
        full
          ? { full: true, state: JSON.parse(json) as WireState }
          : { full: false, patch: JSON.parse(json) as StatePatch },
      );
      trimHistory(client);
      client.send(
        encodeFrameJson(
          {
            type: full ? FRAME.snapshot : FRAME.delta,
            seq,
            ack: client.ackedSeq,
            tick,
          },
          json,
        ),
      );
      // Cleared only AFTER the frame is handed over, so a send that throws
      // leaves the client still owed its world rather than baselined on one it
      // never received.
      client.needsFull = false;
      // The first post-travel full is the one whose ack releases the client
      // back onto deltas (§6.4) — record its sequence once.
      if (client.fullUntilAck === -1) client.fullUntilAck = seq;
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
      // AN EMPTY DEDICATED SERVER DOES NOT SIMULATE. Seat 0 is departed until
      // somebody joins, so a step would find every hero out of play and end a
      // run nobody has played — and a machine with nobody on it should cost
      // nothing anyway. The reconnect sweep still runs below, because a held
      // seat has to lapse whether or not anybody is watching.
      if (ownerless && clients.size === 0) {
        sweepHeldSeats();
        return 0;
      }
      // Held seats lapse on the session's own clock rather than on a timer of
      // their own — nothing below the session owns a timer, the same rule the
      // transport seam follows.
      sweepHeldSeats();
      const owed = Math.min(Math.floor(ms / TICK_MS), MAX_TICKS_PER_ADVANCE);
      for (let i = 0; i < owed; i++) {
        stepOnce();
        // A requested crossing (§6.4) is consumed BETWEEN ticks, where no
        // frame is half-applied — and before the publish, so the first
        // snapshot after a travel is already the new world.
        if (state.pendingTravel) performTravel();
        if (++sinceSnapshot >= SNAPSHOT_EVERY_TICKS) {
          sinceSnapshot = 0;
          publish();
        }
      }
      return owed;
    },

    get clientCount() {
      return clients.size;
    },

    addClient(id, send, seatRequest, name) {
      const wants =
        typeof seatRequest === "boolean"
          ? { play: seatRequest, loadout: undefined as unknown }
          : seatRequest;
      // The HOST is always slot 0 and seat 0 — they are the run that already
      // exists. Everybody else takes the lowest free roster slot, and a player
      // among them is SEATED: a hero of their own is appended to the party,
      // and the index they land on IS their seat.
      // A DEDICATED SERVER HAS NO HOST, so the arrival-order heuristic below is
      // switched off for one: every player is seated with the hero they
      // brought, and the first of them takes the departed seat 0.
      const host = !ownerless && wants.play && clients.size === 0;
      const slot = host ? 0 : nextSlot();
      // THE SEAT IS THE SERVER'S ANSWER: a seated client steers
      // `state.players[seat]` and nobody else, and a spectator has no seat at
      // all — which is what every privacy and authority check below reads,
      // never a claim the client made about itself.
      let seat: number | null = null;
      // A RECONNECT IS TRIED FIRST, and it short-circuits everything below —
      // the seat cap included, since the seat is already theirs and was never
      // given away. The hero standing on the field IS the authoritative one, so
      // the `loadout` on the join is deliberately not read: dressing a resumed
      // hero in a claim that arrived from a stranger would hand a reconnect the
      // one thing a fresh join is checked for.
      const resumed = wants.play ? claimHeldSeat(wants.resume) : null;
      if (host) {
        seat = 0;
      } else if (resumed !== null) {
        seat = resumed;
        options.log?.(`net: slot ${slot} resumed seat ${seat}`);
      } else if (wants.play && nextFreeSeat(state) < maxClients) {
        // A joiner arrives beside the party with their OWN bag, purse and
        // build. The seat is never RENUMBERED — every command and input frame
        // in flight names one by index — but a seat somebody has LEFT is handed
        // out again (see `game/seating.ts`), so a session people have come and
        // gone from is not eventually full of bodies nobody is behind.
        //
        // AND THE HERO THEY BRING IS A CLAIM FROM A STRANGER, so it is weighed
        // before the simulation is handed it (plan §5.3): the level is held
        // inside the ladder, every stat block inside what that level pays for,
        // and every piece checked against the catalogs — an id nothing has
        // heard of is a crash on the HOST's machine from one packet. It is a
        // speed bump rather than a wall and `loadout-check.ts` says so at
        // length. What it corrected is logged HERE and not sent back: telling
        // a joiner which field failed is telling an attacker which field to fix.
        const checked = validateLoadout(wants.loadout);
        if (checked?.problems.length) {
          options.log?.(
            `net: loadout corrected for slot ${slot} — ` +
              checked.problems.join("; "),
          );
        }
        seat = seatOf(
          state,
          seatHero(state, (checked?.loadout as Loadout | null) ?? null),
        );
      }
      const recipient: Recipient = { seat };
      const client: Client = {
        id,
        slot,
        name: name?.trim() || (host ? "HOST" : `PLAYER ${slot + 1}`),
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
        needsFull: adopted !== null,
        history: new Map(),
      };
      clients.set(id, client);
      if (seat !== null) inputs.set(seat, { ...IDLE_INPUT });
      // A HERO SEATED MID-RUN CHANGES THE WORLD, and every other client's
      // baseline predates them. A delta would carry the new hero correctly —
      // the differ handles a grown list — but the ARRIVING client's own
      // `createRunFromParams` built a one-hero party, so it has no way to know
      // about the seats already standing. Everybody gets a full snapshot on the
      // next publish rather than a delta against a party that changed shape.
      if (seat !== null && seat > 0) {
        for (const other of clients.values()) other.needsFull = true;
      }
      const welcome: WelcomePayload = {
        handshake: {
          protocol: PROTOCOL_VERSION,
          build: options.build,
          mods: options.mods ?? [],
        },
        params,
        slot: client.slot,
        seat: recipient.seat,
        // The ticket back into this seat. Minted per WELCOME rather than per
        // seat, so every reconnection issues a fresh one and the ticket that
        // just got somebody in is spent.
        resume:
          recipient.seat === null ? undefined : mintTicket(recipient.seat),
      };
      if (welcome.resume) tickets.set(id, welcome.resume);
      send(encodeFrame({ type: FRAME.welcome, seq, ack: 0, tick }, welcome));
      // The log is handed over WHOLE, and only to the arriving client: a
      // spectator who joins an hour in and sees an empty chat box has no way
      // to tell a quiet session from a broken one. It is bounded for exactly
      // this reason — see `MAX_CHAT_LOG`.
      if (chat.log.length) send(chatFrame([...chat.log]));
      // The arrival is announced AFTER the welcome, so the newcomer sees their
      // own arrival in the same order everybody else does.
      broadcastChat([chat.announce(`${client.name} JOINED`)]);
      broadcastRoster();
    },

    removeClient(id) {
      const client = clients.get(id);
      if (!client) return;
      clients.delete(id);
      // A DEPARTING PLAYER'S HERO IS NO LONGER ANYBODY'S. The seat is NOT
      // spliced out — every command and input frame in flight names a seat by
      // index, so renumbering the party would deliver somebody else's steering
      // to the wrong hero — but two things have to happen to the body it holds.
      //
      // The last frame they sent goes, or it keeps walking toward wherever they
      // were last steering for the rest of the run. And the hero is DEPARTED
      // (plan §4.2): the world stops answering for it, which is what lets the
      // people still playing grow past the seat, keeps a departed level-90 from
      // holding the horde's level over them, and — the sharp end — lets them
      // LOSE, since a run whose fourth player quit could not otherwise ever be
      // defeated.
      //
      // AND THE SEAT IS KEPT FOR THEM (plan §5.4). A dropped connection and a
      // player quitting are indistinguishable from here, so every departure is
      // treated as though it might be the first: the body still means nothing
      // to the world, but the seat is not handed to a newcomer for
      // `RECONNECT_GRACE_MS`, and the person who left holds the only ticket
      // back into it. Coming back resumes the hero as it stands — every point
      // of xp, every item, every level — rather than building a fresh one out
      // of whatever loadout was last banked, which is the whole value of the
      // feature: otherwise a lost packet costs an hour.
      const ticket = tickets.get(id);
      tickets.delete(id);
      if (client.recipient.seat !== null) {
        inputs.set(client.recipient.seat, { ...IDLE_INPUT });
        departHero(state, client.recipient.seat, {
          hold: ticket !== undefined,
          // Only an ownerless session may empty seat 0 — see `DepartOptions`.
          seatZero: ownerless,
        });
        if (ticket !== undefined) {
          held.set(ticket, {
            seat: client.recipient.seat,
            expiresAt: now() + RECONNECT_GRACE_MS,
          });
        }
      }
      // The host leaving is the session ending, and `close` says so in its own
      // words; announcing "HOST LEFT" first would put a chat line in front of
      // a bye nobody will be around to read.
      if (client.slot === 0) return;
      broadcastChat([chat.announce(`${client.name} LEFT`)]);
      broadcastRoster();
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
        // The client has applied a post-travel world — deltas are safe again.
        if (
          client.fullUntilAck !== undefined &&
          client.fullUntilAck > 0 &&
          frameSeq >= client.fullUntilAck
        ) {
          delete client.fullUntilAck;
        }
        for (const held of [...client.history.keys()]) {
          if (held <= frameSeq) client.history.delete(held);
        }
        return;
      }
      if (type === FRAME.chat) {
        // CHAT IS THE ONE THING A SPECTATOR MAY DO, and it is the whole point
        // of shipping it in this PR rather than in phase 4: eight people watching
        // a hardcore run in silence are eight people watching a video. What
        // any one of them may CHANGE is still nothing — the room refuses a
        // spectator's `/players`, `/kick` and `/invite` by name.
        const reply = chat.say(
          {
            slot: client.slot,
            name: client.name,
            isHost: client.slot === 0,
          },
          (payload as { text?: unknown } | null)?.text,
        );
        broadcastChat(reply.broadcast);
        if (reply.toSpeaker.length) client.send(chatFrame(reply.toSpeaker));
        // A `/kick` or a `/players` may have changed who is here and what they
        // are standing in; the roster is what the party frames read.
        if (reply.broadcast.length) broadcastRoster();
        return;
      }
      // Only the hero's owner may steer him or act for him. A spectator
      // driving somebody else's character is the cheapest possible griefing,
      // and the check belongs HERE — the one place a client cannot argue with
      // it.
      if (client.recipient.seat === null) return;
      if (type === FRAME.input) {
        applyInput(inputs, client.recipient.seat, payload);
        return;
      }
      if (type === FRAME.command) {
        const frame = payload as { name?: unknown; args?: unknown } | null;
        // THE ACTING HERO IS THE SEAT WE ADMITTED THIS CLIENT INTO, never a
        // field on the frame (plan §3.6's debt). A bag, a purse, a build and a
        // talent tree are private, so a command that touches one had to learn
        // whose it is — and letting a client NAME the seat would hand a
        // stranger somebody else's inventory in one field.
        runCommand(
          state,
          frame?.name,
          frame?.args,
          state.players[client.recipient.seat],
        );
      }
    },

    roster: rosterEntries,

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
function frozenGenesis(state: GameState): Record<string, unknown> {
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
 * still, which is what a client with a screen open contributes from phase 3 on. */
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
 * what makes it the natural home for phase 5's validation. What it enforces today
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
function runCommand(
  state: GameState,
  name: unknown,
  args: unknown,
  actor: Player | undefined,
): void {
  if (!isRunCommand(name)) return;
  applyRunCommand(state, name, Array.isArray(args) ? args : [], actor);
}

/** Clear the one-shot edges after the tick that consumed them. */
function clearEdges(input: GameInput): void {
  input.jump = false;
  input.useItem = false;
  delete input.moveItem;
  delete input.dropItemIndex;
}
