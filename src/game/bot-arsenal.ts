// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's ARSENAL PLAY: pointing the auto-weapon at the foe worth
// hitting (`bestAimTarget`), playing the powerup dock by VALUE (the timed
// spend, the shelf-space burn, the drop-for-upgrade, the priority sort), and
// the mana-thrift spellcasting read (`pickSpellToCast`). All pure reads of
// the GameState — `decideAct` (bot.ts) wires the picks into the tick's
// GameInput — so botted runs stay deterministic.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { abilityPowerScale, isSlotActive, magnetRadius } from "./abilities.ts";
import { abilityValue } from "./bot-economy.ts";
import {
  SURROUND_RADIUS,
  THREAT_RADIUS,
  threatsWithin,
} from "./bot-perception.ts";
import {
  HEAL_HP_FRAC,
  ITEM_REACH,
  STAMINA_TOPUP_FRAC,
} from "./bot-supplies.ts";
import type { BotTuning } from "./bot-tuning.ts";
import { HELD_ITEMS, PLAYER, WEAPON } from "./config/index.ts";
import { abilityDef } from "./defs/abilities.ts";
import type { AbilityDef } from "./defs/abilities.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { spellDef } from "./defs/spells.ts";
import type { SpellDef, SpellEffect } from "./defs/spells.ts";
import {
  bestMedkitTier,
  isSpellAvailable,
  maxMeleeTargets,
  weaponRangeFor,
  weaponSweepHalfAngle,
} from "./items.ts";
import { blockedByObstacle, lineOfSight } from "./obstacles.ts";
import type { Enemy, GameState } from "./types.ts";

/** Spend the NUKE only into an OVERWHELMING flood — this many foes inside the
 * blast itself (which covers roughly the visible screen). A pack any thinner
 * is left to the guns; the wipe is the break-glass button. */
const NUKE_PACK = 20;
/** Spend a combat power (storm/orbit) once a fight this size is packed close —
 * good value against a few bodies, no need to wait for a horde. */
const POWERUP_FIGHT_PACK = 3;
/** STASIS is the cornered-escape: fired when the hero CAN'T RUN (sprint pool
 * below the top-up line), is BLEEDING (hp under {@link STASIS_HP_FRAC}), and at
 * least this many foes are hunting inside the local threat ring — freezing the
 * chase buys the ground a healthy pair of legs would just outrun. */
const STASIS_HUNT_PACK = 5;
/** The hp fraction under which the cornered-escape stasis arms. */
const STASIS_HP_FRAC = 0.5;
/** Ground drops inside the magnet's pull that make popping it worthwhile. */
const MAGNET_LOOT_MIN = 3;

/** Drink a mana potion once the pool dips below this fraction of its max. */
export const MANA_TOPUP_FRAC = 0.25;

/** HP fraction below which a slotted heal fires REGARDLESS of overheal or the
 * medkits in the pockets — nearly dead, every restored point counts. */
const SPELL_HEAL_EMERGENCY_FRAC = 0.3;

/** How much of a heal's restored bar must land in the hp DEFICIT for the cast
 * to be worth its mana — a 45% heal poured into a 15% dent is mostly overheal,
 * and overheal is mana thrown away. */
const SPELL_HEAL_SOAK_FRAC = 0.8;

/** With no medkit banked and hp below this fraction, every non-heal cast keeps
 * enough mana in reserve to still afford the cheapest slotted heal — the
 * pool's emergency exit is never spent on a nova. */
const SPELL_RESERVE_HP_FRAC = 0.8;

/** How near (px) a fight must stand for the martial self-buff to open it: the
 * amp runs on a timer, so it's popped facing a crowd about to be in weapon
 * range, never over an empty field where the clock ticks for nothing. */
const SPELL_BUFF_ENGAGE_RADIUS = 260;

/** Bodies inside {@link SPELL_BUFF_ENGAGE_RADIUS} that make the buff's timer
 * pay; a lone elite/boss counts regardless — the long fight the amp is for. */
const SPELL_BUFF_PACK = 2;

