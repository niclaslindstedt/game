// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TRADE — one item and one purse across a table, and the rules that stop a
// party duplicating either.
//
// Half of D2 co-op is trade. What makes it hard is not the UI: it is that a
// trade is the only place in the game where a piece of gear LEAVES one private
// bag and arrives in another, and every bug in that shape mints items.
//
// **THE WHOLE DESIGN IS ONE SENTENCE: THE SWAP IS A SINGLE TRANSACTION, ON THE
// AUTHORITY, OR IT DOES NOT HAPPEN.** `settleTrade` removes and inserts inside
// one function with every check done first, so there is no reachable state in
// which an item has left one bag and not arrived in the other. Everything else
// here exists to keep that sentence true:
//
//  1. **AN OFFER NAMES A CELL, AND THE CELL IS RE-READ AT SETTLEMENT.** An
//     offer holds an inventory INDEX and the item INSTANCE ID that was in it.
//     Both, and the pair is the point: an index alone is a cell whose contents
//     may have changed (the player moved something, a merchant sold something,
//     a level-up grew the bag), and an id alone would have to be searched for.
//     If the cell no longer holds that id, the trade is refused rather than
//     guessing — the guess is how somebody trades a sword and hands over a
//     medkit.
//  2. **ANY CHANGE CLEARS BOTH ACCEPTANCES.** The classic trade-window scam is
//     to wait for the other side to accept and then swap what is on the table.
//     Adding, removing or re-pricing anything drops both sides back to
//     unaccepted, so what somebody accepted is always what they saw.
//  3. **A LOCKED OFFER MAY NOT BE SPENT.** While a trade is open the offered
//     cells are still in the owner's bag — moving them out would be a second
//     place the item lives — so every other verb that could consume one asks
//     `isOfferedInTrade` first. That is the rule most likely to be forgotten
//     when a new verb lands, which is why the predicate is exported rather than
//     inlined here.
//  4. **THE TRADE IS BETWEEN TWO SEATS, AND A SEAT IS THE SERVER'S ANSWER.**
//     Nothing here takes a hero from a caller's claim; a command arrives for
//     the seat the session admitted that client into (see `commands.ts`), and
//     `tradePartner` is the only way to reach the other side.
//  5. **AND NOBODY RAISES A TABLE ON SOMEBODY ELSE'S SCREEN.** A trade is
//     REQUESTED (`requestTrade`) and the other player answers it
//     (`acceptTradeRequest` / `declineTradeRequest`) or lets it lapse; only an
//     acceptance calls `openTrade`. D2's shape, and the reason is not manners:
//     the table is a `"trade"` screen on BOTH seats, so a unilateral open is a
//     stranger taking a teammate's controls away mid-fight. The request itself
//     must therefore cost the target NOTHING — it is a pip on their HUD, never
//     a screen — or it recreates the interruption it exists to prevent.
//
// **A REQUEST IS A FACT ABOUT TWO SEATS, exactly as a trade is**, so it lives
// on the run (`state.tradeRequests`) rather than in a private field on either
// hero: held on one side, the two sides could disagree about whether an ask is
// still standing. It replicates for free with everything else on the run, and
// it obeys the same lifecycle a trade does — a seat that departs or goes down
// takes its requests with it (`endTradesFor`), so nothing stale can raise a
// table later.
//
// **WHAT THIS DELIBERATELY IS NOT.** There is no shared STASH. A stash is an
// account-shaped store — it outlives a run, it has to merge across devices
// through cloud save, and it would need a migration ladder of its own — and the
// thing players actually ask for when they say "trade" is handing a friend the
// sword you just found. The vault (`items/vault.ts`) already covers "I threw
// something away and want it back"; a stash is its own feature and should be
// designed as one rather than smuggled in beside this.

import { TRADE } from "./config/index.ts";
import { inventoryCapacity } from "./items/inventory.ts";
import { heroInPlay } from "./party.ts";
import { seatOf } from "./party.ts";
import type { Equipment, GameState, Player, TradeSide } from "./types/index.ts";

/** Why a trade could not be opened, changed or settled. Null means it worked. */
export type TradeRefusal =
  | "no-trade"
  | "busy"
  | "not-in-trade"
  | "bad-seat"
  | "bad-cell"
  | "moved"
  | "not-accepted"
  | "no-room"
  | "no-coins"
  | "no-request";

