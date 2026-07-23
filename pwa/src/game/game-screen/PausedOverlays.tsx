// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paused-phase overlays, wired to the run's session machinery: the demo's
// exit confirm (HOW TO PLAY taps anywhere to raise it) and the ordinary pause
// menu with its AUTO PILOT engage/stop row. Split from GameScreen because the
// wiring reaches into music, the autopilot session, and the character — the
// scene overlays proper (SceneOverlays.tsx) stay free of all that.

import type { MutableRefObject } from "react";

import {
  autopilotDrainPerSecond,
  muteDialogue,
  resumeGame,
  startAutopilot,
  stopAutopilot,
  unmuteDialogue,
  type Difficulty,
  type GameState,
} from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";

import { hasClearedLevel, type Character } from "../characters.ts";
import { DemoExitOverlay } from "../overlays/DemoExitOverlay.tsx";
import { resumeMusic } from "../music/index.ts";
import { PauseOverlay } from "../overlays/PauseOverlay.tsx";
import type { useAutopilotSession } from "./autopilot-director.ts";

export function RunPausedOverlay({
  state,
  font,
  demo,
  botView,
  userPausedRef,
  characterRef,
  difficulty,
  autopilot,
  onQuit,
  onExitToMenu,
  bumpUi,
}: {
  state: GameState;
  font: PixelFont;
  demo: boolean;
  botView: boolean;
  /** Latched viewer pause — cleared on resume so the bot loop flies again. */
  userPausedRef: MutableRefObject<boolean>;
  characterRef: MutableRefObject<Character>;
  difficulty: Difficulty;
  /** The AUTO PILOT session housing (see useAutopilotSession). */
  autopilot: ReturnType<typeof useAutopilotSession>;
  /** Abandon the demo for good (no parked run to keep). */
  onQuit: () => void;
  /** Leave to the menu but keep the frozen run in memory — CONTINUE
   * resumes it. The state is already in the `paused` phase here. */
  onExitToMenu: (state: GameState) => void;
  bumpUi: () => void;
}) {
  const resumeRun = () => {
    if (state.phase !== "paused") return;
    userPausedRef.current = false;
    resumeGame(state);
    resumeMusic();
    bumpUi();
  };
  // HOW TO PLAY: the demo's exit confirm stands in for the pause menu —
  // KEEP WATCHING resumes where it froze; MAIN MENU drops the demo.
  if (demo) {
    return <DemoExitOverlay font={font} onResume={resumeRun} onExit={onQuit} />;
  }
  return (
    <PauseOverlay
      font={font}
      onResume={resumeRun}
      onExit={() => onExitToMenu(state)}
      // AUTO PILOT (src/game/autopilot.ts): engage the coin-metered
      // self-play from here — starting also resumes the run so the
      // meter (and the bot) actually flies. Hidden in BOT VIEW: the
      // engine autopilot is already flying the run (we're WATCHING a bot
      // play), so the coin-metered self-play row makes no sense there.
      autopilot={
        botView
          ? undefined
          : {
              active: state.autopilot.active,
              coins: state.player.coins,
              drainPerSecond: autopilotDrainPerSecond(autopilot.view.speed),
              onStart: () => {
                if (state.phase !== "paused") return;
                if (!startAutopilot(state, autopilot.sessionRef.current.speed))
                  return;
                // Engaged on already-cleared ground? Pin the session to this
                // level — the ride farms it instead of advancing the campaign.
                autopilot.engage(
                  hasClearedLevel(
                    characterRef.current,
                    state.level.id,
                    difficulty,
                  )
                    ? state.level.id
                    : null,
                );
                autopilot.setHistoryOpen(false);
                muteDialogue(state);
                userPausedRef.current = false;
                resumeGame(state);
                resumeMusic();
                bumpUi();
              },
              onStop: () => {
                stopAutopilot(state);
                autopilot.disengage();
                unmuteDialogue(state);
                bumpUi();
              },
            }
      }
    />
  );
}
