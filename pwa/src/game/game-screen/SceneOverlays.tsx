// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's phase-driven overlay stack: the prelude cutscene, the level
// intro/outro monologues, the level-name title card, in-world dialogue
// (with the arrival-scene bag shortcut), the spare/finish choice, the
// companion equip panel, the level-up chooser, the "SPELL UNLOCKED" modal,
// the respec screen, the inventory, the shop, and the full-screen map.
// Each overlay's taps play the shared UI sounds and nudge React to re-read
// the frozen engine state (bumpUi). The pause/demo-exit overlays and the
// end-of-run splashes stay in GameScreen — they reach into run/session
// machinery (music, autopilot, quit/exit) this stack doesn't know about.

import type { MutableRefObject, ReactNode } from "react";

import {
  advanceDialogue,
  advanceIntro,
  advanceOutro,
  autofillSpellSlots,
  canOpenInventory,
  closeCompanionPanel,
  closeInventory,
  closeMap,
  closeShop,
  confirmRespec,
  muteDialogue,
  skipCutscene,
  skipIntro,
  skipOutro,
  takeSpellUnlock,
  tapCutscene,
  type GameState,
} from "@game/core";

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
import { playTypewriterHaptic } from "../haptics.ts";
import { IntroOverlay, type IntroReveal } from "../overlays/IntroOverlay.tsx";
import { InventoryPanel } from "../InventoryPanel.tsx";
import { LevelUpOverlay } from "../overlays/LevelUpOverlay.tsx";
import { MapOverlay } from "../overlays/MapOverlay.tsx";
import { RespecOverlay } from "../overlays/RespecOverlay.tsx";
import { playUiSound } from "../sfx/index.ts";
import { ShopPanel } from "../ShopPanel.tsx";
import { SpellUnlockOverlay } from "../overlays/SpellUnlockOverlay.tsx";
import { TitleCard } from "../TitleCard.tsx";
import type { Hud } from "./hud-model.ts";

export function SceneOverlays({
  state,
  hud,
  assets,
  font,
  cutsceneRevealRef,
  introRevealRef,
  dialogueRevealRef,
  demoLevelupFocus,
  heroAvatar,
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
  /** The hero-avatar inventory button, re-parked over an arrival scene. */
  heroAvatar: ReactNode;
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
          revealRef={cutsceneRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onTap={() => {
            tapCutscene(state);
            playUiSound(synth, "move");
          }}
          onSkip={() => {
            skipCutscene(state);
            playUiSound(synth, "back");
          }}
        />
      )}

      {hud.phase === "intro" && (
        <IntroOverlay
          state={state}
          assets={assets}
          font={font}
          revealRef={introRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            advanceIntro(state);
            playUiSound(synth, "move");
            bumpUi();
          }}
          onSkip={() => {
            skipIntro(state);
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
          revealRef={introRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            advanceOutro(state);
            playUiSound(synth, "move");
            bumpUi();
          }}
          onSkip={() => {
            skipOutro(state);
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
          revealRef={dialogueRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            advanceDialogue(state);
            playUiSound(synth, "move");
            bumpUi();
          }}
          onMute={() => {
            muteDialogue(state);
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
      {hud.phase === "dialogue" && canOpenInventory(state) && (
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

      {hud.phase === "companion" && (
        <CompanionPanel
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            closeCompanionPanel(state);
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {hud.phase === "levelup" && (
        <LevelUpOverlay
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          demoFocusStat={demoLevelupFocus}
        />
      )}

      {/* The "SPELL UNLOCKED" modal — sits ABOVE everything (including the
          level-up chooser it usually pops over) and drains the engine's unlock
          queue one at a time. Learning a spell drops it onto an empty spell-bar
          slot (autofill). */}
      {hud.spellUnlocks.length > 0 && (
        <SpellUnlockOverlay
          key={hud.spellUnlocks[0]!}
          spellId={hud.spellUnlocks[0]!}
          font={font}
          sprites={assets.sprites}
          onDismiss={() => {
            takeSpellUnlock(state);
            autofillSpellSlots(state);
            bumpUi();
          }}
        />
      )}

      {hud.phase === "respec" && (
        <RespecOverlay
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onConfirm={() => {
            if (confirmRespec(state)) {
              playUiSound(synth, "start");
              bumpUi();
            }
          }}
        />
      )}

      {hud.phase === "inventory" && (
        <InventoryPanel
          state={state}
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            closeInventory(state);
            bumpUi();
          }}
        />
      )}

      {hud.phase === "shop" && (
        <ShopPanel
          state={state}
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            closeShop(state);
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {hud.phase === "map" && (
        <MapOverlay
          state={state}
          assets={assets}
          font={font}
          onClose={() => {
            closeMap(state);
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}
    </>
  );
}
