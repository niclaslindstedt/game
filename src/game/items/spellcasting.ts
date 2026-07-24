// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cast system's hero-side reads: SPIRIT regen rates, the dominant-stat
// spell class, availability/unlock queries, the self-buff multiplier, and the
// HUD spell-bar slot mutators.

import { REGEN } from "../config/index.ts";
import {
  dominantSpellStat,
  spellDefs,
  unlockedSpellIdsForStat,
  SPELL_SLOTS,
  SPELL_STAT_CLASS,
  type SpellClass,
  type SpellDef,
} from "../defs/spells.ts";
import type { GameState, StatName } from "../types/index.ts";
import { effectiveStat } from "./derived.ts";

/** Mana regenerated per second at the hero's effective SPIRIT once the
 * post-cast idle window (`REGEN.manaDelayMs`) has lapsed (config REGEN). */
export function manaRegenPerSec(state: GameState): number {
  return (
    REGEN.manaBasePerSec + effectiveStat(state, "spirit") * REGEN.manaPerSpirit
  );
}

/** Health regenerated per second at the hero's effective SPIRIT once the
 * post-hit pause (`REGEN.hpDelayMs`) has lapsed — 0 at 0 SPIRIT (config REGEN). */
export function hpRegenPerSec(state: GameState): number {
  return effectiveStat(state, "spirit") * REGEN.hpPerSpirit;
}

/**
 * The hero's spell-class STAT — the dominant of STRENGTH / DEXTERITY /
 * INTELLIGENCE, or null when none reaches the first unlock step (a balanced or
 * un-invested build has no class, hence no spell bar). This is the one gate the
 * whole cast system reads: your class picks your spell list.
 */
export function heroSpellStat(state: GameState): StatName | null {
  return dominantSpellStat(
    effectiveStat(state, "strength"),
    effectiveStat(state, "dexterity"),
    effectiveStat(state, "intelligence"),
  );
}

/** The hero's spell CLASS (melee/ranged/magic), or null when they have none. */
export function heroSpellClass(state: GameState): SpellClass | null {
  const stat = heroSpellStat(state);
  return stat ? (SPELL_STAT_CLASS[stat] ?? null) : null;
}

/**
 * True when `def` is available to the hero right now: it belongs to the hero's
 * class (its `stat` is the dominant one) AND the hero's effective governing
 * stat has reached its `minStat`. The single availability gate the picker, the
 * cast path (`castSpell`), and the bot all read.
 */
export function isSpellAvailable(state: GameState, def: SpellDef): boolean {
  const stat = heroSpellStat(state);
  return stat === def.stat && effectiveStat(state, def.stat) >= def.minStat;
}

/**
 * Every spell the hero has unlocked — their class's list up to their governing
 * stat, ascending by `minStat`. Empty when the hero has no class. The pool the
 * spell-bar picker offers, and the predicate the HUD reads to decide whether to
 * show the bar at all (no spells → no bar).
 */
export function unlockedSpellIds(state: GameState): string[] {
  const stat = heroSpellStat(state);
  if (!stat) return [];
  return unlockedSpellIdsForStat(stat, effectiveStat(state, stat));
}

/**
 * The active self-buff multiplier for one combat field (1 when no buff runs) —
 * read at the three sites a martial `buff` power touches: `weaponDamageFor`
 * (damage), `weaponCooldownFor` (haste), and `playerSpeed` (move speed).
 */
export function heroBuffMult(
  state: GameState,
  field: "damage" | "haste" | "speed",
): number {
  const p = state.player;
  if (p.buffMs <= 0) return 1;
  if (field === "damage") return p.buffDamageMult;
  if (field === "haste") return p.buffHasteMult;
  return p.buffSpeedMult;
}

/**
 * Assign a spell to a HUD spell-bar slot (or clear it with `null`) — the
 * long-press picker's commit. Refuses an out-of-range slot, an unknown spell,
 * or one not available to the hero's class (the picker only offers available
 * spells, but the mutator re-checks). Assigning a spell already in another slot
 * MOVES it (no duplicate slot). Returns whether the bar changed.
 */
export function setSpellSlot(
  state: GameState,
  slotIndex: number,
  spellId: string | null,
): boolean {
  if (slotIndex < 0 || slotIndex >= SPELL_SLOTS) return false;
  const slots = state.player.spellSlots;
  if (spellId === null) {
    if (slots[slotIndex] === null) return false;
    slots[slotIndex] = null;
    return true;
  }
  const def = spellDefs()[spellId];
  if (!def) return false;
  if (!isSpellAvailable(state, def)) return false;
  // Moving a spell already slotted elsewhere clears its old slot first.
  for (let i = 0; i < slots.length; i++) {
    if (i !== slotIndex && slots[i] === spellId) slots[i] = null;
  }
  slots[slotIndex] = spellId;
  return true;
}

/**
 * Auto-fill any EMPTY spell-bar slots with the hero's newest unlocked spells
 * not already on the bar — called by the app when a fresh hero (or a loaded
 * loadout with a short bar) has open slots, so the bar is never blank when
 * spells are available. Fills highest-`minStat` first (the newest, strongest).
 * Returns whether anything was placed.
 */
export function autofillSpellSlots(state: GameState): boolean {
  const slots = state.player.spellSlots;
  const onBar = new Set(slots.filter((s): s is string => s !== null));
  // unlockedSpellIds is ascending by minStat; reverse so the strongest lands
  // first. Already class-filtered, so a warrior never auto-slots a magic spell.
  const available = unlockedSpellIds(state)
    .filter((id) => !onBar.has(id))
    .reverse();
  let placed = false;
  let cursor = 0;
  for (let i = 0; i < slots.length && cursor < available.length; i++) {
    if (slots[i] === null) {
      slots[i] = available[cursor++] ?? null;
      placed = true;
    }
  }
  return placed;
}

/**
 * Lift the `levelup` pause and drop back into play — but only once BOTH the
 * banked stat points are all spent AND the "SPELL UNLOCKED" queue is empty. A
 * ding that crosses a ×10 class milestone queues a power (`allocateStat`); the
 * run must stay frozen behind that reveal modal, or the hero would fight on
 * unattended while the player reads it. Called both when the last point lands
 * (`allocateStat`) and when the last unlock is dismissed (`takeSpellUnlock`),
 * so whichever finishes last is the one that resumes. A no-op outside `levelup`
 * (a respec never auto-closes; play stays play).
 */
export function resumeAfterLevelup(state: GameState): void {
  if (
    state.phase === "levelup" &&
    state.player.pendingStatPoints === 0 &&
    state.pendingSpellUnlocks.length === 0
  ) {
    state.phase = "playing";
  }
}

/**
 * Drain the next queued spell unlock (see `GameState.pendingSpellUnlocks`,
 * filled by `allocateStat` when a class stat crosses a ×10 milestone) — returns
 * its SPELL_DEFS id and removes it from the queue, or null when the queue is
 * empty. The app calls this as the unlock modal is dismissed, one at a time.
 * Draining the LAST unlock lifts the level-up pause `allocateStat` held open
 * behind the modal (see `resumeAfterLevelup`), so the run resumes only once the
 * reward has been read — not the instant the last point landed.
 */
export function takeSpellUnlock(state: GameState): string | null {
  const id = state.pendingSpellUnlocks.shift() ?? null;
  resumeAfterLevelup(state);
  return id;
}
