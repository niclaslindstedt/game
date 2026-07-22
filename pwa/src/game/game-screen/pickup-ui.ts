// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's pickup feedback surfaces: the lower-corner "PICKED UP X" text
// feed, and the framed pickup CARD for bag gear (one at a time, queued so a
// loot flood never flash-replaces itself). Both are effect-scoped factories —
// GameScreen builds them per run and disposes them with the run effect.

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  equipFromInventory,
  equipmentIcon,
  itemLevelReq,
  type GameState,
  type Quality,
  type Tier,
} from "@game/core";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { PICKUP_TTL_MS, type PickupMessage } from "../PickupFeed.tsx";
import {
  PICKUP_CARD_TTL_MS,
  PICKUP_CARD_TTL_QUEUED_MS,
  PICKUP_CARD_TTL_UPGRADE_MS,
  type PickupCard,
} from "../PickupModal.tsx";
import { playUiSound } from "../sfx/index.ts";
import { TIER_COLORS } from "../tiers.ts";

// At most this many pickup lines show at once; older ones drop off the top so
// a loot flood never buries the screen.
const PICKUP_MAX = 6;
// How many bag-gear pickup cards may WAIT in the queue behind the one on
// screen. Past this a loot flood would take too long to drain, so the oldest
// ordinary (non-upgrade) card is dropped to make room — better finds are never
// skipped, only ordinary overflow is.
const PICKUP_CARD_QUEUE_MAX = 8;

export type PickupFeedHandle = {
  /** Append a line to the lower-corner feed (it expires itself). */
  push: (text: string, color?: string, prefix?: string) => void;
  /** Clear every pending expiry timer (run teardown). */
  dispose: () => void;
};

/**
 * The lower-right pickup feed: a fresh run starts with an empty log, and
 * each line schedules its own expiry so rows fade independently (WoW's
 * loot toast: newest at the bottom, oldest drops off the top first).
 */
export function createPickupFeed(
  setPickups: Dispatch<SetStateAction<PickupMessage[]>>,
): PickupFeedHandle {
  setPickups([]);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let seq = 0;
  const push = (text: string, color?: string, prefix?: string) => {
    const id = ++seq;
    setPickups((prev) => {
      const next = [...prev, { id, text, color, prefix }];
      return next.length > PICKUP_MAX ? next.slice(-PICKUP_MAX) : next;
    });
    const timer = setTimeout(() => {
      timers.delete(timer);
      setPickups((prev) => prev.filter((p) => p.id !== id));
    }, PICKUP_TTL_MS);
    timers.add(timer);
  };
  return { push, dispose: () => timers.forEach(clearTimeout) };
}

export type PickupCardQueueHandle = {
  /** Enqueue a freshly bagged piece of gear for its turn on screen. */
  show: (opts: {
    name: string;
    tier: Tier;
    quality?: Quality;
    defId?: string;
    itemId?: number;
    equipped: boolean;
    upgrade: boolean;
  }) => void;
  /** Clear the dwell timer and the dismiss hook (run teardown). */
  dispose: () => void;
};

/**
 * The framed pickup card for bag gear: finds are ENQUEUED and shown one at
 * a time, so a burst of loot doesn't flash-replace itself before the player
 * can read (or tap-to-equip) each piece — each card gets its own turn on
 * screen, which is the "delay" between pickups. A card's dwell shortens
 * while a backlog waits behind it (so the queue drains fast) but a BETTER
 * find — an upgrade over / at-or-above the worn piece for its slot — always
 * lingers longer, so a real gear jump gets a proper look. The queue is
 * capped (PICKUP_CARD_QUEUE_MAX); on overflow the oldest ordinary card is
 * dropped first, so better finds are never skipped.
 */