/**
 * ASK a teammate for a trade (rule 5). Nothing opens on either screen; the
 * target gets a pip and answers when they want to.
 *
 * Refused for the same reasons opening one is — a seat nobody is behind, a
 * departed body, yourself, either side already at a table — plus the requester
 * having a screen up, which is the same "be standing on the field to start
 * this" rule `openTrade` applies to the acting hero. The TARGET's screen is
 * deliberately NOT checked: somebody in their bag is exactly who a
 * non-blocking ask is for, and the busy-hero refusal stays where it belongs,
 * on the accept.
 *
 * ONE OUTSTANDING ASK PER SEAT. A re-request replaces the old one rather than
 * queueing a second, so a player leaning on the button cannot paper a
 * teammate's HUD with pips — and the replacement refreshes the clock, which is
 * what a player pressing again means by it.
 *
 * NO EVENT IS EMITTED, deliberately. The ask is a fact that STANDS rather than
 * a moment that happened, so the pip (and the chirp the app gives it) are
 * driven off `state.tradeRequests` — which means a client whose snapshot
 * arrived a frame late still draws it, where a missed event would have shown
 * nothing at all until the request lapsed.
 */
export function requestTrade(
  state: GameState,
  actor: Player,
  targetSeat: number,
): TradeRefusal | null {
  const seat = seatOf(state, actor);
  if (seat === null || seat === targetSeat) return "bad-seat";
  // BOTH ends have to be somebody in play. A hero lying on the ground steers
  // nothing and holds no screen, so the busy check below would wave them
  // through — and an ask from a corpse is one `endTradesFor` was never given a
  // chance to clear.
  if (!heroInPlay(actor)) return "bad-seat";
  const target = state.players[targetSeat];
  if (!target || !heroInPlay(target)) return "bad-seat";
  if (tradeOf(state, seat) || tradeOf(state, targetSeat)) return "busy";
  if (actor.screen !== undefined) return "busy";
  const open = (state.tradeRequests ??= []);
  const existing = open.findIndex((r) => r.from === seat);
  if (existing >= 0) open.splice(existing, 1);
  open.push({ from: seat, to: targetSeat, atMs: state.stats.timeMs });
  return null;
}

/**
 * Answer YES to the ask from `fromSeat` — the one call that raises a table.
 *
 * The request is SPENT either way: an accept that `openTrade` refuses (the
 * requester wandered into their own bag in the meantime — rule 5's backstop)
 * leaves nothing standing to be tried again into the same refusal, and the
 * requester is free to ask again. A stale request that survived its own
 * failure is precisely the thing that raises a table nobody is expecting.
 */
export function acceptTradeRequest(
  state: GameState,
  actor: Player,
  fromSeat: number,
): TradeRefusal | null {
  const seat = seatOf(state, actor);
  if (seat === null) return "bad-seat";
  const open = state.tradeRequests ?? [];
  const index = open.findIndex((r) => r.from === fromSeat && r.to === seat);
  if (index < 0) return "no-request";
  open.splice(index, 1);
  const requester = state.players[fromSeat];
  if (!requester || !heroInPlay(requester)) return "bad-seat";
  // The TABLE is opened as the REQUESTER's — they are `openTrade`'s acting
  // hero and the accepting seat is the partner. Which way round it is makes no
  // difference to the trade (the two sides are symmetric), but it keeps the
  // busy-hero check reading the way rule 5 words it: the person who asked is
  // the one who has to still be free to have meant it.
  return openTrade(state, requester, seat);
}

/** Answer NO. Costs the decliner nothing and the requester nothing but the
 * ask — there is no cooldown, deliberately: a decline the game punishes is a
 * decline players stop giving, and an ignored request is worse for everybody
 * than a fast no. */
export function declineTradeRequest(
  state: GameState,
  actor: Player,
  fromSeat: number,
): boolean {
  const seat = seatOf(state, actor);
  if (seat === null) return false;
  const open = state.tradeRequests ?? [];
  const index = open.findIndex((r) => r.from === fromSeat && r.to === seat);
  if (index < 0) return false;
  open.splice(index, 1);
  return true;
}

/** The standing asks THIS seat has been sent, oldest first — what the HUD
 * draws a pip for. */
export function tradeRequestsTo(
  state: GameState,
  seat: number,
): TradeRequest[] {
  return (state.tradeRequests ?? []).filter((r) => r.to === seat);
}

/** How much longer this ask stands (ms), for the pip's own countdown. */
export function tradeRequestMsLeft(
  state: GameState,
  request: TradeRequest,
): number {
  return Math.max(0, TRADE.requestMs - (state.stats.timeMs - request.atMs));
}

