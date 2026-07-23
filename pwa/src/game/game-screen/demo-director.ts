// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HOW TO PLAY demo's front-of-house direction (see demo.ts and the
// GameScreen `demo` prop): the one-shot teaching tooltips popped where the
// autopilot taps (with their read-freeze), the level-up modal played at a
// human pace (one visible tap per point), and the anti-strobe facing damper
// that keeps the watched hero from flickering left↔right as the bot
// re-steers every tick. All of it is a LOOK layer on the demo input only —
// the bot's own decisions, and every non-demo run, are untouched.

import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import {
  allocateStat,
  botAllocate,
  PLAYER,
  type Bot,
  type GameInput,
  type GameState,
} from "@game/core";
import { normalize } from "@game/lib/vec.ts";

import { DEMO_TIPS } from "../copy.ts";
import type { DemoTipState } from "../DemoTip.tsx";
import type { TapFx } from "./bot-feedback.ts";

// How long a HOW TO PLAY teaching tooltip lingers before it fades (ms). Long
// enough to read the one line, short enough that it clears well before the next
// new action would raise its own.
const DEMO_TIP_MS = 5200;
// HOW TO PLAY: how long the sim FREEZES when a teaching tooltip pops (ms), so a
// newcomer can read the callout before the action carries on. Only the demo
// pauses; the tip lingers (DEMO_TIP_MS) well past the freeze, so play resumes
// under a still-visible tip. ~2s — a beat to read one line.
const DEMO_TIP_PAUSE_MS = 2000;
// HOW TO PLAY: the level-up modal is played like a person would, not drained
// instantly like the developer BOT VIEW. REVEAL is the beat the modal sits
// still before the first stat is picked (so it's seen); TAP is the beat between
// each subsequent pick, so the banked points are spent one visible tap at a
// time (a ripple blooms on each stat button). TAP holds a full ~2s — as long as
// a teaching tooltip's freeze (DEMO_TIP_PAUSE_MS) — so a newcomer can actually
// follow each point landing rather than watching them drain in a blur.
const DEMO_LEVELUP_REVEAL_MS = 650;
const DEMO_LEVELUP_TAP_MS = 2000;
// HOW TO PLAY — the anti-strobe damper. The autopilot re-picks its steer every
// tick, so while it orbits/kites a pack it wants left, then right, then left in
// the space of a few frames — which mirror-flips the sprite fast enough to read
// as a robot making "intra-second decisions". Two knobs tame it so the watched
// hero reads as a person:
//   • COMMIT — a reversal only turns him after the opposing horizontal intent has
//     PERSISTED this long (ms). Brief orbit jitter never lasts that long, so it
//     never turns him at all; only a genuine, sustained change of direction does.
//   • HOLD — once he does turn, he keeps that facing at least this long (ms)
//     before another turn is even considered, so two real turns can't stack up
//     into a flicker.
// Until a turn is earned, the opposing horizontal is CANCELLED (x pinned to the
// hero) so he holds his heading and moves straight up/down — or stands still —
// instead of snapping around. The result: he mostly stands or slides vertically
// while fighting, and turns only occasionally and deliberately. A LOOK tweak on
// the DEMO input only — the bot's own decision, and every non-demo run, untouched.
const DEMO_FACE_COMMIT_MS = 450;
const DEMO_FACE_HOLD_MS = 1200;

/** Anti-strobe facing memory for the HOW TO PLAY demo (see {@link dampDemoFlicker}).
 * `holdMs` counts down the post-turn lock; `pendingMs` accrues sustained opposing
 * intent toward the next earned turn. */
type DemoFacing = { faceLeft: boolean; holdMs: number; pendingMs: number };

/**
 * Damp the WATCHED autopilot's left↔right strobing in the HOW TO PLAY demo by
 * rewriting the DEMO input (never the bot's own steer). A move that agrees with
 * the hero's current facing — or is near-vertical — passes through untouched. An
 * opposing horizontal move only TURNS him once it has persisted for
 * {@link DEMO_FACE_COMMIT_MS} AND the post-turn {@link DEMO_FACE_HOLD_MS} lock has
 * elapsed; until then its x is pinned to the hero so he slides straight up/down
 * (or stands) rather than snapping around. So transient orbit jitter never flips
 * the sprite, and genuine turns are deliberate and spaced out. Mutates
 * `input.target` in place; mirrors the engine's `faceFlipMinX` so it only acts on
 * moves that would actually flip the sprite.
 */
