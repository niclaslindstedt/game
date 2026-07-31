// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ground-item pickups: medkits, golden arrows, stacked consumables, story
// items, ability pickups, and equipment (auto-equip or bag). Part of the step
// pipeline (see ./index.ts).

import { distanceSq } from "@game/lib/vec.ts";
import { canBankAbility } from "../abilities.ts";
import { JUMP, LOOT, MEDKIT, PLAYER } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { tierRank } from "../defs/equipment.ts";
import {
  addToInventory,
  bankConsumable,
  bankMedkit,
  consumableName,
  dropItem,
  equipmentName,
  isAutoEquipEnabled,
  isBetterEquipment,
  itemVoice,
  medkitTierIndex,
  recomputeMaxHp,
  recomputeMaxStamina,
  syncInventoryCapacity,
  wearSlotFor,
  wouldUpgradeSlot,
} from "../items/index.ts";
import { arrowXp } from "../leveling.ts";
import { grantXp } from "../loot.ts";
import { heroInPlay, seatOf } from "../party.ts";
import { questItemDef } from "../defs/quests.ts";
import { creditQuestPickup } from "../quests/index.ts";
import { collectStoryItem } from "../story.ts";
import type { EquipSlot, GameState, Item } from "../types/index.ts";

/**
 * The ground-item pass: fly every drop's arc down, then let each hero in the
 * party reach for what is under their feet.
 *
 * THE TWO HALVES ARE SEPARATE LOOPS, AND THAT IS THE WHOLE STRUCTURE. A toss's
 * countdown and a mercy angel's descent are facts about the ITEM — one tick of
 * dt each per tick of the run — while a pickup is a question each HERO asks. A
 * party of eight walking one loop would count every arc down eight times as
 * fast, so every drop would land in an eighth of its flight and the toss would
 * visibly break the moment a second player joined.
 *
 * Heroes reach in SEAT ORDER, which is a real (if small) tie-break: two players
 * standing on one medkit is a race, and a race resolved by seat is at least
 * deterministic and identical on every machine — a race resolved by whatever
 * order the party list happened to be in would replicate differently on the
 * server than on a client.
 */