/**
 * DROP THE ASKS THAT HAVE LAPSED. Run every tick from the step pipeline,
 * straight after the run's clock advances — so a request ages on RUN time and
 * a party that all stepped behind screens at once comes back to the ask they
 * left standing.
 *
 * Costs nothing without requests, which is every single-player run there is.
 */
export function stepTradeRequests(state: GameState): void {
  const open = state.tradeRequests;
  if (!open?.length) return;
  const kept = open.filter((r) => tradeRequestMsLeft(state, r) > 0);
  if (kept.length !== open.length) state.tradeRequests = kept;
}

/**
 * Open a trade between the hero acting and the seat they named.
 *
 * **NOT A VERB THE APP MAY SEND** — reached only through
 * `acceptTradeRequest`, because a table raised without the other player's yes
 * is rule 5's whole subject. It stays a function of its own so the consent
 * step and the transaction it guards remain separable.
 *
 * Refused if either side is already trading — a hero in two trades at once is
 * the shape that lets one item be promised twice — or if the partner is not
 * somebody in play. A DEPARTED seat is not a partner: the body is nobody's, and
 * trading with it would post an item into a bag that goes nowhere.
 */
export function openTrade(
  state: GameState,
  actor: Player,
  partnerSeat: number,
): TradeRefusal | null {
  const seat = seatOf(state, actor);
  if (seat === null || seat === partnerSeat) return "bad-seat";
  const partner = state.players[partnerSeat];
  if (!partner || !heroInPlay(partner)) return "bad-seat";
  if (tradeOf(state, seat) || tradeOf(state, partnerSeat)) return "busy";
  // Both heroes must be FREE — standing on the field with nothing open. The
  // consent step is the answer to "should this table exist at all"; this is
  // the answer to "is either of them in the middle of something else right
  // now", and a table raised over somebody's bag or mid-respec would still
  // hijack a screen they are using. So it stays as the backstop on the accept
  // path (rule 5).
  if (actor.screen !== undefined || partner.screen !== undefined) {
    return "busy";
  }
  state.trades ??= [];
  state.trades.push({
    seats: [seat, partnerSeat],
    offers: [emptySide(), emptySide()],
  });
  // The window is a per-player SCREEN on both sides at once (the
  // `Player.screen` model): no steering while at the table, still standing,
  // still killable.
  actor.screen = "trade";
  partner.screen = "trade";
  return null;
}

/** Close a trade without settling it. Nothing has moved, so nothing is undone
 * — which is the whole benefit of leaving offered items in their owner's bag
 * until the moment they cross. */
export function cancelTrade(state: GameState, actor: Player): boolean {
  const seat = seatOf(state, actor);
  if (seat === null) return false;
  const index = (state.trades ?? []).findIndex((t) => t.seats.includes(seat));
  if (index < 0) return false;
  const [trade] = state.trades!.splice(index, 1);
  if (trade) lowerTradeScreens(state, trade);
  return true;
}

/**
 * Put the item in inventory cell `cell` on the table, or take it back off
 * (`cell` of -1 clears the offer).
 *
 * BOTH ACCEPTANCES DROP. Changing what is on the table after somebody has
 * agreed to it is the oldest trade-window scam there is, and the defence is not
 * a warning — it is that an acceptance only ever describes the table as it was
 * when it was given.
 */
export function offerItem(
  state: GameState,
  actor: Player,
  cell: number,
): TradeRefusal | null {
  const found = mySide(state, actor);
  if (!found) return "not-in-trade";
  const { trade, side } = found;
  if (cell < 0) {
    trade.offers[side]!.cell = -1;
    trade.offers[side]!.itemId = -1;
    delete trade.offers[side]!.item;
  } else {
    const item = actor.inventory[cell];
    if (!item) return "bad-cell";
    trade.offers[side]!.cell = cell;
    trade.offers[side]!.itemId = item.id;
    // A COPY for the other side to look at — their bag is private, so this is
    // the only way they can see what is being offered. Presentation only; the
    // swap re-reads the real cell. Cloned rather than referenced so a piece
    // that is later modified in the bag cannot silently re-describe an offer
    // somebody already agreed to.
    trade.offers[side]!.item = structuredClone(item);
  }
  unacceptBoth(trade);
  return null;
}

/** Put coins on the table. Clamped to what the hero actually holds, and both
 * acceptances drop for the same reason `offerItem` drops them. */
