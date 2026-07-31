// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's POCKET ARSENAL — WHICH WEAPON IS IN THE HAND, moment by
// moment. Split out of bot/economy.ts (the bag/merchant half) because it is
// its own decision: the hero carries a small kit and the fight in front of him
// picks from it, the way a player thumbs the quick-draw switcher.
//
// The whole system rests on ONE number, `weaponMomentValue`: a weapon's
// per-target damage over time × the targets THE FIELD lets it land on right
// now. That folds the three reads a human makes into one comparison:
//
//   • RANGE — a weapon that can't reach the bodies on the field is worth
//     nothing, however good it reads on the item card, and only the foes
//     inside its own reach count toward its crowd.
//   • SHAPE vs the CROWD — a volley's pellets, a railgun's pierce line and a
//     bolt's chain leaps (`rangedShotTargets`), or a blade's cone, are worth
//     the mass actually standing there and no more: a 4-pellet gun credits 4
//     against a mob of four and 1 against a straggler.
//   • THE BIG BODY — a boss/elite on top of the hero reads as ONE target for
//     everything, so the ranking collapses to raw per-shot damage. That is
//     "bring the single-target round to a boss, the spray to the horde".
//
// Everything else here is that number plus discipline: an anti-juggle gap, a
// hysteresis margin so two comparable guns never flap (waived for a plain
// upgrade — a better find is drawn as soon as it lands), the melee stick band,
// and the BAG DISCIPLINE keep-set that makes sure the kit the hero hauls
// actually covers both fights (see `botPocketKeepIndices`).

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import {
  canEquip,
  committedLane,
  equipFromInventory,
  heroLoadoutMemo,
  maxMeleeTargets,
  weaponCooldownFor,
  weaponDps,
  weaponRangeFor,
  weaponScore,
  weaponSweepHalfAngle,
} from "../items/index.ts";
import { JUMP } from "../config/index.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import {
  meleeRealizedTargets,
  rangedShotTargets,
  weaponDef,
} from "../defs/equipment.ts";
import type { Equipment, GameState, WeaponClass } from "../types/index.ts";

/** How near a live boss/elite must be (world px) for the moment to read as a
 * BIG BODY — one health pool that soaks every shape, so the pick collapses to
 * whatever hits hardest per target. Sized a little past a boss arena's
 * engagement ring, and always clipped to the weapon's own reach. */
const POCKET_BOSS_RADIUS = 340;

/** How near two bodies stand (world px) to count as ONE MASS — roughly the
 * footprint a volley / pierce line / chain covers, so the pack count answers
 * "how many foes would this shot really land on". */
const PACK_RADIUS = 90;

/** Minimum gap (sim ms) between the swap system's HAND CHANGES, so a foe
 * dancing on the blade-reach line can't make the hero juggle weapons every
 * tick. Short enough that a real transition (closing from shot range into
 * blade range) still feels instant; the airborne draw bypasses it (a hop's
 * whole window is shorter than this). */
const SWAP_COOLDOWN_MS = 400;

/** How far past the blade's own reach a body may stand before the blade hero
 * puts the blade away again (the sticky exit band of the melee hold): drawn
 * at `reach`, pocketed at `reach × MELEE_STICK`, so the hand doesn't flap on
 * a foe orbiting the boundary. */
const MELEE_STICK = 1.5;

/** How much better a banked weapon must read THIS MOMENT before the hero puts
 * away one that is already earning its keep — hysteresis on top of the
 * {@link SWAP_COOLDOWN_MS} gap, so a pack drifting across the crowd/single
 * line can't make him juggle two comparable guns. It is also what a PLAIN
 * UPGRADE has to clear on the context-free `weaponScore` to skip the
 * contextual test — the same bar both ways, so a fresh find that is simply
 * better goes in the hand while two rivals can't trade it back and forth. */
const SWAP_GAIN_MARGIN = 1.25;

/** How many bag cells the discipline spares for the pocket arsenal, on top of
 * the stashed main. The roles are filled in priority order (see
 * {@link computePocketKeepIndices}) and overlap freely; the cap only bites on
 * an exotic bag, but the opening bag is `LOOT.baseInventorySize` cells wide,
 * so an uncapped keep-set would swallow it whole. */
const POCKET_KEEP_MAX = 3;

