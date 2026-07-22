// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD snapshot: the slow-moving view of the live engine state that the
// React HUD renders from. The render loop rebuilds it every frame but only
// publishes it to React when the change-key differs (see buildHud), so the
// DOM UI re-renders on real changes, not sixty times a second.

import {
  bestMedkitTier,
  companionDef,
  equipmentIcon,
  equipmentMaxDurability,
  isWeaponBroken,
  isWeaponDef,
  menaceStage,
  playerAppearance,
  spellDef,
  SPELL_GLOBAL_COOLDOWN_MS,
  unlockedSpellIds,
  weaponDamageFor,
  type Equipment,
  type GamePhase,
  type GameState,
  type GameStats,
} from "@game/core";

import type { SpellSlotView } from "../SpellBar.tsx";

export type Hud = {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  /** Current sprint pool and its max. */
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  xpToNext: number;
  enemiesLeft: number;
  /** Current menace/rampage stage (uncapped) driving the gauge. */
  menaceStage: number;
  /** Free (empty) bag cells — shown on the minimap-corner bag badge, red at 0. */
  bagFree: number;
  /** Icon sprite of the worn bag (or the default carry-all when none is worn) —
   * drawn on the minimap-corner bag badge so the pouch matches the equipped bag. */
  bagIcon: string;
  /** True for a short window after the full bag turned away loot — pulses the
   * minimap bag badge to nudge the player to open it and make room. */
  bagFullHint: boolean;
  /** The powerup dock, oldest first (ABILITY_DEFS ids) — banked and running. */
  heldAbilities: string[];
  /**
   * Which dock slots (indices into `heldAbilities`) hold a powerup that is
   * running right now: those slots show the countdown radial in place and take
   * no taps until they lapse, while the rest stay banked and spendable. The
   * per-frame countdown/radial for each is written to the DOM directly by the
   * render loop (keyed on the slot), not through here.
   */
  activeSlots: number[];
  /** The best-quality medkit the hero holds (MEDKIT tier index), or -1 when
   * none — the consumable dock's medkit slot shows this grade + its count. */
  medkitTier: number;
  /** How many medkits of `medkitTier` are stacked (0 when none held). */
  medkitCount: number;
  /** Stacked stamina potions held — the consumable dock's stamina slot count. */
  staminaPotions: number;
  /** Stacked weapon repair kits held — the consumable dock's repair slot count. */
  repairKits: number;
  /** Stacked blue-gatorade mana potions held — the mana slot count. */
  manaPotions: number;
  /** Current mana (ceil) and max — the mana bar + the spell-bar affordability. */
  mana: number;
  maxMana: number;
  /** True once the hero has UNLOCKED at least one power of their class (a
   * dominant STR/DEX/INT that reached the first ×10 step) — the mana bar and
   * spell bar only show once there is a real power to put on the bar. */
  isCaster: boolean;
  /** The spell-bar slots (per HUD slot): assigned spell id, recharge fraction
   * (0 = ready), and whether the pool affords it. */
  spells: SpellSlotView[];
  /** Every spell the hero has unlocked (ascending) — the picker's menu. */
  unlockedSpells: string[];
  /** SPELL_DEFS ids queued for the "SPELL UNLOCKED" modal (see
   * `pendingSpellUnlocks`); the first drives the overlay. */
  spellUnlocks: string[];
  /** Equipped weapon def id — drives the always-on weapon widget. */
  weaponDefId: string;
  /** Equipped weapon's durability 0..1, or null for the unbreakable sidearm. */
  weaponWear: number | null;
  /** The purse — coins earned selling loot to the merchant. */
  coins: number;
  /** Player sprite family (`playerAppearance`) for the inventory avatar. */
  appearance: string;
  /**
   * The recruited party, join order — one clickable portrait per companion
   * below the hero's avatar (tapping one opens its equip screen). `hpFrac`
   * drives the sliver bar; a DOWNED companion's portrait grays out.
   */
  companions: {
    id: number;
    defId: string;
    sprite: string;
    hpFrac: number;
    downed: boolean;
  }[];
  stats: GameStats;
};

