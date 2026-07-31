// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The AREA CAPTION: the field's one-shot announcement line, flashed over the
// middle of the screen. It carries the name of the labeled design zone the hero
// walks into (BREAK ROOM, STOCK ROOM, PIT STOP, the corner vaults…) — the
// player-facing "markup" of the level's named rooms — and the same slot carries
// the other things that happen TO an area, like clearing out the pack holding
// it. GameScreen watches `currentAreaLabel(state)` each frame and, on a change
// to a new named area, remounts this component (keyed on a bump id) so its
// one-shot fade replays; an event-driven caption (event-fx.ts) bumps the same
// id. Purely cosmetic; it reads the same labeled safe/quiet zones the map
// preview draws and the engine's zone geometry.

import { runLevelDef, zoneContains, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/**
 * The label of the named design zone the hero currently stands in, or null on
 * open floor. Checks the level's safe and quiet zones (the two carry every named
 * pocket); returns the FIRST labeled match — author overlapping zones so the
 * more specific room is listed first.
 */
export function currentAreaLabel(state: GameState): string | null {
  const def = runLevelDef(state);
  const zones = [...(def.safeZones ?? []), ...(def.quietZones ?? [])];
  for (const zone of zones) {
    if (zone.label && zoneContains(zone, state.players[0].pos))
      return zone.label;
  }
  return null;
}

/** The caption's default amber — the colour a room label wears. */
const AREA_CAPTION_COLOR = "#ffb02e";

/** The flashed field caption. Positioned + animated by the `.area-caption`
 * rule (styles.css); remount it (via a changing React `key`) to replay. */
export function AreaCaption({
  label,
  font,
  color = AREA_CAPTION_COLOR,
}: {
  label: string;
  font: PixelFont;
  /** Tint for this caption — a room label keeps the amber default; an event
   * caption speaks in its own colour (the pack-cleared green). */
  color?: string;
}) {
  return (
    <div className="area-caption" aria-live="polite">
      <PixelText font={font} text={label} scale={3} color={color} />
    </div>
  );
}
