// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE QUEST LOG — every errand this run has touched, in one scrollable modal,
// opened by the HUD's own `!` button (beside the bag pouch) and freezing the run
// in its own `questLog` phase, exactly as the fog-of-war map does. It used to
// hang off the pause menu, which put the answer to "what was I doing" two
// presses deep behind a screen about quitting.
//
// It is the ANSWER TO "what was I doing", and that is a different question from
// the one the on-screen tracker answers. The tracker (QuestTracker.tsx) shows
// only what is RUNNING, in two or three lines, because it lives over the fight;
// the log shows every errand TAKEN — running, finished-but-not-handed-in,
// handed in, and failed — with who wants it and what it pays, because the
// player opened it on purpose and has stopped playing to read.
//
// It lists ONLY accepted work. Givers the player has not spoken to are never
// named here — a log that says who is standing on the map before the player
// has met them spoils the walk that finds them. Their presence is announced
// where it belongs: the gold `!` over their own heads out in the world.
//
// It lists in the engine's own order (`trackedQuests`: most recently accepted
// first), so the errand the player just took is the first thing they see.

import {
  giversForLevel,
  objectiveNeed,
  questDef,
  questGiverName,
  trackedQuests,
  type GameState,
  type QuestStatus,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { type GameAssets } from "../assets.ts";
import { bustSrc } from "../SpritePortrait.tsx";
import { objectiveLine } from "../quest-text.ts";

/** Status → the one word the row is headed with, and its colour. Failed is the
 * only red in the log: everything else is either work or done work. */
const STATUS: Record<QuestStatus, { label: string; color: string }> = {
  offered: { label: "AVAILABLE", color: "#ffd75e" },
  declined: { label: "AVAILABLE", color: "#ffd75e" },
  active: { label: "IN PROGRESS", color: "#cfd6e0" },
  complete: { label: "READY TO HAND IN", color: "#7fe3a0" },
  turnedIn: { label: "COMPLETED", color: "#6f7a88" },
  failed: { label: "FAILED", color: "#e06a6a" },
};

export function QuestLogOverlay({
  state,
  assets,
  font,
  onClose,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  onClose: () => void;
}) {
  const tracked = trackedQuests(state);

  return (
    <div
      className="game-overlay quest-log-overlay"
      onPointerDown={onClose}
      role="presentation"
    >
      <div
        className="quest-log-box"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="quest-log-header">
          <PixelText font={font} text="QUEST LOG" scale={4} color="#ffd75e" />
        </div>

        <div className="quest-log-rows">
          {tracked.length === 0 && (
            <PixelText
              font={font}
              text="YOU HAVE NOT TAKEN ON ANY ERRANDS."
              scale={2}
              color="#6f7a88"
              maxWidth={30}
            />
          )}

          {tracked.map((progress) => {
            const quest = questDef(progress.id);
            const status = STATUS[progress.status];
            const portrait = bustSrc(
              assets.sprites,
              giverSprite(state, quest.giver),
            );
            return (
              <div className="quest-log-row" key={progress.id}>
                {portrait && (
                  <img
                    src={portrait}
                    alt=""
                    className="pixel-img quest-log-face"
                  />
                )}
                <div className="quest-log-body">
                  <PixelText
                    font={font}
                    text={quest.name}
                    scale={2}
                    color="#f6e3b0"
                    maxWidth={28}
                  />
                  <PixelText
                    font={font}
                    text={`${questGiverName(quest.giver)} - ${status.label}`}
                    scale={2}
                    color={status.color}
                    maxWidth={28}
                  />
                  {progress.status !== "turnedIn" &&
                    quest.objectives.map((objective, i) => (
                      <PixelText
                        key={i}
                        font={font}
                        text={objectiveLine(
                          quest.id,
                          objective,
                          progress.counts[i] ?? 0,
                        )}
                        scale={2}
                        color={
                          (progress.counts[i] ?? 0) >= objectiveNeed(objective)
                            ? "#7fe3a0"
                            : "#9aa3ad"
                        }
                        maxWidth={28}
                      />
                    ))}
                </div>
              </div>
            );
          })}

        </div>

        <button
          type="button"
          className="pixel-button secondary quest-log-close"
          aria-label="close-quest-log"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={3} />
        </button>
      </div>
    </div>
  );
}

/** The sprite family the giver of `giverId` wears — read off the live catalog
 * so a mod's giver draws its own face here. */
function giverSprite(state: GameState, giverId: string): string {
  const def = giversForLevel(state.level.id).find((g) => g.id === giverId);
  return def?.sprite ?? "merchant";
}
