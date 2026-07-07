// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Renders a running cutscene (see @game/lib/cutscene + defs/cutscenes.ts):
// a letterboxed side-view stage drawn on its own canvas — backdrop, props,
// actors (bottom-anchored, painter-sorted by y), fade — with the current
// caption/dialogue line as DOM pixel text in a JRPG dialogue box floating
// over the stage bottom (never pushing the stage around). Text beats hold
// until the player taps. The overlay only DRAWS; advancing the scene is the
// caller's job (the game loop steps it, the preview page steps its own
// copy), so one component serves both.

import { useEffect, useRef, useState } from "react";

import { currentLine, cutsceneDef, type CutsceneState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteByName, type GameAssets } from "./assets.ts";

/** CSS pixels per stage pixel — scenes zoom in closer than gameplay. */
const STAGE_SCALE = 3;

/** Display names for the cast (actor ids are engine-side keys). */
const ACTOR_NAMES: Record<string, string> = {
  hero: "ME",
  ada: "ADA",
};

/** Per-backdrop paint: wall, floor, and trim colors. */
const BACKDROPS: Record<
  string,
  { wall: string; floor: string; trim: string; floorY: number }
> = {
  livingRoom: {
    wall: "#262838",
    floor: "#4a3a2c",
    trim: "#1a1c28",
    floorY: 78,
  },
};

function drawStage(
  ctx: CanvasRenderingContext2D,
  cutscene: CutsceneState,
  assets: GameAssets,
  timeMs: number,
): void {
  const def = cutsceneDef(cutscene.defId);
  const { width, height } = def.stage;
  const paint = BACKDROPS[def.stage.backdrop] ?? {
    wall: "#262838",
    floor: "#3a3c4c",
    trim: "#1a1c28",
    floorY: Math.round(height * 0.65),
  };

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = paint.wall;
  ctx.fillRect(0, 0, width, paint.floorY);
  ctx.fillStyle = paint.floor;
  ctx.fillRect(0, paint.floorY, width, height - paint.floorY);
  ctx.fillStyle = paint.trim;
  ctx.fillRect(0, paint.floorY, width, 2);
  // Faint floorboards give the room depth without a tile pass.
  for (let y = paint.floorY + 14; y < height; y += 14) {
    ctx.fillRect(0, y, width, 1);
  }

  // Props and visible actors share one painter's queue, bottom-anchored at
  // their pos (pos.y = where they meet the floor), sorted back to front.
  type Placed = { sprite: string; x: number; y: number; flip: boolean };
  const queue: Placed[] = def.stage.props.map((prop) => ({
    sprite: prop.kind,
    x: prop.pos.x,
    y: prop.pos.y,
    flip: false,
  }));
  for (const actor of cutscene.actors) {
    if (actor.hidden) continue;
    // Walking actors alternate `<sprite>_0/_1`; idle holds frame 0.
    const frame = actor.moving ? Math.floor(timeMs / 220) % 2 : 0;
    queue.push({
      sprite: `${actor.sprite}_${frame}`,
      x: actor.pos.x,
      y: actor.pos.y,
      flip: actor.faceLeft,
    });
  }
  queue.sort((a, b) => a.y - b.y);

  for (const item of queue) {
    const sprite =
      spriteByName(assets.sprites, item.sprite) ??
      spriteByName(assets.sprites, `${item.sprite}_0`);
    if (!sprite) continue;
    const x = Math.round(item.x - sprite.width / 2);
    const y = Math.round(item.y - sprite.height);
    if (item.flip) {
      ctx.save();
      ctx.translate(x + sprite.width, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, x, y);
    }
  }

  if (cutscene.fade > 0) {
    ctx.fillStyle = `rgba(6, 7, 12, ${cutscene.fade})`;
    ctx.fillRect(0, 0, width, height);
  }
}

export function CutsceneOverlay({
  cutscene,
  assets,
  font,
  onTap,
  onSkip,
}: {
  cutscene: CutsceneState;
  assets: GameAssets;
  font: PixelFont;
  /** Player tap: cut the running beat short. */
  onTap: () => void;
  /** The SKIP button: end the scene outright. */
  onSkip: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Re-render the DOM text when the running beat changes under us — the
  // engine mutates the scene in place, so we watch it from a draw loop.
  const [, setBeat] = useState(-1);

  const def = cutsceneDef(cutscene.defId);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = def.stage.width;
    canvas.height = def.stage.height;

    let raf = 0;
    const draw = (timeMs: number) => {
      drawStage(ctx, cutscene, assets, timeMs);
      setBeat(cutscene.beat);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cutscene, assets, def]);

  const line = currentLine(cutscene, def);

  return (
    <div
      className="game-overlay cutscene-overlay"
      onPointerDown={onTap}
      role="presentation"
    >
      <canvas
        ref={canvasRef}
        className="cutscene-canvas"
        style={{
          // Native size, shrunk to fit the whole viewport — the dialogue box
          // floats OVER the stage (never pushing it), so no room is reserved.
          width: `min(${def.stage.width * STAGE_SCALE}px, 100vw, calc(100vh * ${def.stage.width / def.stage.height}))`,
          aspectRatio: `${def.stage.width} / ${def.stage.height}`,
          height: "auto",
        }}
      />
      {line && (
        <div
          className={
            line.kind === "say" ? "cutscene-line say" : "cutscene-line caption"
          }
        >
          {line.kind === "say" && line.actor && (
            <PixelText
              font={font}
              text={ACTOR_NAMES[line.actor] ?? line.actor.toUpperCase()}
              scale={2}
              color="#7ef0c8"
            />
          )}
          {line.text.map((row, i) => (
            <PixelText key={i} font={font} text={row} scale={2} />
          ))}
          {/* Text waits for the player — the blink is the "your move" cue. */}
          <div className="cutscene-continue">
            <PixelText
              font={font}
              text="TAP TO CONTINUE"
              scale={1}
              color="#9aa3ad"
            />
          </div>
        </div>
      )}
      <button
        type="button"
        className="pixel-button secondary cutscene-skip"
        aria-label="skip-cutscene"
        onClick={(event) => {
          event.stopPropagation();
          onSkip();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PixelText font={font} text="SKIP" scale={2} />
      </button>
    </div>
  );
}
