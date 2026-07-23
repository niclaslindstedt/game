// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ground-item pickups: medkits, golden arrows, stacked consumables, story
// items, ability pickups, and equipment (auto-equip or bag). Part of the step
// pipeline (see ./index.ts).

import { distanceSq } from "@game/lib/vec.ts";
import { canBankAbility } from "../abilities.ts";
import { JUMP, LOOT, MEDKIT, PLAYER } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { levelDef } from "../defs/levels/index.ts";
import {
  addToInventory,
  bankConsumable,
  bankMedkit,
  consumableName,
  equipmentName,
  isAutoEquipEnabled,
  isBetterEquipment,
  medkitTierIndex,
  recomputeMaxHp,
  recomputeMaxStamina,
  syncInventoryCapacity,
  wouldUpgradeSlot,
} from "../items/index.ts";
import { arrowColdXp, arrowXpShareAt } from "../leveling.ts";
import { grantXp } from "../loot.ts";
import { collectStoryItem } from "../story.ts";
import type { GameState, Item } from "../types.ts";

export function stepItems(state: GameState, dtMs: number): void {
  const player = state.player;
  // Pieces displaced by an auto-equip with a full bag fall back to the
  // ground — collected here so the filter pass isn't mutated mid-flight.
  const displaced: Item[] = [];
  const pickupReach = MEDKIT.radius + PLAYER.radius;
  const pickupReachSq = pickupReach * pickupReach;
  // Floating above the ground: the hero can't scoop loot mid-jump — a drop is
  // grabbed only once he's back down (the same z rule that stays his blade and
  // lets him clear the well pull). The magnet may still reel drops toward him
  // while airborne, but they wait on the ground until he lands to be taken.
  const airborne = player.z > JUMP.dodgeHeight;
  state.items = state.items.filter((item) => {
    // A mercy drop still riding its angel down is airborne: count off the
    // delivery, and until it lands it can't be picked up (the magnet leaves it
    // alone too — see stepAbilities). The renderer draws the descent off the
    // same timer; here it only gates the grab.
    if (item.deliverMs !== undefined && item.deliverMs > 0) {
      item.deliverMs = Math.max(0, item.deliverMs - dtMs);
      return true;
    }
    // Mid-jump the hero floats past the drop without taking it — hold it on
    // the ground until he lands (airborne short-circuits the reach test).
    const overlapping =
      !airborne && distanceSq(item.pos, player.pos) <= pickupReachSq;
    if (!overlapping) return true;

    if (item.kind === "medkit") {
      // D2-style tiered kits stack into the consumable dock, one stack per
      // quality (config MEDKIT.tiers); the hero spends them on his own call
      // (consumeMedkit), best-quality first. A stack already at its cap turns
      // the kit away — it stays on the ground. Untiered items (minted before
      // tiers shipped) read as the lightest kit.
      const tierIndex = medkitTierIndex(item.tier);
      if (!bankMedkit(state, tierIndex)) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "medkit",
        name: (MEDKIT.tiers[tierIndex] ?? MEDKIT.tiers[0]).name,
      });
      return false;
    }

    // The golden arrow: a CATCH-UP faucet. While the hero is still under the
    // level a normal run of this map/difficulty leaves him at, it pays a share
    // of the current level's XP bar — tapering with level (arrowXpShareAt), a
    // full quarter-level early down to a sliver — so arrows carry the
    // onboarding and speed an under-levelled hero up to where the content
    // belongs. ONCE he hits that cap the arrow goes COLD (arrowColdXp: a flat
    // few mob kills), so replaying old maps can't arrow-boost him past their
    // tier. A rung with no cap entry never goes cold.
    if (item.kind === "xp") {
      state.stats.itemsCollected++;
      const cap = levelDef(state.level.id).loot.arrowCapByDifficulty?.[
        state.difficulty
      ];
      // Resolve the award once so the same figure both banks XP and floats up
      // off the hero's head as blue "+N XP" combat text.
      const xpGain =
        cap !== undefined && player.level >= cap
          ? arrowColdXp(player.level)
          : Math.max(
              1,
              Math.round(player.xpToNext * arrowXpShareAt(player.level)),
            );
      state.events.push({
        type: "itemCollected",
        kind: "xp",
        name: "GOLDEN ARROW",
        xp: xpGain,
      });
      grantXp(state, xpGain);
      return false;
    }

    // The stack-and-spend consumables — repair kits, energy drinks (stamina
    // potions), and blue gatorade (mana potions) — STASH into the consumable
    // dock (stacking, capped at CONSUMABLES.stackCap) rather than firing on
    // contact; the hero spends one on his own call (useRepairKit /
    // useStaminaPotion / useManaPotion). A full stack turns the pickup away:
    // it stays on the ground.
    if (
      item.kind === "repair" ||
      item.kind === "drink" ||
      item.kind === "mana"
    ) {
      if (!bankConsumable(state, item.kind)) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: item.kind,
        name: consumableName(item.kind),
      });
      return false;
    }

    // Story items are plot, not gear: banked in state.storyItems (never
    // the bag) and their lore plays as a dialogue on the spot.
    if (item.kind === "story") {
      collectStoryItem(state, item.defId, item.pos);
      return false;
    }

    // Ability pickups are banked for the `useItem` input (never the bag);
    // at the carry cap — or a second `uniqueHeld` power like the NUKE while
    // one is already docked — they stay on the ground like an overflowing drop.
    if (item.kind === "ability") {
      if (!canBankAbility(state, item.defId)) return true;
      state.player.heldAbilities.push(item.defId);
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "ability",
        name: abilityDef(item.defId).name,
      });
      return false;
    }

    // Equipment better than what's worn is equipped on the spot; the old
    // piece heads for the bag, or the ground when the bag is full. Lesser
    // finds go into the bag, staying grounded when it's full. When the player
    // has turned auto-equip off (a setting), even a genuine upgrade banks to
    // the bag instead — the card still flags it so they can equip it by hand.
    if (isAutoEquipEnabled() && isBetterEquipment(state, item.equipment)) {
      const slot = item.equipment.slot;
      const previous =
        slot === "weapon" ? player.equipment.weapon : player.equipment[slot];
      if (slot === "weapon") {
        player.equipment.weapon = item.equipment;
        player.weaponCooldownMs = 0;
      } else {
        player.equipment[slot] = item.equipment;
      }
      recomputeMaxHp(state);
      recomputeMaxStamina(state);
      // A +STRENGTH piece can widen the bag, so grow it to match (mirrors
      // `equipFromInventory`).
      syncInventoryCapacity(state);
      if (previous && !addToInventory(state, previous)) {
        displaced.push({
          id: state.nextId++,
          kind: "equipment",
          pos: { ...player.pos },
          equipment: previous,
        });
      }
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "equipment",
        tier: item.equipment.tier,
        quality: item.equipment.quality,
        name: equipmentName(item.equipment),
        defId: item.equipment.defId,
        itemId: item.equipment.id,
        uniqueId: item.equipment.uniqueId,
        // Worn on the spot — the auto-equip path only ever fires on a genuine
        // upgrade, so the card badges it EQUIPPED, not tap-to-equip.
        equipped: true,
        upgrade: true,
      });
      state.events.push({ type: "autoEquipped", defId: item.equipment.defId });
      return false;
    }
    // A bagged find might still out-score the worn piece (a passive charm the
    // auto-equip rule leaves alone) — probe before it lands so the card can
    // flag it as an upgrade to tap.
    const bagUpgrade = wouldUpgradeSlot(state, item.equipment);
    if (!addToInventory(state, item.equipment)) {
      // Bag full: the piece stays grounded. Nudge the player to make room —
      // a thought over the hero and a pulse on the bag button — throttled so
      // standing on the loot doesn't fire it every tick.
      if (state.bagFullHintCooldownMs <= 0) {
        state.bagFullHintCooldownMs = LOOT.bagFullHintCooldownMs;
        state.events.push({
          type: "pickupBlocked",
          reason: "bagFull",
          pos: { ...player.pos },
        });
      }
      return true;
    }
    state.stats.itemsCollected++;
    state.events.push({
      type: "itemCollected",
      kind: "equipment",
      tier: item.equipment.tier,
      quality: item.equipment.quality,
      name: equipmentName(item.equipment),
      defId: item.equipment.defId,
      itemId: item.equipment.id,
      uniqueId: item.equipment.uniqueId,
      equipped: false,
      upgrade: bagUpgrade,
    });
    return false;
  });
  if (displaced.length > 0) state.items.push(...displaced);
}