export function createPickupCardQueue(deps: {
  state: GameState;
  assets: GameAssets;
  setPickupCard: Dispatch<SetStateAction<PickupCard | null>>;
  /** Carries the dismiss action for the current NON-INTERACTIVE card (the
   * canvas tap handler reads it) — null while an upgrade card owns its tap. */
  pickupDismissRef: MutableRefObject<(() => void) | null>;
  bumpUi: () => void;
}): PickupCardQueueHandle {
  const { state, assets, setPickupCard, pickupDismissRef, bumpUi } = deps;
  setPickupCard(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  const queue: PickupCard[] = [];
  let showing = false;

  // Clear the card on screen now and roll the queue forward (the tap-to-
  // dismiss action and the dwell timer both land here).
  const dismissCurrent = () => {
    if (timer) clearTimeout(timer);
    setPickupCard(null);
    pickupDismissRef.current = null;
    pump();
  };

  // Pull the next queued card onto the screen, sizing its dwell to the state
  // at show time: a better find lingers, an ordinary one is halved while a
  // backlog still waits behind it, and otherwise runs the full base time.
  // When the queue empties the stage goes idle.
  const pump = () => {
    const next = queue.shift();
    if (!next) {
      showing = false;
      pickupDismissRef.current = null;
      return;
    }
    showing = true;
    // A NON-INTERACTIVE card (no tap-to-equip — every non-upgrade) is
    // tap-to-dismiss: the canvas flicks it away when a tap lands over it, so
    // a non-upgrade never squats in the thumb zone. A tap-to-equip upgrade
    // owns its own tap, so it isn't dismissable this way.
    pickupDismissRef.current = next.onEquip ? null : dismissCurrent;
    const better = next.upgrade || next.equipped;
    const ttlMs = better
      ? PICKUP_CARD_TTL_UPGRADE_MS
      : queue.length > 0
        ? PICKUP_CARD_TTL_QUEUED_MS
        : PICKUP_CARD_TTL_MS;
    setPickupCard({ ...next, ttlMs });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      setPickupCard(null);
      pickupDismissRef.current = null;
      pump();
    }, ttlMs);
  };

  const show: PickupCardQueueHandle["show"] = (opts) => {
    const { name, tier, quality, defId, itemId, equipped, upgrade } = opts;
    const icon = defId
      ? spriteDataUrl(assets.sprites, equipmentIcon(defId))
      : undefined;
    const color = TIER_COLORS[tier] ?? TIER_COLORS.regular;
    const id = ++seq;
    // Tap-to-equip is offered ONLY for a bagged UPGRADE the hero can wear
    // right now — a non-upgrade is never interactive (it's tap-to-dismiss /
    // steer-through instead), an auto-equipped upgrade is already worn, and an
    // under-leveled find would be refused. The item is located by its stable
    // id so a bag rearranged while the card is up still equips the right
    // piece, and its requirement is read off the INSTANCE (`itemLevelReq`) so
    // an artifact's cap gate matches the engine's refusal instead of its lower
    // base req.
    const bagged =
      itemId != null
        ? (state.player.inventory.find((it) => it?.id === itemId) ?? null)
        : null;
    const canEquip =
      upgrade &&
      !equipped &&
      defId != null &&
      bagged != null &&
      state.player.level >= itemLevelReq(bagged);
    const onEquip = canEquip
      ? () => {
          const index = state.player.inventory.findIndex(
            (it) => it?.id === itemId,
          );
          if (index >= 0 && equipFromInventory(state, index)) {
            playUiSound(synth, "equip");
            bumpUi();
            // Flip the live card to its worn state — the find is now equipped,
            // no longer an upgrade to chase or a tap target.
            setPickupCard((prev) =>
              prev && prev.id === id
                ? {
                    ...prev,
                    equipped: true,
                    upgrade: false,
                    onEquip: undefined,
                  }
                : prev,
            );
          }
        }
      : undefined;
    // Dwell is decided at show time (pump); enqueue with the base.
    queue.push({
      id,
      icon,
      name,
      color,
      tier,
      quality,
      upgrade,
      equipped,
      onEquip,
      ttlMs: PICKUP_CARD_TTL_MS,
    });
    // Keep the backlog bounded: drop the oldest ORDINARY card first so a flood
    // of trash can't stall an upgrade's turn; fall back to the oldest of all
    // if every waiting card is a keeper.
    if (queue.length > PICKUP_CARD_QUEUE_MAX) {
      const drop = queue.findIndex((c) => !(c.upgrade || c.equipped));
      queue.splice(drop >= 0 ? drop : 0, 1);
    }
    if (!showing) pump();
  };

  return {
    show,
    dispose: () => {
      if (timer) clearTimeout(timer);
      pickupDismissRef.current = null;
    },
  };
}