/** A weapon the hero owns and could wield, with the bag cell it sits in
 * (-1 = in hand). */
type Owned = { index: number; item: Equipment };

/** Every wieldable weapon in the BAG (broken, under-leveled or under-statted
 * pieces are passed over — `canEquip`), optionally narrowed to the shots or to
 * the blades. */
function bagWeapons(state: GameState, kind?: "shot" | "melee"): Owned[] {
  const out: Owned[] = [];
  const inv = state.players[0].inventory;
  for (let index = 0; index < inv.length; index++) {
    const item = inv[index];
    if (!item || item.slot !== "weapon") continue;
    if (kind && weaponKind(item) !== kind) continue;
    if (!canEquip(state, state.players[0], item)) continue;
    out.push({ index, item });
  }
  return out;
}

/** Does this weapon THROW something (a shot the hero can land from range and
 * mid-air), or does it need a body at arm's length? */
function weaponKind(item: Equipment): "shot" | "melee" {
  return weaponDef(item.defId).projectile ? "shot" : "melee";
}

/** Does the bag hold ANY drawable pocket shot? The pure read `fight.ts` gates
 * its forward reposition-hops on: a blade hero with a pocket banked keeps
 * dealing damage mid-air (the swap draws it at the top of the hop), so the
 * "an airborne melee blade is dead weight" rule stops applying to him. */
export function hasPocketShooter(state: GameState): boolean {
  return bagWeapons(state, "shot").length > 0;
}

// ---- The FIELD READ (what the fight in front of the hero is asking for) ---------

/** One live body, as the weapon pick cares about it: how far it stands from
 * the hero, and whether it belongs to the MASS around the shot's likely aim
 * point (the nearest foe). */
type Body = { dist: number; inPack: boolean };

/** The moment, priced once per decision and shared by every candidate: every
 * live body's distance + pack membership, and how near the closest boss/elite
 * stands (Infinity with none about). Pure. */
type FieldRead = { bodies: Body[]; bossDist: number };

function fieldRead(state: GameState): FieldRead {
  const player = state.players[0];
  const bodies: Body[] = [];
  let bossDist = Infinity;
  let aim: Vec2 | null = null;
  let nearest = Infinity;
  for (const enemy of state.enemies) {
    const d = distance(player.pos, enemy.pos);
    bodies.push({ dist: d, inPack: false });
    if (d < nearest) {
      nearest = d;
      aim = enemy.pos;
    }
    const role = enemyDef(enemy.defId).role;
    if ((role === "boss" || role === "elite") && d < bossDist) bossDist = d;
  }
  if (aim) {
    let i = 0;
    for (const enemy of state.enemies) {
      const body = bodies[i++];
      if (body) body.inPack = distance(aim, enemy.pos) <= PACK_RADIUS;
    }
  }
  return { bodies, bossDist };
}

/**
 * WHAT A WEAPON IS WORTH THIS MOMENT — its per-target output (`weaponDps`)
 * times the targets the field lets it land on, or **-1 when it cannot land at
 * all**: nothing inside its reach, or a blade while the hero is airborne
 * (step/ holsters melee above `JUMP.dodgeHeight`). One scale for every class,
 * so the blade, the boss round and the crowd spray are directly comparable —
 * which is what lets the hand be shopped against the bag on a single number.
 *
 * The target count is where RANGE, SHAPE and the BIG BODY meet: only foes
 * inside this weapon's own reach are counted, its shape (pellets / pierce /
 * chain, or the blade's stat-widened cone) is the ceiling, and the mass really
 * standing at the aim point is the floor — collapsed to 1 whenever a
 * boss/elite is close enough to be the thing being shot at.
 */
function weaponMomentValue(
  state: GameState,
  item: Equipment,
  read: FieldRead,
  airborne: boolean,
): number {
  const def = weaponDef(item.defId);
  const melee = def.projectile === undefined;
  if (melee && airborne) return -1;
  const range = weaponRangeFor(state, state.players[0], item);
  let inRange = 0;
  let pack = 0;
  for (const body of read.bodies) {
    if (body.dist > range) continue;
    inRange++;
    if (body.inPack) pack++;
  }
  if (inRange === 0) return -1;
  const shape = def.projectile
    ? rangedShotTargets(def.projectile)
    : Math.min(
        meleeRealizedTargets(
          weaponSweepHalfAngle(state, state.players[0], item),
          range,
        ),
        maxMeleeTargets(state, state.players[0]),
      );
  const bigBody = read.bossDist <= Math.min(POCKET_BOSS_RADIUS, range);
  const targets = bigBody ? 1 : Math.min(shape, Math.max(1, pack));
  return weaponDps(state, state.players[0], item) * targets;
}