export function offerCoins(
  state: GameState,
  actor: Player,
  coins: number,
): TradeRefusal | null {
  const found = mySide(state, actor);
  if (!found) return "not-in-trade";
  const { trade, side } = found;
  const amount = Math.max(0, Math.floor(Number.isFinite(coins) ? coins : 0));
  if (amount > actor.coins) return "no-coins";
  trade.offers[side]!.coins = amount;
  unacceptBoth(trade);
  return null;
}

/**
 * Agree to the table as it stands. When both sides have agreed, the swap runs
 * IMMEDIATELY and in one piece — there is no window between "both accepted"
 * and "the items moved" for anything to happen in.
 */
export function acceptTrade(
  state: GameState,
  actor: Player,
): TradeRefusal | null {
  const found = mySide(state, actor);
  if (!found) return "not-in-trade";
  const { trade, side } = found;
  trade.offers[side]!.accepted = true;
  if (!trade.offers[0]!.accepted || !trade.offers[1]!.accepted) return null;
  return settleTrade(state, trade);
}

/**
 * THE TRANSACTION. Every check first, then every move — so there is no
 * reachable state in which an item has left one bag and not arrived in the
 * other.
 *
 * The re-read of each offered cell is the anti-dupe rule that matters. An offer
 * was made against a bag that has since been ticked past: a merchant sale, an
 * auto-equip sweep, a discard, a mercy drop landing in a free cell, a level-up
 * growing the bag. If the cell no longer holds the id that was offered, the
 * whole trade is refused. It is NOT re-searched for elsewhere in the bag —
 * finding "the same item somewhere else" is exactly how a trade hands over
 * something the offering player did not put on the table.
 */
function settleTrade(state: GameState, trade: Trade): TradeRefusal | null {
  const a = state.players[trade.seats[0]];
  const b = state.players[trade.seats[1]];
  if (!a || !b || !heroInPlay(a) || !heroInPlay(b)) return "bad-seat";
  const give = [trade.offers[0]!, trade.offers[1]!] as const;
  const items: (Equipment | null)[] = [];
  for (const [i, hero] of [a, b].entries()) {
    const offer = give[i]!;
    if (offer.cell < 0) {
      items.push(null);
      continue;
    }
    const held = hero.inventory[offer.cell] ?? null;
    // MOVED, SOLD, BROKEN OR SPENT since the offer was made. Refused whole.
    if (!held || held.id !== offer.itemId) return "moved";
    items.push(held);
  }
  // The purses, checked before either is touched.
  if (give[0]!.coins > a.coins || give[1]!.coins > b.coins) return "no-coins";
  // AND THE ROOM. An item leaving a bag frees the cell it was in, so a swap of
  // one for one always fits — but a one-way gift into a full bag does not, and
  // handing it over anyway would drop the item on the floor of a data structure.
  const [fromA, fromB] = [items[0] ?? null, items[1] ?? null];
  if (!hasRoomFor(state, a, fromB, fromA)) return "no-room";
  if (!hasRoomFor(state, b, fromA, fromB)) return "no-room";

  // Past here nothing can fail. The removals happen before the inserts so a
  // vacated cell is available to the incoming piece, which is what makes a
  // swap between two full bags work at all.
  if (fromA) a.inventory[give[0]!.cell] = null;
  if (fromB) b.inventory[give[1]!.cell] = null;
  if (fromA) putSomewhere(b, fromA);
  if (fromB) putSomewhere(a, fromB);
  a.coins += give[1]!.coins - give[0]!.coins;
  b.coins += give[0]!.coins - give[1]!.coins;
  const index = (state.trades ?? []).indexOf(trade);
  if (index >= 0) state.trades!.splice(index, 1);
  lowerTradeScreens(state, trade);
  return null;
}

/**
 * IS THIS CELL ON A TABLE RIGHT NOW — the predicate every verb that could
 * consume an item has to ask.
 *
 * An offered item stays in its owner's bag until it crosses, which is what
 * makes a cancelled trade cost nothing. The price of that is this check: equip
 * it, sell it, scrap it or throw it away mid-trade and the offer would name a
 * cell that no longer holds it. `settleTrade` would refuse (that is rule 1
 * doing its job), but the player who did it would have no idea why, so the
 * verbs refuse up front instead.
 */
export function isOfferedInTrade(
  state: GameState,
  player: Player,
  cell: number,
): boolean {
  const seat = seatOf(state, player);
  if (seat === null) return false;
  for (const trade of state.trades ?? []) {
    const side = trade.seats.indexOf(seat);
    if (side < 0) continue;
    if (trade.offers[side]!.cell === cell) return true;
  }
  return false;
}

/** The trade this seat is in, or null. */
export function tradeOf(state: GameState, seat: number): Trade | null {
  return (state.trades ?? []).find((t) => t.seats.includes(seat)) ?? null;
}

