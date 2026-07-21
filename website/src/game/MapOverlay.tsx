// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level map: shown while the engine sits in the `map` phase (the MAP
// button in the upper HUD, or M on desktop) with the run frozen behind it.
// Warcraft-style fog of war: the level is drawn one chunky pixel per fog
// cell, terrain visible only where the hero has walked (`state.explored`),
// pitch dark elsewhere, with a soft penumbra along the fog's edge. Pins mark
// where story items and unique/legendary loot were found and where elites
// and bosses fell (`state.mapMarkers`); the hero's own position glows green.
// Everything is static while the map is up, so the canvas draws once per
// open — no animation loop.

import { useEffect, useRef } from "react";

import {
  MAP,
  mapCols,
  mapRows,
  isExplored,
  type GameState,
  type MapMarkerKind,
  type TileSpec,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import {
  spriteByName,
  spriteDataUrl,
  type GameAssets,
  type Sprites,
} from "./assets.ts";

/** Backing-store pixels per fog cell — the map's chunky "pixel" size. */
const CELL_PX = 4;

/** The marker icon each event kind pins on the map (and shows in the legend) —
 * shapes carry the meaning now, not colored dots. Generated in the `markers`
 * sprite family (scripts/sprite-data/markers.mjs). */
const MARKER_SPRITE: Record<MapMarkerKind, string> = {
  story: "map_story",
  elite: "map_elite",
  boss: "map_boss",
  // The wandering vendor's gold coin — the same sprite that bobs over his
  // head in-game, from the icons family.
  merchant: "icon_coin",
};

/** The hero's own "you are here" pin. */
const PLAYER_SPRITE = "map_you";

/** The black-hole hazard pin (rift gravity wells). */
const WELL_SPRITE = "map_well";

const FOG_COLOR = "#0b0d10";

/** The ground sprite for a world position — the level-wide pair, or the
 * zone's own where a `TileSpec.zones` rect covers it (render.ts groundTile,
 * minus the per-tile variety that wouldn't read at map scale). */
function groundSpriteFor(
  sprites: Sprites,
  tiles: TileSpec,
  wx: number,
  wy: number,
) {
  const zone = tiles.zones?.find(
    (z) =>
      wx >= z.rect.x &&
      wx < z.rect.x + z.rect.width &&
      wy >= z.rect.y &&
      wy < z.rect.y + z.rect.height,
  );
  return spriteByName(sprites, (zone?.ground ?? tiles.ground).common);
}

/** Draw the whole map once: terrain under the lifted fog, the fog itself,
 * architecture, landmarks, event pins, and the hero. */
function drawMap(
  canvas: HTMLCanvasElement,
  state: GameState,
  assets: GameAssets,
): void {
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  canvas.width = cols * CELL_PX;
  canvas.height = rows * CELL_PX;
  // Size the on-screen box here, where the level's shape is known: as big as
  // fits the modal on this viewport (phone landscape is the tight case),
  // never distorted, never overflowing the card.
  const maxW = Math.min(window.innerWidth * 0.78, 620);
  const maxH = window.innerHeight * 0.5;
  const fit = Math.min(maxW / canvas.width, maxH / canvas.height);
  canvas.style.width = `${Math.round(canvas.width * fit)}px`;
  canvas.style.height = `${Math.round(canvas.height * fit)}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  // The fog: everything starts dark; explored cells paint terrain over it.
  ctx.fillStyle = FOG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cellAt = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows
      ? state.explored[ty * cols + tx]
      : undefined;

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (cellAt(tx, ty) !== 1) continue;
      const sprite = groundSpriteFor(
        assets.sprites,
        state.level.tiles,
        (tx + 0.5) * MAP.cellSize,
        (ty + 0.5) * MAP.cellSize,
      );
      if (sprite) {
        ctx.drawImage(sprite, tx * CELL_PX, ty * CELL_PX, CELL_PX, CELL_PX);
      }
    }
  }

  // World px → map px.
  const s = CELL_PX / MAP.cellSize;
  const seen = (pos: { x: number; y: number }) => isExplored(state, pos);

  // Architecture under the lifted fog: walls, rocks and locked doors as dark
  // blocks over the terrain — the map's "outlines" of the level's structure.
  for (const obstacle of state.obstacles) {
    if (!seen(obstacle.pos)) continue;
    const halfW = obstacle.half?.x ?? obstacle.radius;
    const halfH = obstacle.half?.y ?? obstacle.radius;
    ctx.fillStyle =
      obstacle.kind === "door_locked" ? "#c46a3a" : "rgba(16, 19, 27, 0.75)";
    ctx.fillRect(
      Math.round((obstacle.pos.x - halfW) * s),
      Math.round((obstacle.pos.y - halfH) * s),
      Math.max(1, Math.round(halfW * 2 * s)),
      Math.max(1, Math.round(halfH * 2 * s)),
    );
  }

  // Black holes ride above the canvas as `map_well` icons (see the overlay in
  // the component) so they read at a legible size no matter how zoomed-out the
  // level is — but their PULL is drawn here as a faint violet footprint, so the
  // hazard's reach is legible on the map. Wells only exist on the rift, so this
  // shows nowhere else.
  for (const well of state.wells) {
    ctx.fillStyle = "rgba(138, 108, 224, 0.16)";
    ctx.beginPath();
    ctx.arc(
      well.pos.x * s,
      well.pos.y * s,
      well.pullRadius * s,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Landmarks (the lander, the boss's flag…) as cool bright dots.
  for (const landmark of state.landmarks) {
    if (!seen(landmark.pos)) continue;
    ctx.fillStyle = "#9fc4ff";
    ctx.fillRect(
      Math.round(landmark.pos.x * s) - 1,
      Math.round(landmark.pos.y * s) - 1,
      2,
      2,
    );
  }

  // The fog's penumbra: explored cells bordering the dark get a half-shade,
  // so the frontier reads soft instead of a hard checker edge.
  ctx.fillStyle = "rgba(11, 13, 16, 0.5)";
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (cellAt(tx, ty) !== 1) continue;
      const frontier =
        cellAt(tx - 1, ty) === 0 ||
        cellAt(tx + 1, ty) === 0 ||
        cellAt(tx, ty - 1) === 0 ||
        cellAt(tx, ty + 1) === 0;
      if (frontier) {
        ctx.fillRect(tx * CELL_PX, ty * CELL_PX, CELL_PX, CELL_PX);
      }
    }
  }

  // Event pins and the hero are no longer painted here — they ride above the
  // canvas as pixel-icon markers (see the overlay in the component), so they
  // read at a legible size regardless of how zoomed-out the level is.
}

export function MapOverlay({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawMap(canvas, state, assets);
  }, [state, assets]);

  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  // Marker position → percentage of the level's extent, so a pixel-icon can be
  // absolutely placed over the canvas no matter what size it fits to.
  const worldW = mapCols(state.level) * MAP.cellSize;
  const worldH = mapRows(state.level) * MAP.cellSize;
  const at = (pos: { x: number; y: number }) => ({
    left: `${(100 * pos.x) / worldW}%`,
    top: `${(100 * pos.y) / worldH}%`,
  });
  const iconUrl = (name: string) =>
    spriteDataUrl(assets.sprites, name) ?? undefined;

  const legend: { sprite: string; label: string }[] = [
    { sprite: PLAYER_SPRITE, label: "YOU" },
    { sprite: MARKER_SPRITE.story, label: "STORY" },
    { sprite: MARKER_SPRITE.elite, label: "ELITE" },
    { sprite: MARKER_SPRITE.boss, label: "BOSS" },
    { sprite: MARKER_SPRITE.merchant, label: "MERCHANT" },
    // Only meaningful on the rift; harmless elsewhere (the legend is static).
    ...(state.wells.length > 0
      ? [{ sprite: WELL_SPRITE, label: "BLACK HOLE" }]
      : []),
  ];

  return (
    <div
      className="game-overlay map-overlay"
      // Clicking the backdrop closes, like the pause screen.
      onPointerDown={onClose}
      role="presentation"
    >
      <div className="intro-box map-box" onPointerDown={stop}>
        <div className="map-header">
          <img
            className="pixel-img map-title-icon"
            src={iconUrl("icon_treasure_map")}
            alt=""
          />
          <PixelText
            font={font}
            text={state.level.name}
            scale={2}
            color="#7ef0c8"
          />
        </div>
        <div className="map-canvas-wrap">
          <canvas ref={canvasRef} className="map-canvas" />
          {/* Pins ride above the canvas as pixel icons: story/loot/elite/boss/
              merchant where they happened, and the hero's own pin last (on
              top). They show even over standing fog — the hero was there. */}
          <div className="map-markers">
            {/* Black holes: the rift's gravity wells, always shown (a hazard
                worth previewing) — they exist only on the rift, so nothing
                pins here on any other level. */}
            {state.wells.map((well) => (
              <img
                key={`well-${well.id}`}
                className="pixel-img map-marker"
                src={iconUrl(WELL_SPRITE)}
                alt=""
                style={at(well.pos)}
              />
            ))}
            {state.mapMarkers.map((marker, index) => (
              <img
                key={`${marker.kind}-${index}`}
                className="pixel-img map-marker"
                src={iconUrl(MARKER_SPRITE[marker.kind])}
                alt=""
                style={at(marker.pos)}
              />
            ))}
            <img
              className="pixel-img map-marker is-you"
              src={iconUrl(PLAYER_SPRITE)}
              alt=""
              style={at(state.player.pos)}
            />
          </div>
        </div>
        <div className="map-legend">
          {legend.map(({ sprite, label }) => (
            <span key={label} className="map-legend-item">
              <img
                className="pixel-img map-legend-icon"
                src={iconUrl(sprite)}
                alt=""
              />
              <PixelText font={font} text={label} scale={2} color="#9aa3ad" />
            </span>
          ))}
        </div>
        <button
          type="button"
          className="pixel-button modal-close-btn"
          aria-label="close-map"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={2} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}