/** Threats packed inside SURROUND_RADIUS before a ward is worth raising on a
 * HEALTHY hero — a hurt hero raises it on any near threat instead. */
const SPELL_SHIELD_PACK = 3;

/** A ward within this many ms of lapsing (or already down) may be re-raised;
 * re-casting over a healthy ward only refreshes it — most of the mana buys
 * absorb the old ward already had. */
const SPELL_SHIELD_REFRESH_MS = 500;

/** Count of live, non-apparition foes within `radius` of the hero (the
 * powerup-moment reads — a nuke wipes anything, kneeling spareables included,
 * so this deliberately does NOT apply the cast-target `state.choice` guard). */
function foesWithin(state: GameState, radius: number): number {
  let n = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    if (distance(state.player.pos, enemy.pos) <= radius) n++;
  }
  return n;
}

/** Live foes a cast can actually damage — mirrors sorcery.ts `isTargetable`:
 * apparitions never take hits, and a kneeling spareable awaiting its verdict
 * (`state.choice`) is off-limits. The bot counts exactly what the resolver
 * will hit, so it never banks a cast on a body the engine skips. */
function castTargets(state: GameState): Enemy[] {
  return state.enemies.filter(
    (e) =>
      !enemyDef(e.defId).apparition &&
      !(state.choice !== null && state.choice.enemyId === e.id),
  );
}

/** The nearest of `foes` to `from` within `range` (skipping `exclude`) — the
 * same greedy pick the cast resolver makes for bolts and rain centres. */
function nearestCastTarget(
  foes: Enemy[],
  from: Vec2,
  range: number,
  exclude?: Set<number>,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const foe of foes) {
    if (exclude?.has(foe.id)) continue;
    const d = distance(foe.pos, from);
    if (d <= range && d < bestD) {
      bestD = d;
      best = foe;
    }
  }
  return best;
}

/**
 * The EFFECTIVE damage a damage cast would land RIGHT NOW, in the catalog's
 * level-1 units: each foe's remaining bar is read back through
 * `abilityPowerScale` (the multiplier the resolver applies at cast) and the
 * per-foe credit is OVERKILL-CAPPED at that bar — damage past a corpse counts
 * nothing, so a capstone nova is never spent finishing one dying straggler.
 * A foe the cast KILLS credits at least `killCredit` though (never more than
 * the cast's own damage number): the raw cap alone starves the horde clear —
 * against a pack the hero outlevels every bar reads near zero, and a nova
 * one-shotting five bodies IS the play, not waste.
 * The per-effect reads mirror sorcery.ts exactly: a bolt strikes the nearest
 * foe in range then chains greedily within `WEAPON.chainRange` at the falloff;
 * a nova rings the HERO; a rain lands its ring on the nearest foe within
 * `castRange`. Returns 0 when nothing would connect (the engine would fizzle).
 */
function spellDamageValue(
  state: GameState,
  effect: Extract<SpellEffect, { kind: "bolt" | "nova" | "rain" }>,
  foes: Enemy[],
  power: number,
  killCredit: number,
): number {
  // The value one strike of `dmg` lands on a foe with `bar` left (L1 units):
  // capped at the bar (overkill counts nothing), floored at the kill credit
  // when the strike fells it (a removed attacker is worth more than its
  // sliver of bar), never above the strike itself.
  const credit = (dmg: number, bar: number): number =>
    dmg >= bar ? Math.min(dmg, Math.max(bar, killCredit)) : dmg;
  if (effect.kind === "bolt") {
    let victim = nearestCastTarget(foes, state.player.pos, effect.range);
    if (!victim) return 0;
    const struck = new Set<number>();
    let dmg = effect.damage;
    let total = 0;
    for (let leap = 0; ; leap++) {
      struck.add(victim.id);
      total += credit(dmg, victim.hp / power);
      if (leap >= (effect.chain ?? 0)) break;
      const next = nearestCastTarget(
        foes,
        victim.pos,
        WEAPON.chainRange,
        struck,
      );
      if (!next) break;
      victim = next;
      dmg *= WEAPON.chainDamageFrac;
    }
    return total;
  }
  const center =
    effect.kind === "nova"
      ? state.player.pos
      : nearestCastTarget(foes, state.player.pos, effect.castRange)?.pos;
  if (!center) return 0;
  let total = 0;
  for (const foe of foes) {
    if (distance(foe.pos, center) <= effect.radius) {
      total += credit(effect.damage, foe.hp / power);
    }
  }
  return total;
}

