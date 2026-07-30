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
  hasQuest,
  isWeaponBroken,
  isWeaponDef,
  menaceStage,
  playerAppearance,
  weaponDamageFor,
  weaponDps,
  type Equipment,
  type GamePhase,
  type GameState,
  type GameStats,
} from "@game/core";

import { getSettings, type WeaponSwitchOrder } from "../settings.ts";

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
  /**
   * THE QUEST BUTTON's state — the `!` sitting beside the bag pouch.
   *
   * `hidden` is a map that hands out no errands at all (no givers stand on it),
   * where the log could only ever open empty. Otherwise it is `alert` (gold)
   * once this run has taken an errand — the log has something in it worth
   * reading — and `quiet` (grey) until then. A giver's UNTAKEN offer
   * deliberately does NOT light it: two of them stand on every map from the
   * first frame, so counting those would leave the button permanently gold and
   * say nothing. The offer is already announced where it belongs — the gold `!`
   * over that person's own head (`giverMark`).
   */
  questLog: "hidden" | "quiet" | "alert";
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

/**
 * The other carried weapons — the switch targets shared by the quick-draw
 * switcher, the 1-4 hotkeys, and the demo's played swap, so all three always
 * agree on which weapon sits in which slot.
 *
 * The ORDER is the player's call (SETTINGS → CONTROLS → QUICK DRAW,
 * `WeaponSwitchOrder`), because the two useful answers pull opposite ways:
 *
 *   • `bag` (the default) — the BACKPACK's own order, cell by cell. A weapon
 *     sits at the same place on both screens, so a player who arranges their
 *     bag can find a weapon in the switcher without reading it.
 *   • `dps` — best first for THIS hero (`weaponDps`: stat-scaled damage,
 *     cadence and crit for the weapon's class, the same figure the item card
 *     leads with), ties broken on item level. Slot 1 is then always the
 *     hardest hitter he owns, whatever the bag looks like.
 *
 * `dmg` is the number each slot shows, and it follows the ranking: per-hit
 * damage in bag order (nothing is being ranked, so the honest read is what one
 * blow lands), the dps figure in dps order — a list must never sort on a
 * number it doesn't show.
 */
export function weaponAlternatives(
  state: GameState,
  order: WeaponSwitchOrder = getSettings().weaponSwitchOrder,
): { item: Equipment; index: number; dmg: number }[] {
  const byDps = order === "dps";
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
    .map((e) => {
      const item = e.item as Equipment;
      return {
        item,
        index: e.index,
        dmg: Math.round(
          byDps ? weaponDps(state, item) : weaponDamageFor(state, item),
        ),
      };
    })
    .sort((a, b) =>
      byDps ? b.dmg - a.dmg || b.item.ilvl - a.item.ilvl : a.index - b.index,
    );
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
  // The worn bag's own icon (the default carry-all when none is worn, or when
  // the second arm is holding a SHIELD) — drawn on the minimap-corner bag badge
  // so the pouch matches the gear.
  const offhand = state.player.equipment.offhand;
  const wornBag = offhand?.slot === "bag" ? offhand : null;
  const bagIcon =
    wornBag && !isWeaponDef(wornBag.defId)
      ? equipmentIcon(wornBag.defId)
      : "icon_bag";
  // THE ERRANDS, in one walk of the log. Two things come out of it:
  //
  //   • the quest BUTTON's state (see `Hud.questLog`), and
  //   • the change-key signature every errand's status and tally folds into,
  //     which is what makes the ON-SCREEN TRACKER (QuestTracker.tsx) live. The
  //     tracker reads `state` directly, so it only repaints when this snapshot
  //     publishes — and without the tally in the key, a delivered escort or a
  //     fetch piece walked over moved nothing the key was watching and the
  //     strip sat on a stale count until some unrelated kill shook it loose.
  //
  // Walked by hand rather than through `trackedQuests` because that builds and
  // sorts a fresh array and this runs sixty times a second. `hasQuest` guards
  // the case a mod was switched off between the offer and now, exactly as the
  // log itself does.
  let questTaken = false;
  let questKey = "";
  for (const id in state.quests) {
    const progress = state.quests[id];
    if (!progress || !hasQuest(id)) continue;
    questKey += `${id}:${progress.status}:${progress.counts.join(".")},`;
    if (progress.status !== "offered" && progress.status !== "declined")
      questTaken = true;
  }
  const questLog: Hud["questLog"] =
    state.questGivers.length === 0 ? "hidden" : questTaken ? "alert" : "quiet";
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
  // (half-percent / per-mille of full) rather than raw: a raw float moves on
  // every trickle of damage or XP, and keying on them re-rendered the whole
  // HUD sixty times a second through any fight. Zero stays exact (an
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
  const key = `${state.phase}/${state.cutscene?.defId ?? ""}/${hpKey}/${xpKey}/${state.player.level}/${state.player.pendingStatPoints}/${state.enemies.length}/${bagCount}/${bagFree}/${bagIcon}/${bagFullHint ? 1 : 0}/${questLog}/${questKey}/${held}/${active}/${medkitTier}:${medkitCount}/${staminaPotions}/${repairKits}/${weapon.defId}/${weaponWear?.toFixed(2) ?? ""}/${state.player.coins}/${appearance}/${outfit}/${stage}/${party}/${state.stats.kills}/${Math.floor(state.stats.combatMs / 1000)}/${talentKey}`;
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
      questLog,
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