/** The banked weapon of `kind` the moment values most, or null when none of
 * them can land a blow right now. */
function bestBagDraw(
  state: GameState,
  read: FieldRead,
  airborne: boolean,
  kind: "shot" | "melee",
): (Owned & { value: number }) | null {
  let best: (Owned & { value: number }) | null = null;
  for (const { index, item } of bagWeapons(state, kind)) {
    const value = weaponMomentValue(state, item, read, airborne);
    if (value < 0 || (best && value <= best.value)) continue;
    best = { index, item, value };
  }
  return best;
}

/**
 * The bag cell holding the best pocket shot FOR THIS MOMENT, or -1 with
 * nothing worth drawing — the "which gun does this fight want" read, exported
 * for the tests and the app. Every banked shot is priced at
 * {@link weaponMomentValue}, so the single-target round takes the pocket at a
 * boss (or a lone straggler out of the others' reach) and the spread takes it
 * against a mass. A shot that reaches nobody never wins — drawing a gun with
 * nothing in range is churn, not damage.
 */
export function botPocketShooterIndex(state: GameState): number {
  const airborne = state.players[0].z > JUMP.dodgeHeight;
  const pick = bestBagDraw(state, fieldRead(state), airborne, "shot");
  return pick ? pick.index : -1;
}

// ---- The KIT the hero hauls (bag discipline) ------------------------------------

/** The hero's MAIN weapon — the strongest he owns (hand + bag, ranked by the
 * build-aware `weaponScore`), with the bag cell it sits in (-1 = in hand).
 * Stable across the swap system's hand changes, when the blade rides the bag
 * and a pocket gun rides the hand. */
// The bot's economy reads (`bestOwnedWeapon`, `botPocketKeepIndices`) are pure
// functions of the hero's loadout — the worn kit plus every bag item — and get
// called several times per tick (wantsMerchantVisit twice over, the field cull,
// the weapon-swap step). The loadout memo already mints a fresh object whenever
// the loadout snapshot changes (any equip/pickup/drop shifts the inventory id
// list it hashes), so caching these off that memo object gives a per-loadout
// memo that auto-invalidates the instant anything relevant moves — collapsing
// the repeated inventory walks into one. Read-only results (callers copy into a
// Set / read fields), so the shared reference is safe to hand back.
const bestWeaponByLoadout = new WeakMap<object, Owned>();
const pocketKeepByLoadout = new WeakMap<object, number[]>();

export function bestOwnedWeapon(state: GameState): Owned {
  const memo = heroLoadoutMemo(state, state.players[0]);
  const hit = bestWeaponByLoadout.get(memo);
  if (hit) return hit;
  const result = computeBestOwnedWeapon(state);
  bestWeaponByLoadout.set(memo, result);
  return result;
}

function computeBestOwnedWeapon(state: GameState): Owned {
  const inv = state.players[0].inventory;
  let item = state.players[0].equipment.weapon;
  let index = -1;
  let bestScore = weaponScore(state, state.players[0], item);
  for (let i = 0; i < inv.length; i++) {
    const cell = inv[i];
    if (
      !cell ||
      cell.slot !== "weapon" ||
      !canEquip(state, state.players[0], cell)
    )
      continue;
    const score = weaponScore(state, state.players[0], cell);
    if (score > bestScore) {
      bestScore = score;
      item = cell;
      index = i;
    }
  }
  return { item, index };
}

/** How many targets a weapon's blow is SHAPED for, field aside — the paper
 * crowd credit that sorts the "spray" role from the "round" role. */
function weaponShape(state: GameState, item: Equipment): number {
  const def = weaponDef(item.defId);
  if (def.projectile) return rangedShotTargets(def.projectile);
  return Math.min(
    meleeRealizedTargets(
      weaponSweepHalfAngle(state, state.players[0], item),
      weaponRangeFor(state, state.players[0], item),
    ),
    maxMeleeTargets(state, state.players[0]),
  );
}

