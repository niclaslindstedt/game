// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's scene overlay stack — the GLOBAL phases, and only those: the
// prelude cutscene, the level intro/outro monologues, the level-name title
// card, in-world dialogue (with the arrival-scene bag shortcut), the
// spare/finish choice, and the "SPELL UNLOCKED" talent picker.
//
// THE LOCAL HERO'S OWN SCREENS ARE NOT HERE ANY MORE. The bag, the map, the
// stall, the chooser, the pause menu and the rest are CONTENT
// (`content/menus/`), drawn by `pwa/src/game/menus/` and wired through
// `menu-panels.tsx`. What is left in this file is the beats the whole party
// watches, which are the engine's phases rather than one player's window.
//
// Each overlay's taps play the shared UI sounds and nudge React to re-read the
// frozen engine state (bumpUi). The end-of-run splashes stay in GameScreen —
// they reach into run/session machinery this stack doesn't know about.

import { runCarDamage } from "../car-condition.ts";
import { heroSoak } from "./hero-soak.ts";
import { bodyCoat } from "../render/soak-ladder.ts";
import { localHero } from "../local-seat.ts";
import type { MutableRefObject, ReactNode } from "react";

import { canOpenInventory, type GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";

import { type GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { ChoiceOverlay } from "../overlays/ChoiceOverlay.tsx";
import {
  CutsceneOverlay,
  type CutsceneReveal,
} from "../overlays/CutsceneOverlay.tsx";
import {
  DialogueOverlay,
  type DialogueReveal,
} from "../overlays/DialogueOverlay.tsx";
import { playTypewriterHaptic } from "../haptics.ts";
import { IntroOverlay, type IntroReveal } from "../overlays/IntroOverlay.tsx";
import { playUiSound } from "../sfx/ui.ts";
import { TalentPickerOverlay } from "../overlays/TalentPickerOverlay.tsx";
import { TitleCard } from "../TitleCard.tsx";
import type { Hud } from "./hud-model.ts";

import { runCommand } from "../run-commands.ts";

export function SceneOverlays({
  state,
  hud,
  assets,
  font,
  cutsceneRevealRef,
  introRevealRef,
  dialogueRevealRef,
  demoTalentFocus,
  heroAvatar,
  heroName,
  onBeginRun,
  bumpUi,
}: {
  state: GameState;
  hud: Hud;
  assets: GameAssets;
  font: PixelFont;
  /** Live mirrors of the scene crawls so the keyboard advance (controls.ts)
   * shares the tap's two-step feel: finish the reveal, then turn the page. */
  cutsceneRevealRef: MutableRefObject<CutsceneReveal>;
  introRevealRef: MutableRefObject<IntroReveal>;
  dialogueRevealRef: MutableRefObject<DialogueReveal>;
  /** HOW TO PLAY: the talent the autopilot is about to tap (null outside the
   * demo) — lights the talent picker's row, the way demoLevelupFocus lights
   * the stat chooser's button. */
  demoTalentFocus: string | null;
  /** The hero-avatar button, re-parked over an arrival scene — the BAG copy
   * (see GameScreen): there is no pouch on screen during a stare-down, and
   * equipping a fitting weapon is the whole reason it is offered there. */
  heroAvatar: ReactNode;
  /** The roster hero playing this run — the name over every page he speaks,
   * and what the `{HERO}` token in an authored line resolves to (the engine
   * state carries a build, never a name). */
  heroName: string;
  /** Leave the level-name card and drop into the run — the level music
   * rolls the moment play begins. */
  onBeginRun: () => void;
  bumpUi: () => void;
}) {
  return (
    <>
      {state.cutscene && hud.phase === "cutscene" && (
        <CutsceneOverlay
          cutscene={state.cutscene}
          assets={assets}
          font={font}
          heroName={heroName}
          car={runCarDamage(state)}
          soak={bodyCoat(heroSoak(state))}
          revealRef={cutsceneRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onTap={() => {
            runCommand(state, "tapCutscene");
            playUiSound(synth, "move");
          }}
          onSkip={() => {
            runCommand(state, "skipCutscene");
            playUiSound(synth, "back");
          }}
        />
      )}

      {hud.phase === "intro" && (
        <IntroOverlay
          state={state}
          assets={assets}
          font={font}
          heroName={heroName}
          revealRef={introRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            runCommand(state, "advanceIntro");
            playUiSound(synth, "move");
            bumpUi();
          }}
          onSkip={() => {
            runCommand(state, "skipIntro");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {hud.phase === "outro" && (
        <IntroOverlay
          variant="outro"
          state={state}
          assets={assets}
          font={font}
          heroName={heroName}
          revealRef={introRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            runCommand(state, "advanceOutro");
            playUiSound(synth, "move");
            bumpUi();
          }}
          onSkip={() => {
            runCommand(state, "skipOutro");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {hud.phase === "title" && (
        <TitleCard state={state} font={font} onBegin={onBeginRun} />
      )}

      {hud.phase === "dialogue" && (
        <DialogueOverlay
          state={state}
          assets={assets}
          font={font}
          heroName={heroName}
          revealRef={dialogueRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            runCommand(state, "advanceDialogue");
            playUiSound(synth, "move");
            bumpUi();
          }}
          onMute={() => {
            runCommand(state, "muteDialogue");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {/* An elite/boss ARRIVAL scene offers the bag: the hero's avatar
          re-parks top-left OVER the overlay's tap-to-advance backdrop
          (rendered after it, so its taps never turn the page), letting the
          player open the inventory and equip a fitting weapon before the
          fight. Other scenes (last words, thoughts, lore) stay read-only —
          the engine's canOpenInventory draws that line. */}
      {hud.phase === "dialogue" &&
        canOpenInventory(state, localHero(state)) && (
          <div className="dialogue-hud">{heroAvatar}</div>
        )}

      {hud.phase === "choice" && (
        <ChoiceOverlay
          state={state}
          assets={assets}
          font={font}
          onResolve={(spared) => {
            playUiSound(synth, spared ? "confirm" : "back");
            bumpUi();
          }}
        />
      )}

      {/* The TALENT PICKER — sits ABOVE the level-up chooser and drains the
          engine's talent-point queue one at a time. Keyed on the earning tree
          so a switch of tree re-arms the reveal. */}
      {hud.talentPoints.length > 0 && (
        <TalentPickerOverlay
          key={hud.talentPoints[0]!}
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          demoFocusTalent={demoTalentFocus}
        />
      )}
    </>
  );
}
