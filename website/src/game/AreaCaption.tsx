// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The AREA CAPTION: the name of the labeled design zone the hero walks into
// (BREAK ROOM, STOCK ROOM, PIT STOP, the corner vaults…), flashed once over the
// field as a location subtitle — the player-facing "markup" of the level's
// named rooms. GameScreen watches `currentAreaLabel(state)` each frame and, on a
// change to a new named area, remounts this component (keyed on a bump id) so
// its one-shot fade replays. Purely cosmetic; it reads the same labeled
// safe/quiet zones the map preview draws and the engine's zone geometry.

import { levelDef, zoneContains, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/**
 * The label of the named design zone the hero currently stands in, or null on
 * open floor. Checks the level's safe and quiet zones (the two carry every named
 * pocket); returns the FIRST labeled match — author overlapping zones so the
 * more specific room is listed first.
 */
export function currentAreaLabel(state: GameState): string | null {
  const def = levelDef(state.level.id);
  const zones = [...(def.safeZones ?? []), ...(def.quietZones ?? [])];
  for (const zone of zones) {
    if (zone.label && zoneContains(zone, state.player.pos)) return zone.label;
  }
  return null;
}

/** The flashed location subtitle. Positioned + animated by the `.area-caption`
 * rule (styles.css); remount it (via a changing React `key`) to replay. */
export function AreaCaption({
  label,
  font,
}: {
  label: string;
  font: PixelFont;
}) {
  return (
    <div className="area-caption" aria-live="polite">
      <PixelText font={font} text={label} scale={3} color="#ffb02e" />
    </div>
  );
}
