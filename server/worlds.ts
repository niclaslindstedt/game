// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MORE THAN ONE LEVEL IN ONE SESSION — the world record, and the crossing that
// moves a seat between two of them.
//
// A session used to hold exactly one `GameState`, and every crossing moved the
// whole party. That is the right call for a campaign — friends walk into the
// next level together — and it is also a hard ceiling on one feature: **a real
// town portal.** One player nipping home to sell while their friends keep
// fighting needs the field they left to still be standing, still be simulating,
// and still be somewhere they can step back onto. That is two carves live in
// one process, which is what this module is.
//
// **A SEAT NUMBER MEANS THE SAME PLAYER IN EVERY WORLD, AND THAT IS THE WHOLE
// TRICK.** The obvious design — a seat becomes a (world, index) pair — would
// have touched every input frame, every command, the roster, the reconnect
// ticket, the party HUD and the private tier's withholding, all of which name a
// seat by a single number today. So instead every world carries the SAME party
// shape: seat 3 is `players[3]` in the field's carve AND in the garage's, and
// the one a hero is not currently standing in holds a DEPARTED body in that
// chair. That flag already means precisely the right thing — "present in the
// list, answered for by nobody" — so `heroInPlay`, `partyLevel`,
// `partyCentroid`, `partyWiped`, the aggro pass and the XP share all read a
// hero on another level correctly with no change at all. `Recipient.seat` keeps
// working, so does `state.players[seat]`, and so does every frame in flight.
//
// **A WORLD IS ONE PER LEVEL ID.** A session never holds two carves of the same
// venue, which is what makes "travel to X" a single verb with two meanings that
// need no flag to tell apart: if no world is on X, one is carved; if one is,
// the seat WALKS INTO IT. The road home and the road back are the same request,
// and the return lands on the field as it was left — the same dead, the same
// loot on the floor — rather than on a fresh roll of it. It is also what keeps
// the client's crossing detection sound: the client reads a world change off a
// CHANGED LEVEL ID (`server/client.ts`), which is only ever true when the id is
// the world's identity.
//
// **A WORLD LIVES WHILE SOMEBODY IS ASSIGNED TO IT.** The last seat to leave
// takes the carve with it; a seat whose world was disposed under it (the party
// crossed out of the field somebody had a portal home to) is re-anchored to the
// one the party is actually on, because the alternative is a player stepping
// back onto an empty level nobody will ever return to.

import {
  bankCampaignQuests,
  createRunFromParams,
  departHero,
  ensureSeats,
  extractLoadout,
  seatHero,
  type GameInput,
  type GameState,
  type Loadout,
} from "@game/core";

import { hash32 } from "./wire/handshake.ts";
import { type SessionParams } from "./wire/protocol.ts";
import { frozenGenesis } from "./session-model.ts";

/**
 * ONE LIVE CARVE inside a session, and everything the publish loop needs to
 * describe it to a client.
 *
 * `id` is the session's own numbering rather than the level id, because a world
 * OUTLIVES neither: the party crossing from the moon to Boot Hill retires one
 * world and raises another, and a number that never repeats is what stops a
 * stale seat routing into the carve its id used to name.
 */
export type World = {
  readonly id: number;
  /**
   * What a client rebuilds this carve from — the STATIC replication tier's
   * whole argument list. Replaced only when the world is (a world's parameters
   * are its identity), so a later joiner's welcome always describes the level
   * they are actually being seated on.
   */
  params: SessionParams;
  state: GameState;
  /** The world at tick 0, frozen — what every delta into this world is coded
   * against until a client acknowledges something newer. See
   * {@link frozenGenesis}. */
  genesis: Record<string, unknown>;
  /** Every event this world produced since the last publish, in tick order.
   * PER WORLD, because an event is a thing that happened SOMEWHERE: a client in
   * the garage must not be handed the gore, the sound and the haptics of a
   * fight two universes away. */
  pendingEvents: unknown[];
  /** The level id the "game started" line was logged for, so a crossing logs
   * its own arrival exactly once. */
  startedLevel: string | null;
  /** Reused across ticks: one input slot per seat, so the per-tick party frame
   * is not a fresh allocation sixty times a second, per world. */
  frame: GameInput[];
};

/** One seat's whole carry-over across a crossing — the same three facts the
 * party crossing has always moved. */