/** One job in the kit, and the best weapon the hero owns for it (hand
 * included — a role the HAND already fills costs no bag cell). */
type Role = { index: number; lane: WeaponClass };

/**
 * Bag cells the bot's bag discipline SPARES for the pocket arsenal — the
 * "carry an answer to every fight" rule. Spared whatever their raw numbers
 * read against the hand, and — while the swap system has the blade riding the
 * bag — the main weapon's own cell too. Read by `cullWorstLoot` and
 * `tradeAtMerchant` so neither the field cull nor the counter sell-run eats
 * the kit.
 *
 * The roles, in the order the cells are spent:
 *   1. the BOSS ROUND — the shot that hits hardest per target (`weaponDps`);
 *   2. the CROWD SPRAY — the best shot whose SHAPE covers a mass (pellets, a
 *      pierce line, a chain), priced at what it lands across one;
 *   3+. the same two jobs in MELEE (the heavy blade and the cleaver) and class
 *      coverage (best banked ranged / magic), ordered so the hero's OWN SPEC
 *      (`committedLane`) comes first — a blade build keeps its second blade
 *      shape ahead of a gunner's.
 * The shots lead because they are the roles the hero has no substitute for:
 * out of arm's reach and through every airborne frame they are his only
 * damage. A role the HAND already fills is free; the rest of the set is capped
 * at {@link POCKET_KEEP_MAX} cells and always leaves the bag a cell the cull
 * can free.
 */
export function botPocketKeepIndices(state: GameState): number[] {
  const memo = heroLoadoutMemo(state, state.players[0]);
  const hit = pocketKeepByLoadout.get(memo);
  if (hit) return hit;
  const result = computePocketKeepIndices(state);
  pocketKeepByLoadout.set(memo, result);
  return result;
}

function computePocketKeepIndices(state: GameState): number[] {
  const keep = new Set<number>();
  const main = bestOwnedWeapon(state);
  if (main.index >= 0) keep.add(main.index); // the stashed main, mid-swap
  const owned: Owned[] = [
    { index: -1, item: state.players[0].equipment.weapon },
    ...bagWeapons(state),
  ];
  // The four jobs, each won by the best weapon the hero owns for it.
  const round = (kind: "shot" | "melee"): Role | null =>
    bestRole(state, owned, kind, (item) =>
      weaponDps(state, state.players[0], item),
    );
  const spray = (kind: "shot" | "melee"): Role | null =>
    bestRole(state, owned, kind, (item) => {
      const shape = weaponShape(state, item);
      return shape > 1 ? weaponDps(state, state.players[0], item) * shape : -1;
    });
  const byClass = (cls: WeaponClass): Role | null =>
    bestRole(state, owned, undefined, (item) =>
      weaponDef(item.defId).class === cls
        ? weaponScore(state, state.players[0], item)
        : -1,
    );
  const lane = committedLane(state, state.players[0]);
  const rest = [
    round("melee"),
    spray("melee"),
    byClass("ranged"),
    byClass("magic"),
  ];
  const roles = [
    round("shot"),
    spray("shot"),
    // The hero's OWN lane first among the remainder — his spec decides which
    // spare he'd actually swing.
    ...rest.filter((r) => r?.lane === lane),
    ...rest.filter((r) => r && r.lane !== lane),
  ];
  // Never spare so much that the cull can't free the bot's open cell.
  const cap = Math.min(POCKET_KEEP_MAX, state.players[0].inventory.length - 1);
  let spent = 0;
  for (const role of roles) {
    if (spent >= cap) break;
    // -1 = the HAND already fills this job; a cell already spared fills it for
    // free. Either way the role costs nothing.
    if (!role || role.index < 0 || keep.has(role.index)) continue;
    keep.add(role.index);
    spent++;
  }
  return [...keep];
}

/** The owned weapon that scores highest for one job (a negative score opts a
 * weapon out of the job entirely), or null when nobody qualifies. */
