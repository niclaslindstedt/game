// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PANELS THE RUN'S WINDOWS PLACE — the bag grid, the map, the stall, the
// chooser, the two conversation boxes, the trade table.
//
// Every one of these was mounted with a `hud.screen === "…"` test beside it
// until the windows became content. Now `content/menus/<id>.yaml` decides which
// screen raises which window and what furniture is around it, and this file is
// the other half of that seam: the code-backed insides, by name, each built with
// the run, the assets and the verbs it needs.
//
// WHY A THUNK PER PANEL rather than a component per window. A panel is built
// only when the window that names it is actually drawn, so the eleven that are
// not on screen cost nothing — and a panel this run has no answer for (a
// session roster with no session) is simply absent, which the renderer treats
// as a row that draws nothing. That is one fewer gate than authoring the same
// fact twice.
//
// THE VERBS ARE THE ENGINE'S. Every close, pick, accept and advance below is a
// run command; none of these panels owns a rule. Which is what lets a mod
// replace the window around one — or the whole window — without any rule
// changing with it.

import type { GameState } from "@game/core";

import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { CachePanel } from "../CachePanel.tsx";
import { CharacterSheet } from "../CharacterSheet.tsx";
import { CompanionPanel } from "../CompanionPanel.tsx";
import { playTypewriterHaptic } from "../haptics.ts";
import { InventoryPanel } from "../InventoryPanel.tsx";
import type { MenuPanels } from "../menus/widgets.ts";
import type { SessionLink } from "../net/session-link.ts";
import { LevelUpOverlay } from "../overlays/LevelUpOverlay.tsx";
import { MapOverlay } from "../overlays/MapOverlay.tsx";
import { QuestLogOverlay } from "../overlays/QuestLogOverlay.tsx";
import { QuestOverlay } from "../overlays/QuestOverlay.tsx";
import { RespecOverlay } from "../overlays/RespecOverlay.tsx";
import { TalkOverlay } from "../overlays/TalkOverlay.tsx";
import { TradeOverlay } from "../overlays/TradeOverlay.tsx";
import { playUiSound } from "../sfx/ui.ts";
import { ShopPanel } from "../ShopPanel.tsx";
import { localHero } from "../local-seat.ts";
import { tradePartner } from "@game/core";

import { runCommand, runCommandOk } from "../run-commands.ts";

/** Which half of the character screen the app is showing — the two faces of the
 * hero's one `inventory` screen. */
export type CharTab = "bag" | "stats";