function dampDemoFlicker(
  input: GameInput,
  pos: { x: number; y: number },
  face: DemoFacing,
  dtMs: number,
): void {
  if (face.holdMs > 0) face.holdMs -= dtMs;
  const settle = () => {
    face.pendingMs = 0;
  };
  if (!input.steering) return settle();
  const n = normalize(input.target.x - pos.x, input.target.y - pos.y);
  if (n.len < PLAYER.arriveRadius) return settle(); // not really going anywhere
  if (Math.abs(n.x) < PLAYER.faceFlipMinX) return settle(); // vertical: no flip
  const wantLeft = n.x < 0;
  if (wantLeft === face.faceLeft) return settle(); // moving the way he faces — free
  // Opposing horizontal intent. Bank how long it has held; a real, sustained
  // turn (and only once the post-turn lock is up) commits and re-arms the lock.
  face.pendingMs += dtMs;
  if (face.holdMs <= 0 && face.pendingMs >= DEMO_FACE_COMMIT_MS) {
    face.faceLeft = wantLeft;
    face.holdMs = DEMO_FACE_HOLD_MS;
    face.pendingMs = 0;
    return; // let the earned turn carry him
  }
  // Not earned yet → hold the facing, drop the horizontal so he goes up/down
  // (or stands) instead of strobing.
  input.target.x = pos.x;
}

/** The demo's React housing: tip/focus state the overlays render, plus the
 * refs the loop mutates. Component-lifetime — the shown-tips set survives the
 * run effect's per-level reruns so a taught control stays taught. */
export function useDemoState() {
  // The one teaching tooltip currently on screen (or null), the set of tip
  // keys already shown THIS session (each fires once), and the timer that
  // clears the active tip.
  const [demoTip, setDemoTip] = useState<DemoTipState | null>(null);
  const shownDemoTipsRef = useRef<Set<string>>(new Set());
  const demoTipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Milliseconds the sim is still FROZEN under the current teaching tooltip
  // (see DEMO_TIP_PAUSE_MS) — set when a tip pops, counted down in the loop.
  const demoPauseMsRef = useRef(0);
  // Paces the level-up modal so the viewer WATCHES the points be spent —
  // `armed` flips true once the current level-up has revealed (and its
  // teaching tip fired), `tapMs` counts down the beat between each shown "tap".
  const demoLevelupArmedRef = useRef(false);
  const demoLevelupTapMsRef = useRef(0);
  // The stat the autopilot is about to tap in the level-up modal. Fed to
  // LevelUpOverlay so the chosen button lights up (the same highlight a
  // human's cursor gives) — so a viewer can SEE which stat the bot picks, not
  // just a fleeting ripple. Null when no demo level-up is in progress. The ref
  // is the loop's change-detector (its closure never sees state updates); the
  // state is what the render reads (a ref can't be read during render).
  const demoLevelupFocusRef = useRef<string | null>(null);
  const [demoLevelupFocus, setDemoLevelupFocus] = useState<string | null>(null);
  // The anti-strobe facing memory (see dampDemoFlicker).
  const demoFaceRef = useRef<DemoFacing>({
    faceLeft: false,
    holdMs: 0,
    pendingMs: 0,
  });
  // Stable (memoized) so the run effect can depend on it without re-running.
  const refs = useMemo(
    () => ({
      shownDemoTipsRef,
      demoTipTimerRef,
      demoPauseMsRef,
      demoLevelupArmedRef,
      demoLevelupTapMsRef,
      demoLevelupFocusRef,
      demoFaceRef,
    }),
    [],
  );
  // Flick the current tip away NOW (the demo's tap-anywhere layer): stop its
  // fade timer, unmount it, and drop its read-freeze so play resumes at once.
  // Lives here — not in the component — because it writes the hook's refs.
  const clearTip = useCallback(() => {
    if (demoTipTimerRef.current) clearTimeout(demoTipTimerRef.current);
    setDemoTip(null);
    demoPauseMsRef.current = 0;
  }, []);
  return {
    demoTip,
    setDemoTip,
    demoLevelupFocus,
    setDemoLevelupFocus,
    clearTip,
    refs,
  };
}