function bestRole(
  state: GameState,
  owned: Owned[],
  kind: "shot" | "melee" | undefined,
  score: (item: Equipment) => number,
): Role | null {
  let best: Role | null = null;
  let bestValue = 0;
  for (const { index, item } of owned) {
    if (kind && weaponKind(item) !== kind) continue;
    const value = score(item);
    if (value <= 0 || value <= bestValue) continue;
    bestValue = value;
    best = { index, lane: weaponDef(item.defId).class };
  }
  return best;
}

// ---- The SWAP itself -----------------------------------------------------------

/** The slice of bot memory the swap system writes: when the hand last
 * changed, for the anti-juggle cooldown. Structural, so `state.ts` needs no
 * import from here — the `Bot` type carries the field. */
export type SwapMemory = { lastSwapMs?: number };

/** Swap the hand to bag cell `index`, carrying the attack clock across: the
 * new hand inherits the shorter of the carried wait and its own full
 * cooldown, so juggling weapons never mints free shots (the UI's
 * `equipFromInventory` zeroes it — instant gratification for a hand-picked
 * swap; the bot, swapping every fight, plays fair). */
function swapHand(bot: SwapMemory, state: GameState, index: number): boolean {
  const player = state.players[0];
  const carried = player.weaponCooldownMs;
  if (!equipFromInventory(state, player, index)) return false;
  player.weaponCooldownMs = Math.min(
    carried,
    weaponCooldownFor(state, player, player.equipment.weapon),
  );
  bot.lastSwapMs = state.stats.timeMs;
  return true;
}

/**
 * THE WEAPON-SWAP DECISION, split out from the commit
 * ({@link stepBotWeaponSwap}) so a caller can see the hand change COMING:
 * returns the bag cell the swap system wants drawn RIGHT NOW, or -1 to keep
 * the current hand. Pure — reads the state and the bot's anti-juggle memory,
 * writes neither.
 *
 * The split exists for the HOW TO PLAY demo, which plays the swap as the two
 * taps a player makes (open the switcher, then tap the weapon — see
 * `demo-director.ts`): it has to know WHICH weapon the bot is reaching for
 * before the hand actually changes, or it would light up the wrong row.
 * Everything else calls the committing form and never sees this.
 */