export function screenPanels({
  state,
  assets,
  font,
  heroName,
  hardcore,
  onCharTab,
  levelupByPress,
  demoLevelupFocus,
  sessionLink,
  bumpUi,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** The roster hero playing this run — the sheet's name plate and the name
   * over every page he speaks (the engine state carries a build, never a
   * name). */
  heroName: string;
  hardcore: boolean;
  /** Show the OTHER face of the character screen. Which face is SHOWING is not
   * a prop: it is `menu.charBag` / `menu.charStats`, and the window's own rows
   * are gated on them (`content/menus/inventory.yaml`). */
  onCharTab: (tab: CharTab) => void;
  /** The level-up chooser now up is one the PLAYER opened (the HUD's points
   * pip), not one the ding raised — so it skips its reveal lockout. */
  levelupByPress: boolean;
  /** HOW TO PLAY: the stat the autopilot is about to tap (null outside the
   * demo) — lights the chooser's button. */
  demoLevelupFocus: string | null;
  /** The session behind this run, for the trade table's partner name — the
   * engine's Player carries none. */
  sessionLink?: SessionLink | null;
  bumpUi: () => void;
}): MenuPanels {
  /** Close a window with the engine verb that lowers it, and the sound every
   * back press in this game makes. */
  const close =
    (
      command:
        | "closeInventory"
        | "closeShop"
        | "closeCache"
        | "closeMap"
        | "closeQuestLog"
        | "closeCompanionPanel",
    ) =>
    () => {
      runCommand(state, command);
      playUiSound(synth, "back");
      bumpUi();
    };
  const blip = () => {
    playUiSound(synth, "blip");
    playTypewriterHaptic();
  };

  return {
    inventoryPanel: () => (
      <InventoryPanel
        state={state}
        font={font}
        relicFonts={assets.relicFonts}
        sprites={assets.sprites}
        onChange={bumpUi}
        onClose={() => {
          // The bag's own close plays no back chirp: its cards make their own
          // noises, and the pouch button that opened it already clicked.
          runCommand(state, "closeInventory");
          bumpUi();
        }}
      />
    ),

    characterSheet: () => (
      <CharacterSheet
        state={state}
        font={font}
        sprites={assets.sprites}
        heroName={heroName}
        hardcore={hardcore}
        difficulty={state.difficulty}
        onOpenBag={() => onCharTab("bag")}
        onClose={close("closeInventory")}
      />
    ),

    shopPanel: () => (
      <ShopPanel
        state={state}
        font={font}
        relicFonts={assets.relicFonts}
        sprites={assets.sprites}
        onChange={bumpUi}
        onClose={close("closeShop")}
      />
    ),

    cachePanel: () => (
      <CachePanel
        state={state}
        font={font}
        relicFonts={assets.relicFonts}
        sprites={assets.sprites}
        onChange={bumpUi}
        onClose={close("closeCache")}
      />
    ),

    mapPanel: () => (
      <MapOverlay
        state={state}
        assets={assets}
        font={font}
        onClose={close("closeMap")}
      />
    ),

    questLogPanel: () => (
      <QuestLogOverlay
        state={state}
        assets={assets}
        font={font}
        onClose={close("closeQuestLog")}
      />
    ),

    companionPanel: () => (
      <CompanionPanel
        state={state}
        font={font}
        sprites={assets.sprites}
        onChange={bumpUi}
        onClose={close("closeCompanionPanel")}
      />
    ),

    levelupChooser: () => (
      <LevelUpOverlay
        state={state}
        font={font}
        sprites={assets.sprites}
        onChange={bumpUi}
        skipArm={levelupByPress}
        demoFocusStat={demoLevelupFocus}
      />
    ),

    respecPanel: () => (
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
    ),

    // THE TALK BOX — a conversation the player STEERS: what a bystander says,
    // and what the hero may say back. Every branch is an engine mutator.
    talkBox: () => (
      <TalkOverlay
        state={state}
        assets={assets}
        font={font}
        heroName={heroName}
        onAdvance={() => {
          runCommand(state, "advanceTalk");
          playUiSound(synth, "move");
          bumpUi();
        }}
        onPick={(index) => {
          runCommandOk(state, "pickTalkChoice", index);
          playUiSound(synth, "confirm");
          bumpUi();
        }}
        onBlip={blip}
        onClose={() => {
          runCommand(state, "closeTalk");
          playUiSound(synth, "back");
          bumpUi();
        }}
      />
    ),

    // THE ERRAND BOX — the conversation with somebody who has work for you.
    questBox: () => (
      <QuestOverlay
        state={state}
        assets={assets}
        font={font}
        heroName={heroName}
        onAdvance={() => {
          runCommand(state, "advanceQuestDialogue");
          playUiSound(synth, "move");
          bumpUi();
        }}
        onAccept={() => {
          runCommandOk(state, "acceptQuest");
          playUiSound(synth, "confirm");
          bumpUi();
        }}
        onDecline={() => {
          runCommandOk(state, "declineQuest");
          playUiSound(synth, "back");
          bumpUi();
        }}
        onTurnIn={() => {
          runCommand(state, "turnInQuest");
          playUiSound(synth, "confirm");
          bumpUi();
        }}
        onPick={(questId) => {
          runCommandOk(state, "pickQuestTopic", questId);
          playUiSound(synth, "confirm");
          bumpUi();
        }}
        onChooseReward={(index) => {
          runCommandOk(state, "chooseQuestReward", index);
          playUiSound(synth, "move");
          bumpUi();
        }}
        onBlip={blip}
        onClose={() => {
          runCommand(state, "closeQuestDialogue");
          playUiSound(synth, "back");
          bumpUi();
        }}
      />
    ),

    // THE TRADE TABLE — raised on both seats at once by `openTrade`, which only
    // an accepted REQUEST reaches (trade.ts rule 5). The overlay shows the table
    // and sends verbs; every rule is the engine's. The partner's NAME comes from
    // the session roster.
    tradeTable: () => (
      <TradeOverlay
        state={state}
        assets={assets}
        font={font}
        partnerName={partnerName(state, sessionLink)}
        bumpUi={bumpUi}
      />
    ),
  };
}

function partnerName(
  state: GameState,
  sessionLink: SessionLink | null | undefined,
): string | null {
  const seat = tradePartner(state, localHero(state));
  if (seat === null) return null;
  return sessionLink?.roster.find((entry) => entry.seat === seat)?.name ?? null;
}
