// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's render callback: draw the world frame + transient effects, then
// write every per-frame DOM surface directly (the FPS meter, the XP-strip
// kill heat, the touch/bot dpads, the powerup cooldown radials, the live
// minimap) — none of it through React — and finally publish the HUD snapshot
// to React only when its change-key moves (see hud-model.ts).

import { localHero } from "../local-seat.ts";
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";

import {
  abilityDef,
  PLAYER,
  type Bot,
  type GameInput,
  type GameState,
} from "@game/core";
import { clamp, normalize } from "@game/lib/vec.ts";

import type { PointerTracker } from "@ui/lib/pointer.ts";

import { type GameAssets } from "../assets.ts";
import { applyBloom } from "../render/bloom.ts";
import { synth } from "../audio.ts";
import { currentAreaLabel } from "../AreaCaption.tsx";
import { drawMinimap } from "../Minimap.tsx";
import {
  applyCameraShake,
  combatNoiseFade,
  computeCamera,
  deathZoom,
  drawEffects,
  drawFrame,
  effectsClockMs,
  guidanceArrowBlinkIndex,
  guidanceArrowVisible,
  heldMotion,
  heldTwoHanded,
  MELEE_SWING_MS,
  worldToCanvas,
} from "../render.ts";
import { getSettings } from "../settings.ts";
import { playUiSound } from "../sfx/ui.ts";
import { shotStyleFor } from "../weapon-fx.ts";
import type { DemoDirector } from "./demo-director.ts";
import { buildHud, type Hud } from "./hud-model.ts";
import { XP_BAR_HOT_MS } from "./event-fx.ts";
import type { LoopShared } from "./loop-shared.ts";
import { DPAD_DEADZONE_PX, DPAD_RING_PX } from "./player-input.ts";
import type { RunTuning } from "./run-setup.ts";

/** The area caption ("STOCK ROOM", "AREA CLEARED"): the line flashed over the
 * middle of the field. The render loop detects a zone entry — and event-fx
 * announces what happens to an area — and bumps `id` so the caption remounts
 * and replays its fade. `color` defaults to the room label's amber. */
export type AreaCaptionState = { label: string; id: number; color?: string };

