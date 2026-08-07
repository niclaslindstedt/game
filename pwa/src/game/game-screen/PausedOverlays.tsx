// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paused-screen overlays, wired to the run's session machinery: the demo's
// exit confirm (HOW TO PLAY taps anywhere to raise it) and the ordinary pause
// menu with its AUTO PILOT engage/stop row. Split from GameScreen because the
// wiring reaches into music, the autopilot session, and the character — the
// scene overlays proper (SceneOverlays.tsx) stay free of all that.

import { localHero, localScreen, localSeat } from "../local-seat.ts";
import { useState, type MutableRefObject } from "react";

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
import type { RelicTier, Sprites } from "../assets.ts";
import { TIER_COLORS } from "../tiers.ts";
import { RunVaultScreen } from "../VaultScreen.tsx";
import { DemoExitOverlay } from "../overlays/DemoExitOverlay.tsx";
import { resumeMusic } from "../music/index.ts";
import { PauseOverlay } from "../overlays/PauseOverlay.tsx";
import type { SessionLink } from "../net/session-link.ts";
import { SessionPanel } from "./SessionPanel.tsx";
import {
  finishAutopilotRide,
  type useAutopilotSession,
} from "./autopilot-director.ts";
import { useRunStore } from "./run-store.ts";

import { runCommand, runCommandOk } from "../run-commands.ts";

