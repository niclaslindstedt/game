// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CROSSINGS — moving seats between the worlds a session holds.
//
// Split out of `session.ts` by concern, the same way `session-model.ts` was:
// that module is the authoritative simulation LOOP and every line in it should
// be about advancing and publishing a run. What lives here is the other verb —
// a seat leaving one carve and standing up in another — and it is the whole of
// what a party crossing (`travelTo`, the host's road) and a TOWN PORTAL
// (`travelSolo`, one player's own) have in common, which turns out to be almost
// everything. The pure half (raising a world, populating it, lifting a seat's
// carry-over out) is one further step down, in `worlds.ts`.
//
// It closes over a session, so it is a factory rather than a set of free
// functions — and everything it may touch is handed over in {@link
// CrossingContext} rather than reached for. That list IS the blast radius: a
// crossing may move seats between worlds, re-baseline the clients that moved,
// and say so on the roster and in the chat. It may not step anything, publish
// anything, or decide who is admitted.

import type { GameInput } from "@game/core";

import { type Client } from "./session-model.ts";
import { baselineFor } from "./wire/snapshot.ts";
import {
  carrySeat,
  createWorld,
  instateSeat,
  padWorld,
  paramsFor,
  populateWorld,
  vacateSeat,
  type SeatCarry,
  type World,
} from "./worlds.ts";

/** The one input a seat with nobody steering it contributes. Duplicated from
 * `session-model.ts` deliberately — importing the loop's vocabulary into the
 * crossing would point the dependency the wrong way. */
const IDLE: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
  useItem: false,
};

/** Everything a crossing may touch, handed over by the session that owns it. */
export type CrossingContext = {
  /** Every live carve, by world id. A crossing adds to it and takes from it. */
  worlds: Map<number, World>;
  /** The world the session is ABOUT — where a joiner is seated and what
   * `Session.state` reports. */
  primary(): World;
  /** Move it. Only a PARTY crossing ever does. */
  setPrimary(world: World): void;
  /** A world id nothing has worn before. Never reused, so a stale seat cannot
   * route into the carve an id used to name. */
  mintWorldId(): number;
  /** Which world each seat is standing in; absent means the primary. */
  seatWorld: Map<number, number>;
  /** The party's width across every world. */
  seatCount(): number;
  clients: Map<number, Client>;
  /** The live input per seat. A crossing idles the seats that moved. */
  inputs: Map<number, GameInput>;
  log?(message: string): void;
  /** Say something in the session's own voice. */
  announce(message: string): void;
  /** Who is where has changed; tell everybody. */
  rosterChanged(): void;
  /** What to call a seat in an announcement. */
  playerName(seat: number): string;
};

export type Crossings = {
  /** Consume `state.pendingTravel` — the host's road, for the whole party. */
  performTravel(world: World): void;
  /** Consume `state.pendingSolo` — a town portal, one seat at a time. */
  performSolo(world: World): void;
  /** Let a world go once the last seat has left it. Reached from outside for
   * the one case that empties a world without a crossing: a reconnect hold
   * lapsing on somebody who dropped in a second world. */
  disposeIfEmpty(world: World): void;
};

