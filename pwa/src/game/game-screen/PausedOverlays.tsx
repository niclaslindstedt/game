// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PAUSE MENU'S WIRING — the verbs its rows carry and the panels it places.
//
// The pause screen itself is CONTENT (`content/menus/pause.yaml`, and the
// demo's own confirm beside it in `demo_exit.yaml`): what the box says, which
// rows are in it, what each one is called and what it sounds like are authored,
// and `pwa/src/game/menus/` draws them. What is left here is the half a YAML
// file cannot carry — the run, the music, the autopilot session, the character
// on disk — handed over as a table of verbs by name and a table of panels by
// name.
//
// That split is the whole point. `resumeRun` is a name, so a mod's own button
// can carry it; the AUTO PILOT pickers are a panel, so a mod can move them,
// gate them or leave them out; and neither needs a line of code here to change.

import { useState, type MutableRefObject, type ReactNode } from "react";

import { localHero, localScreen, localSeat } from "../local-seat.ts";

import {
  AUTOPILOT,
  autopilotDrainPerSecond,
  captureBuildSnapshot,
  equipmentName,
  vaultContents,
  type Difficulty,
  type GameState,
} from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";

import { hasClearedLevel, type Character } from "../characters.ts";
import type { GameAssets, RelicTier, Sprites } from "../assets.ts";
import type { HudActions } from "../hud/context.ts";
import type { MenuPanels } from "../menus/widgets.ts";
import { TIER_COLORS } from "../tiers.ts";
import { RunVaultScreen } from "../VaultScreen.tsx";
import {
  AutopilotStartModal,
  AutopilotTrashConfirm,
  type AutopilotRung,
} from "../overlays/AutopilotOverlay.tsx";
import { CoinStoreOverlay } from "../overlays/CoinStoreOverlay.tsx";
import { coinStoreAvailable } from "../store.ts";
import { resumeMusic } from "../music/index.ts";
import type { SessionLink } from "../net/session-link.ts";
import { SessionPanel } from "./SessionPanel.tsx";
import {
  finishAutopilotRide,
  type useAutopilotSession,
} from "./autopilot-director.ts";
import { useRunStore, type RunBuy } from "./run-store.ts";

import { runCommand, runCommandOk } from "../run-commands.ts";

/** What the pause menu contributes to the run's menus: verbs by name, panels by
 * name, and the one fact its rows are gated on. */
export type PauseMenuWiring = {
  actions: HudActions;
  panels: MenuPanels;
  /** This run may be handed to the AUTO PILOT at all — published as
   * `menu.autopilotOffered`, which is what the AUTO PILOT row is gated on. */
  autopilotOffered: boolean;
};

