// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's control surface: the canvas pointer tracker (touch dpad taps,
// mouse press-to-use, and the tap routing for the three inert banners that park
// over the field — the pickup card, the achievement toast and the screenshot
// flash), the
// rebindable keyboard/mouse/wheel actions, the fixed Escape hatch,
// scene-advance keys, the weapon/powerup number rows, and the blur/visibility
// auto-pause. GameScreen builds one per run effect; detach() unwires
// everything on teardown.

import { fieldLive, localHero, localScreen } from "../local-seat.ts";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  canOpenInventory,
  canPauseGame,
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
import { playUiSound } from "../sfx/ui.ts";
import { weaponAlternatives } from "./hud-model.ts";
import type { CharTab } from "./SceneOverlays.tsx";
import type { InputQueues } from "./player-input.ts";

import { runCommand, runCommandOk } from "../run-commands.ts";

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
  /** The live pickup-card element + what a tap over it does (see GameScreen) —
   * equip a tap-to-equip upgrade, or flick any other card away, instead of
   * jumping. The card never takes pointer events itself, so a HOLD over it
   * still anchors the virtual dpad. */
  pickupCardElRef: MutableRefObject<HTMLButtonElement | null>;
  pickupCardTapRef: MutableRefObject<(() => void) | null>;
  /** The live achievement-toast element (null while no badge is celebrating).
   * The banner is inert for the same reason the pickup card is — it lands in
   * the thumb's dpad zone — so the canvas routes a tap over it here instead:
   * `openAchievements` raises the trophy shelf. */
  achievementToastElRef: MutableRefObject<HTMLDivElement | null>;
  /** Raise the ACHIEVEMENTS shelf (pausing the run) — see use-run-shelf.ts. */
  openAchievements: () => void;
  /** Toggle that same shelf: the ACHIEVEMENTS bind's own verb. */
  toggleAchievements: () => void;
  /** Live mirror of whether the shelf is up: while it is, it owns the
   * keyboard (its own listener walks the rows and closes). */
  achievementsOpenRef: MutableRefObject<boolean>;
  /** The live screenshot-flash element (null while none is up). Inert for the
   * same reason the two above are, so the canvas routes a tap over the
   * miniature here: `openShots` raises the gallery on that picture. */
  shotFlashElRef: MutableRefObject<HTMLDivElement | null>;
  /** Raise the SCREENSHOT gallery (pausing the run) — see use-run-shelf.ts. */
  openShots: () => void;
  /** Live mirror of whether that gallery is up — it owns the keyboard too. */
  shotsOpenRef: MutableRefObject<boolean>;
  /**
   * THE ROAD IS UP — a DRIVE owns the whole screen and the whole of the input
   * (pwa/src/game/drive-screen/), so this layer cedes to it exactly as it cedes
   * to a shelf.
   *
   * It has to be ceded rather than merely ignored. The departing run is still
   * mounted under an interlude (that is the point — its mount is never torn
   * down and rebuilt around a minute of road), so without this every key the
   * road reads ALSO reaches the run: the screenshot bind took two pictures,
   * WASD queued jumps and steering against a frozen hero, and the pause bind
   * raised a screen on a run nobody could see.
   */
  driveOpenRef?: MutableRefObject<unknown>;
  /** The SCREENSHOT bind's own verb: take one, captioned by the caller. */
  takeScreenshot: () => void;
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
  /** Pick which face of the character screen the `inventory` freeze shows.
   * The INVENTORY key means the BAG — the stat sheet is the portrait's. */
  setCharTab: Dispatch<SetStateAction<CharTab>>;
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
    pickupCardTapRef,
    achievementToastElRef,
    openAchievements,
    toggleAchievements,
    achievementsOpenRef,
    shotFlashElRef,
    openShots,
    shotsOpenRef,
    driveOpenRef,
    takeScreenshot,
    userPausedRef,
    dialogueRevealRef,
    introRevealRef,
    cutsceneRevealRef,
    weaponMenuOpenRef,
    setWeaponMenuOpen,
    setCharTab,
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

  // Did the tap land over this (pointer-events:none) overlay element? Both the
  // pickup card and the achievement toast park in the lower centre — where a
  // thumb anchors the virtual dpad — so neither may take the press itself; the
  // canvas hit-tests them here and acts on the one the tap fell inside. Reads
  // `pointer` below, which is assigned before any tap can arrive.
  const tapHits = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    const box = el.getBoundingClientRect();
    const view = canvas.getBoundingClientRect();
    const px = view.left + pointer.state.x;
    const py = view.top + pointer.state.y;
    return (
      px >= box.left && px <= box.right && py >= box.top && py <= box.bottom
    );
  };

  // The control scheme (see settings.ts): a touch anchors a virtual dpad
  // where it lands — dragging away from the anchor walks in that
  // direction, releasing stops. Any touch tap jumps: a quick solo tap, or
  // the other hand tapping while the first finger steers. A mouse follows
  // the steering setting — cursor-follow mode turns clicks into item use
  // (Space jumps); AIM & SHOOT makes the left button the trigger (read
  // straight off pointer.state.held by the sim loop).
  const pointer = trackPointer(canvas, {
    onTap: ({ fingers, pointerType }) => {
      // The DEATH SCENE: a tap anywhere skips the tableau and raises the YOU
      // DIED modal straight away (the engine flips to `defeat` next tick, and
      // refuses the skip inside its opening grace window). Either way the tap
      // is spent here — nothing else acts while the hero lies dead.
      if (state.phase === "dying") {
        runCommandOk(state, "skipDeathScene");
        return;
      }
      // THE BOSS DEATH RITE: the same bargain. A tap gets on with it, and the
      // engine refuses the skip inside its own grace window — which is what
      // stops the finger that was steering when the boss fell from throwing the
      // finisher away before it has played a frame.
      if (state.phase === "bossDeath") {
        runCommandOk(state, "skipBossDeath");
        return;
      }
      // Remember where the tap landed (CSS px): the sim loop checks it
      // against the merchant before letting it act as a jump.
      queues.shopTapRef.current = { x: pointer.state.x, y: pointer.state.y };
      // A single-finger tap landing ON the pickup card acts on the card
      // instead of jumping: it equips a tap-to-equip upgrade, and flicks any
      // other card away so it doesn't squat in the thumb zone.
      //
      // The card is pointer-events:none in every state, INCLUDING the clickable
      // upgrade — it parks in the lower centre of the screen, which is exactly
      // where a thumb anchors the virtual dpad, and a card that took the press
      // itself left steering dead for its whole five seconds on screen (a real
      // "why won't it move" on a phone). Routing the tap through the canvas
      // gives the card its button back while a HOLD steers straight through it.
      if (fingers === 1) {
        const tapCard = pickupCardTapRef.current;
        if (tapCard && tapHits(pickupCardElRef.current)) {
          tapCard();
          return; // swallow the jump — the tap was spent on the card
        }
        // The ACHIEVEMENT TOAST rides the same strip and is inert for the same
        // reason, so a tap on the badge opens the trophy shelf (which pauses
        // the run) rather than jumping. A HOLD still steers straight through
        // it — only a tap is spent here.
        if (tapHits(achievementToastElRef.current)) {
          openAchievements();
          return;
        }
        // …and the SCREENSHOT FLASH, which is the same arrangement one more
        // time: pressing the miniature is a request to LOOK at the picture, so
        // it freezes the run and opens the gallery on it.
        if (tapHits(shotFlashElRef.current)) {
          openShots();
          return;
        }
      }
      // Only touch/pen taps jump: a mouse click uses an item (cursor-follow)
      // or pulls the trigger (AIM & SHOOT) — desktop jumps live on Space.
      if (pointerType !== "mouse") {
        queues.jumpQueuedRef.current = true;
      }
    },
    onPress: ({ pointerType }) => {
      // Skip the death tableau on a press (a press-and-hold never fires
      // onTap) — pressing anywhere brings up the modal, once the engine's
      // grace window has passed.
      if (state.phase === "dying") {
        runCommandOk(state, "skipDeathScene");
        return;
      }
      if (state.phase === "bossDeath") {
        runCommandOk(state, "skipBossDeath");
        return;
      }
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
        if (fieldLive(state)) queues.jumpQueuedRef.current = true;
        return;
      case "useAbility":
        // Spend the oldest powerup — the engine no-ops off the field.
        queues.useItemQueuedRef.current = true;
        return;
      case "weaponMenu":
        if (fieldLive(state)) {
          setWeaponMenuOpen((open) => !open);
          playUiSound(synth, "confirm");
        }
        return;
      case "inventory":
        // Opens mid-run AND during an elite/boss arrival scene (the engine
        // gate) — the stare-down is when a fitting weapon gets equipped.
        if (canOpenInventory(state, localHero(state))) {
          setCharTab("bag");
          runCommand(state, "openInventory");
          playUiSound(synth, "confirm");
        } else if (localScreen(state) === "inventory") {
          runCommand(state, "closeInventory");
          playUiSound(synth, "back");
        }
        bumpUi();
        return;
      case "map":
        // Toggles the fog-of-war level map (same freeze as the bag).
        if (fieldLive(state)) {
          runCommand(state, "openMap");
          playUiSound(synth, "confirm");
          bumpUi();
        } else if (localScreen(state) === "map") {
          runCommand(state, "closeMap");
          playUiSound(synth, "back");
          bumpUi();
        }
        return;
      case "achievements":
        // The trophy shelf over the run — the shelf pauses it on the way up
        // and thaws it on the way down (use-achievements-shelf.ts). Only
        // reached while the shelf is DOWN: while it is up it owns the
        // keyboard, and its own listener closes it.
        toggleAchievements();
        return;
      case "screenshot":
        // Never freezes the run and never refuses: a picture of the death
        // splash, the victory screen, a cutscene or the pause menu is as
        // wanted as one of the fight. The capture is asynchronous and the
        // flash it raises is a receipt, not a screen.
        takeScreenshot();
        return;
      case "pause":
        // The bound key reads the same rule Escape does — including over an
        // in-world dialogue (canPauseGame).
        if (canPauseGame(state, localHero(state))) {
          pause(true);
          playUiSound(synth, "confirm");
        } else if (localScreen(state) === "paused") {
          resume();
          playUiSound(synth, "back");
        }
        return;
      case "medkit":
        // Spend from the consumable dock; the engine no-ops when nothing is
        // held or there's nothing to top up, so an idle press is free.
        if (fieldLive(state) && !weaponMenuOpenRef.current)
          queues.useMedkitQueuedRef.current = true;
        return;
      case "stamina":
        if (fieldLive(state) && !weaponMenuOpenRef.current)
          queues.useStaminaQueuedRef.current = true;
        return;
      case "repair":
        if (fieldLive(state) && !weaponMenuOpenRef.current)
          queues.useRepairQueuedRef.current = true;
        return;
      case "riftSeam":
        // TEAR A SEAM HOME. Sent as a run command because the run may be
        // simulating elsewhere, and the engine holds every refusal (no tool,
        // one already standing, already home — src/game/rift-tool.ts), so an
        // idle press is free exactly like the dock's are.
        if (fieldLive(state) && !weaponMenuOpenRef.current) {
          if (runCommandOk(state, "tearSeam")) playUiSound(synth, "confirm");
        }
        return;
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // The DEATH SCENE: the keyboard is INERT while the hero lies dead. Only a
    // click/tap skips the tableau — a hand still resting on WASD (or the walk
    // modifier) when he fell fires keydown repeats every few frames, which
    // threw the YOU DIED modal up the instant he hit the ground and ate the
    // whole beat. Swallowing the key here also keeps a bound action (a powerup,
    // the medkit) from queueing itself against a corpse.
    // …with ONE exception, and it is the whole point of the key: the death
    // tableau is a moment a player wants a picture of. The screenshot bind
    // neither freezes the run nor raises a screen, so letting it through
    // cannot eat the beat the guard exists to protect.
    if (driveOpenRef?.current) return;
    if (state.phase === "dying") {
      if (actionForCode(event.code, getSettings().keybindings) === "screenshot")
        takeScreenshot();
      return;
    }
    // The level-up chooser (and the respec screen it shares parts with) owns
    // the keyboard while it's up: LevelUpOverlay runs its own listener
    // (arrows/WASD move the cursor, Enter/Space spend a point, Escape banks
    // the rest). Ceding here keeps those keys from steering or queuing a jump.
    const screen = localScreen(state);
    if (screen === "levelup" || screen === "respec") return;
    // The ACHIEVEMENTS shelf owns the keyboard the same way while it is up:
    // it walks its own rows and closes itself on ESC or the achievements bind.
    // Ceding here keeps that press from also resuming the run under it. The
    // SCREENSHOT gallery is the same shelf discipline (use-run-shelf.ts) and
    // cedes on the same line.
    if (achievementsOpenRef.current || shotsOpenRef.current) return;
    if (driveOpenRef?.current) return;
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
        fieldLive(state)
      ) {
        event.preventDefault(); // arrow keys must not scroll the page
      }
    }
    if (event.code === binds.walk) {
      queues.walkingRef.current = true;
    }
    // The JUMP bind is also the HANDBRAKE at a wheel, and a lever is HELD —
    // so its down-state is tracked here beside the walk modifier, while the
    // one-shot jump edge is still banked below. Only `readHumanInput` decides
    // which of the two a press means, and it decides on whether the player is
    // in a car.
    if (event.code === binds.jump) {
      queues.handbrakeKeyRef.current = true;
    }
    if (event.repeat) return;
    // Space and Enter both turn the page through any waiting scene (cutscene,
    // intro, title card, in-world dialogue). Space alone doubles as jump once
    // the run is live; Enter is scene-only so it never fires an action.
    const advanceKey = event.code === "Space" || event.key === "Enter";
    // …but only while the scene actually has the stage. A screen the player
    // raised OVER one (the pause menu on an in-world dialogue, the bag on an
    // arrival stare-down) owns the keyboard, and a page turned blind behind it
    // is a line of speech the player never saw.
    const inScene =
      screen === undefined &&
      (state.phase === "cutscene" ||
        state.phase === "intro" ||
        state.phase === "outro" ||
        state.phase === "title" ||
        state.phase === "dialogue");
    if (advanceKey && inScene) {
      event.preventDefault();
      if (state.phase === "cutscene") {
        // Two-step like the dialogue crawl: finish the line, then turn it.
        if (!cutsceneRevealRef.current.done) {
          cutsceneRevealRef.current.skip();
        } else {
          runCommand(state, "tapCutscene");
        }
      } else if (state.phase === "intro") {
        // Two-step like the dialogue crawl: finish the reveal, then turn the
        // page (past the last page the engine flashes the level name).
        if (!introRevealRef.current.done) {
          introRevealRef.current.skip();
        } else {
          runCommand(state, "advanceIntro");
          playUiSound(synth, "move");
        }
        bumpUi();
      } else if (state.phase === "outro") {
        // The epilogue turns like the intro (the overlay shares the reveal
        // ref — only one of the two is ever mounted at a time).
        if (!introRevealRef.current.done) {
          introRevealRef.current.skip();
        } else {
          runCommand(state, "advanceOutro");
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
          runCommand(state, "advanceDialogue");
          playUiSound(synth, "move");
        }
        bumpUi();
      }
    } else if (event.key === "Escape") {
      // Escape is the fixed, non-rebindable escape hatch: it skips a running
      // scene, closes an open overlay, and pauses/resumes the live run — the
      // one control a rebind can never steal.
      if (state.phase === "cutscene") {
        runCommand(state, "skipCutscene");
        playUiSound(synth, "back");
      } else if (state.phase === "intro") {
        runCommand(state, "skipIntro");
        playUiSound(synth, "back");
        bumpUi();
      } else if (state.phase === "outro") {
        runCommand(state, "skipOutro");
        playUiSound(synth, "back");
        bumpUi();
      } else if (screen === "inventory") {
        runCommand(state, "closeInventory");
        playUiSound(synth, "back");
        bumpUi();
      } else if (screen === "shop") {
        runCommand(state, "closeShop");
        playUiSound(synth, "back");
        bumpUi();
      } else if (screen === "cache") {
        runCommand(state, "closeCache");
        playUiSound(synth, "back");
        bumpUi();
      } else if (screen === "map") {
        runCommand(state, "closeMap");
        playUiSound(synth, "back");
        bumpUi();
      } else if (screen === "questLog") {
        runCommand(state, "closeQuestLog");
        playUiSound(synth, "back");
        bumpUi();
      } else if (screen === "paused") {
        resume();
        playUiSound(synth, "back");
      } else if (canPauseGame(state, localHero(state))) {
        // Mid-run, or over an in-world DIALOGUE: a scene runs for as many pages
        // as it was written for, and ESCAPE is the control a player reaches for
        // when life interrupts — so it raises the menu over the speaker rather
        // than doing nothing at all. The scene keeps the stage underneath and
        // takes it back on RESUME.
        pause(true);
        playUiSound(synth, "confirm");
      }
    } else if (actionForCode(event.code, binds)) {
      // A rebindable action key fired (see keybindings.ts / runBinding).
      event.preventDefault();
      runBinding(actionForCode(event.code, binds) as BindableAction);
    } else if (fieldLive(state) && /^[1-9]$/.test(event.key)) {
      // The weapon-slot / powerup-dock number keys stay fixed (a contextual
      // range, not a single bind): 1-4 equip a listed alternative while the
      // weapon menu is up, otherwise 1/2/3 fire the matching powerup slot.
      const n = Number(event.key) - 1;
      if (weaponMenuOpenRef.current) {
        const alt = weaponAlternatives(state)[n];
        if (alt && runCommandOk(state, "equipFromInventory", alt.index)) {
          playUiSound(synth, "equip");
          setWeaponMenuOpen(false);
          bumpUi();
        }
      } else if (
        n <= 2 &&
        localHero(state).heldAbilities[n] &&
        !localHero(state).abilities.some((a) => a.slot === n)
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
    if (event.code === binds.jump) {
      queues.handbrakeKeyRef.current = false;
    }
  };
  // A mouse button / wheel notch can be bound to any discrete action too (see
  // keybindings.ts). Both no-op unless the player bound a pointer control —
  // the shipped scheme is all-keyboard, so there's no default pointer capture
  // to fight the canvas steering.
  const onMouseDown = (event: MouseEvent) => {
    if (achievementsOpenRef.current || shotsOpenRef.current) return;
    if (driveOpenRef?.current) return;
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
    if (achievementsOpenRef.current || shotsOpenRef.current) return;
    if (driveOpenRef?.current) return;
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
    queues.handbrakeKeyRef.current = false;
    pause();
  };
  // Tab hidden (mobile app-switch, backgrounded tab): same auto-pause. Both
  // signals fire in different browsers, and pause() is idempotent.
  //
  // A genuine backgrounding is a DELIBERATE user action, so the pause must
  // STICK — even under the autopilot's input loop (DEVELOPER → PLAYGROUND → BOT VIEW),
  // which otherwise clears auto-pauses and would keep the run going in the
  // background. Latch it like a hand-opened pause so the bot leaves it be
  // (the ordering matters: `onBlur` may have already raised the hero's
  // `paused` screen, so latch directly rather than relying on pause()'s
  // guard). The
  // ONE exception is a headless `?bot=` playtest (a bot with no BOT VIEW
  // watcher): it can report itself hidden spuriously and must keep running,
  // so it leaves the pause clearable — the same reason the bot loop clears
  // these at all.
  const isHeadlessPlaytest = bot !== null && !botView;
  const onVisibility = () => {
    if (!document.hidden) return;
    pause();
    if (!isHeadlessPlaytest && localScreen(state) === "paused") {
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