/**
 * The spell-bar slot the bot should cast this tick, or -1 for none — the
 * MANA-THRIFT read: mana trickles back slowly (and every cast pauses the
 * trickle), so each point spent must convert to landed damage or a kept life.
 * In priority order:
 *
 * 1. SURVIVAL — a heal when bleeding: unconditionally near death, otherwise
 *    only as the medkit backup (kits pop first) and only when the dent soaks
 *    most of the restored bar (overheal is waste).
 * 2. The martial BUFF opening a real fight (a pack or a named foe at the
 *    engagement ring, no amp already running).
 * 3. The DAMAGE cast (bolt/nova/rain) converting the most EFFECTIVE damage
 *    per point of mana — overkill-capped, chain- and ring-aware via
 *    {@link spellDamageValue} — and only above the tuned efficiency floor
 *    (`spellEffMin`; relaxed to `spellEffBrimMin` while the pool brims and
 *    the regen is being wasted anyway). A whiffing or corpse-finishing cast
 *    scores under the floor and is held.
 * 4. The WARD under real pressure (hurt with a threat near, or a pack inside
 *    the surround ring) when no healthy ward is up.
 * 5. The SLOW at the cornered moment (bleeding, a hunting pack inside the
 *    ring) — crowd control bought only when it buys survival.
 *
 * With no medkit banked and the bar dented, every non-heal cast keeps the
 * cheapest slotted heal affordable ({@link SPELL_RESERVE_HP_FRAC}). Pure:
 * reads state + tuning only.
 */
