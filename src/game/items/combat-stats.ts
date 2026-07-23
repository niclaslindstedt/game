// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero's combat chances and presentation: shield absorption, crit
// chance/multiplier, dodge, miss, enemy counterparts, walk speed, and the
// suited/plain-clothes sprite read.

import { ACCURACY, DODGE, PLAYER, REGEN, STATS } from "../config/index.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import {
  baseCritMult,
  gearDef,
  isWeaponDef,
  weaponDef,
} from "../defs/equipment.ts";
import { levelDef } from "../defs/levels/index.ts";
import { storyItemDef } from "../defs/story.ts";
import type { Equipment, GameState, WeaponClass } from "../types/index.ts";
import { CRIT_STAT } from "./class-stats.ts";
import {
  activePieces,
  effectiveStat,
  hasActiveAffix,
  heroLoadoutMemo,
  setBonusAffixes,
} from "./derived.ts";
import { heroBuffMult } from "./spellcasting.ts";

/**
 * Route an incoming (post-armor) blow through the hero's magical SHIELD and
 * arm the health-regen pause. Every player-damage site calls this instead of
 * subtracting hp directly: it resets `hpRegenMs` (so SPIRIT regen holds off
 * after a hit) and, when a ward is up, absorbs up to `shieldHp` of the blow —
 * returning the hp damage that GETS THROUGH. A lapsed/undamaged shield is a
 * clean passthrough. Reads `REGEN.hpDelayMs`.
 */
export function absorbPlayerDamage(state: GameState, hpDamage: number): number {
  const player = state.player;
  player.hpRegenMs = REGEN.hpDelayMs;
  if (player.shieldMs <= 0 || player.shieldHp <= 0) return hpDamage;
  const absorbed = Math.min(player.shieldHp, hpDamage);
  player.shieldHp -= absorbed;
  if (player.shieldHp <= 0) {
    player.shieldHp = 0;
    player.shieldMs = 0;
  }
  return hpDamage - absorbed;
}

/**
 * A weapon's crit-damage multiplier in this player's hands: the class FLOOR
 * (`baseCritMult` — ranged > melee > magic) deepened by DEXTERITY, the precision
 * slope (`STATS.critDamagePerDex`). A DEX-max ranged build crits hardest; a
 * moderate-DEX melee build a little over its floor; a DEX-less caster stays at
 * its floor. MAGIC is HARD-CAPPED at `STATS.magicCritCap` (melee's floor) so a
 * mage who stacks gear DEX can never out-crit a bruiser — crit weight is a
 * physical identity. The one source every crit surface reads (the blow in
 * step.ts, the DPS readouts, auto-equip scoring); the budget model prices off
 * the stat-independent floor.
 */
export function weaponCritMult(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const mult =
    baseCritMult(def) +
    effectiveStat(state, "dexterity") * STATS.critDamagePerDex;
  if (def.class === "magic") return Math.min(mult, STATS.magicCritCap);
  return mult;
}

/**
 * The player's crit chance for a swing of the given weapon class: the base
 * chance plus the class's CRIT stat (DEX for melee & ranged, INT for magic —
 * see `CRIT_STAT`), a MARGINAL LUCK nudge, and every gear/affix crit bonus.
 * `weaponClass` defaults to the equipped weapon's class, so the HUD readout
 * reflects what's in hand; combat passes the class of the blow that landed.
 */
/**
 * Bend an additive probability/reduction budget toward a sub-1.0 ceiling:
 * ~linear while small, asymptotic to `cap` (never reaching it), the top band
 * expensive — `cap × (1 − e^(−x/cap))`. Bounds crit and dodge so the raised,
 * level-scaled stat cap can't drive them to a degenerate 100%.
 */
export function saturateToward(x: number, cap: number): number {
  if (x <= 0) return 0;
  return cap * (1 - Math.exp(-x / cap));
}

export function playerCritChance(
  state: GameState,
  weaponClass: WeaponClass = weaponDef(state.player.equipment.weapon.defId)
    .class,
): number {
  let chance =
    STATS.baseCritChance +
    effectiveStat(state, CRIT_STAT[weaponClass]) * STATS.critChancePerStat +
    effectiveStat(state, "luck") * STATS.critChancePerLuck;
  // The gear/affix/set crit sum only moves with the loadout — memoized, since
  // this is rolled per weapon blow at horde scale.
  const memo = heroLoadoutMemo(state);
  let critBonus = memo.critBonus;
  if (critBonus === undefined) {
    critBonus = 0;
    for (const piece of activePieces(state)) {
      if (!isWeaponDef(piece.defId)) {
        critBonus += gearDef(piece.defId).bonuses.critChance ?? 0;
      }
      for (const affix of piece.affixes) {
        if (affix.kind === "crit") critBonus += affix.value;
      }
    }
    // SET BONUSES add their `crit` (several sets reward the full kit with it).
    for (const affix of setBonusAffixes(state)) {
      if (affix.kind === "crit") critBonus += affix.value;
    }
    memo.critBonus = critBonus;
  }
  chance += critBonus;
  // Saturate toward the ceiling — high crit-stat/affix builds approach but never
  // reach `critCap`, with the last points crawling (see `saturateToward`).
  return saturateToward(chance, STATS.critCap);
}