export type DemoRefs = ReturnType<typeof useDemoState>["refs"];

export type DemoDirector = {
  /** Raise a one-time teaching tooltip anchored at a client point. */
  showDemoTip: (key: string, text: string, x: number, y: number) => void;
  /** True while the sim should stay FROZEN under the current tip's read
   * beat (counts the freeze down as a side effect). */
  holdSim: (dtMs: number) => boolean;
  /** Play the level-up modal at a watchable pace (one tap per beat). */
  stepLevelup: (dtMs: number) => void;
  /** Re-arm the level-up pacing between level-ups and drop the stat
   * highlight so it doesn't cling to a closed modal. */
  resetLevelupPacing: () => void;
  /** Apply the anti-strobe facing damper to this tick's demo input. */
  dampFlicker: (input: GameInput, dtMs: number) => void;
  /** The steering lesson, anchored on the BOT VIEW steer pad. */
  teachSteer: (anchor: () => { x: number; y: number }) => void;
  /** Clear the pending tip timer (run teardown). */
  dispose: () => void;
};

/** Build the per-run demo direction (a no-op shell when `demo` is false). */
export function createDemoDirector(deps: {
  demo: boolean;
  bot: Bot | null;
  state: GameState;
  refs: DemoRefs;
  setDemoTip: Dispatch<SetStateAction<DemoTipState | null>>;
  setDemoLevelupFocus: Dispatch<SetStateAction<string | null>>;
  screenRef: RefObject<HTMLDivElement | null>;
  tapFx: TapFx;
  bumpUi: () => void;
}): DemoDirector {
  const {
    demo,
    bot,
    state,
    refs,
    setDemoTip,
    setDemoLevelupFocus,
    screenRef,
    tapFx,
    bumpUi,
  } = deps;
  // Monotonic id for demo tooltips — remounts the callout so each new tip
  // re-runs its entry animation.
  let demoTipSeq = 0;

  // HOW TO PLAY: raise a one-time teaching tooltip anchored at a client point
  // (the spot the autopilot just "tapped"). Each `key` fires ONCE per demo
  // session — the newcomer is taught each control the first time the bot uses
  // it and never nagged again — so a repeat, or any non-demo run, is a no-op.
  // The caret anchors at the exact tap point; DemoTip slides only the box
  // back on-screen if it would clip an edge (so the caret keeps pointing at
  // the control). The tip flips below the anchor when it sits too near the
  // top edge. A fresh tip replaces (and re-times) the last.
  const showDemoTip = (
    key: string,
    text: string,
    clientX: number,
    clientY: number,
  ) => {
    if (!demo || refs.shownDemoTipsRef.current.has(key)) return;
    refs.shownDemoTipsRef.current.add(key);
    const rect = screenRef.current?.getBoundingClientRect();
    const x = clientX - (rect?.left ?? 0);
    const y = clientY - (rect?.top ?? 0);
    setDemoTip({
      id: ++demoTipSeq,
      key,
      text,
      x,
      y,
      // Anchors near the top flip below so the box never clips off-screen.
      place: y < 120 ? "below" : "above",
    });
    if (refs.demoTipTimerRef.current)
      clearTimeout(refs.demoTipTimerRef.current);
    refs.demoTipTimerRef.current = setTimeout(
      () => setDemoTip(null),
      DEMO_TIP_MS,
    );
    // Freeze the run for a beat so the newcomer can read the callout before the
    // action resumes (the tip lingers past the freeze — see the loop's pause).
    refs.demoPauseMsRef.current = DEMO_TIP_PAUSE_MS;
  };

  // HOW TO PLAY: hold the whole sim frozen while a teaching tooltip is being
  // read (DEMO_TIP_PAUSE_MS), then resume — the tip stays up a while longer.
  // The world stops; render keeps drawing the frozen frame + tip.
  const holdSim = (dtMs: number) => {
    if (demo && refs.demoPauseMsRef.current > 0) {
      refs.demoPauseMsRef.current -= dtMs;
      return true;
    }
    return false;
  };

  // HOW TO PLAY: play the level-up modal the way a person would — let it
  // reveal, TEACH stat allocation once (a tip anchored on the stat the bot is
  // about to pick), then spend the banked points one VISIBLE tap at a time (a
  // ripple blooms on each stat button), rather than the developer BOT VIEW's
  // instant drain. Paced by demoLevelupTapMsRef; the teaching tip's own freeze
  // (demoPauseMsRef) holds the modal still while the line is read. `armed`
  // resets between level-ups (resetLevelupPacing) so each one reveals afresh.
  const statButton = (stat: string) =>
    screenRef.current?.querySelector(`[aria-label="stat-${stat}"]`) ?? null;
  const stepLevelup = (dtMs: number) => {
    if (!bot || state.player.pendingStatPoints <= 0) return;
    const stat = botAllocate(bot, state);
    const btn = statButton(stat);
    // The modal paints one render frame after the phase flips; hold off until
    // its stat buttons exist so the tip anchors and the reveal beat both start
    // against a modal the viewer can actually see. bumpUi nudges that paint.
    if (!btn) {
      bumpUi();
      return;
    }
    // Light up the stat the next tap will land on (the same highlight a human
    // cursor gives) so the viewer SEES which stat is picked before the point
    // drops. Re-render only on a change of focus, so the highlight steps to the
    // next stat at the START of its beat rather than jumping only at the tap.
    if (refs.demoLevelupFocusRef.current !== stat) {
      refs.demoLevelupFocusRef.current = stat;
      setDemoLevelupFocus(stat); // re-renders the modal with the new highlight
    }
    if (!refs.demoLevelupArmedRef.current) {
      refs.demoLevelupArmedRef.current = true;
      refs.demoLevelupTapMsRef.current = DEMO_LEVELUP_REVEAL_MS;
      // Teach it once — anchored on the stat the first tap will land on.
      const c = tapFx.elCenter(btn);
      if (c) showDemoTip("levelstat", DEMO_TIPS.levelstat, c.x, c.y);
      return;
    }
    refs.demoLevelupTapMsRef.current -= dtMs;
    if (refs.demoLevelupTapMsRef.current > 0) return;
    refs.demoLevelupTapMsRef.current = DEMO_LEVELUP_TAP_MS;
    tapFx.rippleOnEl(btn); // bloom the "tap" on the button it lands on
    allocateStat(state, stat);
    bumpUi();
  };

  // Re-arm so the NEXT level-up reveals (and re-teaches) from scratch,
  // and drop the stat highlight so it doesn't cling to a closed modal.
  const resetLevelupPacing = () => {
    refs.demoLevelupArmedRef.current = false;
    if (refs.demoLevelupFocusRef.current !== null) {
      refs.demoLevelupFocusRef.current = null;
      setDemoLevelupFocus(null);
    }
  };

  // Keep the watched hero from strobing left↔right as the bot re-steers each
  // tick — hold the facing and go vertical/stand between flips so he reads as
  // a person. Demo only; the bot's own decision is untouched (developer BOT
  // VIEW shows the raw steer).
  const dampFlicker = (input: GameInput, dtMs: number) => {
    if (demo)
      dampDemoFlicker(input, state.player.pos, refs.demoFaceRef.current, dtMs);
  };

  // The anchor is a THUNK so the caller (the render loop, every frame while
  // the bot steers) never pays for a layout read once the tip has shown —
  // getBoundingClientRect forces a layout flush, and per-frame it was one of
  // the render loop's most expensive calls.
  const teachSteer = (anchor: () => { x: number; y: number }) => {
    if (!demo || refs.shownDemoTipsRef.current.has("steer")) return;
    const a = anchor();
    showDemoTip("steer", DEMO_TIPS.steer, a.x, a.y);
  };

  return {
    showDemoTip,
    holdSim,
    stepLevelup,
    resetLevelupPacing,
    dampFlicker,
    teachSteer,
    dispose: () => {
      if (refs.demoTipTimerRef.current)
        clearTimeout(refs.demoTipTimerRef.current);
    },
  };
}
