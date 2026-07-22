// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BOT VIEW steering telemetry, part two: the white "tap" ripples that bloom
// wherever the autopilot clicks (a jump at the hero, or a button ripple on
// the dock/spell/consumable slot it fired), and — in the HOW TO PLAY demo —
// the teaching-tooltip anchors those taps raise. Driven from the sim loop's
// event pass and only ever shown while a bot drives; normal play sees none
// of it (the human sees where their own finger lands).

import type { RefObject } from "react";

import type { GameEvent, GameState } from "@game/core";

import { DEMO_TIPS } from "../copy.ts";

export type TapFx = {
  /** Bloom a wavy ring ripple at a client point (a bot "tap"). */
  rippleAtClient: (
    clientX: number,
    clientY: number,
    variant: "jump" | "button",
  ) => void;
  /** Bloom a button ripple centred on a HUD element (a dock or spell slot). */
  rippleOnEl: (el: Element | null | undefined) => void;
  /** A HUD element's centre in client px, or null if it isn't laid out. */
  elCenter: (el: Element | null | undefined) => { x: number; y: number } | null;
  /** Clear pending ripple-removal timers (run teardown). */
  dispose: () => void;
};

/**
 * BOT VIEW "tap" ripple factory: a white, wavy ring bloom appended to the FX
 * layer at a screen point — the visual for the bot "clicking" there. Used for
 * jumps (at the hero) and for each button the bot fires (see rippleOnEl).
 * Self-removes when its rings finish; only spawned while the bot drives.
 */
export function createTapFx(tapFxRef: RefObject<HTMLDivElement | null>): TapFx {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const rippleAtClient = (
    clientX: number,
    clientY: number,
    variant: "jump" | "button",
  ) => {
    const layer = tapFxRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const ripple = document.createElement("div");
    ripple.className = `tap-ripple tap-ripple--${variant}`;
    ripple.style.left = `${clientX - rect.left}px`;
    ripple.style.top = `${clientY - rect.top}px`;
    // Three staggered rings read as one wavy pulse rippling outward.
    ripple.append(
      document.createElement("span"),
      document.createElement("span"),
      document.createElement("span"),
    );
    for (const ring of ripple.children) ring.className = "tap-ring";
    layer.appendChild(ripple);
    const done = setTimeout(() => {
      timers.delete(done);
      ripple.remove();
    }, 760);
    timers.add(done);
  };
  const rippleOnEl = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    rippleAtClient(r.left + r.width / 2, r.top + r.height / 2, "button");
  };
  const elCenter = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement)) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  return {
    rippleAtClient,
    rippleOnEl,
    elCenter,
    dispose: () => timers.forEach(clearTimeout),
  };
}

export type BotFeedback = {
  /** Bloom the ripple/tip for one engine event, given this tick's camera. */
  onEvent: (
    event: GameEvent,
    state: GameState,
    camera: { x: number; y: number },
  ) => void;
};

/**
 * The per-event ripple + teaching-tip dispatch. The bot never touches the
 * React button handlers, so these engine events are the only truthful signal
 * that an ability/spell/consumable actually went off.
 */
export function createBotFeedback(deps: {
  canvas: HTMLCanvasElement;
  /** Live CSS-px → world-unit factors (the resize observer rewrites them). */
  cssToWorld: { x: number; y: number };
  tapFx: TapFx;
  powerupDockRef: RefObject<HTMLDivElement | null>;
  screenRef: RefObject<HTMLDivElement | null>;
  /** HOW TO PLAY teaching tooltips (a no-op outside the demo). */
  showDemoTip: (key: string, text: string, x: number, y: number) => void;
}): BotFeedback {
  const { canvas, cssToWorld, tapFx, powerupDockRef, screenRef, showDemoTip } =
    deps;
  const onEvent: BotFeedback["onEvent"] = (event, state, camera) => {
    if (event.type === "jump") {
      const cr = canvas.getBoundingClientRect();
      const sx = cr.left + (state.player.pos.x - camera.x) / cssToWorld.x;
      const sy = cr.top + (state.player.pos.y - camera.y) / cssToWorld.y;
      tapFx.rippleAtClient(sx, sy, "jump");
      // HOW TO PLAY: teach the jump the first time the bot leaps.
      showDemoTip("jump", DEMO_TIPS.jump, sx, sy);
    } else if (event.type === "abilityStarted") {
      // The dock renders slots 0..2 in order, so slot index === child
      // index — index directly (the slot may not have re-rendered to its
      // active/data-slot form yet this synchronous tick).
      const ab = state.player.abilities.find(
        (a) => a.defId === event.defId && a.slot !== undefined,
      );
      const dock = powerupDockRef.current;
      if (ab?.slot !== undefined && dock) {
        const slot = dock.children[ab.slot];
        tapFx.rippleOnEl(slot);
        const c = tapFx.elCenter(slot);
        if (c) showDemoTip("powerup", DEMO_TIPS.powerup, c.x, c.y);
      }
    } else if (event.type === "spellCast") {
      // A cast keeps its slot (spells aren't consumed), so the
      // `cast-<id>` label is stable at this instant.
      const slot = screenRef.current?.querySelector(
        `[aria-label="cast-${event.spellId}"]`,
      );
      tapFx.rippleOnEl(slot);
      const c = tapFx.elCenter(slot);
      if (c) showDemoTip("spell", DEMO_TIPS.spell, c.x, c.y);
    } else if (event.type === "itemCollected" || event.type === "playerHurt") {
      // HOW TO PLAY: teach the walk-over pickup on the first scoop,
      // and the "mobs hurt" lesson the first time the hero takes a
      // hit — both anchored on the hero himself (that's where the
      // loot vanished / the bite landed). One-shot like every tip;
      // outside the demo showDemoTip is a no-op.
      const cr = canvas.getBoundingClientRect();
      const sx = cr.left + (state.player.pos.x - camera.x) / cssToWorld.x;
      const sy = cr.top + (state.player.pos.y - camera.y) / cssToWorld.y;
      if (event.type === "itemCollected") {
        showDemoTip("loot", DEMO_TIPS.loot, sx, sy);
      } else {
        showDemoTip("hurt", DEMO_TIPS.hurt, sx, sy);
      }
    } else {
      // The three consumables share one lesson ("tap an item to use
      // it"), anchored on whichever slot the bot spent from.
      const consumable =
        event.type === "medkitUsed"
          ? "medkit"
          : event.type === "manaPotionUsed"
            ? "mana"
            : event.type === "staminaPotionUsed"
              ? "stamina"
              : event.type === "repairKitUsed"
                ? "repair"
                : null;
      if (consumable) {
        const slot = screenRef.current?.querySelector(
          `[data-consumable="${consumable}"]`,
        );
        tapFx.rippleOnEl(slot);
        const c = tapFx.elCenter(slot);
        if (c) showDemoTip("item", DEMO_TIPS.item, c.x, c.y);
      }
    }
  };
  return { onEvent };
}