/**
 * The player's chance to sidestep an incoming blow entirely: the innate `base`
 * plus DEXTERITY's reflexes and a marginal LUCK nudge, scaled by the
 * difficulty's `playerDodgeMult` (the gentle rungs slip more hits, the hard
 * rungs fewer) and capped at `DODGE.max` so no build becomes untouchable.
 * Rolled in the contact-damage path (step.ts) and surfaced on the stat panel.
 */
export function playerDodgeChance(state: GameState): number {
  // Saturate toward `DODGE.max` (well below 1.0) rather than hard-clamp, so DEX
  // past the old clamp point keeps buying a little dodge with a steep, expensive
  // top — no build becomes untouchable even at the raised stat cap.
  const linear =
    (DODGE.base +
      effectiveStat(state, "dexterity") * DODGE.perDex +
      effectiveStat(state, "luck") * DODGE.perLuck) *
    difficultyDef(state.difficulty).playerDodgeMult;
  return saturateToward(linear, DODGE.max);
}

/**
 * The player's MISS chance for a weapon blow: an innate `ACCURACY.baseMiss`
 * whiff trimmed by DEXTERITY's aim (`perDex`), scaled by the difficulty's
 * `playerMissMult` (the hard rungs whiff more), floored at `minMiss`. This is
 * the hero's own accuracy — independent of the target — and is surfaced on the
 * stat panel (as HIT rate) and rolled in `hitEnemy` for weapon attacks.
 */
export function playerMissChance(state: GameState): number {
  // SURE STRIKE (a legendary affix): the weapon simply never whiffs on its
  // own — the innate miss reads zero, floor and difficulty notwithstanding.
  // The foe's DODGE is still its own move (see `enemyDodgeChance`).
  if (hasActiveAffix(state, "sureStrike")) {
    return 0;
  }
  return Math.max(
    ACCURACY.minMiss,
    (ACCURACY.baseMiss - effectiveStat(state, "dexterity") * ACCURACY.perDex) *
      difficultyDef(state.difficulty).playerMissMult,
  );
}

/**
 * An enemy's chance to DODGE the player's weapon blow: its `base` evasion (the
 * def's `dodgeChance`, or the `ACCURACY.enemyDodge` default) trimmed by the
 * player's DEXTERITY hit rate (`perDex`), scaled by the difficulty's
 * `enemyDodgeMult` (slipperier monsters up the ladder), floored at 0. Rolled
 * in `hitEnemy` after the miss check, so a build that pumps DEX both whiffs
 * and gets dodged less. Mirror of `enemyCritChance`'s LUCK-avoidance shape.
 */
export function enemyDodgeChance(state: GameState, base: number): number {
  return Math.max(
    0,
    (base - effectiveStat(state, "dexterity") * ACCURACY.perDex) *
      difficultyDef(state.difficulty).enemyDodgeMult,
  );
}

/**
 * Whether the hero is drawn as the astronaut. The EVA suit is STORY gear,
 * not equipment — it is worn OVER his clothes and armor, carries no slot and
 * no stats, and latches the moment its story item is picked up (a
 * `StoryItemDef.suitsHero` entry — SpaceZ HQ's recovered space suit). On
 * every level but SpaceZ HQ he starts suited (the story picks up
 * mid-mission). The renderer reads this to choose the plain-clothes or
 * astronaut sprite set.
 */
export function playerSuited(state: GameState): boolean {
  for (const defId of state.storyItems) {
    if (storyItemDef(defId).suitsHero) return true;
  }
  return levelDef(state.level.id).heroSuited ?? true;
}

/**
 * The sprite family the player wears right now — the renderer draws
 * `<appearance>_0` / `_1` / `_jump` from it, so a costume change is data:
 * a sequel returns different family keys here (and ships their sprites) with
 * no renderer edit. This game toggles between plain clothes and the EVA suit.
 */
export function playerAppearance(state: GameState): string {
  return playerSuited(state) ? "player" : "hero";
}

/**
 * The player's walk speed in world px/s: the base quickened by SPEED points and
 * dragged back by STRENGTH — a heavily-muscled hero hauls that bulk around, so
 * STR shaves a little off the walk (`strengthSlowPerPoint`, floored at
 * `strengthSlowFloor`). The two stats pull against each other, so a glass-cannon
 * bruiser gives up some mobility for its firepower rather than getting both.
 */
export function playerSpeed(state: GameState): number {
  const quickness = 1 + effectiveStat(state, "speed") * STATS.speedPerPoint;
  const burden = Math.max(
    STATS.strengthSlowFloor,
    1 - effectiveStat(state, "strength") * STATS.strengthSlowPerPoint,
  );
  // A running move-speed buff (a charge/sprint art) quickens the walk (1 idle).
  return PLAYER.speed * quickness * burden * heroBuffMult(state, "speed");
}

/** Enemy crit chance against the player, after LUCK's avoidance. */
export function enemyCritChance(state: GameState, base: number): number {
  return Math.max(
    0,
    base - effectiveStat(state, "luck") * STATS.critAvoidPerLuck,
  );
}