export function pickSpellToCast(
  state: GameState,
  threatNear: boolean,
  tune: BotTuning,
): number {
  const p = state.player;

  // The castable bar: slotted, unlocked, off its own cooldown, affordable.
  const options: { slot: number; def: SpellDef }[] = [];
  for (let i = 0; i < p.spellSlots.length; i++) {
    const id = p.spellSlots[i];
    if (!id) continue;
    const def = spellDef(id);
    if (!isSpellAvailable(state, def)) continue;
    if ((p.spellCooldowns[id] ?? 0) > 0) continue;
    if (p.mana < def.manaCost) continue;
    options.push({ slot: i, def });
  }
  if (options.length === 0) return -1;

  const hurt = p.hp < p.maxHp * HEAL_HP_FRAC;
  const noKit = bestMedkitTier(state) < 0;

  // 1. SURVIVAL FIRST — the biggest slotted heal that's warranted.
  let heal = -1;
  let healPct = 0;
  const emergency = p.hp < p.maxHp * SPELL_HEAL_EMERGENCY_FRAC;
  for (const { slot, def } of options) {
    const e = def.effect;
    if (e.kind !== "heal" || e.healPct <= healPct) continue;
    const soaks = p.maxHp - p.hp >= p.maxHp * e.healPct * SPELL_HEAL_SOAK_FRAC;
    if (emergency || (hurt && noKit && soaks)) {
      heal = slot;
      healPct = e.healPct;
    }
  }
  if (heal >= 0) return heal;

  // The heal RESERVE every other cast honours (0 = no reserve needed).
  let healReserve = 0;
  if (noKit && p.hp < p.maxHp * SPELL_RESERVE_HP_FRAC) {
    for (const id of p.spellSlots) {
      if (!id) continue;
      const def = spellDef(id);
      if (def.effect.kind !== "heal" || !isSpellAvailable(state, def)) continue;
      if (healReserve === 0 || def.manaCost < healReserve) {
        healReserve = def.manaCost;
      }
    }
  }
  const spendable = (cost: number): boolean => p.mana - cost >= healReserve;

  const foes = castTargets(state);
  const power = abilityPowerScale(state);

  // 2. The FIGHT-OPENING BUFF (martial classes).
  if (p.buffMs <= 0) {
    for (const { slot, def } of options) {
      if (def.effect.kind !== "buff" || !spendable(def.manaCost)) continue;
      let pack = 0;
      let named = false;
      for (const foe of foes) {
        if (distance(foe.pos, p.pos) > SPELL_BUFF_ENGAGE_RADIUS) continue;
        pack++;
        const role = enemyDef(foe.defId).role;
        if (role === "elite" || role === "boss") named = true;
      }
      if (pack >= SPELL_BUFF_PACK || (named && pack >= 1)) return slot;
    }
  }

  // 3. MAXIMUM DAMAGE PER MANA — the best-converting damage cast above the
  // efficiency floor (relaxed while the pool brims: idle mana at the cap
  // wastes the regen, so converting it at a poorer rate still pays).
  const brimming = p.mana >= p.maxMana * tune.spellBrimFrac;
  const effFloor = brimming
    ? Math.min(tune.spellEffMin, tune.spellEffBrimMin)
    : tune.spellEffMin;
  let best = -1;
  let bestEff = 0;
  let bestDmg = 0;
  for (const { slot, def } of options) {
    const e = def.effect;
    if (e.kind !== "bolt" && e.kind !== "nova" && e.kind !== "rain") continue;
    if (!spendable(def.manaCost)) continue;
    const dmg = spellDamageValue(state, e, foes, power, tune.spellKillCredit);
    const eff = dmg / def.manaCost;
    if (
      eff >= effFloor &&
      (eff > bestEff || (eff === bestEff && dmg > bestDmg))
    ) {
      best = slot;
      bestEff = eff;
      bestDmg = dmg;
    }
  }
  if (best >= 0) return best;

  // 4. The WARD, under real pressure only, never over a healthy ward.
  if (p.shieldMs <= SPELL_SHIELD_REFRESH_MS) {
    const packed = threatsWithin(state, SURROUND_RADIUS).length;
    for (const { slot, def } of options) {
      if (def.effect.kind !== "shield" || !spendable(def.manaCost)) continue;
      if ((hurt && threatNear) || packed >= SPELL_SHIELD_PACK) return slot;
    }
  }

  // 5. The SLOW, at the cornered moment (mirrors the stasis powerup's read).
  if (p.hp < p.maxHp * STASIS_HP_FRAC) {
    for (const { slot, def } of options) {
      const e = def.effect;
      if (e.kind !== "slow" || !spendable(def.manaCost)) continue;
      let packed = 0;
      for (const foe of foes) {
        if (distance(foe.pos, p.pos) <= e.radius) packed++;
      }
      if (packed >= STASIS_HUNT_PACK) return slot;
    }
  }
  return -1;
}

/** Is a NUKE banked in the powerup dock? With one in his pocket the bot can
 * afford to be DARING: it keeps kiting forward and skips the escape-route
 * guard — worst case, the button clears the screen. Pure. */
export function hasNukeBanked(state: GameState): boolean {
  return state.player.heldAbilities.some(
    (id) => abilityDef(id).kind === "nuke",
  );
}

/**
 * The BANKED dock slots — not running, not blocked by a running copy of a
 * non-stackable power (the engine would refuse the spend and waste the edge)
 * — most precious first ({@link abilityValue}): the moment pass hands the
 * crowd to the best power, the burn pass walks the list backwards for the
 * cheapest.
 */
function bankedPowerups(
  state: GameState,
): { defId: string; slot: number; def: AbilityDef }[] {
  const player = state.player;
  return player.heldAbilities
    .map((defId, slot) => ({ defId, slot, def: abilityDef(defId) }))
    .filter(({ slot }) => !isSlotActive(state, slot))
    .filter(
      ({ def, defId }) =>
        def.stackable || !player.abilities.some((a) => a.defId === defId),
    )
    .sort((a, b) => abilityValue(b.defId) - abilityValue(a.defId));
}