export type SeatCarry = {
  seat: number;
  loadout: Loadout | null;
  departed: boolean;
  held: boolean;
  /**
   * THE WOUND TRAVELS, on a solo crossing only.
   *
   * A level transition rests the hero — `applyLoadout` refills him, because
   * arriving at the next venue on 4 hp is not a difficulty, it is a loading
   * screen you lose. A TOWN PORTAL is the other thing entirely: nipping home
   * mid-fight and coming back healed would make the tear a free full heal on a
   * cooldown of however long the walk takes, which is a stronger item than
   * anything in the game. So a solo crossing carries the health it left with
   * and a party crossing (the campaign's own road) does not.
   */
  hp?: number;
};

/** Lift a seat's carry-over out of the world it is leaving. The loadout comes
 * through `extractLoadout` — the one banking funnel, an unrecovered corpse's
 * gear included — so a crossing loses nothing a victory would have kept.
 *
 * `solo` says this is a town portal rather than the campaign's road, which
 * decides two things: the wound travels, and the COMPANIONS do not (they are a
 * fact about the run rather than about one hero, so they stay standing on the
 * field their party is on). */
export function carrySeat(
  world: World,
  seat: number,
  solo = false,
): SeatCarry | null {
  const hero = world.state.players[seat];
  if (!hero) return null;
  const loadout = extractLoadout(world.state, hero);
  if (solo) loadout.companions = [];
  return {
    seat,
    loadout,
    departed: hero.departed === true,
    held: hero.held === true,
    ...(solo ? { hp: hero.hp } : {}),
  };
}

/** `cleared` plus the level `run` is on, when the party has WON it. Pure, and
 * never mutates the list it was handed — the old params outlive the crossing as
 * every connected client's baseline. */
export function clearedAfter(
  cleared: readonly string[],
  run: GameState,
): string[] {
  const won = run.phase === "victory" || run.phase === "outro" || run.staying;
  if (!won || cleared.includes(run.level.id)) return [...cleared];
  return [...cleared, run.level.id];
}

/**
 * The parameters a world on `dest` is built from, derived from the world being
 * left.
 *
 * Everything here was already worked out for the party crossing and is
 * unchanged by there being two worlds — the derived seed (so travelling
 * A → B → A does not rebuild B's first carve), the CLEAR the level being left
 * earns if the party won it, the campaign chain, the thoughts already read.
 *
 * `loadout` is the one field that had to learn about seats. It dresses the hero
 * `createRunFromParams` builds at INDEX 0, so it may only carry seat 0's
 * carry-over — and only when seat 0 is one of the seats actually crossing.
 * Anybody else is instated into their own index afterwards
 * ({@link populateWorld}); handing seat 2's bag to index 0 would put their gear
 * on a placeholder and leave them naked.
 */
export function paramsFor(
  from: World,
  dest: string,
  skip: string,
  crossing: readonly SeatCarry[],
  travels: number,
): SessionParams {
  const zero = crossing.find((carry) => carry.seat === 0) ?? null;
  return {
    ...from.params,
    seed: hash32(`${from.params.seed}|${dest}|${travels}`),
    levelId: dest,
    loadout: zero?.loadout ?? null,
    clearedLevels: clearedAfter(from.params.clearedLevels, from.state),
    campaignQuests: bankCampaignQuests(from.state),
    seenThoughts: [...from.state.thoughtsSeen],
    // The loadout's banked purse IS the purse: the wealth fold happened when
    // the run was first built.
    coins: null,
    // The session has no roster to ask (a per-character fact) — the
    // destination's merchant starts undiscovered, and each app still banks the
    // meeting for its own hero when he is found.
    merchantDiscovered: false,
    respec: false,
    openingSkip: skip,
    // A flight in progress crosses with the run (the refund must revert to the
    // pre-FLIGHT build, not the pre-level one).
    autopilotBuild: from.state.autopilot.build ?? null,
  };
}

/** Raise a world from parameters. The genesis is frozen HERE, before anybody is
 * seated into it, so it is exactly what a client's own `createRunFromParams`
 * produces from the same arguments — which is what keeps the static tier free
 * on the far side of a crossing. */
export function createWorld(id: number, params: SessionParams): World {
  const state = createRunFromParams(params);
  return {
    id,
    params,
    state,
    genesis: frozenGenesis(state),
    pendingEvents: [],
    startedLevel: null,
    frame: [],
  };
}

/**
 * Put the crossing seats into a freshly raised world, and make every seat that
 * is NOT crossing a departed body in it.
 *
 * The order is load-bearing: the party is padded to its full width FIRST, so
 * every index exists, and only then are the absent seats departed — the other
 * way round, `nextFreeSeat` would hand a padding hero the chair it had just
 * emptied. Seat 0 is a special case only in that `createRunFromParams` already
 * built it (see {@link paramsFor}); everybody else is instated into their own
 * index.
 */
