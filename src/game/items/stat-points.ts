// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level-up stat allocation and the LEVEL TOKEN respec: spending pending
// points (with spell-unlock milestones), refunding the whole build, and
// committing it back into play.

import { STAT_NAMES } from "../defs/equipment.ts";
import { SPELL_STATS, spellsUnlockedBetweenForStat } from "../defs/spells.ts";
import { statCap } from "../leveling.ts";
import type { GameState, StatName } from "../types/index.ts";
import {
  effectiveStat,
  recomputeMaxHp,
  recomputeMaxMana,
  recomputeMaxStamina,
} from "./derived.ts";
import { syncInventoryCapacity } from "./inventory.ts";
import { heroSpellStat } from "./spellcasting.ts";

// ---- Level-ups -------------------------------------------------------------------

/**
 * Spend one pending stat point. When the last point is spent the `levelup`
 * pause lifts and play resumes.
 */
export function allocateStat(state: GameState, stat: StatName): boolean {
  const player = state.player;
  if (player.pendingStatPoints <= 0) return false;
  // The level-scaled cap: chosen points can't be placed past `statCap` (they'd
  // realize nothing — that region is the diminished GEAR tail). Below ~L66 the
  // cap sits above any achievable chosen pile, so this only bites at the 250
  // hard ceiling; the UI greys a maxed stat.
  if (player.stats[stat] >= statCap(player.level)) return false;
  // SPELL UNLOCKS ride a CLASS STAT (STR/DEX/INT) crossing a ×10 milestone —
  // read it before the point lands so we can enqueue any power the jump unlocks
  // (skipped during a respec, where the player already knows their spellbook).
  const isClassStat = (SPELL_STATS as readonly StatName[]).includes(stat);
  const classStatBefore =
    isClassStat && state.phase !== "respec" ? effectiveStat(state, stat) : 0;
  player.stats[stat]++;
  // Tally the player's own pick so the chooser can show it apart from the
  // head-start/auto-growth/gear baked into the effective stat.
  player.spentStats[stat]++;
  player.pendingStatPoints--;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  // INTELLIGENCE always sizes the mana pool (every class's fuel) — resize it as
  // the point lands, regardless of which class the hero is.
  if (stat === "intelligence") recomputeMaxMana(state);
  // Surface any power the higher stat just unlocked — but only when this stat is
  // (now) the hero's dominant CLASS, so a warrior never gets a "spell unlocked"
  // pop for magic, and points into an off-class stat stay silent.
  if (
    isClassStat &&
    state.phase !== "respec" &&
    heroSpellStat(state) === stat
  ) {
    const unlocked = spellsUnlockedBetweenForStat(
      stat,
      classStatBefore,
      effectiveStat(state, stat),
    );
    for (const id of unlocked) {
      if (!state.pendingSpellUnlocks.includes(id)) {
        state.pendingSpellUnlocks.push(id);
      }
    }
  }
  // STRENGTH also widens the carry bag — grow it as the point lands.
  if (stat === "strength") syncInventoryCapacity(state);
  // A level-up resumes the moment its last point lands; a respec never
  // auto-closes — the chooser stays open (points can be moved back and forth)
  // until the player confirms the build (`confirmRespec`).
  if (player.pendingStatPoints === 0 && state.phase === "levelup") {
    state.phase = "playing";
  }
  return true;
}

// ---- Respec (LEVEL TOKEN reallocation) ----------------------------------------

/**
 * Open the from-scratch respec the way a spent LEVEL TOKEN owes it (see
 * progress.ts): refund every banked stat point back into a single pool and
 * zero the six stats, then freeze the run in the `respec` phase so the player
 * re-places the whole build. Idempotent guard aside, this is the one-shot the
 * pending flag arms — clear it so a later `dismissIntro` can't re-open the
 * chooser. The refunded total is the hero's carried-in level (plus any
 * difficulty head-start already folded into his stats).
 */
export function beginRespec(state: GameState): void {
  const player = state.player;
  state.respecPending = false;
  let pool = player.pendingStatPoints;
  for (const stat of STAT_NAMES) {
    pool += player.stats[stat];
    player.stats[stat] = 0;
    // The whole refunded pool (head-start included) is re-placed from
    // scratch, so the player's spent tally restarts at zero and grows back as
    // they re-allocate — the chooser tracks this respec's own picks.
    player.spentStats[stat] = 0;
  }
  player.pendingStatPoints = pool;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  recomputeMaxMana(state);
  syncInventoryCapacity(state);
  // Refunding STRENGTH shrinks the bag; keep current hp/stamina/mana inside the
  // freshly-zeroed pools so the readouts never show an over-full bar.
  player.hp = Math.min(player.hp, player.maxHp);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  player.mana = Math.min(player.mana, player.maxMana);
  state.phase = "respec";
}

/**
 * Put one point back into the pool during a respec: the inverse of
 * `allocateStat`, floored at zero and live only while the `respec` chooser is
 * open. Returns false when the stat is already at zero (nothing to refund) or
 * the run is not respeccing.
 */
export function deallocateStat(state: GameState, stat: StatName): boolean {
  if (state.phase !== "respec") return false;
  const player = state.player;
  if (player.stats[stat] <= 0) return false;
  player.stats[stat]--;
  player.spentStats[stat] = Math.max(0, player.spentStats[stat] - 1);
  player.pendingStatPoints++;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  if (stat === "intelligence") recomputeMaxMana(state);
  if (stat === "strength") syncInventoryCapacity(state);
  player.hp = Math.min(player.hp, player.maxHp);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  player.mana = Math.min(player.mana, player.maxMana);
  return true;
}

/**
 * Commit the respec and drop into play — only once every refunded point has
 * been re-spent, so the build is never left with points on the table. The run
 * arrives rested, exactly like a fresh drop: full health and a full sprint
 * pool over the newly-chosen stats. False (nothing happens) while points
 * remain or the run is not respeccing.
 */
export function confirmRespec(state: GameState): boolean {
  const player = state.player;
  if (state.phase !== "respec" || player.pendingStatPoints > 0) return false;
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
  player.mana = player.maxMana;
  state.phase = "playing";
  return true;
}
