// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BOT VIEW steering telemetry, part two: the white "tap" ripples that bloom
// wherever the autopilot clicks (a jump at the hero, or a button ripple on
// the dock/spell/consumable slot it fired), and — in the HOW TO PLAY demo —
// the teaching-tooltip anchors those taps raise. Driven from the sim loop's
// event pass and only ever shown while a bot drives; normal play sees none
// of it (the human sees where their own finger lands).

import type { RefObject } from "react";

import type { GameEvent, GameState } from "@game/core";
import type { Vec2 } from "@game/lib/vec.ts";

import { DEMO_TIPS } from "../copy.ts";

/** HOW TO PLAY: the engine events that teach something about the WORLD rather
 * than a control — each carries a `pos`, so its tooltip anchors right where it
 * happened on the field. Keyed by event type → `DEMO_TIPS` key.
 *
 * The crate lesson rides `crateBroken` — the blow that actually SMASHES the
 * box, which is the moment worth teaching. It still points at a crate rather
 * than bare ground: the tip's read-freeze stops the SIM clock, and the whole
 * effect layer runs on that clock (`effectsClockMs`), so the break animation is
 * held at its very first frame — the box intact, upright, on its own spot —
 * for the length of the callout, and keels over and bursts the instant play
 * resumes. */
const WORLD_LESSONS: Partial<
  Record<GameEvent["type"], keyof typeof DEMO_TIPS>
> = {
  crateBroken: "crate",
  merchantDiscovered: "merchant",
  mercyDrop: "mercy",
};

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
  /**
   * Where a teaching tooltip's CARET goes for a HUD control, and which side of
   * it the box sits on: the control's horizontal centre and its NEAR EDGE —
   * never its centre, which would park the callout squarely on top of the thing
   * it names (a dock slot is a fat square; the pause zone is a tall strip whose
   * centre is the clock). A control near the top of the screen takes the box
   * BELOW it (above would clip off-screen) and anchors on its bottom edge;
   * everything lower is the mirror. Null when the control isn't laid out.
   */
  elAnchor: (
    el: Element | null | undefined,
  ) => { x: number; y: number; place: "above" | "below" } | null;
  /** Clear pending ripple-removal timers (run teardown). */
  dispose: () => void;
};

/** Distance from the shell's top edge inside which a tooltip flips BELOW its
 * anchor — above it there isn't room for the box (see {@link TapFx.elAnchor}
 * and DemoTip's own fallback). */