export function createCrossings(ctx: CrossingContext): Crossings {
  /** How many crossings this session has performed — folded into each new
   * seed so travelling A → B → A does not rebuild B's first carve. */
  let travels = 0;

  /**
   * The world this session holds on `levelId`, or null.
   *
   * ONE WORLD PER LEVEL ID is the invariant the whole feature rests on (see
   * `server/worlds.ts`): it is what makes "travel to X" a single verb whose two
   * meanings need no flag to tell apart — carve X, or WALK ONTO the X that is
   * already standing — and it is what keeps the client's crossing detection
   * sound, since the client reads a world change off a changed level id.
   */
  function worldOn(levelId: string): World | null {
    for (const world of ctx.worlds.values()) {
      if (world.state.level.id === levelId) return world;
    }
    return null;
  }

  /**
   * Let a world go once the last seat has left it.
   *
   * The PRIMARY is never disposed — it is what the session is about, and a
   * session with no world is not a session. Everything else is held only by the
   * people standing in it: the garage a lone shopper walked out of is a carve
   * nobody will ever see again, and keeping it would leave a level sitting in
   * memory for nobody.
   */
  function disposeIfEmpty(world: World): void {
    if (world === ctx.primary()) return;
    for (const id of ctx.seatWorld.values()) if (id === world.id) return;
    ctx.worlds.delete(world.id);
  }

  /**
   * Re-baseline a client onto the world it is now watching.
   *
   * FULL SNAPSHOTS UNTIL IT ACKNOWLEDGES ONE (`fullUntilAck`), and that is not
   * a formality — it is the whole of how a returning player gets a picture of a
   * level other people have been playing without him. His baseline for this
   * carve is stale or absent, so a delta against it would name entity ids he
   * does not hold; he is handed the world entire instead. Every mob where it
   * now stands, every item that dropped on the floor while he was away, every
   * teammate's position, the fog as the party opened it. And it stays whole
   * until he says he has it, because on an unreliable transport there is no
   * ordering to lean on.
   */
  function rebaseline(client: Client, world: World): void {
    client.needsFull = true;
    client.fullUntilAck = -1;
    client.history.clear();
    client.baseline = baselineFor(world.genesis, client.recipient);
  }

  /** Every client seated in one of `seats`, plus — when the PRIMARY moved —
   * the spectators, who watch the run the session is about. */
  function clientsOn(
    seats: ReadonlySet<number>,
    spectators: boolean,
  ): Client[] {
    const found: Client[] = [];
    for (const client of ctx.clients.values()) {
      const seat = client.recipient.seat;
      if (seat === null ? spectators : seats.has(seat)) found.push(client);
    }
    return found;
  }

  /** The world a seat is standing in, by id. */
  function worldIdOf(seat: number): number {
    return ctx.seatWorld.get(seat) ?? ctx.primary().id;
  }

  /**
   * THE ONE CROSSING, and both roads run through it.
   *
   * `seats` is who is moving: the whole party for the host's `travelTo`, one
   * player for a `travelSolo` town portal. Everything else is the same work in
   * the same order — lift each seat's carry-over out of the world being left
   * (through `extractLoadout`, the one banking funnel), find or raise the world
   * on the destination, stand them up in it at their OWN seat number, and
   * re-baseline their clients.
   *
   * The two things only a MULTI-seat crossing does are the two that are about
   * the session rather than about a player: the primary world moves with the
   * party (so a later joiner is welcomed onto the level their friends are
   * actually on), and any seat whose road back pointed at the world being left
   * is given one that will still exist.
   */
  function crossTo(
    from: World,
    seats: readonly number[],
    dest: string,
    skip: string,
    solo: boolean,
  ): boolean {
    const crossing: SeatCarry[] = [];
    for (const seat of seats) {
      const carry = carrySeat(from, seat, solo);
      if (carry) crossing.push(carry);
    }
    if (!crossing.length) return false;
    const moving = new Set(crossing.map((carry) => carry.seat));
    // THE DESTINATION MAY ALREADY BE STANDING. Walking onto it is the whole
    // point of the town portal — the field a player left is still there, with
    // the same dead and the same loot on the floor, and a fresh carve of the
    // same venue would be a different place wearing its name.
    let to = worldOn(dest);
    const carved = to === null;
    if (!to) {
      const nextParams = paramsFor(from, dest, skip, crossing, ++travels);
      try {
        to = createWorld(ctx.mintWorldId(), nextParams);
      } catch (err) {
        // A destination this build cannot carve. The verb validated the id, so
        // this is belt and braces — refused loudly rather than killing the
        // session process mid-run.
        ctx.log?.(`net: travel to ${dest} refused — ${String(err)}`);
        return false;
      }
      ctx.worlds.set(to.id, to);
      populateWorld(to, ctx.seatCount(), crossing, from.state.party);
    } else {
      // ARRIVING AMONG PEOPLE. Everybody already standing here holds a baseline
      // that predates the newcomer, exactly as they would for a mid-run join —
      // so they are owed a whole world rather than a delta against a party that
      // just changed shape.
      for (const carry of crossing) instateSeat(to, carry);
      for (const client of ctx.clients.values()) {
        if (client.recipient.seat === null) continue;
        if (moving.has(client.recipient.seat)) continue;
        if (worldIdOf(client.recipient.seat) === to.id) client.needsFull = true;
      }
    }
    for (const carry of crossing) {
      if (from !== to) vacateSeat(from, carry.seat);
      ctx.seatWorld.set(carry.seat, to.id);
    }
    // EVERY WORLD KEEPS THE SAME PARTY WIDTH, so seat N exists wherever seat N
    // may turn up next. A crossing is where the width can grow (the destination
    // was raised before this seat existed), so it is where they are squared up.
    const seatsNow = ctx.seatCount();
    for (const world of ctx.worlds.values()) padWorld(world, seatsNow);
    if (!solo) {
      ctx.setPrimary(to);
      // A seat whose road back pointed at the world the party just left has to
      // be given one that exists — the party's own.
      for (const [seat, id] of [...ctx.seatWorld]) {
        if (id === from.id) ctx.seatWorld.set(seat, to.id);
      }
    }
    for (const client of clientsOn(moving, !solo)) {
      rebaseline(client, to);
      const seat = client.recipient.seat;
      if (seat !== null) ctx.inputs.set(seat, { ...IDLE });
    }
    disposeIfEmpty(from);
    // WHO IS WHERE HAS CHANGED, and the roster is the only thing on the wire
    // that says so — a party frame reads it to tell a teammate in the garage
    // apart from one who has quit.
    ctx.rosterChanged();
    ctx.log?.(
      `net: ${solo ? `seat ${[...moving][0]}` : "the party"} ` +
        `${carved ? "travelled to" : "stepped back onto"} ${dest}`,
    );
    return true;
  }

  /**
   * AN IN-SESSION PARTY CROSSING: carry everybody through the door together.
   *
   * The request arrived as the `travelTo` run command (seat 0 only — the host
   * chooses the road) and was parked on `state.pendingTravel` for THIS moment:
   * between ticks, where no frame is half-applied. Every seat's loadout is
   * extracted from the authoritative run, the destination is built from the
   * session's own parameters with a derived seed (or WALKED ONTO, if somebody
   * had already gone ahead through a portal), and the party is re-seated in the
   * SAME ORDER — a seat is an index every in-flight frame names, so the rebuild
   * may not renumber anybody.
   */
  function performTravel(world: World): void {
    const request = world.state.pendingTravel;
    delete world.state.pendingTravel;
    if (!request) return;
    // EVERY SEAT STANDING **HERE** — never one shopping two levels away. The
    // party crossing is the host's decision for the people he is playing with,
    // and a hero who stepped through a portal is not one of them until they
    // come back.
    const seats = world.state.players
      .map((_hero, seat) => seat)
      .filter((seat) => worldIdOf(seat) === world.id);
    if (!crossTo(world, seats, request.to, request.skip, false)) return;
    ctx.log?.(`net: travelled to ${request.to} (${travels})`);
    ctx.announce(`TRAVELLING TO ${request.to.toUpperCase()}`);
  }

  /**
   * A TOWN PORTAL: one hero steps off the field while the rest keep playing it.
   *
   * The queue is drained one request at a time and each is re-checked against
   * where its seat actually is, because a crossing moves worlds out from under
   * the loop — two players stepping home in the same tick is the case this is
   * written for.
   */
  function performSolo(world: World): void {
    const queue = world.state.pendingSolo;
    if (!queue?.length) return;
    for (const request of queue.splice(0, queue.length)) {
      // THE SEAT MUST STILL BE HERE. A request survives a tick, and the party
      // may have crossed in the meantime — moving somebody out of a world they
      // already left would take the body rather than the player.
      if (worldIdOf(request.seat) !== world.id) continue;
      if (crossTo(world, [request.seat], request.to, request.skip, true)) {
        ctx.announce(
          `${ctx.playerName(request.seat)} STEPPED THROUGH TO ` +
            request.to.toUpperCase(),
        );
      }
    }
    delete world.state.pendingSolo;
  }

  return { performTravel, performSolo, disposeIfEmpty };
}