export function botWeaponSwapTarget(bot: SwapMemory, state: GameState): number {
  if (state.phase !== "playing") return -1;
  const player = state.players[0];
  if (player.disarmed) return -1;
  const held = player.equipment.weapon;
  const main = bestOwnedWeapon(state);
  const since =
    bot.lastSwapMs === undefined
      ? Infinity
      : state.stats.timeMs - bot.lastSwapMs;
  const coolingDown = since < SWAP_COOLDOWN_MS;
  const heldShot = weaponKind(held) === "shot";
  const airborne = player.z > JUMP.dodgeHeight;
  const read = fieldRead(state);

  /** Trade the hand for a banked pick — but only on a CLEAR gain, so two
   * comparable weapons in the kit can't juggle. The anti-juggle gap applies on
   * the ground; MID-AIR it is bypassed, because drawing the crowd gun over a
   * pack at the top of a hop is exactly what carrying it is for and a hop's
   * whole window is shorter than the gap.
   *
   * The margin is asked for only when the trade GIVES UP REACH. That is not a
   * detail: the hero's whole standoff is derived from the weapon in his hand
   * (`survive()` holds at its range), so putting away a long gun for a short
   * one walks him into the pack — measurably more damage taken and more
   * deaths. Reaching FARTHER for the same output is free; reaching less far
   * has to pay for the ground it costs. That also gives the hysteresis a
   * stable direction: the cheap trade is always the safer one. */
  const trade = (pick: (Owned & { value: number }) | null): number => {
    if (!pick) return -1;
    if (coolingDown && !airborne) return -1;
    const mine = weaponMomentValue(state, held, read, airborne);
    if (mine < 0) return pick.index; // the hand can't land a blow at all
    // A plainly BETTER weapon — one that wins the context-free ranking by the
    // same margin — is worth the ground too: that is how a fresh find gets
    // worn instead of riding the bag.
    const keepsReach =
      weaponRangeFor(state, player, pick.item) >=
      weaponRangeFor(state, player, held);
    const upgrade =
      weaponScore(state, player, pick.item) >
      weaponScore(state, player, held) * SWAP_GAIN_MARGIN;
    const bar = keepsReach || upgrade ? 1 : SWAP_GAIN_MARGIN;
    return pick.value > mine * bar ? pick.index : -1;
  };

  if (weaponDef(main.item.defId).projectile) {
    // A SHOOTER BUILD never swaps for POSITION — its gun already fires in
    // every stance — but it does swap for the FIGHT: the single-target round
    // at a boss, the spread into a mass. And "the gun is in hand" is not a
    // given: the bag is where every find lands with the player's on-pickup
    // auto-equip off, so a hero holding a blade with the stronger gun banked
    // draws it (falling back to the main when nothing is in range yet, or he
    // would be left with the wrong weapon forever).
    if (!heldShot) {
      if (coolingDown && !airborne) return -1;
      const shot = bestBagDraw(state, read, airborne, "shot");
      if (shot) return shot.index;
      return main.index >= 0 ? main.index : -1;
    }
    return trade(bestBagDraw(state, read, airborne, "shot"));
  }

  // A BLADE BUILD. Nearest live body against the MAIN blade's true reach
  // (stat-widened, the same distance stepWeapon lands swings at), with a
  // sticky exit band so a foe orbiting the boundary can't start a juggle.
  let nearest = Infinity;
  for (const body of read.bodies) nearest = Math.min(nearest, body.dist);
  const reach = weaponRangeFor(state, player, main.item);
  const wantBlade =
    !airborne && nearest <= reach * (heldShot ? 1 : MELEE_STICK);
  if (wantBlade) {
    // A body in blade reach: nothing out-damages the blade there — and WHICH
    // blade is the moment's call too (the cleaver into a pack, the heavy
    // hitter at a boss).
    const blade = bestBagDraw(state, read, airborne, "melee");
    if (!blade) return -1;
    if (!heldShot) return trade(blade); // already swinging: only a clear gain
    return coolingDown ? -1 : blade.index;
  }
  // Out of blade business: hold the shot the fight wants while anything
  // presents a target, and go back to the blade when the field is empty (the
  // idle hand).
  const shot = bestBagDraw(state, read, airborne, "shot");
  if (shot) {
    if (heldShot) return trade(shot);
    if (coolingDown && !airborne) return -1;
    return shot.index;
  }
  // Nothing to shoot: the blade is the resting hand (and the next fight
  // usually opens at reach). Never mid-air — the blade is dead weight there.
  if (heldShot && main.index >= 0 && !airborne && !coolingDown) {
    return main.index;
  }
  return -1;
}

/**
 * THE WEAPON-SWAP SYSTEM — a harness-side action (like `autoEquipBest`,
 * called each tick by the campaign sim and the app's autoplay, never from
 * the pure `botAct`): keep the hand on whatever maximizes damage THIS
 * moment. A blade hero swings the blade when a body stands in blade reach —
 * nothing out-damages it there — but the blade deals ZERO damage everywhere
 * else, so out of reach (closing on a pack, kiting, walking off to fetch
 * loot) and through every airborne frame (step/ holsters melee above
 * `JUMP.dodgeHeight`) the hand holds a banked shot instead. WHICH weapon —
 * blade or shot — is the field's call ({@link weaponMomentValue}): the round
 * that hits hardest at a boss or a lone straggler, the spread that covers a
 * mass, and never one whose reach falls short of the bodies on the field. The
 * pick is re-made every tick, so a fresh find goes into the hand as soon as it
 * beats what he carries, and a pack that closes mid-JUMP is met with the crowd
 * gun at the top of the hop.
 *
 * The bot simply manipulates the inventory — no UI, the same
 * `equipFromInventory` a player's bag hotkey drives — with the attack clock
 * carried across so the juggle never mints free shots, a
 * {@link SWAP_COOLDOWN_MS} anti-flap gap (the airborne draw bypasses it — a
 * hop's window is shorter than the gap) and a {@link SWAP_GAIN_MARGIN}
 * hysteresis on re-picks. Returns whether the hand changed (so the app can
 * refresh its HUD). Deterministic: memory lives on the bot, keyed off pure
 * state, exactly like the rest of the bot's latches — the decision itself is
 * {@link botWeaponSwapTarget}.
 */
export function stepBotWeaponSwap(bot: SwapMemory, state: GameState): boolean {
  const index = botWeaponSwapTarget(bot, state);
  if (index < 0) return false;
  return swapHand(bot, state, index);
}