/** Other carried weapons, best first — the switch targets shared by the Q
 * weapon menu and the 1-4 hotkeys. Ordered by ilvl (highest first) so "1"
 * grabs the top-item-level weapon; ties break on stat-scaled damage
 * (weaponDamageFor) so equal-ilvl slots fall in dps order and follow the
 * build. */
export function weaponAlternatives(
  state: GameState,
): { item: Equipment; index: number; dmg: number }[] {
  return state.player.inventory
    .map((item, index) => ({ item, index }))
    .filter(
      (e) =>
        e.item !== null &&
        isWeaponDef(e.item.defId) &&
        // A broken weapon (durability 0) can't be switched to until it's
        // repaired — the engine refuses the equip, so hide it from the switcher.
        !isWeaponBroken(e.item),
    )
    .map((e) => ({
      item: e.item as Equipment,
      index: e.index,
      dmg: Math.round(weaponDamageFor(state, e.item as Equipment)),
    }))
    .sort((a, b) => b.item.ilvl - a.item.ilvl || b.dmg - a.dmg);
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Build the HUD snapshot plus its change-key from the live engine state.
 * The key folds in every slow-moving value the HUD shows; the caller
 * publishes the snapshot to React only when the key differs from the last
 * frame's, so the ticking sim never thrashes React state.
 */
export function buildHud(
  state: GameState,
  bagFullHint: boolean,
): { key: string; hud: Hud } {
  const bagCount = state.player.inventory.filter(Boolean).length;
  // Empty cells: the capacity (which grows with STRENGTH / a worn bag)
  // minus what's carried — shown on the avatar badge, red at 0.
  const bagFree = state.player.inventory.length - bagCount;
  // The worn bag's own icon (the default carry-all when none is worn) —
  // drawn on the minimap-corner bag badge so the pouch matches the gear.
  const wornBag = state.player.equipment.bag;
  const bagIcon =
    wornBag && !isWeaponDef(wornBag.defId)
      ? equipmentIcon(wornBag.defId)
      : "icon_bag";
  const held = state.player.heldAbilities.join(",");
  // Only *which* slots are banked vs running mounts/unmounts dock chrome;
  // the ticking timer itself is animated straight on the DOM, so it stays
  // out of the change-key (which would otherwise thrash React state every
  // frame).
  const active = state.player.abilities
    .map((a) => a.slot)
    .filter((s) => s !== undefined)
    .sort((a, b) => a - b)
    .join(",");
  // The consumable dock: the best-quality medkit held (and its stack
  // depth), the stamina-potion count, and the repair-kit count. All feed
  // the change-key so the slots re-render as kits are grabbed and spent.
  const medkitTier = bestMedkitTier(state);
  const medkitCount =
    medkitTier >= 0 ? (state.player.medkits[medkitTier] ?? 0) : 0;
  const staminaPotions = state.player.staminaPotions;
  const repairKits = state.player.repairKits;
  // The mana pool + spell bar. Mana is coarsened into the change-key so
  // the bar re-renders a few times a second (not every frame); the
  // cooldown wipe reads at tenths — smooth enough for a 2–8s recharge.
  // The hero's class list (empty when they have no class) — the bar and
  // mana pool only show once there is a real power to slot.
  const unlockedSpells = unlockedSpellIds(state);
  const isCaster = unlockedSpells.length > 0;
  // The shared global cooldown sweeps EVERY slot (a queued spell waits
  // behind it), so the whole bar reads as recharging between casts —
  // shown as whichever runs longer, the spell's own cooldown or the GCD.
  const gcdFrac = Math.max(
    0,
    Math.min(1, state.player.globalCooldownMs / SPELL_GLOBAL_COOLDOWN_MS),
  );
  const spellViews: SpellSlotView[] = state.player.spellSlots.map((id) => {
    if (!id) return { id: null, cooldownFrac: 0, affordable: false };
    const sdef = spellDef(id);
    const cd = state.player.spellCooldowns[id] ?? 0;
    return {
      id,
      cooldownFrac: Math.max(
        gcdFrac,
        Math.min(1, cd / Math.max(1, sdef.cooldownMs)),
      ),
      affordable: state.player.mana >= sdef.manaCost,
    };
  });
  const spellUnlocks = [...state.pendingSpellUnlocks];
  const manaPotions = state.player.manaPotions;
  const spellKey = `${Math.ceil(state.player.mana)}/${state.player.maxMana}/${manaPotions}/${state.player.spellSlots.join(",")}/${spellViews.map((v) => Math.round(v.cooldownFrac * 10)).join("")}/${unlockedSpells.join(",")}/${spellUnlocks.join(",")}`;
  const weapon = state.player.equipment.weapon;
  const weaponWear =
    weapon.durability === undefined
      ? null
      : weapon.durability / equipmentMaxDurability(weapon);
  const appearance = playerAppearance(state);
  // The worn armor pieces, so the avatar portrait re-renders when the
  // outfit changes (the weapon is already keyed via `weapon.defId`).
  const { head, chest, legs, feet } = state.player.equipment;
  const outfit = [head, chest, legs, feet]
    .map((piece) => piece?.defId ?? "")
    .join(",");
  const stage = menaceStage(state);
  // The party portraits re-render on membership, coarse health (tenths
  // — the sliver bar's resolution), and the downed flag.
  const party = state.companions
    .map(
      (c) =>
        `${c.id}:${Math.ceil((10 * c.hp) / Math.max(1, c.maxHp))}:${c.downedMs !== undefined ? 1 : 0}`,
    )
    .join(",");
  // The prelude scene's id is part of the key: a chained prelude swaps
  // `state.cutscene` for the next scene with nothing else changing, and
  // the overlay only receives the fresh scene if this re-renders.
  const key = `${state.phase}/${state.cutscene?.defId ?? ""}/${state.player.hp}/${Math.ceil(state.player.stamina)}/${state.player.xp}/${state.player.level}/${state.player.pendingStatPoints}/${state.enemies.length}/${bagCount}/${bagFree}/${bagIcon}/${bagFullHint ? 1 : 0}/${held}/${active}/${medkitTier}:${medkitCount}/${staminaPotions}/${repairKits}/${weapon.defId}/${weaponWear?.toFixed(2) ?? ""}/${state.player.coins}/${appearance}/${outfit}/${stage}/${party}/${state.stats.kills}/${Math.floor(state.stats.combatMs / 1000)}/${spellKey}`;
  return {
    key,
    hud: {
      phase: state.phase,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      stamina: state.player.stamina,
      maxStamina: state.player.maxStamina,
      level: state.player.level,
      xp: state.player.xp,
      xpToNext: state.player.xpToNext,
      enemiesLeft: state.enemies.length,
      menaceStage: stage,
      bagFree,
      bagIcon,
      bagFullHint,
      heldAbilities: [...state.player.heldAbilities],
      activeSlots: state.player.abilities
        .map((a) => a.slot)
        .filter((s): s is number => s !== undefined),
      medkitTier,
      medkitCount,
      staminaPotions,
      repairKits,
      manaPotions,
      mana: Math.round(state.player.mana),
      maxMana: state.player.maxMana,
      isCaster,
      spells: spellViews,
      unlockedSpells,
      spellUnlocks,
      weaponDefId: weapon.defId,
      weaponWear,
      coins: state.player.coins,
      appearance,
      companions: state.companions.map((c) => ({
        id: c.id,
        defId: c.defId,
        sprite: companionDef(c.defId).sprite,
        hpFrac: c.maxHp > 0 ? c.hp / c.maxHp : 0,
        downed: c.downedMs !== undefined,
      })),
      stats: { ...state.stats },
    },
  };
}
