// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's scene overlay stack (global phases + the local hero's own
// screens): the prelude cutscene, the level
// intro/outro monologues, the level-name title card, in-world dialogue
// (with the arrival-scene bag shortcut), the spare/finish choice, the
// companion equip panel, the level-up chooser, the "SPELL UNLOCKED" modal,
// the respec screen, the two faces of the character screen (the inventory and
// the stat sheet), the shop, the full-screen map, and the quest log.
// Each overlay's taps play the shared UI sounds and nudge React to re-read
// the frozen engine state (bumpUi). The pause/demo-exit overlays and the
// end-of-run splashes stay in GameScreen — they reach into run/session
// machinery (music, autopilot, quit/exit) this stack doesn't know about.

import { localHero } from "../local-seat.ts";
import type { MutableRefObject, ReactNode } from "react";

import { canOpenInventory, type GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";

import { type GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { ChoiceOverlay } from "../overlays/ChoiceOverlay.tsx";
import { CompanionPanel } from "../CompanionPanel.tsx";
import {
  CutsceneOverlay,
  type CutsceneReveal,
} from "../overlays/CutsceneOverlay.tsx";
import {
  DialogueOverlay,
  type DialogueReveal,
} from "../overlays/DialogueOverlay.tsx";
import { CharacterSheet } from "../CharacterSheet.tsx";
import { playTypewriterHaptic } from "../haptics.ts";
import { IntroOverlay, type IntroReveal } from "../overlays/IntroOverlay.tsx";
import { InventoryPanel } from "../InventoryPanel.tsx";
import { LevelUpOverlay } from "../overlays/LevelUpOverlay.tsx";
import { MapOverlay } from "../overlays/MapOverlay.tsx";
import { QuestLogOverlay } from "../overlays/QuestLogOverlay.tsx";
import { RespecOverlay } from "../overlays/RespecOverlay.tsx";
import { playUiSound } from "../sfx/ui.ts";
import { ShopPanel } from "../ShopPanel.tsx";
import { TalentPickerOverlay } from "../overlays/TalentPickerOverlay.tsx";
import { TitleCard } from "../TitleCard.tsx";
import type { Hud } from "./hud-model.ts";

import { runCommand, runCommandOk } from "../run-commands.ts";

/** Which half of the character screen the app is showing — see the pair of
 * overlays below. */
export type CharTab = "bag" | "stats";

export function SceneOverlays({
  state,
  hud,
  assets,
  font,
  cutsceneRevealRef,
  introRevealRef,
  dialogueRevealRef,
  demoLevelupFocus,
  demoTalentFocus,
  levelupByPress,
  heroAvatar,
  charTab,
  onCharTab,
  heroName,
  hardcore,
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
  /** HOW TO PLAY: the stat the autopilot is about to tap (null outside the
   * demo) — lights the level-up chooser's button. */
  demoLevelupFocus: string | null;
  /** HOW TO PLAY: the talent the autopilot is about to tap (null outside the
   * demo) — lights the talent picker's row, the way demoLevelupFocus lights
   * the stat chooser's button. */
  demoTalentFocus: string | null;
  /** The level-up chooser now up is one the PLAYER opened (the HUD's points
   * pip), not one the ding raised — so it skips its reveal lockout. */
  levelupByPress: boolean;
  /** The hero-avatar button, re-parked over an arrival scene — the BAG copy
   * (see GameScreen): there is no pouch on screen during a stare-down, and
   * equipping a fitting weapon is the whole reason it is offered there. */
  heroAvatar: ReactNode;
  /** Which face of the character screen is showing while the engine sits in
   * its `inventory` phase — the bag, or the stat sheet. */
  charTab: CharTab;
  onCharTab: (tab: CharTab) => void;
  /** The roster hero playing this run — the sheet's name plate, the name over
   * every page he speaks, and what the `{HERO}` token in an authored line
   * resolves to (the engine state carries a build, never a name). */
  heroName: string;
  hardcore: boolean;
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

      {hud.screen === "companion" && (
        <CompanionPanel
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            runCommand(state, "closeCompanionPanel");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {hud.screen === "levelup" && (
        <LevelUpOverlay
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          skipArm={levelupByPress}
          demoFocusStat={demoLevelupFocus}
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

      {hud.screen === "respec" && (
        <RespecOverlay
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onConfirm={() => {
            if (runCommandOk(state, "confirmRespec")) {
              playUiSound(synth, "start");
              bumpUi();
            }
          }}
        />
      )}

      {/* The CHARACTER SCREEN, in its two D2 faces. Both share the hero's
          `inventory` screen — pressing the bag pouch or the hero's portrait
          parks the hero identically — and the app decides which half shows,
          so a swap between them is instant and CLOSE leaves both. */}
      {hud.screen === "inventory" && charTab === "bag" && (
        <InventoryPanel
          state={state}
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            runCommand(state, "closeInventory");
            bumpUi();
          }}
        />
      )}

      {hud.screen === "inventory" && charTab === "stats" && (
        <CharacterSheet
          state={state}
          font={font}
          sprites={assets.sprites}
          heroName={heroName}
          hardcore={hardcore}
          difficulty={state.difficulty}
          onOpenBag={() => onCharTab("bag")}
          onClose={() => {
            runCommand(state, "closeInventory");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {hud.screen === "shop" && (
        <ShopPanel
          state={state}
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            runCommand(state, "closeShop");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {hud.screen === "map" && (
        <MapOverlay
          state={state}
          assets={assets}
          font={font}
          onClose={() => {
            runCommand(state, "closeMap");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {/* THE QUEST LOG — raised by the HUD's `!` button, parking the hero on
          its own screen exactly as the map does. */}
      {hud.screen === "questLog" && (
        <QuestLogOverlay
          state={state}
          assets={assets}
          font={font}
          onClose={() => {
            runCommand(state, "closeQuestLog");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}
    </>
  );
}
