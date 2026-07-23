// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's control surface: the canvas pointer tracker (touch dpad taps,
// mouse press-to-use), the rebindable keyboard/mouse/wheel actions, the
// fixed Escape hatch, scene-advance keys, the weapon/powerup number rows,
// and the blur/visibility auto-pause. GameScreen builds one per run effect;
// detach() unwires everything on teardown.

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  advanceDialogue,
  advanceIntro,
  advanceOutro,
  canOpenInventory,
  closeInventory,
  closeMap,
  closeShop,
  equipFromInventory,
  openInventory,
  openMap,
  skipCutscene,
  skipIntro,
  skipOutro,
  tapCutscene,
  type Bot,
  type GameState,
} from "@game/core";

import { trackPointer, type PointerTracker } from "@ui/lib/pointer.ts";

import { synth } from "../audio.ts";
import type { CutsceneReveal } from "../overlays/CutsceneOverlay.tsx";
import type { DialogueReveal } from "../overlays/DialogueOverlay.tsx";
import type { IntroReveal } from "../overlays/IntroOverlay.tsx";
import {
  actionForCode,
  mouseButtonCode,
  moveVectorForCode,
  wheelCode,
  type BindableAction,
} from "../keybindings.ts";
import { getSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import { weaponAlternatives } from "./hud-model.ts";
import type { InputQueues } from "./player-input.ts";

export type Controls = {
  pointer: PointerTracker;
  /** Unwire every listener and dispose the pointer tracker. */
  detach: () => void;
};

export function createControls(deps: {
  canvas: HTMLCanvasElement;
  state: GameState;
  queues: InputQueues;
  /** The developer BOT VIEW / `?bot=` bot, and whether a viewer watches it —
   * a headless `?bot=` playtest must keep running when the tab reports
   * itself hidden (see onVisibility below). */
  bot: Bot | null;
  botView: boolean;
  /** The live pickup-card element + its dismiss action (see GameScreen) — a
   * tap landing over a NON-INTERACTIVE card flicks it away instead of
   * jumping. */
  pickupCardElRef: MutableRefObject<HTMLButtonElement | null>;
  pickupDismissRef: MutableRefObject<(() => void) | null>;
  /** A pause the viewer opened by hand — latched so the bot's input loop
   * leaves it alone. */
  userPausedRef: MutableRefObject<boolean>;
  /** Live mirrors of the scene crawls, so keyboard advance shares the tap's
   * two-step feel (finish the reveal, then turn the page). */
  dialogueRevealRef: MutableRefObject<DialogueReveal>;
  introRevealRef: MutableRefObject<IntroReveal>;
  cutsceneRevealRef: MutableRefObject<CutsceneReveal>;
  /** Whether the in-HUD weapon switcher is expanded (live mirror + setter). */
  weaponMenuOpenRef: MutableRefObject<boolean>;
  setWeaponMenuOpen: Dispatch<SetStateAction<boolean>>;
  pause: (userInitiated?: boolean) => void;
  resume: () => void;
  beginRun: () => void;
  bumpUi: () => void;
}): Controls {
  const {
    canvas,
    state,
    queues,
    bot,
    botView,
    pickupCardElRef,
    pickupDismissRef,
    userPausedRef,
    dialogueRevealRef,
    introRevealRef,
    cutsceneRevealRef,
    weaponMenuOpenRef,
    setWeaponMenuOpen,
    pause,
    resume,
    beginRun,
    bumpUi,
  } = deps;

  // Audio can only start from a user gesture; the run itself begins with
  // a click/tap, and steering keeps the context alive after that.
  synth.unlock();
  const unlock = () => synth.unlock();
  canvas.addEventListener("pointerdown", unlock);

  // The control scheme (see settings.ts): a touch anchors a virtual dpad
  // where it lands — dragging away from the anchor walks in that
  // direction, releasing stops. Any touch tap jumps: a quick solo tap, or
  // the other hand tapping while the first finger steers. A mouse follows
  // the steering setting — cursor-follow mode turns clicks into item use
  // (Space jumps); AIM & SHOOT makes the left button the trigger (read
  // straight off pointer.state.held by the sim loop).
  const pointer = trackPointer(canvas, {
    onTap: ({ fingers, pointerType }) => {
      // Remember where the tap landed (CSS px): the sim loop checks it
      // against the merchant before letting it act as a jump.
      queues.shopTapRef.current = { x: pointer.state.x, y: pointer.state.y };
      // A single-finger tap landing ON a non-interactive pickup card flicks
      // it away instead of jumping — the card is pointer-events:none so the
      // press already steers/jumps through it, and this makes a quick tap the
      // deliberate way to clear a non-upgrade out of the thumb zone.
      if (fingers === 1) {
        const dismiss = pickupDismissRef.current;
        const el = pickupCardElRef.current;
        if (dismiss && el) {
          const card = el.getBoundingClientRect();
          const view = canvas.getBoundingClientRect();
          const px = view.left + pointer.state.x;
          const py = view.top + pointer.state.y;
          if (
            px >= card.left &&
            px <= card.right &&
            py >= card.top &&
            py <= card.bottom
          ) {
            dismiss();
            return; // swallow the jump — the tap was spent dismissing
          }
        }
      }
      // Only touch/pen taps jump: a mouse click uses an item (cursor-follow)
      // or pulls the trigger (AIM & SHOOT) — desktop jumps live on Space.
      if (pointerType !== "mouse") {
        queues.jumpQueuedRef.current = true;
      }
    },
    onPress: ({ pointerType }) => {
      if (pointerType === "mouse" && getSettings().steering === "hover") {
        queues.useItemQueuedRef.current = true;
      }
    },
  });

  // Perform a rebindable discrete action (fired from a bound key, mouse
  // button, or wheel notch). Each case mirrors what its shipped key used to
  // do, honoring the current phase so a bind only bites where it makes sense.
  const runBinding = (action: BindableAction) => {
    switch (action) {
      case "jump":
        // Space's old bare-press jump; queued for the sim loop.
        if (state.phase === "playing") queues.jumpQueuedRef.current = true;
        return;
      case "useAbility":
        // Spend the oldest powerup — the engine no-ops off the field.
        queues.useItemQueuedRef.current = true;
        return;
      case "weaponMenu":
        if (state.phase === "playing") {
          setWeaponMenuOpen((open) => !open);
          playUiSound(synth, "confirm");
        }
        return;
      case "inventory":
        // Opens mid-run AND during an elite/boss arrival scene (the engine
        // gate) — the stare-down is when a fitting weapon gets equipped.
        if (canOpenInventory(state)) {
          openInventory(state);
          playUiSound(synth, "confirm");
        } else if (state.phase === "inventory") {
          closeInventory(state);
          playUiSound(synth, "back");
        }
        bumpUi();
        return;
      case "map":
        // Toggles the fog-of-war level map (same freeze as the bag).
        if (state.phase === "playing") {
          openMap(state);
          playUiSound(synth, "confirm");
          bumpUi();
        } else if (state.phase === "map") {
          closeMap(state);
          playUiSound(synth, "back");
          bumpUi();
        }
        return;
      case "pause":
        if (state.phase === "playing") {
          pause(true);
          playUiSound(synth, "confirm");
        } else if (state.phase === "paused") {
          resume();
          playUiSound(synth, "back");
        }
        return;
      case "medkit":
        // Spend from the consumable dock; the engine no-ops when nothing is
        // held or there's nothing to top up, so an idle press is free.
        if (state.phase === "playing" && !weaponMenuOpenRef.current)
          queues.useMedkitQueuedRef.current = true;
        return;
      case "stamina":
        if (state.phase === "playing" && !weaponMenuOpenRef.current)
          queues.useStaminaQueuedRef.current = true;
        return;
      case "mana":
        if (state.phase === "playing" && !weaponMenuOpenRef.current)
          queues.useManaQueuedRef.current = true;
        return;
      case "repair":
        if (state.phase === "playing" && !weaponMenuOpenRef.current)
          queues.useRepairQueuedRef.current = true;
        return;
      case "spell1":
      case "spell2":
      case "spell3":
      case "spell4":
        // Cast the matching spell-bar slot; the engine gates it.
        if (state.phase === "playing" && !weaponMenuOpenRef.current)
          queues.castSpellIndexRef.current = Number(action.slice(5)) - 1;
        return;
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // The level-up chooser owns the keyboard while it's up: LevelUpOverlay
    // runs its own listener (arrows/WASD move the cursor, Enter/Space spend a
    // point). Ceding here keeps those keys from steering or queuing a jump.
    if (state.phase === "levelup") return;
    const binds = getSettings().keybindings;
    // Track held movement keys + the walk modifier every keydown (repeats
    // included — Set.add is idempotent) so the sim loop reads live state.
    if (moveVectorForCode(event.code, binds)) {
      queues.heldMoveKeysRef.current.add(event.code);
      // AIM & SHOOT walks by keyboard even with KEYS off, so the movement
      // keys are live (and must not scroll the page) in that mode too.
      const s = getSettings();
      if (
        (s.keyboardMove === "on" || s.steering === "aim") &&
        state.phase === "playing"
      ) {
        event.preventDefault(); // arrow keys must not scroll the page
      }
    }
    if (event.code === binds.walk) {
      queues.walkingRef.current = true;
    }
    if (event.repeat) return;
    // Space and Enter both turn the page through any waiting scene (cutscene,
    // intro, title card, in-world dialogue). Space alone doubles as jump once
    // the run is live; Enter is scene-only so it never fires an action.
    const advanceKey = event.code === "Space" || event.key === "Enter";
    const inScene =
      state.phase === "cutscene" ||
      state.phase === "intro" ||
      state.phase === "outro" ||
      state.phase === "title" ||
      state.phase === "dialogue";
    if (advanceKey && inScene) {
      event.preventDefault();
      if (state.phase === "cutscene") {
        // Two-step like the dialogue crawl: finish the line, then turn it.
        if (!cutsceneRevealRef.current.done) {
          cutsceneRevealRef.current.skip();
        } else {
          tapCutscene(state);
        }
      } else if (state.phase === "intro") {
        // Two-step like the dialogue crawl: finish the reveal, then turn the
        // page (past the last page the engine flashes the level name).
        if (!introRevealRef.current.done) {
          introRevealRef.current.skip();
        } else {
          advanceIntro(state);
          playUiSound(synth, "move");
        }
        bumpUi();
      } else if (state.phase === "outro") {
        // The epilogue turns like the intro (the overlay shares the reveal
        // ref — only one of the two is ever mounted at a time).
        if (!introRevealRef.current.done) {
          introRevealRef.current.skip();
        } else {
          advanceOutro(state);
          playUiSound(synth, "move");
        }
        bumpUi();
      } else if (state.phase === "title") {
        beginRun();
        bumpUi();
      } else if (state.phase === "dialogue") {
        if (!dialogueRevealRef.current.done) {
          dialogueRevealRef.current.skip();
        } else {
          advanceDialogue(state);
          playUiSound(synth, "move");
        }
        bumpUi();
      }
    } else if (event.key === "Escape") {
      // Escape is the fixed, non-rebindable escape hatch: it skips a running
      // scene, closes an open overlay, and pauses/resumes the live run — the
      // one control a rebind can never steal.
      if (state.phase === "cutscene") {
        skipCutscene(state);
        playUiSound(synth, "back");
      } else if (state.phase === "intro") {
        skipIntro(state);
        playUiSound(synth, "back");
        bumpUi();
      } else if (state.phase === "outro") {
        skipOutro(state);
        playUiSound(synth, "back");
        bumpUi();
      } else if (state.phase === "inventory") {
        closeInventory(state);
        playUiSound(synth, "back");
        bumpUi();
      } else if (state.phase === "shop") {
        closeShop(state);
        playUiSound(synth, "back");
        bumpUi();
      } else if (state.phase === "map") {
        closeMap(state);
        playUiSound(synth, "back");
        bumpUi();
      } else if (state.phase === "playing") {
        pause(true);
        playUiSound(synth, "confirm");
      } else if (state.phase === "paused") {
        resume();
        playUiSound(synth, "back");
      }
    } else if (actionForCode(event.code, binds)) {
      // A rebindable action key fired (see keybindings.ts / runBinding).
      event.preventDefault();
      runBinding(actionForCode(event.code, binds) as BindableAction);
    } else if (state.phase === "playing" && /^[1-9]$/.test(event.key)) {
      // The weapon-slot / powerup-dock number keys stay fixed (a contextual
      // range, not a single bind): 1-4 equip a listed alternative while the
      // weapon menu is up, otherwise 1/2/3 fire the matching powerup slot.
      const n = Number(event.key) - 1;
      if (weaponMenuOpenRef.current) {
        const alt = weaponAlternatives(state)[n];
        if (alt && equipFromInventory(state, alt.index)) {
          playUiSound(synth, "equip");
          setWeaponMenuOpen(false);
          bumpUi();
        }
      } else if (
        n <= 2 &&
        state.player.heldAbilities[n] &&
        !state.player.abilities.some((a) => a.slot === n)
      ) {
        // A slot already counting down a running power isn't spendable.
        queues.useItemQueuedRef.current = true;
        queues.useItemIndexRef.current = n;
      }
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const binds = getSettings().keybindings;
    if (moveVectorForCode(event.code, binds))
      queues.heldMoveKeysRef.current.delete(event.code);
    if (event.code === binds.walk) {
      queues.walkingRef.current = false;
    }
  };
  // A mouse button / wheel notch can be bound to any discrete action too (see
  // keybindings.ts). Both no-op unless the player bound a pointer control —
  // the shipped scheme is all-keyboard, so there's no default pointer capture
  // to fight the canvas steering.
  const onMouseDown = (event: MouseEvent) => {
    const action = actionForCode(
      mouseButtonCode(event.button),
      getSettings().keybindings,
    );
    if (action) {
      event.preventDefault();
      runBinding(action);
    }
  };
  const onWheel = (event: WheelEvent) => {
    const action = actionForCode(
      wheelCode(event.deltaY),
      getSettings().keybindings,
    );
    if (action) {
      event.preventDefault();
      runBinding(action);
    }
  };
  // Suppress the browser context menu only when the right button is actually
  // bound, so an unbound right-click still behaves normally.
  const onContextMenu = (event: MouseEvent) => {
    if (actionForCode(mouseButtonCode(2), getSettings().keybindings) !== null) {
      event.preventDefault();
    }
  };
  // Losing focus (alt-tab, switching tab/app) must not leave a key "stuck",
  // and auto-pauses the run — the world (and music) freeze until the player
  // comes back and clicks in. A no-op mid-overlay (pause() is guarded).
  const onBlur = () => {
    queues.heldMoveKeysRef.current.clear();
    queues.walkingRef.current = false;
    pause();
  };
  // Tab hidden (mobile app-switch, backgrounded tab): same auto-pause. Both
  // signals fire in different browsers, and pause() is idempotent.
  //
  // A genuine backgrounding is a DELIBERATE user action, so the pause must
  // STICK — even under the autopilot's input loop (DEVELOPER → BOT VIEW),
  // which otherwise clears auto-pauses and would keep the run going in the
  // background. Latch it like a hand-opened pause so the bot leaves it be
  // (the ordering matters: `onBlur` may have already flipped the phase to
  // `paused`, so latch directly rather than relying on pause()'s guard). The
  // ONE exception is a headless `?bot=` playtest (a bot with no BOT VIEW
  // watcher): it can report itself hidden spuriously and must keep running,
  // so it leaves the pause clearable — the same reason the bot loop clears
  // these at all.
  const isHeadlessPlaytest = bot !== null && !botView;
  const onVisibility = () => {
    if (!document.hidden) return;
    pause();
    if (!isHeadlessPlaytest && state.phase === "paused") {
      userPausedRef.current = true;
    }
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousedown", onMouseDown);
  // Non-passive so a bound wheel notch can preventDefault the page scroll.
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);

  const detach = () => {
    pointer.dispose();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("pointerdown", unlock);
  };

  return { pointer, detach };
}