const TOP_BAND_PX = 120;

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
  const elAnchor = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement)) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    // The FX layer is `inset: 0` inside the game shell, so its rect IS the
    // shell's — the frame the tooltip has to stay inside.
    const shellTop = tapFxRef.current?.getBoundingClientRect().top ?? 0;
    const below = r.top + r.height / 2 - shellTop < TOP_BAND_PX;
    return {
      x: r.left + r.width / 2,
      y: below ? r.bottom : r.top,
      place: below ? ("below" as const) : ("above" as const),
    };
  };
  return {
    rippleAtClient,
    rippleOnEl,
    elCenter,
    elAnchor,
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
  /** Where a world point sits on the page, in CSS px — the viewport's own
   * conversion, which carries the world projection (render/tilt.ts). */
  toCss: (
    worldX: number,
    worldY: number,
    camera: { x: number; y: number },
  ) => { x: number; y: number };
  tapFx: TapFx;
  powerupDockRef: RefObject<HTMLDivElement | null>;
  screenRef: RefObject<HTMLDivElement | null>;
  /** HOW TO PLAY teaching tooltips (a no-op outside the demo). `place` pins
   * which side of the anchor the box sits on; omitted, the tip picks its own. */
  showDemoTip: (
    key: string,
    text: string,
    x: number,
    y: number,
    place?: "above" | "below",
  ) => void;
}): BotFeedback {
  const { canvas, toCss, tapFx, powerupDockRef, screenRef, showDemoTip } = deps;
  const onEvent: BotFeedback["onEvent"] = (event, state, camera) => {
    if (event.type === "jump") {
      const cr = canvas.getBoundingClientRect();
      const at = toCss(state.player.pos.x, state.player.pos.y, camera);
      const sx = cr.left + at.x;
      const sy = cr.top + at.y;
      tapFx.rippleAtClient(sx, sy, "jump");
      // HOW TO PLAY: teach the jump the first time the bot leaps.
      showDemoTip("jump", DEMO_TIPS.jump, sx, sy);
    } else if (event.type === "abilityStarted") {
      // `abilityStarted` is only ever pushed by a SPEND (step/player.ts
      // `stepUseItem`), so it always means the hero really used a powerup —
      // the lesson never fires off a mere pickup.
      //
      // Which SLOT, though, has to be the copy this event announced:
      // `grantAbility` pushes the fresh copy onto the tail of `abilities`, so a
      // STACKABLE power already running would have the head of the list point
      // the caret at the older copy's slot — a different square. Scan from the
      // back for the newest one. The dock renders slots 0..2 in order, so slot
      // index === child index — index directly (the slot may not have
      // re-rendered to its active/data-slot form yet this synchronous tick).
      const abilities = state.player.abilities;
      let slotIndex: number | undefined;
      for (let i = abilities.length - 1; i >= 0; i--) {
        const ability = abilities[i];
        if (ability?.defId === event.defId && ability.slot !== undefined) {
          slotIndex = ability.slot;
          break;
        }
      }
      const dock = powerupDockRef.current;
      if (slotIndex !== undefined && dock) {
        const slot = dock.children[slotIndex];
        tapFx.rippleOnEl(slot);
        // Anchored on the slot's near EDGE, so the callout sits clear of the
        // dock and its caret points AT the powerup that just went off.
        const at = tapFx.elAnchor(slot);
        if (at) showDemoTip("powerup", DEMO_TIPS.powerup, at.x, at.y, at.place);
      }
    } else if (event.type === "itemCollected" || event.type === "playerHurt") {
      // HOW TO PLAY: teach the walk-over pickup on the first scoop,
      // and the "mobs hurt" lesson the first time the hero takes a
      // hit — both anchored on the hero himself (that's where the
      // loot vanished / the bite landed). One-shot like every tip;
      // outside the demo showDemoTip is a no-op.
      const cr = canvas.getBoundingClientRect();
      const at = toCss(state.player.pos.x, state.player.pos.y, camera);
      const sx = cr.left + at.x;
      const sy = cr.top + at.y;
      if (event.type === "itemCollected") {
        showDemoTip("loot", DEMO_TIPS.loot, sx, sy);
      } else {
        showDemoTip("hurt", DEMO_TIPS.hurt, sx, sy);
      }
    } else if (WORLD_LESSONS[event.type]) {
      // HOW TO PLAY: the lessons the WORLD teaches — a smashed supply crate, a
      // merchant come into view, a mercy drop flown in for a hero in trouble.
      // Each is anchored where it HAPPENED (the event's own world point), not
      // on a HUD control, because the thing being taught is out on the field.
      const key = WORLD_LESSONS[event.type]!;
      const pos = (event as { pos: Vec2 }).pos;
      const cr = canvas.getBoundingClientRect();
      const at = toCss(pos.x, pos.y, camera);
      showDemoTip(key, DEMO_TIPS[key], cr.left + at.x, cr.top + at.y);
    } else {
      // A spent consumable still blooms its "tap" ripple on the slot it came
      // out of. Its teaching tip does NOT ride these events: they fire once the
      // item is already gone, so spending the last medkit would leave "TAP AN
      // ITEM TO USE IT" pointing at a bare square. The demo teaches that lesson
      // a beat EARLIER, off the bot's intent, while the dock still shows the
      // item — see `holdItemUse` in demo-director.ts.
      const consumable =
        event.type === "medkitUsed"
          ? "medkit"
          : event.type === "staminaPotionUsed"
            ? "stamina"
            : event.type === "repairKitUsed"
              ? "repair"
              : null;
      if (consumable) {
        tapFx.rippleOnEl(
          screenRef.current?.querySelector(`[data-consumable="${consumable}"]`),
        );
      }
    }
  };
  return { onEvent };
}