export function populateWorld(
  world: World,
  seats: number,
  crossing: readonly SeatCarry[],
  party: GameState["party"],
): void {
  // THE PARTY STAMP SURVIVES A CROSSING — a run more than one person has played
  // does not get its records back by walking through a door, and that is no
  // less true when the door leads to a second world.
  if (party) world.state.party = { ...party };
  ensureSeats(world.state, seats);
  const arriving = new Set(crossing.map((carry) => carry.seat));
  for (let seat = 0; seat < world.state.players.length; seat++) {
    if (arriving.has(seat)) continue;
    // `seatZero` because index 0 here is a placeholder like any other when the
    // host is not the one crossing — the seat-0 rule guards a SESSION's host,
    // and this is a body nobody was ever behind.
    departHero(world.state, seat, { seatZero: true });
  }
  for (const carry of crossing) {
    if (carry.seat !== 0) instateSeat(world, carry);
    else applyCarryFlags(world, carry);
  }
}

/**
 * Square this world's party up to `seats` chairs.
 *
 * EVERY WORLD KEEPS THE SAME WIDTH so seat N exists wherever seat N may turn
 * up next — a portal into a carve raised before somebody joined would otherwise
 * find no chair to stand them in. The new chairs hold departed placeholders,
 * which is exactly what a hero on another level is from here.
 */
export function padWorld(world: World, seats: number): void {
  ensureSeats(world.state, seats);
}

/**
 * Instate a seat into a world — a party arriving on the next level, a player
 * walking into the garage their friend is already shopping in, or one stepping
 * back onto the field they left.
 *
 * The body that may still be standing in this chair is REPLACED rather than
 * revived, and that is the correct half of the trade: the hero has been playing
 * somewhere else since, so the authoritative version of them is the carry-over
 * they arrived with. Reviving the old body would roll back every coin they
 * earned and every point they spent while they were away — the exact bug a
 * town portal exists to not have.
 */
export function instateSeat(world: World, carry: SeatCarry): void {
  ensureSeats(world.state, carry.seat + 1);
  withCompanions(world, () =>
    seatHero(world.state, carry.loadout, { seat: carry.seat }),
  );
  applyCarryFlags(world, carry);
}

/**
 * Move a seat out of the world it is standing in.
 *
 * Only the flags flip — the body stays exactly where it fell, which is what
 * lets the field a player stepped off keep looking like a field somebody is
 * coming back to.
 *
 * **AND THE CHAIR IS HELD.** `held` is the reconnect grace's flag and it means
 * precisely the right thing here: this seat is being KEPT for somebody who is
 * coming back, so `nextFreeSeat` must skip it. Without it the lowest-free-seat
 * rule reads the vacated body as an abandoned one and hands the chair to the
 * next player who joins — seating a stranger on top of a hero who is standing
 * in the garage with a bag full of loot.
 */
export function vacateSeat(world: World, seat: number): void {
  departHero(world.state, seat, { seatZero: true, hold: true });
}

/** The three facts a carry-over asserts about the seat once its hero is
 * standing: the departed/held flags a crossing must not lose, and the wound a
 * solo crossing carries (see {@link SeatCarry.hp}). */
function applyCarryFlags(world: World, carry: SeatCarry): void {
  const hero = world.state.players[carry.seat];
  if (!hero) return;
  // A departed or HELD seat keeps its flags across the crossing: a body nobody
  // is behind is still nobody's on the next level, and a reconnect ticket must
  // still name a real chair.
  if (carry.departed) hero.departed = true;
  if (carry.held) hero.held = true;
  if (typeof carry.hp === "number") {
    hero.hp = Math.max(1, Math.min(hero.maxHp, carry.hp));
  }
}

/**
 * Run `seat`, keeping the companions ALREADY STANDING in this world.
 *
 * `applyLoadout` rebuilds `state.companions` from the arriving hero's carry
 * alone — correct when a lone hero walks onto a fresh level, and wrong every
 * other time, because the companion list is a fact about the RUN rather than
 * about one player. Left alone it means the last seat instated erases
 * everybody else's party: a bug the single-world party crossing has carried
 * since joiners could bring their own, and one a second world would otherwise
 * make load-bearing (a friend stepping into the garage would delete the
 * companions still fighting beside the party on the field).
 *
 * So the standing list is captured and the arriving hero's is APPENDED to it.
 * A solo crossing carries none at all (see {@link carrySeat}), which is what
 * makes stepping home and back a no-op for the party's followers rather than a
 * way to duplicate them.
 */
function withCompanions(world: World, seat: () => void): void {
  const standing = [...world.state.companions];
  seat();
  world.state.companions = [...standing, ...world.state.companions];
}