export function stepItems(state: GameState, dtMs: number): void {
  // Pieces displaced by an auto-equip with a full bag fall back to the
  // ground — collected here so the filter pass isn't mutated mid-flight, and
  // carrying the hero they fell out of so each lands at ITS OWN owner's feet.
  const displaced: { item: Item; from: { x: number; y: number } }[] = [];
  const pickupReach = MEDKIT.radius + PLAYER.radius;
  const pickupReachSq = pickupReach * pickupReach;

  // THE ARCS, ONCE. A drop thrown clear of the body is in the air: count the
  // arc off and hold the pickup until it comes down (the magnet leaves it alone
  // too — see stepPowers); the renderer arcs it from `toss.from` to `pos`. The
  // touchdown is where the noise is: `itemLanded` carries what the thing is
  // MADE OF, and a magic-or-better find rings its rarity over the top. A mercy
  // drop riding its angel down counts off the same way.
  for (const item of state.items) {
    if (item.toss) {
      item.toss.ms = Math.max(0, item.toss.ms - dtMs);
      if (item.toss.ms <= 0) {
        item.toss = undefined;
        state.events.push({
          type: "itemLanded",
          pos: { ...item.pos },
          kind: itemVoice(item),
        });
        if (
          item.kind === "equipment" &&
          tierRank(item.equipment.tier) >= tierRank("magic")
        ) {
          state.events.push({
            type: "lootShine",
            pos: { ...item.pos },
            tier: item.equipment.tier,
          });
        }
        // Landed this very tick — it may be under a hero's feet already, so it
        // falls through to the pickup pass below rather than costing a frame.
      }
    } else if (item.deliverMs !== undefined && item.deliverMs > 0) {
      item.deliverMs = Math.max(0, item.deliverMs - dtMs);
    }
  }

  for (const player of state.players) {
    if (!heroInPlay(player)) continue;
    // Floating above the ground: the hero can't scoop loot mid-jump — a drop is
    // grabbed only once he's back down (the same z rule that stays his blade and
    // lets him clear the well pull). The magnet may still reel drops toward him
    // while airborne, but they wait on the ground until he lands to be taken.
    const airborne = player.z > JUMP.dodgeHeight;
    if (airborne) continue;
    const seat = seatOf(state, player);
    state.items = state.items.filter((item) => {
      // Still in the air (a toss mid-arc, or a mercy drop on its angel): not
      // collectable by anybody this tick.
      if (item.toss) return true;
      if (item.deliverMs !== undefined && item.deliverMs > 0) return true;
      // ALLOCATED LOOT: somebody else's pile is walked over, not picked up. Free
      // for all — and every single-player run — stamps no owner, so this never
      // fires there (see `GameState.lootMode`).
      if (item.owner !== undefined && item.owner !== seat) return true;
      const overlapping = distanceSq(item.pos, player.pos) <= pickupReachSq;
      if (!overlapping) return true;

      if (item.kind === "medkit") {
        // D2-style tiered kits stack into the consumable dock, one stack per
        // quality (config MEDKIT.tiers); the hero spends them on his own call
        // (consumeMedkit), best-quality first. A stack already at its cap turns
        // the kit away — it stays on the ground. Untiered items (minted before
        // tiers shipped) read as the lightest kit.
        const tierIndex = medkitTierIndex(item.tier);
        if (!bankMedkit(state, player, tierIndex)) return true;
        state.stats.itemsCollected++;
        state.events.push({
          type: "itemCollected",
          kind: "medkit",
          name: (MEDKIT.tiers[tierIndex] ?? MEDKIT.tiers[0]).name,
        });
        return false;
      }

      // The golden arrow: a flat, MOB-PRICED bonus — `arrowXp` pays a set few
      // kills' worth (`XP_TUNING.arrowXpKills`, authored in content/leveling.yaml)
      // of the mob that DROPPED it (`item.mlvl`), so an arrow shed by a low-level
      // mob on outgrown ground is worth only that mob's little, never a full
      // at-level ding — grinding old ground can't over-level the hero. No
      // share-of-bar, no hot/cold split: the payout can never distort the leveling
      // table's kills-per-level, and grinding arrows is never better than fighting.
      // A source-less arrow (no `mlvl`) falls back to the hero's own level.
      if (item.kind === "xp") {
        state.stats.itemsCollected++;
        // Resolve the award once so the same figure both banks XP and floats up
        // off the hero's head as blue "+N XP" combat text. 0 = the faucet is
        // switched off (a calibration run) — collect silently, grant nothing.
        const xpGain = arrowXp(item.mlvl ?? player.level, player.level);
        if (xpGain > 0) {
          state.events.push({
            type: "itemCollected",
            kind: "xp",
            name: "GOLDEN ARROW",
            xp: xpGain,
          });
          // The arrow belongs to whoever walked over it — no share, no gate.
          grantXp(state, player, xpGain);
        }
        return false;
      }

      // The stack-and-spend consumables — repair kits and energy drinks (stamina
      // potions) — STASH into the consumable dock (stacking, capped at
      // CONSUMABLES.stackCap) rather than firing on contact; the hero spends one
      // on his own call (useRepairKit / useStaminaPotion). A full stack turns the
      // pickup away: it stays on the ground.
      if (item.kind === "repair" || item.kind === "drink") {
        if (!bankConsumable(state, player, item.kind)) return true;
        state.stats.itemsCollected++;
        state.events.push({
          type: "itemCollected",
          kind: item.kind,
          name: consumableName(item.kind),
        });
        return false;
      }

      // A QUEST PIECE is a token, not gear: it banks a tally on the errand that
      // wanted it (never the bag, which the hero needs for loot) and vanishes.
      // A piece belonging to no running errand — left over from a quest that
      // failed or was handed in — is quietly left on the ground rather than
      // collected into nothing.
      if (item.kind === "quest") {
        if (!creditQuestPickup(state, item.questId, item.defId)) return true;
        state.stats.itemsCollected++;
        state.events.push({
          type: "itemCollected",
          kind: "quest",
          name: questItemDef(item.questId, item.defId)?.name ?? "QUEST ITEM",
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
        if (!canBankAbility(state, player, item.defId)) return true;
        player.heldAbilities.push(item.defId);
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
      if (
        isAutoEquipEnabled() &&
        isBetterEquipment(state, player, item.equipment)
      ) {
        // Never null here: `isBetterEquipment` already refused the trinket (it
        // pays out from the bag, so it is never worn).
        const slot = wearSlotFor(state, player, item.equipment) as EquipSlot;
        const previous = player.equipment[slot];
        if (slot === "weapon") {
          player.equipment.weapon = item.equipment;
          player.weaponCooldownMs = 0;
        } else {
          player.equipment[slot] = item.equipment;
        }
        recomputeMaxHp(state, player);
        recomputeMaxStamina(state, player);
        // A +STRENGTH piece can widen the bag, so grow it to match (mirrors
        // `equipFromInventory`).
        syncInventoryCapacity(state, player);
        if (previous && !addToInventory(state, player, previous)) {
          displaced.push({
            item: {
              id: state.nextId++,
              kind: "equipment",
              pos: { ...player.pos },
              equipment: previous,
            },
            from: { ...player.pos },
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
        state.events.push({
          type: "autoEquipped",
          defId: item.equipment.defId,
        });
        return false;
      }
      // A bagged find might still out-score the worn piece (a passive charm the
      // auto-equip rule leaves alone) — probe before it lands so the card can
      // flag it as an upgrade to tap.
      const bagUpgrade = wouldUpgradeSlot(state, player, item.equipment);
      if (!addToInventory(state, player, item.equipment)) {
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
  }
  // The piece the swap knocked out of a full bag is TOSSED clear of the hero,
  // not laid at his feet — otherwise the drop he just picked up reappears under
  // him and reads as a failed pickup. Done after the filter, which reassigns
  // `state.items` and would otherwise swallow the push.
  for (const { item, from } of displaced) dropItem(state, item, from);
}