export function usePauseMenu({
  state,
  assets,
  demo,
  botView,
  hardcore,
  userPausedRef,
  characterRef,
  difficulty,
  autopilot,
  onQuit,
  onExitToMenu,
  bumpUi,
  sessionLink,
}: {
  /** Null before the run is up — the hook is called every render, so it has to
   * survive that; every verb below refuses on it. */
  state: GameState | null;
  /** Null while they load — the hook is called every render, above the screen's
   * own loading return, so it has to survive that too. */
  assets: GameAssets | null;
  demo: boolean;
  botView: boolean;
  /** The active hero is hardcore — the AUTO PILOT row is withheld (permadeath
   * makes an unattended ride too risky; see the flight director). */
  hardcore: boolean;
  /** Latched viewer pause — cleared on resume so the bot loop flies again. */
  userPausedRef: MutableRefObject<boolean>;
  characterRef: MutableRefObject<Character>;
  difficulty: Difficulty;
  /** The AUTO PILOT session housing (see useAutopilotSession). */
  autopilot: ReturnType<typeof useAutopilotSession>;
  /** Abandon the demo for good (no parked run to keep). */
  onQuit: () => void;
  /** Leave to the menu but keep the frozen run in memory — CONTINUE resumes
   * it. The local hero's `paused` screen is already up here. */
  onExitToMenu: (state: GameState) => void;
  bumpUi: () => void;
  /** The session behind this run, when there is one — the pause menu's own
   * roster row (see SessionPanel). */
  sessionLink?: SessionLink | null;
}): PauseMenuWiring {
  // The in-run COIN STORE's buy runner (the AUTO PILOT picker's STORE button):
  // banks the pack onto the hero and tops up the live purse.
  const buyCoins = useRunStore({ state, characterRef, bumpUi });
  // The START picker is raised from the AUTO PILOT row and stacks over the
  // window (its own backdrop dismisses it back to the pause menu).
  const [picking, setPicking] = useState(false);
  // The in-run COIN STORE stacks over the picker (its STORE button), so closing
  // it drops back onto the rungs with the topped-up purse. Only where this
  // build has a store at all — native, or the FORCE STORE dev switch.
  const [shopping, setShopping] = useState(false);
  // The LAST CALL: a rung picked while the LOST & FOUND still holds something
  // parks its speed here instead of flying, and the confirm stacks over the
  // picker until the player either buys back or accepts the loss.
  const [confirming, setConfirming] = useState<number | null>(null);
  // The run's own LOST & FOUND, raised from that confirm (BUY BACK) — the ride
  // about to be engaged is what empties the vault, so the buy-back has to be
  // reachable from in here rather than only from the title menu.
  const [browsingVault, setBrowsingVault] = useState(false);

  // A ride can be offered on this run at all? Not in the demo (a showcase
  // nobody is flying), not in BOT VIEW (the engine autopilot is already flying
  // it), and never for a hardcore hero: the flight director retires a hero
  // mid-ride, so handing an unattended bot the controls could permakill the
  // run. A hardcore hero is always flown by hand.
  const autopilotOffered = !demo && !botView && !hardcore;
  const active = state?.autopilot.active === true;

  const resumeRun = () => {
    if (!state || localScreen(state) !== "paused") return;
    userPausedRef.current = false;
    // A hero carrying unspent points (an AUTO PILOT ride stopped from here
    // hands its allocations back as pending) drops straight back into play —
    // the points stay banked, and the HUD's points pip carries the reminder.
    runCommand(state, "resumeGame");
    resumeMusic();
    bumpUi();
  };

  // Leaving to the menu with a ride still flying: end it first (refund the
  // flight's stat/talent picks) so the parked run isn't stranded with the bot's
  // allocations — then hand the frozen state up to be parked.
  const exitToMenu = () => {
    if (!state) return;
    finishAutopilotRide({
      state,
      characterRef,
      sessionRef: autopilot.sessionRef,
      syncView: autopilot.syncView,
    });
    onExitToMenu(state);
  };

  const stopRide = () => {
    if (!state) return;
    // End the ride and hand the flight's stat/talent picks back as unspent
    // points; they stay banked across the resume, and the HUD's points pip is
    // what reminds the player to spend them.
    finishAutopilotRide({
      state,
      characterRef,
      sessionRef: autopilot.sessionRef,
      syncView: autopilot.syncView,
    });
    bumpUi();
  };

  const startRide = (speed: number) => {
    if (!state || localScreen(state) !== "paused") return;
    if (!runCommandOk(state, "startAutopilot", speed)) return;
    // A NEW flight, a new LOST & FOUND: whatever the last one threw away and
    // the player never bought back is trashed here, for good (items/vault.ts
    // `clearVault`). The vault is a holding pen for one flight's discards,
    // never a second stash.
    runCommand(state, "clearVault");
    // Remember the chosen rung on the session so the in-HUD panel shows it and
    // the next lap re-arms the meter at that speed.
    autopilot.setSpeed(speed);
    // Engaged on already-cleared ground? Pin the session to this level — the
    // ride farms it instead of advancing the campaign. Hand the ride the hero's
    // pre-flight build so the STOP can give its stat/talent allocations back
    // (keeping the ride harmless to the player's own spec).
    autopilot.engage(
      hasClearedLevel(characterRef.current, state.level.id, difficulty)
        ? state.level.id
        : null,
      captureBuildSnapshot(state, localHero(state)),
      localHero(state).level,
    );
    autopilot.setHistoryOpen(false);
    runCommand(state, "muteDialogue");
    userPausedRef.current = false;
    runCommand(state, "resumeGame");
    resumeMusic();
    bumpUi();
  };

  /** Engage — or raise the last call first, if a ride would bin the vault. */
  const pickSpeed = (speed: number) => {
    if (state && vaultContents(localHero(state).vault).length > 0) {
      setConfirming(speed);
      return;
    }
    setPicking(false);
    startRide(speed);
  };

  const actions: HudActions = {
    resumeRun,
    exitToMenu,
    quitRun: onQuit,
    openAutopilot: () => setPicking(true),
    stopAutopilot: stopRide,
    useCleanSlate: () => {
      // The chooser IS the confirmation: `beginRespec` refunds into a pool the
      // player then has to re-place, and it cannot be committed until every
      // point is back down. There is nothing to warn about that the next screen
      // does not say better.
      if (state && runCommandOk(state, "spendCleanSlate")) bumpUi();
    },
  };

  const panels: MenuPanels = {};
  if (state && assets && sessionLink) {
    panels.sessionPanel = () => (
      <SessionPanel
        font={assets.font}
        link={sessionLink}
        state={state}
        sprites={assets.sprites}
        mySeat={sessionLink.spectating ? null : localSeat()}
        // ASK FOR A TRADE, from the roster row. The press has to leave the
        // pause screen first — `requestTrade` refuses a hero with any other
        // screen up, the same "be standing on the field to start this" rule the
        // table itself applies — so it resumes exactly as the RESUME row does
        // and sends the verb behind it. Nothing opens here: the teammate
        // answers on their own HUD. A spectator holds no seat and gets no
        // button.
        onTrade={
          sessionLink.spectating
            ? undefined
            : (seat) => {
                if (localScreen(state) !== "paused") return;
                userPausedRef.current = false;
                runCommand(state, "resumeGame");
                runCommandOk(state, "requestTrade", seat);
                resumeMusic();
                bumpUi();
              }
        }
      />
    );
  }
  if (state && assets && autopilotOffered) {
    panels.autopilotPickers = () => (
      <AutopilotPickers
        state={state}
        font={assets.font}
        relicFonts={assets.relicFonts}
        sprites={assets.sprites}
        active={active}
        picking={picking}
        shopping={shopping}
        confirming={confirming}
        browsingVault={browsingVault}
        onPick={pickSpeed}
        onStore={() => setShopping(true)}
        onCloseStore={() => setShopping(false)}
        onClosePicker={() => setPicking(false)}
        onBrowseVault={() => setBrowsingVault(true)}
        onCloseVault={() => setBrowsingVault(false)}
        onConfirm={() => {
          const speed = confirming;
          setConfirming(null);
          setPicking(false);
          if (speed !== null) startRide(speed);
        }}
        onCancelConfirm={() => setConfirming(null)}
        onBuyCoins={buyCoins}
        bumpUi={bumpUi}
      />
    );
  }

  return { actions, panels, autopilotOffered };
}