export function RunPausedOverlay({
  state,
  font,
  relicFonts,
  sprites,
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
  state: GameState;
  font: PixelFont;
  /** The relic fonts — forwarded to the run's LOST & FOUND item cards. */
  relicFonts: Record<RelicTier, PixelFont>;
  /** The atlas — the pause menu forwards it to the AUTO PILOT picker. */
  sprites: Sprites;
  demo: boolean;
  botView: boolean;
  /** The active hero is hardcore — the AUTO PILOT row is withheld (permadeath
   * makes an unattended ride too risky; see the engage block below). */
  hardcore: boolean;
  /** Latched viewer pause — cleared on resume so the bot loop flies again. */
  userPausedRef: MutableRefObject<boolean>;
  characterRef: MutableRefObject<Character>;
  difficulty: Difficulty;
  /** The AUTO PILOT session housing (see useAutopilotSession). */
  autopilot: ReturnType<typeof useAutopilotSession>;
  /** Abandon the demo for good (no parked run to keep). */
  onQuit: () => void;
  /** Leave to the menu but keep the frozen run in memory — CONTINUE
   * resumes it. The local hero's `paused` screen is already up here. */
  onExitToMenu: (state: GameState) => void;
  bumpUi: () => void;
  /** The session behind this run, when there is one — the pause screen is
   * where its live status rows hang (see SessionPanel). */
  sessionLink?: SessionLink | null;
}) {
  // The in-run COIN STORE's buy runner (the AUTO PILOT picker's STORE button):
  // banks the pack onto the hero and tops up the live purse. Declared before
  // the demo's early return so the hook order stays stable.
  const buyCoins = useRunStore({ state, characterRef, bumpUi });
  // The run's own LOST & FOUND, raised from the AUTO PILOT's last-call confirm
  // (BUY BACK) — the ride about to be engaged is what empties the vault, so the
  // buy-back has to be reachable from in here, not only from the title menu.
  const [browsingVault, setBrowsingVault] = useState(false);
  const resumeRun = () => {
    if (localScreen(state) !== "paused") return;
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
    finishAutopilotRide({
      state,
      characterRef,
      sessionRef: autopilot.sessionRef,
      syncView: autopilot.syncView,
    });
    onExitToMenu(state);
  };
  // What engaging a ride would bin, most precious first — the last-call
  // confirm's numbers. Read live so a buy-back shrinks it under the confirm.
  const banked = vaultContents(localHero(state).vault);
  const best = banked[0];
  // HOW TO PLAY: the demo's exit confirm stands in for the pause menu —
  // KEEP WATCHING resumes where it froze; MAIN MENU drops the demo.
  if (demo) {
    return <DemoExitOverlay font={font} onResume={resumeRun} onExit={onQuit} />;
  }
  return (
    <>
      {browsingVault && (
        <RunVaultScreen
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          onChange={bumpUi}
          onClose={() => setBrowsingVault(false)}
        />
      )}
      <PauseOverlay
        font={font}
        sprites={sprites}
        session={
          sessionLink ? (
            <SessionPanel
              font={font}
              link={sessionLink}
              state={state}
              sprites={sprites}
              mySeat={sessionLink.spectating ? null : localSeat()}
              // ASK FOR A TRADE, from the roster row. The press has to leave
              // the pause screen first — `requestTrade` refuses a hero with
              // any other screen up, the same "be standing on the field to
              // start this" rule the table itself applies — so it resumes
              // exactly as the RESUME row does and sends the verb behind it.
              // Nothing opens here: the teammate answers on their own HUD. A
              // spectator holds no seat and gets no button.
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
          ) : null
        }
        onResume={resumeRun}
        onExit={exitToMenu}
        cleanSlates={localHero(state).cleanSlates}
        onUseCleanSlate={() => {
          // The chooser IS the confirmation: `beginRespec` refunds into a pool
          // the player then has to re-place, and it cannot be committed until
          // every point is back down. There is nothing to warn about that the
          // next screen does not say better.
          if (runCommandOk(state, "spendCleanSlate")) bumpUi();
        }}
        // AUTO PILOT (src/game/autopilot.ts): engage the coin-metered
        // self-play from here — starting also resumes the run so the
        // meter (and the bot) actually flies. Hidden in BOT VIEW: the
        // engine autopilot is already flying the run (we're WATCHING a bot
        // play), so the coin-metered self-play row makes no sense there.
        // Hidden for HARDCORE heroes too: a hardcore death is permanent (the
        // flight director retires the hero mid-ride — see
        // autopilot-director.ts), so handing an unattended bot the controls
        // could permakill the run. A hardcore hero is always flown by hand.
        autopilot={
          botView || hardcore
            ? undefined
            : {
                active: state.autopilot.active,
                coins: localHero(state).coins,
                // The LAST CALL before the ride bins the vault: what it holds,
                // and the way out (BUY BACK opens the run's LOST & FOUND).
                vault: {
                  count: banked.length,
                  best: best ? equipmentName(best) : "",
                  bestColor: best ? TIER_COLORS[best.tier] : "#e6e8eb",
                  onBrowse: () => setBrowsingVault(true),
                },
                // Price the ride at the moment of enabling: every offered speed
                // rung with its per-game-second cost, the game-time the purse
                // funds at it, and whether the purse can cover a second of it
                // (startAutopilot refuses the unaffordable ones).
                rungs: AUTOPILOT.speeds.map((speed) => {
                  const cost = autopilotDrainPerSecond(speed);
                  return {
                    speed,
                    cost,
                    gameSeconds: Math.floor(localHero(state).coins / cost),
                    affordable: localHero(state).coins >= cost,
                  };
                }),
                onStart: (speed: number) => {
                  if (localScreen(state) !== "paused") return;
                  if (!runCommandOk(state, "startAutopilot", speed)) return;
                  // A NEW flight, a new LOST & FOUND: whatever the last one threw
                  // away and the player never bought back is trashed here, for
                  // good (items/vault.ts `clearVault`). The vault is a holding
                  // pen for one flight's discards, never a second stash.
                  runCommand(state, "clearVault");
                  // Remember the chosen rung on the session so the in-HUD panel
                  // shows it and the next lap re-arms the meter at that speed.
                  autopilot.setSpeed(speed);
                  // Engaged on already-cleared ground? Pin the session to this
                  // level — the ride farms it instead of advancing the campaign.
                  // Hand the ride the hero's pre-flight build so the STOP can give
                  // its stat/talent allocations back (keeping the ride harmless to
                  // the player's own spec).
                  autopilot.engage(
                    hasClearedLevel(
                      characterRef.current,
                      state.level.id,
                      difficulty,
                    )
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
                },
                onBuyCoins: buyCoins,
                onStop: () => {
                  // End the ride and hand the flight's stat/talent picks back
                  // as unspent points; they stay banked across the resume, and
                  // the HUD's points pip is what reminds the player to spend.
                  finishAutopilotRide({
                    state,
                    characterRef,
                    sessionRef: autopilot.sessionRef,
                    syncView: autopilot.syncView,
                  });
                  bumpUi();
                },
              }
        }
      />
    </>
  );
}
