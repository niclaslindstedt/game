// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAVEL DOOR'S PICKER — where a standing door (the garage's rocket, the
// rift portal) can take you. Opened by a tap on the door's landmark
// (player-input.ts), listing the door's roads.
//
// **IT LISTS ONLY THE ROADS THAT ARE OPEN.** A locked destination used to be
// SHOWN greyed rather than hidden, on the theory that an empty list reads as
// "broken" where a locked row reads as "come back later" — but a greyed row
// also reads out the name of a chapter the player has not reached, and the
// campaign's whole shape (the moon, then Mars, then the deep roads) was
// legible from the hub before any of it was earned. So `openRoads` decides the
// list, and the empty case never reaches this panel at all: a door with
// nowhere to go either speaks its own line or is not on the field to be
// tapped (travel-doors.ts).
//
// The run keeps playing behind it (a hub is safe ground; on any other venue
// the player opened a menu next to a fight on purpose), so this is an
// overlay rather than an engine phase — the engine only says where the door
// stands and where it leads, and the app owns the actual travel, exactly as
// it does for a `gateEntered` crossing.

import { levelDef, runLevelDef, type GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { openRoads } from "./travel-doors.ts";
import { type Character } from "../characters.ts";
import { type Difficulty } from "@game/core";

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
  const roads = openRoads(character, difficulty, door);
  return (
    <div className="game-splash">
      <PixelText font={font} text={door.name} scale={5} color="#7ef0c8" />
      {!canTravel && (
        <PixelText
          font={font}
          text="THE HOST CHOOSES THE ROAD"
          scale={2}
          color="#9aa3ad"
        />
      )}
      <div className="splash-buttons">
        {roads.map((dest) => (
          <button
            key={dest}
            type="button"
            className={canTravel ? "pixel-button" : "pixel-button secondary"}
            disabled={!canTravel}
            onClick={() => canTravel && onTravel(dest)}
          >
            <PixelText
              font={font}
              text={levelDef(dest).name}
              scale={3}
              color={canTravel ? "#0b0d10" : "#6b7480"}
            />
          </button>
        ))}
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
