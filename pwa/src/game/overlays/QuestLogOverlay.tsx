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
// the log shows everything — running, finished-but-not-handed-in, handed in,
// and failed — with who wants it and what it pays, because the player opened it
// on purpose and has stopped playing to read.
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

import { spriteDataUrl, type GameAssets } from "../assets.ts";
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
  // The people on this map who still have something to offer are listed too,
  // under their own heading — an empty log on a map with two `!` marks on it
  // would read as "this level has no quests", which is the opposite of true.
  const untaken = giversForLevel(state.level.id).filter((giver) =>
    state.questGivers.some(
      (g) =>
        g.id === giver.id &&
        !tracked.some((q) => questDef(q.id).giver === giver.id),
    ),
  );

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
          {tracked.length === 0 && untaken.length === 0 && (
            <PixelText
              font={font}
              text="NOBODY HERE HAS ASKED YOU FOR ANYTHING."
              scale={1}
              color="#6f7a88"
              maxWidth={30}
            />
          )}

          {tracked.map((progress) => {
            const quest = questDef(progress.id);
            const status = STATUS[progress.status];
            const portrait = spriteDataUrl(
              assets.sprites,
              `${giverSprite(state, quest.giver)}_0`,
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
                    scale={1}
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
                        scale={1}
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

          {untaken.length > 0 && (
            <div className="quest-log-untaken">
              <PixelText
                font={font}
                text="ASKING FOR HELP"
                scale={1}
                color="#c9a95c"
              />
              {untaken.map((giver) => (
                <div className="quest-log-row" key={giver.id}>
                  <img
                    src={
                      spriteDataUrl(assets.sprites, `${giver.sprite}_0`) ?? ""
                    }
                    alt=""
                    className="pixel-img quest-log-face"
                  />
                  <div className="quest-log-body">
                    <PixelText
                      font={font}
                      text={giver.name}
                      scale={2}
                      color="#f6e3b0"
                      maxWidth={28}
                    />
                    <PixelText
                      font={font}
                      // Found on the map, or still out there — the log says
                      // which, because "go talk to them" is only useful advice
                      // once the player knows where they are.
                      text={
                        state.questGivers.find((g) => g.id === giver.id)
                          ?.discovered
                          ? "MARKED ON YOUR MAP"
                          : "SOMEWHERE ON THIS MAP"
                      }
                      scale={1}
                      color="#6f7a88"
                      maxWidth={28}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
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
