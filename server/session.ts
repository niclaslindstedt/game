// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE SESSION — the authoritative simulation, and the only thing in this
// codebase that is allowed to advance it once multiplayer is on.
//
// The renderer used to own the loop: `GameScreen` called `createGame`, held the
// `GameState`, and drove `step()` from `requestAnimationFrame`. From here on
// the host's renderer is JUST ANOTHER CLIENT — it sends input and applies
// snapshots exactly as a joiner does. That is not tidiness; it is the
// simplification every listen server from Quake onward makes, and it is why
// this design has no "and also, when you are the host…" clauses anywhere in it.
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
//     (a UDP datagram, a Steam P2P packet) safe to run over.
//
//  3. **A client's FIRST baseline is the world at tick 0**, not an empty
//     state. The client built exactly that for itself from the SessionParams,
//     so the very first delta already omits the obstacles, the decor, the
//     canopy and the carve. That is the ~100 KB per level, per client, that
//     the static tier is supposed to save, and it is why no full snapshot is
//     ever sent in ordinary operation.

import {
  adoptRun,
  bankCampaignQuests,
  createRunFromParams,
  departHero,
  extractLoadout,
  LEVEL_ORDER,
  nextFreeSeat,
  releaseSeat,
  resumeHero,
  seatHero,
  seatOf,
  setBalanceTuning,
  step,
  validateLoadout,
  type GameInput,
  type GameState,
  type Loadout,
} from "@game/core";

import { createChatRoom, type ChatRoom } from "./chat-room.ts";
// The session's SHAPES and pure helpers live beside this module
// (`session-model.ts`), split by concern: everything here closes over a
// running world, everything there deliberately cannot.
import {
  applyInput,
  clearEdges,
  frozenGenesis,
  IDLE_INPUT,
  MAX_TICKS_PER_ADVANCE,
  runCommand,
  trimHistory,
  type Client,
  type Session,
  type SessionOptions,
  type SessionPeers,
} from "./session-model.ts";

// Re-exported so every existing importer keeps its one import site.
export type {
  SendFrame,
  Session,
  SessionOptions,
  SessionPeers,
} from "./session-model.ts";
import { hash32 } from "./wire/handshake.ts";
import { encodeFrame, encodeFrameJson, HEADER_BYTES } from "./wire/codec.ts";
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