/**
 * The dock slot whose MOMENT is now — the spend worth making this tick, or -1.
 * The bot knows the whole catalog by VALUE ({@link abilityValue}: nuke >
 * storm > orbit > stasis > magnet) and times each power for what it's worth:
 * the NUKE only into an OVERWHELMING flood (`NUKE_PACK` foes inside the blast
 * itself), a combat power on a decent fight (`POWERUP_FIGHT_PACK`), the
 * STASIS when he's CORNERED — too winded to run, bleeding under half, a pack
 * hunting him (`STASIS_HUNT_PACK`) — and the MAGNET the moment a lootable
 * spill sits inside its pull. Checked best-first, so a flood eats the nuke,
 * never the stasis. Pure (state only), so determinism holds.
 */
export function pickPowerupMoment(state: GameState): number {
  const player = state.player;
  const banked = bankedPowerups(state);
  if (banked.length === 0) return -1;
  const packedClose = threatsWithin(state, SURROUND_RADIUS).length;
  // CORNERED — the stasis moment: too winded to outrun the hunt, bleeding
  // under half, and a real pack on his heels inside the threat ring.
  const cornered =
    player.stamina < player.maxStamina * STAMINA_TOPUP_FRAC &&
    player.hp < player.maxHp * STASIS_HP_FRAC &&
    threatsWithin(state, THREAT_RADIUS).length >= STASIS_HUNT_PACK;
  for (const { def, slot } of banked) {
    switch (def.kind) {
      case "nuke":
        // Counted inside the blast itself, so "overwhelming" means what the
        // wipe would actually erase — not a wide tail of distant stragglers.
        if (foesWithin(state, def.nuke?.radius ?? SURROUND_RADIUS) >= NUKE_PACK)
          return slot;
        break;
      case "storm":
      case "orbit":
        if (packedClose >= POWERUP_FIGHT_PACK) return slot;
        break;
      case "stasis":
        if (cornered) return slot;
        break;
      case "magnet":
        if (magnetLootClose(state, def)) return slot;
        break;
    }
  }
  return -1;
}

/**
 * The dock slot worth BURNING for shelf space this tick, or -1 — the pressure
 * valve that keeps a slot cycling free for the next strong pickup. The MAGNET
 * (pure convenience) burns as soon as the dock is down to its last open slot;
 * with the dock FULL the cheapest banked power burns too — the STASIS freely
 * (low value, and a fresh drop can re-stock the escape), a combat power only
 * with a foe near enough to actually hit. The NUKE is never burned for shelf
 * space: it's the emergency button (and the DARING read, {@link
 * hasNukeBanked}). Runs AFTER {@link powerupDropForUpgrade} in the decision
 * chain — an instant drop beats a burn whose slot only frees when the power
 * lapses. Pure.
 */
export function pickPowerupBurn(state: GameState): number {
  const banked = bankedPowerups(state);
  if (banked.length === 0) return -1;
  const openSlots = HELD_ITEMS.cap - state.player.heldAbilities.length;
  const anyFoeNear = threatsWithin(state, THREAT_RADIUS).length > 0;
  for (let i = banked.length - 1; i >= 0; i--) {
    const { def, slot } = banked[i]!;
    if (def.kind === "nuke") continue; // never burn the wipe for shelf space
    if (def.kind === "magnet" && openSlots <= 1) return slot;
    if (openSlots <= 0) {
      if (def.kind === "magnet" || def.kind === "stasis") return slot;
      if (anyFoeNear) return slot;
    }
  }
  return -1;
}

/** Enough ground drops inside the magnet's pull to be worth popping it —
 * counts what the field would actually reel in (a mercy drop still riding its
 * angel down is out of the magnet's reach, see stepAbilities). */
function magnetLootClose(state: GameState, def: AbilityDef): boolean {
  const reach = magnetRadius(state, def);
  let count = 0;
  for (const item of state.items) {
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (distance(state.player.pos, item.pos) > reach) continue;
    count++;
    if (count >= MAGNET_LOOT_MIN) return true;
  }
  return false;
}

