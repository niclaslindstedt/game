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
  weaponDamageFor,
  type Equipment,
  type GamePhase,
  type GameState,
  type GameStats,
} from "@game/core";

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
  /** The talent-picker queue (tree stats; see `pendingTalentPoints`) — the
   * first drives the talent picker, and its length is the points still owed. */
  talentPoints: string[];
  /** The hero's trained talents (id → rank) — the picker fills each talent's
   * rank pips from this. */
  talents: Record<string, number>;
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
  // The talent-picker queue + the hero's owned ranks — the picker reads both to
  // show the earning tree and its filled pips. Keyed so a spent point (rank up,
  // queue shrinks) re-renders the overlay.
  const talentPoints = [...state.pendingTalentPoints];
  const talents = { ...state.player.talents };
  const talentKey = `${talentPoints.join(",")}/${Object.entries(talents)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}:${v}`)
    .join(",")}`;
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
  // The hp/xp readouts are BARS, so the key carries them at bar resolution
  // (half-percent / per-mille of full) rather than raw: SPIRIT regen moves
  // the raw floats every single tick, and keying on them re-rendered the
  // whole HUD sixty times a second through any fight. Zero stays exact (an
  // empty bar must publish immediately). The STAMINA pool is deliberately
  // NOT in the key at all: its fill is written to the DOM every frame by the
  // render loop (staminaFillRef), so the sprint bar tracks the pool at 60fps
  // with zero React churn — and a maxStamina change always rides an event
  // the key already carries (level-up, outfit, weapon).
  const hpKey =
    state.player.hp <= 0
      ? 0
      : Math.ceil((200 * state.player.hp) / Math.max(1, state.player.maxHp));
  const xpKey = Math.floor(
    (1000 * state.player.xp) / Math.max(1, state.player.xpToNext),
  );
  const key = `${state.phase}/${state.cutscene?.defId ?? ""}/${hpKey}/${xpKey}/${state.player.level}/${state.player.pendingStatPoints}/${state.enemies.length}/${bagCount}/${bagFree}/${bagIcon}/${bagFullHint ? 1 : 0}/${held}/${active}/${medkitTier}:${medkitCount}/${staminaPotions}/${repairKits}/${weapon.defId}/${weaponWear?.toFixed(2) ?? ""}/${state.player.coins}/${appearance}/${outfit}/${stage}/${party}/${state.stats.kills}/${Math.floor(state.stats.combatMs / 1000)}/${talentKey}`;
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
      talentPoints,
      talents,
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
