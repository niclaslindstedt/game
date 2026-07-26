// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HOW TO PLAY demo's front-of-house direction (see demo.ts and the
// GameScreen `demo` prop): the one-shot teaching tooltips popped where the
// autopilot taps (with their read-freeze), the AMBIENT lessons the run state
// raises on the HUD control that answers them (demo-lessons.ts), the level-up
// chooser / talent picker / weapon switcher played at a human pace, and the
// anti-strobe facing damper that keeps the watched hero from flickering
// left↔right as the bot re-steers every tick. All of it is a LOOK layer on the
// demo input only — the bot's own decisions, and every non-demo run, are
// untouched.

import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import {
  allocateStat,
  botAllocate,
  botPickTalent,
  botWeaponSwapTarget,
  PLAYER,
  spendTalentPoint,
  stepBotWeaponSwap,
  type Bot,
  type GameInput,
  type GameState,
} from "@game/core";
import { normalize } from "@game/lib/vec.ts";

import { DEMO_TIPS } from "../copy.ts";
import type { DemoTipState } from "../DemoTip.tsx";
import type { TapFx } from "./bot-feedback.ts";
import {
  createStandstillMemory,
  DEMO_LESSONS,
  trackStandstill,
  type StandstillMemory,
} from "./demo-lessons.ts";
import { weaponAlternatives } from "./hud-model.ts";

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
// HOW TO PLAY: the TALENT PICKER gets the same treatment as the level-up
// chooser — let it reveal, teach the row tap once, then spend the queued
// points one visible tap at a time. Its reveal beat clears the overlay's own
// arming lockout (TALENT_ARM_MS in TalentPickerOverlay) so the box is done
// fading in before the first tap lands on it.
const DEMO_TALENT_REVEAL_MS = 1100;
const DEMO_TALENT_TAP_MS = 2000;
// HOW TO PLAY: the least sim ms between two AMBIENT lessons (demo-lessons.ts).
// A situation the run creates usually creates three at once — a hero low on
// stamina is also carrying a full pack and swinging a worn blade — and each
// tip freezes the run for a read beat, so ungated they would stutter the demo
// into a slideshow. Event tips (a jump, a smashed crate) are NOT gated: they
// fire on a moment that may never come round again, while an ambient lesson
// stays true and simply waits its turn.
const DEMO_LESSON_GAP_MS = 12_000;
// HOW TO PLAY: the beat between the two taps of a played WEAPON SWITCH — the
// press that opens the switcher, and the press on the weapon to draw. A real
// player flicks through the switcher about this fast, so out of the taught
// first switch it reads as one quick motion rather than a menu ceremony. (The
// first switch is the exception: its teaching tip freezes the run, so the
// switcher sits open under the callout for the whole read beat before the
// second tap lands.)
const DEMO_SWITCH_CLICK_MS = 40;
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
  // The TALENT PICKER's pacing, mirroring the level-up trio above: the reveal
  // latch, the beat between shown taps, and the talent row the next tap lands
  // on (ref for the loop's change-detector, state for the render's highlight).
  const demoTalentArmedRef = useRef(false);
  const demoTalentTapMsRef = useRef(0);
  const demoTalentFocusRef = useRef<string | null>(null);
  const [demoTalentFocus, setDemoTalentFocus] = useState<string | null>(null);
  // The anti-strobe facing memory (see dampDemoFlicker).
  const demoFaceRef = useRef<DemoFacing>({
    faceLeft: false,
    holdMs: 0,
    pendingMs: 0,
  });
  // The AMBIENT lessons' housekeeping (see demo-lessons.ts): how long the hero
  // has held still (the stamina lesson's pose read) and the sim ms still owed
  // before the next ambient lesson may be offered (DEMO_LESSON_GAP_MS).
  const demoStillRef = useRef<StandstillMemory>(createStandstillMemory());
  const demoLessonGapMsRef = useRef(0);
  // The WEAPON SWITCH being played as two taps: the bag cell the second tap
  // will draw, and the ms left before it lands. Null between switches.
  const demoSwapPlayRef = useRef<{ index: number; msLeft: number } | null>(
    null,
  );
  // Stable (memoized) so the run effect can depend on it without re-running.
  const refs = useMemo(
    () => ({
      shownDemoTipsRef,
      demoTipTimerRef,
      demoPauseMsRef,
      demoLevelupArmedRef,
      demoLevelupTapMsRef,
      demoLevelupFocusRef,
      demoTalentArmedRef,
      demoTalentTapMsRef,
      demoTalentFocusRef,
      demoFaceRef,
      demoStillRef,
      demoLessonGapMsRef,
      demoSwapPlayRef,
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
    demoTalentFocus,
    setDemoTalentFocus,
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
  /** Play the talent picker at a watchable pace (one tap per beat), the way
   * {@link stepLevelup} plays the stat chooser. */
  stepTalent: (dtMs: number) => void;
  /** Re-arm the talent pacing between pickers and drop the row highlight. */
  resetTalentPacing: () => void;
  /** Play the autopilot's pocket-arsenal swap as the two taps a player makes
   * (open the switcher, tap the weapon). Returns whether the hand changed —
   * the same contract as the engine's `stepBotWeaponSwap`, which it commits. */
  stepWeaponSwap: (drivingBot: Bot, dtMs: number) => boolean;
  /** Offer the AMBIENT lessons the run state has made true (demo-lessons.ts). */
  watchLessons: (dtMs: number) => void;
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
  setDemoTalentFocus: Dispatch<SetStateAction<string | null>>;
  /** The in-HUD weapon switcher's open latch — the played swap opens it on
   * the first tap and closes it on the second. */
  setWeaponMenuOpen: Dispatch<SetStateAction<boolean>>;
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
    setDemoTalentFocus,
    setWeaponMenuOpen,
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
  // top edge — unless the caller has already decided (a HUD lesson picks the
  // side AND the edge it anchors on together, so the box can't land on the
  // control it names). A fresh tip replaces (and re-times) the last.
  const showDemoTip = (
    key: string,
    text: string,
    clientX: number,
    clientY: number,
    place?: DemoTipState["place"],
  ) => {
    if (!demo || refs.shownDemoTipsRef.current.has(key)) return;
    refs.shownDemoTipsRef.current.add(key);
    // A tip FREEZES the run, and the frozen loop never reaches the swap play's
    // second tap — so a switch mid-motion would leave the switcher hanging open
    // under an unrelated callout for the whole read beat. Drop the play and
    // shut the menu; the bot simply re-decides the swap when play resumes. The
    // weapon lesson is the exception: that play is what it's teaching.
    if (key !== "weapon" && refs.demoSwapPlayRef.current) {
      refs.demoSwapPlayRef.current = null;
      setWeaponMenuOpen(false);
    }
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
      place: place ?? (y < 120 ? "below" : "above"),
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

  // HOW TO PLAY: the TALENT PICKER, played exactly the way stepLevelup plays
  // the stat chooser — reveal, teach the row tap once, then spend the queued
  // points one visible tap at a time. Without this the picker is invisible in a
  // botted run: bot-driver drains `pendingTalentPoints` inside the same tick
  // the ding queues them, so the overlay never survives to a paint.
  const talentRow = (id: string) =>
    screenRef.current?.querySelector(`[aria-label="talent-${id}"]`) ?? null;
  const stepTalent = (dtMs: number) => {
    if (!bot || state.pendingTalentPoints.length === 0) return;
    const id = botPickTalent(bot, state);
    // No pickable talent (a maxed tree): fall back to the instant drain so the
    // queue can't wedge the run behind a picker nothing will ever spend.
    if (!id) {
      while (state.pendingTalentPoints.length > 0) {
        const next = botPickTalent(bot, state);
        if (!next || !spendTalentPoint(state, next)) break;
      }
      bumpUi();
      return;
    }
    const row = talentRow(id);
    // The picker paints one frame after the point is queued — wait for its rows
    // so the tip anchors (and the reveal beat starts) against a visible box.
    if (!row) {
      bumpUi();
      return;
    }
    if (refs.demoTalentFocusRef.current !== id) {
      refs.demoTalentFocusRef.current = id;
      setDemoTalentFocus(id); // re-renders the picker with the new highlight
    }
    if (!refs.demoTalentArmedRef.current) {
      refs.demoTalentArmedRef.current = true;
      refs.demoTalentTapMsRef.current = DEMO_TALENT_REVEAL_MS;
      const c = tapFx.elCenter(row);
      if (c) showDemoTip("talent", DEMO_TIPS.talent, c.x, c.y);
      return;
    }
    refs.demoTalentTapMsRef.current -= dtMs;
    if (refs.demoTalentTapMsRef.current > 0) return;
    refs.demoTalentTapMsRef.current = DEMO_TALENT_TAP_MS;
    tapFx.rippleOnEl(row);
    if (!spendTalentPoint(state, id)) return;
    bumpUi();
  };

  // Re-arm so the NEXT picker reveals from scratch, and drop the row highlight
  // so it doesn't cling to a closed overlay.
  const resetTalentPacing = () => {
    refs.demoTalentArmedRef.current = false;
    if (refs.demoTalentFocusRef.current !== null) {
      refs.demoTalentFocusRef.current = null;
      setDemoTalentFocus(null);
    }
  };

  // HOW TO PLAY: the POCKET ARSENAL swap, played as the two presses a player
  // makes instead of the silent inventory write the bot does everywhere else
  // (bot/economy.ts). The engine decision is split so the play can see the hand
  // change COMING (`botWeaponSwapTarget`) and light the right row:
  //   tap 1 — ripple the held-weapon slot and open the switcher, remembering
  //           the bag cell the bot is reaching for;
  //   tap 2 — DEMO_SWITCH_CLICK_MS later, ripple that weapon's row, commit the
  //           swap, and close the switcher.
  // The teaching tip goes on tap 1, and its read-freeze holds the sim (so the
  // switcher sits open under the callout); every later switch flicks through
  // both taps in one quick motion. Returns whether the hand actually changed.
  const stepWeaponSwap = (drivingBot: Bot, dtMs: number): boolean => {
    const play = refs.demoSwapPlayRef.current;
    if (play) {
      play.msLeft -= dtMs;
      if (play.msLeft > 0) return false;
      refs.demoSwapPlayRef.current = null;
      // The switcher lists the alternatives in the same order it renders them,
      // so the target's rank in that list IS its row.
      const order = weaponAlternatives(state).findIndex(
        (alt) => alt.index === play.index,
      );
      const rows = screenRef.current?.querySelectorAll(".wpn-switch-slot");
      if (order >= 0) tapFx.rippleOnEl(rows?.[order]);
      const changed = stepBotWeaponSwap(drivingBot, state);
      setWeaponMenuOpen(false);
      bumpUi();
      return changed;
    }
    const index = botWeaponSwapTarget(drivingBot, state);
    if (index < 0) return false;
    const slot = screenRef.current?.querySelector(
      '[aria-label="switch-weapon"]',
    );
    // No HUD yet (the switcher slot mounts with the playing HUD): commit the
    // swap plainly rather than stalling the bot's arsenal behind the look.
    if (!slot) return stepBotWeaponSwap(drivingBot, state);
    tapFx.rippleOnEl(slot);
    setWeaponMenuOpen(true);
    bumpUi();
    refs.demoSwapPlayRef.current = { index, msLeft: DEMO_SWITCH_CLICK_MS };
    const c = tapFx.elCenter(slot);
    if (c) showDemoTip("weapon", DEMO_TIPS.weapon, c.x, c.y);
    return false;
  };

  // Where a HUD lesson's caret goes, and which side of it the box sits on. A
  // control near the top of the screen has to take the box BELOW it (above
  // would clip off-screen), so the caret anchors on the control's BOTTOM edge
  // — anchoring on its centre would park the callout squarely over the thing
  // it names (the pause zone is a tall strip whose centre is the clock). Below
  // that band it's the mirror: box above, caret on the TOP edge. Null when the
  // control isn't on screen or isn't laid out yet.
  const TOP_BAND_PX = 120;
  const lessonAnchor = (
    el: Element | null | undefined,
  ): { x: number; y: number; place: DemoTipState["place"] } | null => {
    if (!(el instanceof HTMLElement)) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    const shellTop = screenRef.current?.getBoundingClientRect().top ?? 0;
    const below = r.top + r.height / 2 - shellTop < TOP_BAND_PX;
    return {
      x: r.left + r.width / 2,
      y: below ? r.bottom : r.top,
      place: below ? "below" : "above",
    };
  };

  // HOW TO PLAY: the AMBIENT lessons (demo-lessons.ts) — the tips no tap or
  // event raises, only the run BECOMING a situation the HUD answers. Offered
  // one at a time and no oftener than DEMO_LESSON_GAP_MS, because a rough
  // stretch makes several true at once and each tip freezes the run to be read.
  // A ready lesson whose control isn't laid out yet (an empty party rail, a
  // rampage gauge at stage 0) simply keeps waiting — it is never marked taught
  // until its caret has something to point at.
  const watchLessons = (dtMs: number) => {
    if (!demo || state.phase !== "playing") return;
    trackStandstill(refs.demoStillRef.current, state.player.pos, dtMs);
    if (refs.demoLessonGapMsRef.current > 0) {
      refs.demoLessonGapMsRef.current -= dtMs;
      return;
    }
    const ctx = { stillMs: refs.demoStillRef.current.stillMs };
    for (const lesson of DEMO_LESSONS) {
      if (refs.shownDemoTipsRef.current.has(lesson.key)) continue;
      if (!lesson.ready(state, ctx)) continue;
      const at = lessonAnchor(screenRef.current?.querySelector(lesson.anchor));
      if (!at) continue; // control not on screen yet — stay ready and wait
      showDemoTip(
        lesson.key,
        DEMO_TIPS[lesson.key as keyof typeof DEMO_TIPS],
        at.x,
        at.y,
        at.place,
      );
      refs.demoLessonGapMsRef.current = DEMO_LESSON_GAP_MS;
      return;
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
    stepTalent,
    resetTalentPacing,
    stepWeaponSwap,
    watchLessons,
    dampFlicker,
    teachSteer,
    dispose: () => {
      if (refs.demoTipTimerRef.current)
        clearTimeout(refs.demoTipTimerRef.current);
    },
  };
}