export function createSession(options: SessionOptions): Session {
  // MUTABLE, because an in-session crossing replaces the run: the
  // params are what a LATER joiner's welcome carries, so after a travel they
  // must describe the level the party is actually on.
  let params = options.params;

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
   * Mutable because an in-session crossing replaces the world, and the
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
   * SEATS BEING KEPT FOR SOMEBODY WHO DROPPED, by their ticket.
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
   * no-op default, so a session with no networking under it — a MessagePort-
   * only listen server's, and every engine test's — still runs the whole chat
   * path rather than a second, less-tested copy of it. */
  const peers: SessionPeers = {
    kick: options.peers?.kick ?? (() => {}),
    invite: options.peers?.invite ?? (() => false),
    ping: options.peers?.ping ?? (() => -1),
  };

  /**
   * The lowest free seat.
   *
   * `clients.size` was the obvious first answer and it is wrong the moment
   * anybody leaves: with slots 0, 1 and 2 taken, slot 1 quitting and a fourth
   * person joining, the size is 2 and the newcomer is seated on top of slot 2
   * — two clients sharing a seat, two roster rows with one number, and — once
   * joiners bring heroes of their own — two heroes steered by one input. A
   * seat is a position, not a count.
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
        rate: client.sendRate,
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

  /** What `/players N` asked for, or null while the host has not typed one.
   * Kept apart from the bot count so the two compose rather than overwrite:
   * the chat knob is a bargain the host strikes, the bot seats are bodies
   * actually standing in the fight, and each re-application reads BOTH. */
  let playersOverride: number | null = null;

  /** Bot seats still standing in the run — departed ones stopped counting the
   * moment they yielded. */
  function botSeatsInPlay(): number {
    let bots = 0;
    for (const hero of state.players) {
      if (hero.bot && !hero.departed) bots++;
    }
    return bots;
  }

  /**
   * Recompute and apply the horde's player-count pricing — the ONE place
   * `setBalanceTuning(playerScaling(…))` is called, from the chat hook and
   * from every bot seating or departure alike.
   *
   * A bot seat prices the fight exactly as a `/players` step does, because it
   * IS one more body standing in it. And it is BOTH knobs, always: kill XP is
   * level-based, so a hp-scaled mob is tougher and pays exactly the same XP for
   * its level — hp and xpGain move together or `/players` (and every bot seat)
   * is strictly punishing rather than the risk/reward trade it is meant to be.
   * See `wire/players.ts`.
   */
  function applyPlayerScaling(): number {
    const scale = playerScaling((playersOverride ?? 1) + botSeatsInPlay());
    setBalanceTuning(scale);
    return scale.mobHp;
  }

  const chat: ChatRoom = createChatRoom({
    roster: rosterEntries,
    setPlayers(n) {
      playersOverride = n;
      // The reply keeps quoting the mobHp factor — the number the host was
      // promised, bots included.
      return applyPlayerScaling();
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
  let startedLevel: string | null = null;

  function playerName(seat: number): string {
    for (const client of clients.values()) {
      if (client.recipient.seat === seat) return client.name;
    }
    return `PLAYER ${seat + 1}`;
  }

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
    if (state.phase === "playing" && startedLevel !== state.level.id) {
      startedLevel = state.level.id;
      options.log?.(`game started — ${state.level.id}`);
    }
    if (state.events.length) {
      pendingEvents.push(...state.events);
      for (const event of state.events) {
        if (event.type === "heroDown") {
          options.log?.(`player died — ${playerName(event.seat)}`);
        } else if (event.type === "playerDeath") {
          const seat = state.players.findIndex(
            (hero) => !hero.departed && hero.hp <= 0,
          );
          options.log?.(`player died — ${playerName(Math.max(0, seat))}`);
        } else if (event.type === "victory") {
          options.log?.(`level finished — ${state.level.id}`);
          if (state.level.id === LEVEL_ORDER[LEVEL_ORDER.length - 1]) {
            options.log?.(`campaign finished — ${state.difficulty}`);
          }
        }
      }
    }
    // A discrete edge is consumed by the tick it was sampled for. Left set, a
    // single tap would jump on every tick until the next input frame arrived —
    // which at 60 Hz simulation and (say) 30 Hz input is a double jump the
    // player never asked for.
    for (const seated of inputs.values()) clearEdges(seated);
  }

  /** How many crossings this session has performed — folded into each new
   * seed so travelling A → B → A does not rebuild B's first carve. */
  let travels = 0;

  /** `cleared` plus the level `run` is on, when the party has WON it. Pure,
   * and never mutates the list it was handed — the old params outlive the
   * crossing as every connected client's baseline. */
  function clearedAfter(cleared: readonly string[], run: GameState): string[] {
    const won = run.phase === "victory" || run.phase === "outro" || run.staying;
    if (!won || cleared.includes(run.level.id)) return [...cleared];
    return [...cleared, run.level.id];
  }

  /**
   * AN IN-SESSION CROSSING: tear the level down and carry the party
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
      // THE LEVEL BEING LEFT COUNTS AS CLEARED IF THE PARTY WON IT. The engine
      // gates drops on this list (the bunker key stays latent until Boot Hill
      // falls), and a campaign played in company crosses on VICTORY far more
      // often than through a door — so a session that carried the original
      // parameters forward unchanged would keep every clear-gated drop latent
      // for the rest of the run. Asked of the run's own phase rather than of a
      // banked character, because the session has no roster: `victory` and
      // `outro` are the splash and its epilogue, and `staying` is the player
      // who took STAY to farm the cleared field before moving on.
      clearedLevels: clearedAfter(params.clearedLevels, state),
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
            // The header's `ack` on a STATE frame is the highest input seq
            // applied from THIS client (see `Client.lastInputSeq`) — the
            // number its prediction drops replayed inputs against. The
            // snapshot-ack bookkeeping lives in `ackedSeq`/`history` and
            // never needed to travel back: nothing client-side read it.
            type: full ? FRAME.snapshot : FRAME.delta,
            seq,
            ack: client.lastInputSeq,
            tick,
          },
          json,
        ),
      );
      // THE NET GRAPH'S SERVER HALF: state bytes per client, windowed to a
      // second so the roster reports a steady figure instead of the publish
      // beat. Booked here — and only here — because snapshot traffic is the
      // whole story; control frames are bytes-per-minute beside it.
      client.sentWindow += json.length + HEADER_BYTES;
      const at = now();
      if (at - client.windowStart >= 1000) {
        client.sendRate = Math.round(
          (client.sentWindow * 1000) / (at - client.windowStart),
        );
        client.sentWindow = 0;
        client.windowStart = at;
      }
      // Cleared only AFTER the frame is handed over, so a send that throws
      // leaves the client still owed its world rather than baselined on one it
      // never received.
      client.needsFull = false;
      // The first post-travel full is the one whose ack releases the client
      // back onto deltas — record its sequence once.
      if (client.fullUntilAck === -1) client.fullUntilAck = seq;
    }
    // Every client that exists has been handed these; one that joins after
    // this point starts from the genesis baseline and owes nothing.
    pendingEvents = [];
  }

  /** Remove one client — `removeClient`'s whole body, named so the bot-yield
   * path in `addClient` can take the SAME road out rather than a second one. */
  function dropClient(id: number): void {
    const client = clients.get(id);
    if (!client) return;
    clients.delete(id);
    options.log?.(`player quit — ${client.name}`);
    // A DEPARTING PLAYER'S HERO IS NO LONGER ANYBODY'S. The seat is NOT
    // spliced out — every command and input frame in flight names a seat by
    // index, so renumbering the party would deliver somebody else's steering
    // to the wrong hero — but two things have to happen to the body it holds.
    //
    // The last frame they sent goes, or it keeps walking toward wherever they
    // were last steering for the rest of the run. And the hero is DEPARTED:
    // the world stops answering for it, which is what lets the
    // people still playing grow past the seat, keeps a departed level-90 from
    // holding the horde's level over them, and — the sharp end — lets them
    // LOSE, since a run whose fourth player quit could not otherwise ever be
    // defeated.
    //
    // AND THE SEAT IS KEPT FOR THEM. A dropped connection and a
    // player quitting are indistinguishable from here, so every departure is
    // treated as though it might be the first: the body still means nothing
    // to the world, but the seat is not handed to a newcomer for
    // `RECONNECT_GRACE_MS`, and the person who left holds the only ticket
    // back into it. Coming back resumes the hero as it stands — every point
    // of xp, every item, every level — rather than building a fresh one out
    // of whatever loadout was last banked, which is the whole value of the
    // feature: otherwise a lost packet costs an hour.
    //
    // A BOT was never minted a ticket, so its departure holds nothing: the
    // seat frees immediately, which is the whole of how it is yielded.
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
      // A bot seat priced the horde while it stood; its departure un-prices
      // it through the same one function.
      if (client.bot) applyPlayerScaling();
    }
    // The host leaving is the session ending, and `close` says so in its own
    // words; announcing "HOST LEFT" first would put a chat line in front of
    // a bye nobody will be around to read.
    if (client.slot === 0) return;
    broadcastChat([chat.announce(`${client.name} LEFT`)]);
    broadcastRoster();
  }

  /**
   * The most recently seated bot departs, so an arriving person can have its
   * chair.
   *
   * The session OWNS its bot clients — they live in this very process, ticked
   * off its own clock — so removing one is a direct call down the same removal
   * path any leaver takes, not a kick over a wire. The `bye` is still sent
   * first, in the frame every ending travels as: the in-process bot client
   * reads it off its pipe and stops itself, exactly as a remote client would.
   */
  function yieldBotSeat(): void {
    let newest: Client | null = null;
    // Insertion order IS seating order, so the last bot found is the newest.
    for (const client of clients.values()) {
      if (client.bot && client.recipient.seat !== null) newest = client;
    }
    if (!newest) return;
    newest.send(
      encodeFrame(
        { type: FRAME.bye, seq, ack: 0, tick },
        { reason: "shutdown", detail: "seat yielded to a player" },
      ),
    );
    dropClient(newest.id);
    options.log?.(`net: ${newest.name} yielded its seat to a player`);
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
        // A requested crossing is consumed BETWEEN ticks, where no
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

    get botClients() {
      let bots = 0;
      for (const client of clients.values()) if (client.bot) bots++;
      return bots;
    },

    addClient(id, send, seatRequest, name) {
      const wants =
        typeof seatRequest === "boolean"
          ? { play: seatRequest, loadout: undefined as unknown }
          : seatRequest;
      // A BOT SEAT IS A CLIENT SEAT, and only the session's own bot creation
      // ever says so: the hub builds its seat request by hand and never
      // forwards a joiner's claim (`net/hub.ts`), so a stranger cannot wear
      // the flag to dodge the XP split or reprice the horde.
      const bot = wants.bot === true;
      // The HOST is always slot 0 and seat 0 — they are the run that already
      // exists. Everybody else takes the lowest free roster slot, and a player
      // among them is SEATED: a hero of their own is appended to the party,
      // and the index they land on IS their seat.
      // A DEDICATED SERVER HAS NO HOST, so the arrival-order heuristic below is
      // switched off for one: every player is seated with the hero they
      // brought, and the first of them takes the departed seat 0.
      const host = !ownerless && wants.play && clients.size === 0;
      // A RECONNECT IS TRIED FIRST, and it short-circuits everything below —
      // the seat cap included, since the seat is already theirs and was never
      // given away. The hero standing on the field IS the authoritative one, so
      // the `loadout` on the join is deliberately not read: dressing a resumed
      // hero in a claim that arrived from a stranger would hand a reconnect the
      // one thing a fresh join is checked for.
      const resumed = wants.play ? claimHeldSeat(wants.resume) : null;
      // A BOT YIELDS ITS SEAT TO A PERSON. A session whose chairs are filled
      // with the host's own autopilot heroes is not full to a human who wants
      // to play: the most recently seated bot departs — through the same
      // removal path any leaver takes, so its hero is departed, the horde is
      // re-priced and the roster says so — and the person is seated into the
      // chair it gave up. Before `nextSlot()`, so the roster slot is freed too.
      if (
        !bot &&
        !host &&
        resumed === null &&
        wants.play &&
        nextFreeSeat(state) >= maxClients
      ) {
        yieldBotSeat();
      }
      const slot = host ? 0 : nextSlot();
      // THE SEAT IS THE SERVER'S ANSWER: a seated client steers
      // `state.players[seat]` and nobody else, and a spectator has no seat at
      // all — which is what every privacy and authority check below reads,
      // never a claim the client made about itself.
      let seat: number | null = null;
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
        // before the simulation is handed it: the level is held
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
          seatHero(state, (checked?.loadout as Loadout | null) ?? null, {
            bot,
          }),
        );
        // A bot seat prices the horde the moment it stands in the fight —
        // the same knob `/players` turns, from the same one function.
        if (bot) applyPlayerScaling();
      }
      const recipient: Recipient = { seat };
      const client: Client = {
        id,
        slot,
        name: name?.trim() || (host ? "HOST" : `PLAYER ${slot + 1}`),
        bot,
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
        lastInputSeq: 0,
        needsFull: adopted !== null,
        history: new Map(),
        sentWindow: 0,
        windowStart: now(),
        sendRate: 0,
      };
      clients.set(id, client);
      options.log?.(
        `player joined — ${client.name}${seat === null ? " (spectating)" : ` (seat ${seat + 1})`}`,
      );
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
        // just got somebody in is spent. Never for a bot: a bot cannot drop,
        // and a held seat is exactly what must NOT stand between a departing
        // bot and the person its chair is being yielded to.
        resume:
          recipient.seat === null || bot
            ? undefined
            : mintTicket(recipient.seat),
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

    removeClient: dropClient,

    announce(message) {
      broadcastChat([chat.announce(message)]);
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
        // of shipping chat the moment spectators exist: eight people watching
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
        if (applyInput(inputs, client.recipient.seat, payload)) {
          // Track the highest APPLIED seq — the fold itself stays latest-wins
          // (an older frame arriving late still lands on the live input; the
          // next fresh one overwrites it), but the echo the client's
          // prediction reads may only move forward.
          const seq = (payload as { seq?: unknown }).seq;
          if (
            typeof seq === "number" &&
            Number.isFinite(seq) &&
            seq > client.lastInputSeq
          ) {
            client.lastInputSeq = seq;
          }
        }
        return;
      }
      if (type === FRAME.command) {
        const frame = payload as { name?: unknown; args?: unknown } | null;
        // THE ACTING HERO IS THE SEAT WE ADMITTED THIS CLIENT INTO, never a
        // field on the frame. A bag, a purse, a build and a
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