/**
 * The single dock reorder (`GameInput.moveItem`) that walks the powerup row
 * one step closer to the bot's own priority order — best first ({@link
 * abilityValue}, ties keeping their current order) — or null once sorted. The
 * bot issues one move per tick until the dock reads as its ranking, so a
 * viewer can literally see how it values what it carries (the nuke parked at
 * the head of the row, the magnet at the tail). Running slots shuffle along
 * with their countdowns (`moveHeldSlot` keeps the links). Pure.
 */
export function powerupSortMove(
  state: GameState,
): { from: number; to: number } | null {
  const held = state.player.heldAbilities;
  if (held.length < 2) return null;
  const order = held
    .map((defId, i) => ({ i, v: abilityValue(defId) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  for (let to = 0; to < order.length; to++) {
    const from = order[to]!.i;
    if (from !== to) return { from, to };
  }
  return null;
}

/**
 * The dock slot to DROP (`GameInput.dropItemIndex`) so a better powerup lying
 * on the ground can be picked up — or -1 to keep the shelf. Only fires with
 * the dock FULL and a grabbable ability item within {@link ITEM_REACH} (clear
 * straight sweep, not a uniqueHeld double the dock would refuse anyway). What
 * gets tossed, in order of preference:
 *   • a RUNNING (non-nuke) slot — the pickup is already spent, so freeing its
 *     shelf space costs nothing and ANY bankable find is a net gain;
 *   • else the cheapest BANKED (non-nuke) slot, and only for a ground find of
 *     strictly higher value — trading a magnet away for a nuke, never a storm
 *     for a stasis.
 * The NUKE is never tossed. Pure; the actual grab happens as the hero walks
 * over the item (nearestWantedItem already steers at ground abilities).
 */
export function powerupDropForUpgrade(state: GameState): number {
  const player = state.player;
  const held = player.heldAbilities;
  if (held.length < HELD_ITEMS.cap) return -1; // room already
  // The best grabbable powerup find in reach.
  let bestGround = -1;
  for (const item of state.items) {
    if (item.kind !== "ability") continue;
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (abilityDef(item.defId).uniqueHeld && held.includes(item.defId)) {
      continue; // a second nuke can't bank no matter what's dropped
    }
    if (distance(player.pos, item.pos) > ITEM_REACH) continue;
    if (blockedByObstacle(state, player.pos, item.pos, PLAYER.radius)) {
      continue;
    }
    bestGround = Math.max(bestGround, abilityValue(item.defId));
  }
  if (bestGround < 0) return -1;
  // The slot to toss: a spent (running) one for free, else the cheapest
  // banked one — never the nuke.
  let drop = -1;
  let dropValue = Infinity;
  let dropRunning = false;
  for (let i = 0; i < held.length; i++) {
    const defId = held[i]!;
    if (abilityDef(defId).kind === "nuke") continue;
    const running = isSlotActive(state, i);
    const value = abilityValue(defId);
    const better =
      running !== dropRunning ? running : value < dropValue || drop < 0;
    if (better) {
      drop = i;
      dropValue = value;
      dropRunning = running;
    }
  }
  if (drop < 0) return -1;
  return dropRunning || bestGround > dropValue ? drop : -1;
}

/** Nearest-foe distance under which the bot stops picking clever aim targets
 * and shoots the body about to bite it — killing the immediate threat IS the
 * most damage that matters. */
const AIM_PANIC_RANGE = 90;

/** Half-angle (radians) used to judge how many bodies a PIERCING/CHAINING
 * round's line threads — a narrow corridor read on the same cone math. */
const AIM_LINE_HALF_ANGLE = 0.18;

/**
 * The world point the auto-weapon should be AIMED at this tick — the target
 * that turns the swing/volley into the most damage — or undefined to keep the
 * engine's plain nearest-foe pick. The engine reads `GameInput.aim` exactly
 * like a desktop mouse bearing (`nearestEnemy`'s alignment bias), so pointing
 * it at a foe makes the weapon fight THROUGH that foe:
 *   • A CONE/SPREAD weapon (melee sweep, shotgun fan) aims at the foe whose
 *     direction covers the most bodies inside the arc — the densest cluster.
 *   • A PIERCING/CHAINING round aims down the line that threads the most foes.
 *   • A plain single shot finishes the most WOUNDED foe in range (thinning the
 *     pack beats poking the freshest body), tie-broken nearest.
 * A body already at biting range preempts all of it — the immediate threat is
 * shot first. Candidates need line of sight, so a cluster behind a wall never
 * wins over a hittable foe. Pure (state only), so determinism holds.
 */
export function bestAimTarget(state: GameState): Vec2 | undefined {
  const player = state.player;
  const equipped = player.equipment.weapon;
  const range = weaponRangeFor(state, equipped);
  // Candidates: live, targetable, in range, in sight — the foes a swing or a
  // shot could actually reach this tick.
  const foes: { enemy: Enemy; d: number }[] = [];
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    const d = distance(player.pos, enemy.pos);
    if (d > range) continue;
    if (!lineOfSight(state, player.pos, enemy.pos)) continue;
    foes.push({ enemy, d });
  }
  if (foes.length === 0) return undefined;
  foes.sort((a, b) => a.d - b.d);
  const nearest = foes[0]!;
  // A body about to bite is the target, full stop.
  if (nearest.d < AIM_PANIC_RANGE) {
    return { x: nearest.enemy.pos.x, y: nearest.enemy.pos.y };
  }
  const def = weaponDef(equipped.defId);
  const spec = def.projectile;
  // The weapon's damage FOOTPRINT around its aim: a melee sweep's cone, a
  // spread volley's fan, or a piercing round's narrow corridor. 0 = a plain
  // single-target shot.
  let half = 0;
  if (!spec) half = weaponSweepHalfAngle(state, equipped);
  else if ((spec.count ?? 1) > 1 || (spec.spreadDeg ?? 0) > 0) {
    half = Math.max((((spec.spreadDeg ?? 0) / 2) * Math.PI) / 180, 0.12);
  } else if (spec.pierce !== undefined || spec.chain !== undefined) {
    half = AIM_LINE_HALF_ANGLE;
  }
  if (half > 0) {
    // Aim at the foe whose bearing catches the most bodies in the footprint —
    // capped at what INT lets a melee sweep actually cleave, so a wall of
    // twelve doesn't out-score what the blade can really bill.
    const cap = spec ? Infinity : maxMeleeTargets(state);
    const cosHalf = Math.cos(half);
    let best = nearest;
    let bestCovered = 0;
    for (const c of foes) {
      const dx = c.enemy.pos.x - player.pos.x;
      const dy = c.enemy.pos.y - player.pos.y;
      const dm = Math.hypot(dx, dy);
      if (dm < 1) return { x: c.enemy.pos.x, y: c.enemy.pos.y }; // on top of him
      const ax = dx / dm;
      const ay = dy / dm;
      let covered = 0;
      for (const o of foes) {
        const ox = o.enemy.pos.x - player.pos.x;
        const oy = o.enemy.pos.y - player.pos.y;
        const om = Math.hypot(ox, oy) || 1;
        if ((ox / om) * ax + (oy / om) * ay >= cosHalf) covered++;
      }
      covered = Math.min(covered, cap);
      // More bodies wins; a tie goes to the nearer aim (connects sooner).
      if (covered > bestCovered || (covered === bestCovered && c.d < best.d)) {
        bestCovered = covered;
        best = c;
      }
    }
    // With no multi-body line anywhere, fall through to the finisher pick.
    if (bestCovered > 1) return { x: best.enemy.pos.x, y: best.enemy.pos.y };
  }
  // Single-target (or no cluster to catch): FINISH the most wounded foe in
  // range — every body dropped is one less set of teeth — tie-broken nearest.
  let pick = nearest;
  for (const c of foes) {
    if (
      c.enemy.hp < pick.enemy.hp ||
      (c.enemy.hp === pick.enemy.hp && c.d < pick.d)
    ) {
      pick = c;
    }
  }
  return { x: pick.enemy.pos.x, y: pick.enemy.pos.y };
}