/**
 * The AUTO PILOT's own stack, as one panel: the speed picker, the coin store
 * behind its STORE button, the last call before a ride bins the LOST & FOUND,
 * and the vault browser that confirm's BUY BACK opens.
 *
 * It is a WIDGET rather than authored rows because every one of these is a live
 * price list — what a second of flight costs at each rung, what the purse funds,
 * what the vault is holding right now. Content places it, gates it and decides
 * whether it is on the pause menu at all.
 */
function AutopilotPickers({
  state,
  font,
  relicFonts,
  sprites,
  active,
  picking,
  shopping,
  confirming,
  browsingVault,
  onPick,
  onStore,
  onCloseStore,
  onClosePicker,
  onBrowseVault,
  onCloseVault,
  onConfirm,
  onCancelConfirm,
  onBuyCoins,
  bumpUi,
}: {
  state: GameState;
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  active: boolean;
  picking: boolean;
  shopping: boolean;
  confirming: number | null;
  browsingVault: boolean;
  onPick: (speed: number) => void;
  onStore: () => void;
  onCloseStore: () => void;
  onClosePicker: () => void;
  onBrowseVault: () => void;
  onCloseVault: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onBuyCoins: RunBuy;
  bumpUi: () => void;
}): ReactNode {
  const coins = localHero(state).coins;
  // Read live, so buying a piece back while the confirm is up shrinks it under
  // the confirm.
  const banked = vaultContents(localHero(state).vault);
  const best = banked[0];
  // Price the ride at the moment of enabling: every offered speed rung with its
  // per-game-second cost, the game-time the purse funds at it, and whether the
  // purse can cover a second of it (startAutopilot refuses the unaffordable).
  const rungs: AutopilotRung[] = AUTOPILOT.speeds.map((speed) => {
    const cost = autopilotDrainPerSecond(speed);
    return {
      speed,
      cost,
      gameSeconds: Math.floor(coins / cost),
      affordable: coins >= cost,
    };
  });
  const storeOpen = coinStoreAvailable();
  return (
    <>
      {browsingVault && (
        <RunVaultScreen
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          onChange={bumpUi}
          onClose={onCloseVault}
        />
      )}
      {!active && picking && (
        <AutopilotStartModal
          font={font}
          sprites={sprites}
          coins={coins}
          rungs={rungs}
          onPick={onPick}
          onStore={storeOpen ? onStore : undefined}
          onClose={onClosePicker}
        />
      )}
      {!active && picking && shopping && (
        <CoinStoreOverlay
          font={font}
          sprites={sprites}
          coins={coins}
          onBuy={onBuyCoins}
          onClose={onCloseStore}
        />
      )}
      {!active && confirming !== null && banked.length > 0 && (
        <AutopilotTrashConfirm
          font={font}
          sprites={sprites}
          count={banked.length}
          best={best ? equipmentName(best) : ""}
          bestColor={best ? TIER_COLORS[best.tier] : "#e6e8eb"}
          onBuyBack={onBrowseVault}
          onConfirm={onConfirm}
          onClose={onCancelConfirm}
        />
      )}
    </>
  );
}