/** The seat on the other side of this hero's trade, or null. */
export function tradePartner(state: GameState, player: Player): number | null {
  const seat = seatOf(state, player);
  if (seat === null) return null;
  const trade = tradeOf(state, seat);
  if (!trade) return null;
  return trade.seats[0] === seat ? trade.seats[1]! : trade.seats[0]!;
}

/**
 * Tear down any trade a departing seat was in.
 *
 * Called when a hero leaves play. Nothing has moved, so nothing is undone —
 * but the trade has to GO, or the partner is left staring at a table whose
 * other side will never accept and whose items can never be settled.
 */
export function endTradesFor(state: GameState, seat: number): void {
  // THE ASKS GO WITH THE TABLES, in both directions. A request this seat sent
  // would otherwise raise a table on somebody's screen for a hero who is a
  // corpse or a vacancy by the time it is answered, and one they were sent
  // would sit as a pip that can never be honoured.
  const asked = state.tradeRequests;
  if (asked?.length) {
    const kept = asked.filter((r) => r.from !== seat && r.to !== seat);
    if (kept.length !== asked.length) state.tradeRequests = kept;
  }
  const open = state.trades;
  if (!open?.length) return;
  const ended = open.filter((trade) => trade.seats.includes(seat));
  state.trades = open.filter((trade) => !trade.seats.includes(seat));
  // The PARTNER's window comes down too — they are standing at a table whose
  // other side just left play, and a screen nothing can close is exactly the
  // wedge the per-player screen split retired.
  for (const trade of ended) lowerTradeScreens(state, trade);
}

// ---------------------------------------------------------------------------

/** One open trade. Two seats, two sides, index-aligned. */
export type Trade = {
  seats: [number, number];
  offers: [TradeSide, TradeSide];
};

/**
 * ONE STANDING ASK (rule 5). Two seats and the moment it was made — and it is
 * a MOMENT rather than a countdown on purpose: a `msLeft` ticking down every
 * frame would be a field the snapshot differ resends twenty times a second for
 * half a minute, where a stamp is written once and never touched again.
 *
 * `atMs` is `GameStats.timeMs`, the run's own clock, so an ask ages on the
 * time the party actually played rather than on wall clock.
 */
export type TradeRequest = {
  /** The seat that asked. */
  from: number;
  /** The seat being asked. */
  to: number;
  /** `state.stats.timeMs` when the ask was made. */
  atMs: number;
};

function emptySide(): TradeSide {
  return { cell: -1, itemId: -1, coins: 0, accepted: false };
}

/** Rule 2: any change to the table drops both acceptances. */
function unacceptBoth(trade: Trade): void {
  trade.offers[0]!.accepted = false;
  trade.offers[1]!.accepted = false;
}

/** Lower the trade screen on both of a (just-removed) trade's seats. Only the
 * trade screen: a seat that has since raised something else keeps it. */
function lowerTradeScreens(state: GameState, trade: Trade): void {
  for (const seat of trade.seats) {
    const hero = state.players[seat];
    if (hero?.screen === "trade") delete hero.screen;
  }
}

/** The trade this hero is in and which side of it they are. */
function mySide(
  state: GameState,
  actor: Player,
): { trade: Trade; side: 0 | 1 } | null {
  const seat = seatOf(state, actor);
  if (seat === null) return null;
  const trade = tradeOf(state, seat);
  if (!trade) return null;
  return { trade, side: trade.seats[0] === seat ? 0 : 1 };
}

/**
 * Will `incoming` fit in this hero's bag once `outgoing` has left it?
 *
 * The `outgoing` term is what makes a swap between two full bags work: the cell
 * an item vacates is a cell the incoming one can take.
 */
function hasRoomFor(
  state: GameState,
  hero: Player,
  incoming: Equipment | null,
  outgoing: Equipment | null,
): boolean {
  if (!incoming) return true;
  if (outgoing) return true;
  const capacity = inventoryCapacity(state, hero);
  let used = 0;
  for (const cell of hero.inventory) if (cell) used++;
  return used < capacity && hero.inventory.includes(null);
}

/** Put an item in the first free cell, growing the array to the bag's capacity
 * if every existing cell is taken. `hasRoomFor` has already said it fits. */
function putSomewhere(hero: Player, item: Equipment): void {
  const free = hero.inventory.indexOf(null);
  if (free >= 0) {
    hero.inventory[free] = item;
    return;
  }
  hero.inventory.push(item);
}