export function createRenderFrame(deps: {
  state: GameState;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  assets: GameAssets;
  shared: LoopShared;
  tuning: RunTuning;
  input: GameInput;
  pointer: PointerTracker;
  bot: Bot | null;
  botView: boolean;
  demo: boolean;
  showFps: boolean;
  demoDirector: DemoDirector;
  minimapRef: RefObject<HTMLCanvasElement | null>;
  fpsRef: RefObject<HTMLDivElement | null>;
  xpHeatRef: RefObject<HTMLDivElement | null>;
  /** The HUD stamina bar's fill — width written here EVERY frame so the
   * sprint pool drains/refills glass-smooth (the pool moves every tick;
   * publishing it through React re-rendered the HUD dozens of times a
   * second and still stepped at the change-key's resolution). */
  staminaFillRef: RefObject<HTMLDivElement | null>;
  dpadRef: RefObject<HTMLDivElement | null>;
  botDpadRef: RefObject<HTMLDivElement | null>;
  powerupDockRef: RefObject<HTMLDivElement | null>;
  /** The area caption's entry detector + remount sequence (component-lifetime
   * so a re-run of the effect doesn't replay the caption in place). */
  lastAreaRef: MutableRefObject<string | null>;
  areaCaptionSeq: MutableRefObject<number>;
  setAreaCaption: Dispatch<SetStateAction<AreaCaptionState | null>>;
  /** The guidance arrow's last-pinged blink index (see below). */
  guideBlinkRef: MutableRefObject<number | null>;
  setHud: Dispatch<SetStateAction<Hud | null>>;
}): (timeMs: number) => void {
  const {
    state,
    canvas,
    ctx,
    assets,
    shared,
    tuning,
    input,
    pointer,
    bot,
    botView,
    demo,
    showFps,
    demoDirector,
    minimapRef,
    fpsRef,
    xpHeatRef,
    staminaFillRef,
    dpadRef,
    botDpadRef,
    powerupDockRef,
    lastAreaRef,
    areaCaptionSeq,
    setAreaCaption,
    guideBlinkRef,
    setHud,
  } = deps;

  let lastHud = "";
  // The VISUALS knobs, read ONCE at loop construction rather than per frame:
  // they are title-menu settings, so they cannot move mid-run, and `getSettings`
  // per frame would be a lookup 60 times a second for a value that never
  // changes. A run started after a change picks up the new one.
  const fx = getSettings();
  // FPS meter (DEBUG MODE / ?debug): an EMA over the real rAF deltas,
  // flushed to its DOM node a few times a second.
  let fpsLastMs: number | undefined;
  let fpsAvgMs = 0;
  let fpsNextFlushMs = 0;
  // BOT VIEW dpad smoothing: the bot re-picks a steer target every tick, which
  // twitches frame to frame. Low-pass the steer direction and pace so the
  // readout GLIDES like a human thumb instead of snapping — a running average
  // eased toward the live input each frame.
  let botSteerX = 0;
  let botSteerY = 0;
  let botSteerPace = 0;

  // The dpad hint is drawn straight onto DOM styles — per-frame
  // position/highlight without React re-renders.
  const dpad = dpadRef.current;
  const dpadNub = dpad?.querySelector<HTMLElement>(".dpad-nub") ?? null;
  // The bot's own steering dpad (BOT VIEW): same nub, resolved once.
  const botDpad = botDpadRef.current;
  const botDpadNub = botDpad?.querySelector<HTMLElement>(".dpad-nub") ?? null;
  // Powerup dock slots, resolved once per mount like the dpad nubs above and
  // re-queried only after React swaps the dock's children (a banked↔running
  // change remounts a slot, disconnecting the cached node) — not two
  // querySelectors per running powerup per frame.
  const dockSlots = new Map<
    number,
    { slot: HTMLElement; secs: HTMLElement | null }
  >();

  return function render(timeMs: number) {
    const camera = computeCamera(state, canvas.width, canvas.height, timeMs);
    // Layer the transient impact KICK (a lightning strike, a nuke) on top of
    // the clamped camera — the whole world jolts together, effects included.
    applyCameraShake(camera, shared.cameraShake, state.stats.timeMs, timeMs);
    // The DEATH SCENE's slow push-in (render/death.ts `deathZoom`): a plain
    // canvas scale ABOUT THE HERO'S SCREEN POINT, so the body stays pinned
    // exactly where it fell while the world swells around it — anchoring on the
    // view centre instead would drift him off frame on a death at a level edge,
    // where the camera is clamped and he is not centred.
    //
    // Scaling here rather than shrinking the view rect is what keeps it free:
    // every pass below still draws in unzoomed view units, so the culling, the
    // fog buffer (sized to the view — a per-frame view size would reallocate it
    // 60×/s), and the full-screen washes are all untouched. The transform maps
    // the drawn rect onto [t, t + view·zoom], which covers the canvas for any
    // hero point inside the view, so nothing is left unpainted at the edges.
    const zoom = deathZoom(state);
    if (zoom > 1) {
      // The anchor is a point ON THE SCREEN, so it is the hero's PROJECTED
      // place (render/tilt.ts). Anchoring on the raw world offset would drift
      // the body out of frame as the scene zooms, which is the one thing this
      // transform exists to prevent.
      const { x: hx, y: hy } = worldToCanvas(
        localHero(state).pos.x,
        localHero(state).pos.y,
        camera,
      );
      ctx.setTransform(zoom, 0, 0, zoom, hx * (1 - zoom), hy * (1 - zoom));
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // A pinned swing pose (?debug `window.__swing`) overrides the live
    // action so a screenshot samples an exact fraction of the arc. Rebuilt
    // each frame off the current clock so the fraction stays fixed. Neutral
    // (undefined) in normal play — the live `heroAction` drives the swing.
    const DEBUG_POSE_MS = 1000;
    const debugPose = tuning.debugPose;
    const action = debugPose
      ? {
          kind: debugPose.kind,
          weaponClass: debugPose.weaponClass,
          startMs: state.stats.timeMs - debugPose.t * DEBUG_POSE_MS,
          durationMs: DEBUG_POSE_MS,
          arc: debugPose.arc,
          // The pinned pose reads the HELD weapon's own hands AND its motion, so
          // the preview strip shows a greatsword swinging like a greatsword
          // rather than like a gladius with a longer sprite — and a weapon that
          // is never swung juddering rather than sweeping an arc it has not got.
          twoHanded: heldTwoHanded(localHero(state).equipment.weapon.defId),
          motion: heldMotion(localHero(state).equipment.weapon.defId),
        }
      : shared.heroAction;
    drawFrame(ctx, state, assets, camera, timeMs, action, shared.heroImpact);
    // Area caption: flash a named zone's label the moment the hero walks in
    // (only while actually playing — no captions mid-cutscene/menu). Guarded
    // on the ref so it fires once per entry, not every frame.
    if (state.phase === "playing") {
      const area = currentAreaLabel(state);
      if (area !== lastAreaRef.current) {
        lastAreaRef.current = area;
        if (area) {
          setAreaCaption({ label: area, id: ++areaCaptionSeq.current });
        }
      }
      // Ping the "go this way" beacon in step with the guidance arrow's
      // blink: one soft ping each time the pulse crosses a fresh peak while
      // the arrow shows. Baseline (no ping) on the frame it first appears,
      // and clear on hide so it never replays missed blinks in a burst.
      if (guidanceArrowVisible(state)) {
        const idx = guidanceArrowBlinkIndex(timeMs);
        if (guideBlinkRef.current !== null && idx > guideBlinkRef.current) {
          playUiSound(synth, "guide");
        }
        guideBlinkRef.current = idx;
      } else {
        guideBlinkRef.current = null;
      }
    }
    // The effect layer's own clock: the sim clock while playing, carried on by
    // the death scene's clock once the sim freezes, so a damage number caught
    // mid-pop by the killing blow finishes its rise and lapses instead of
    // standing still over the corpse (render/death.ts).
    const effectsMs = effectsClockMs(state);
    // A pinned melee swing (with `arc`/`range`) also draws its slash cone
    // frozen at the SAME fraction, so the preview strip shows the blade and
    // its AoE moving together. The untilMs is set so drawEffects resolves
    // the cone's own `t` back to `debugPose.t`.
    let debugEffects = shared.effects;
    if (debugPose && debugPose.kind === "swing" && debugPose.arc != null) {
      debugEffects = [
        ...shared.effects,
        {
          kind: "swing",
          pos: { x: localHero(state).pos.x, y: localHero(state).pos.y },
          angle: localHero(state).faceLeft ? Math.PI : 0,
          radius: debugPose.range ?? 40,
          arc: debugPose.arc,
          untilMs: state.stats.timeMs + (1 - debugPose.t) * MELEE_SWING_MS,
          durationMs: MELEE_SWING_MS,
        },
      ];
    } else if (debugPose && debugPose.kind === "shot") {
      // Pin the muzzle / cast flash at the same fraction as the pose, so a
      // ranged/magic weapon's shot signature can be sampled frame by frame.
      const MUZZLE_MS = 110;
      const wc = debugPose.weaponClass === "magic" ? "magic" : "ranged";
      debugEffects = [
        ...shared.effects,
        {
          kind: "muzzle",
          pos: { x: localHero(state).pos.x, y: localHero(state).pos.y },
          angle: localHero(state).faceLeft ? Math.PI : 0,
          weaponClass: debugPose.weaponClass,
          fx: shotStyleFor(localHero(state).equipment.weapon.uniqueId, wc),
          untilMs: state.stats.timeMs + (1 - debugPose.t) * MUZZLE_MS,
          durationMs: MUZZLE_MS,
        },
      ];
    }
    // The whole layer fades out as one over the death scene's opening beat —
    // the fight's floating damage/crit/XP numbers get off the screen so the
    // fall can be watched (render/death.ts `combatNoiseFade`).
    drawEffects(
      ctx,
      debugEffects,
      camera,
      effectsMs,
      assets,
      combatNoiseFade(state),
    );

    // BLOOM the finished world picture (SETTINGS → VISUALS) — the lights bleed
    // out past the pixels that drew them. Here, and not a line later: everything
    // world-anchored is down, and everything below is UI (the bot's thought read,
    // the HUD's own canvases), which must stay crisp — interface that blooms
    // reads as a fault rather than as atmosphere. Off costs nothing at all
    // (render/bloom.ts returns immediately).
    applyBloom(ctx, fx.bloom);

    // BOT VIEW / debug: pin the autopilot's current decision (`bot.lastThought`,
    // set by `botAct`) over the hero's head so what the bot is "thinking" each
    // moment is legible while watching. Drawn statically (not the rising float
    // channel) so a per-frame label reads steady, in the debug amber.
    if (bot && (botView || showFps) && !demo && bot.lastThought) {
      const font = assets.font;
      const label = bot.lastThought;
      // Drawn after the frame, in screen space: project the hero's place, then
      // clear his head in unprojected px.
      const at = worldToCanvas(
        localHero(state).pos.x,
        localHero(state).pos.y,
        camera,
      );
      const sx = Math.round(at.x);
      const sy = Math.round(at.y - PLAYER.radius - localHero(state).z - 14);
      const tx = sx - Math.round(font.measure(label) / 2);
      font.draw(ctx, label, tx + 1, sy + 1, { color: "#0b0d10" });
      font.draw(ctx, label, tx, sy, { color: "#ffd23f" });
    }

    // The live HUD minimap: paint the fog-of-war map (cached terrain +
    // live blips + the hero's pin) straight onto its canvas each frame, so
    // it tracks the run without a React re-render. Only mounted while the
    // playing HUD is up, so the ref is null otherwise.
    const minimapNode = minimapRef.current;
    if (minimapNode) drawMinimap(minimapNode, state, assets);

    // XP-bar kill heat: light ONLY the freshly-earned slice. Size the heat
    // overlay to span [streak-start XP → current XP] and, while a recent
    // kill's XP is still "hot" (this and any chained kills within
    // XP_BAR_HOT_MS), show it a brighter blue; the moment the chain lapses
    // the class drops and CSS fades it out, leaving the added XP settled
    // into the resting fill underneath. Written straight to the DOM so React
    // never clobbers it (className/style props here are constants).
    const xpHeatNode = xpHeatRef.current;
    if (xpHeatNode) {
      const xp = localHero(state).xp;
      const toNext = Math.max(1, localHero(state).xpToNext);
      // A level-up wraps XP below the baseline — flash the whole new level's
      // fill from empty rather than a stale (old-level) offset.
      const base = xp < shared.xpHeatBaseXp ? 0 : shared.xpHeatBaseXp;
      const leftPct = clamp((100 * base) / toNext, 0, 100);
      const rightPct = clamp((100 * xp) / toNext, 0, 100);
      xpHeatNode.style.left = `${leftPct}%`;
      xpHeatNode.style.width = `${Math.max(0, rightPct - leftPct)}%`;
      const hot =
        shared.lastXpGainMs !== undefined &&
        state.stats.timeMs - shared.lastXpGainMs <= XP_BAR_HOT_MS;
      xpHeatNode.classList.toggle("is-hot", hot);
    }

    // The stamina bar: the sprint pool moves every simulated tick while the
    // hero runs, so its fill width is written straight to the DOM here, every
    // frame — the bar tracks the pool at 60fps instead of stepping at the
    // HUD change-key's coarser resolution (the pool is deliberately NOT in
    // that key — see buildHud).
    const staminaNode = staminaFillRef.current;
    if (staminaNode) {
      const frac = clamp(
        localHero(state).stamina / Math.max(1, localHero(state).maxStamina),
        0,
        1,
      );
      staminaNode.style.width = `${(100 * frac).toFixed(2)}%`;
    }

    // The FPS readout: smooth the frame delta (EMA) and write the number
    // straight to the DOM every quarter second — no React re-render, so
    // the meter itself costs nothing worth measuring.
    const fpsNode = fpsRef.current;
    if (fpsNode) {
      if (fpsLastMs !== undefined) {
        const frameMs = timeMs - fpsLastMs;
        fpsAvgMs = fpsAvgMs === 0 ? frameMs : fpsAvgMs * 0.9 + frameMs * 0.1;
        if (timeMs >= fpsNextFlushMs && fpsAvgMs > 0) {
          fpsNextFlushMs = timeMs + 250;
          fpsNode.textContent = `${Math.round(1000 / fpsAvgMs)} FPS`;
        }
      }
      fpsLastMs = timeMs;
    }

    // The virtual dpad hint: anchored where the touch landed, arrows
    // brighten toward the drag direction, the nub trails the finger.
    if (dpad) {
      const show =
        !bot &&
        pointer.state.held &&
        pointer.state.pointerType !== "mouse" &&
        state.phase === "playing";
      dpad.style.display = show ? "block" : "none";
      if (show) {
        dpad.style.left = `${pointer.state.originX}px`;
        dpad.style.top = `${pointer.state.originY}px`;
        const n = normalize(
          pointer.state.x - pointer.state.originX,
          pointer.state.y - pointer.state.originY,
        );
        const steering = n.len >= DPAD_DEADZONE_PX;
        const nx = steering ? n.x : 0;
        const ny = steering ? n.y : 0;
        // cos(67°) ≈ 0.38: diagonals light up both of their arrows.
        dpad.dataset.left = nx < -0.38 ? "1" : "";
        dpad.dataset.right = nx > 0.38 ? "1" : "";
        dpad.dataset.up = ny < -0.38 ? "1" : "";
        dpad.dataset.down = ny > 0.38 ? "1" : "";
        if (dpadNub) {
          const reach = Math.min(n.len, DPAD_RING_PX);
          dpadNub.style.transform = `translate(${nx * reach}px, ${ny * reach}px)`;
        }
      }
    }

    // BOT VIEW: the autopilot's steering readout — a fixed lower-right dpad
    // mirroring the bot's steer (direction + pace, localHero(state)). Shown only while the bot
    // drives; normal play hides it (the human has their own anchored dpad
    // above). The steer target is the bot's world point relative to the hero
    // — the exact input step() consumes this frame — but the bot re-picks it
    // every tick, so it's low-passed into a running average that GLIDES like
    // a human thumb rather than snapping to each twitch.
    if (botDpad) {
      const show = !!bot && state.phase === "playing";
      botDpad.style.display = show ? "block" : "none";
      if (show) {
        const n = normalize(
          input.target.x - localHero(state).pos.x,
          input.target.y - localHero(state).pos.y,
        );
        const steering = input.steering && n.len > 1e-3;
        // Target unit direction + pace this frame (zero when idle, so the
        // nub eases home).
        const tx = steering ? n.x : 0;
        const ty = steering ? n.y : 0;
        const tPace = steering ? (input.throttle ?? 1) : 0;
        // Ease the average toward the live target. ~0.16 reads as a smooth
        // human glide at 60fps without lagging the fight noticeably.
        const ease = 0.16;
        botSteerX += (tx - botSteerX) * ease;
        botSteerY += (ty - botSteerY) * ease;
        botSteerPace += (tPace - botSteerPace) * ease;
        const m = normalize(botSteerX, botSteerY);
        const ux = m.len > 1e-3 ? m.x : 0;
        const uy = m.len > 1e-3 ? m.y : 0;
        // Light an arrow only once the smoothed lean is committed (past the
        // deadzone), so a direction change fades across instead of flickering.
        const lit = m.len > 0.2;
        botDpad.dataset.left = lit && ux < -0.38 ? "1" : "";
        botDpad.dataset.right = lit && ux > 0.38 ? "1" : "";
        botDpad.dataset.up = lit && uy < -0.38 ? "1" : "";
        botDpad.dataset.down = lit && uy > 0.38 ? "1" : "";
        if (botDpadNub) {
          // Nub distance folds in the smoothed pace, so a cautious creep
          // sits it closer to centre than a full sprint.
          const reach =
            DPAD_RING_PX * Math.min(1, m.len) * Math.min(1, botSteerPace);
          botDpadNub.style.transform = `translate(${ux * reach}px, ${uy * reach}px)`;
        }
        // HOW TO PLAY: teach steering the first time the bot commits to a
        // direction, anchored on the steer pad (a 0-size point at its ring
        // centre).
        if (lit) {
          demoDirector.teachSteer(() => {
            const r = botDpad.getBoundingClientRect();
            return { x: r.left, y: r.top };
          });
        }
      } else {
        // Reset the average while hidden so a resumed run eases from centre,
        // not from a stale lean.
        botSteerX = 0;
        botSteerY = 0;
        botSteerPace = 0;
      }
    }

    // Drive each running powerup's WoW-style cooldown right on its dock
    // slot: a conic sweep that unwinds as the ability runs out, plus a
    // whole-second countdown. Both are written to the DOM here so they tick
    // every frame without a React re-render (React only owns which slots
    // are banked vs running — see the `active` key). Each running copy owns
    // its own slot, so there's no stacking to reconcile here.
    const dock = powerupDockRef.current;
    if (dock) {
      for (const ability of localHero(state).abilities) {
        if (ability.slot === undefined) continue;
        let entry = dockSlots.get(ability.slot);
        if (!entry || !entry.slot.isConnected) {
          const slot = dock.querySelector<HTMLElement>(
            `[data-slot="${ability.slot}"]`,
          );
          if (!slot) {
            dockSlots.delete(ability.slot);
            continue;
          }
          entry = {
            slot,
            secs: slot.querySelector<HTMLElement>(".active-powerup-secs"),
          };
          dockSlots.set(ability.slot, entry);
        }
        const total = abilityDef(ability.defId).durationMs;
        const remaining = Math.max(0, ability.remainingMs);
        const frac = total > 0 ? Math.min(1, remaining / total) : 0;
        entry.slot.style.setProperty("--cd", frac.toFixed(4));
        if (entry.secs) {
          entry.secs.textContent = String(Math.ceil(remaining / 1000));
        }
      }
    }

    // Mirror the slow-moving values into React only when they change.
    const bagFullHint = state.stats.timeMs < shared.bagFullHintUntilMs;
    const { key, hud } = buildHud(state, bagFullHint);
    if (key !== lastHud) {
      lastHud = key;
      setHud(hud);
    }
  };
}
