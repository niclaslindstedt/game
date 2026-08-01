// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAVEL DOOR'S PICKER — where a standing door (the garage's rocket, the
// rift portal) can take you. Opened by a tap on the door's landmark
// (player-input.ts), listing the door's authored destinations with the same
// unlock rule the campaign picker runs: a locked road is SHOWN greyed rather
// than hidden, because an empty list reads as "broken" where a locked row
// reads as "come back later".
//
// The run keeps playing behind it (a hub is safe ground; on any other venue
// the player opened a menu next to a fight on purpose), so this is an
// overlay rather than an engine phase — the engine only says where the door
// stands and where it leads, and the app owns the actual travel, exactly as
// it does for a `gateEntered` crossing.

import { levelDef, runLevelDef, type GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { isLevelUnlocked } from "../character-progress.ts";
import { hasKeepsake, type Character } from "../characters.ts";
import { storyItemDef, type Difficulty } from "@game/core";

export function TravelPanel({
  state,
  font,
  doorId,
  character,
  difficulty,
  canTravel,
  onTravel,
  onClose,
}: {
  state: GameState;
  font: PixelFont;
  /** Which travel door was tapped (a `LevelDef.travelDoors` id). */
  doorId: string;
  character: Character;
  difficulty: Difficulty;
  /** False on a mount that may not swap the level — a joined session's
   * client (the HOST chooses the road) — so every row reads but none acts. */
  canTravel: boolean;
  onTravel: (levelId: string) => void;
  onClose: () => void;
}) {
  const door = (runLevelDef(state).travelDoors ?? []).find(
    (d) => d.id === doorId,
  );
  if (!door) return null;
  // A door with a `requires` gate (the rift seam) is SEALED as a whole until
  // its keepsake is banked on the character — shown, named, and inert, so
  // the player knows there is a thing to go and find.
  const sealed =
    door.requires !== undefined && !hasKeepsake(character, door.requires);
  return (
    <div className="game-splash">
      <PixelText font={font} text={door.name} scale={5} color="#7ef0c8" />
      {sealed && (
        <PixelText
          font={font}
          text={`SEALED - IT ANSWERS TO THE ${storyItemDef(door.requires!).name}`}
          scale={2}
          color="#ec52be"
        />
      )}
      {!canTravel && (
        <PixelText
          font={font}
          text="THE HOST CHOOSES THE ROAD"
          scale={2}
          color="#9aa3ad"
        />
      )}
      <div className="splash-buttons">
        {door.to.map((dest) => {
          const unlocked =
            !sealed && isLevelUnlocked(character, dest, difficulty);
          const open = unlocked && canTravel;
          return (
            <button
              key={dest}
              type="button"
              className={open ? "pixel-button" : "pixel-button secondary"}
              disabled={!open}
              onClick={() => open && onTravel(dest)}
            >
              <PixelText
                font={font}
                text={
                  unlocked
                    ? levelDef(dest).name
                    : `${levelDef(dest).name} · LOCKED`
                }
                scale={3}
                color={open ? "#0b0d10" : "#6b7480"}
              />
            </button>
          );
        })}
        <button
          type="button"
          className="pixel-button secondary"
          onClick={onClose}
        >
          <PixelText font={font} text="NOT YET" scale={3} />
        </button>
      </div>
    </div>
  );
}
