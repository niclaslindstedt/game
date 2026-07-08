// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Renders a running cutscene (see @game/lib/cutscene + defs/cutscenes.ts):
// a letterboxed side-view stage drawn on its own canvas — backdrop, props,
// actors (bottom-anchored, painter-sorted by y), fade — with the current
// caption/dialogue line as DOM pixel text in a JRPG dialogue box floating
// over the stage bottom (never pushing the stage around). Text beats hold
// until the player taps. The overlay only DRAWS; advancing the scene is the
// caller's job (the game loop steps it, the preview page steps its own
// copy), so one component serves both.

import { useEffect, useRef, useState, type MutableRefObject } from "react";

import { currentLine, cutsceneDef, type CutsceneState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { spriteByName, type GameAssets } from "./assets.ts";

/** The reveal state the overlay publishes so the app's keyboard advance can
 * share the tap's two-step semantics (finish the crawl, then turn the beat). */
export type CutsceneReveal = { done: boolean; skip: () => void };

const EMPTY_LINE: string[] = [];

/** CSS pixels per stage pixel — scenes zoom in closer than gameplay. */
const STAGE_SCALE = 3;

function drawStage(
  ctx: CanvasRenderingContext2D,
  cutscene: CutsceneState,
  assets: GameAssets,
  timeMs: number,
): void {
  const def = cutsceneDef(cutscene.defId);
  const { width, height } = def.stage;
  // The scene carries its own backdrop palette (defs/cutscenes.ts); the
  // renderer only supplies neutral fallbacks for a scene that omits one.
  const backdrop = def.stage.palette;
  const paint = {
    wall: backdrop?.wall ?? "#262838",
    floor: backdrop?.floor ?? "#3a3c4c",
    trim: backdrop?.trim ?? "#1a1c28",
    floorY: backdrop?.floorY ?? Math.round(height * 0.65),
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
  onBlip,
  revealRef,
}: {
  cutscene: CutsceneState;
  assets: GameAssets;
  font: PixelFont;
  /** Player tap: advance the running beat (turn the page). */
  onTap: () => void;
  /** The SKIP button: end the scene outright. */
  onSkip: () => void;
  /** Play the letter-print blip — fired as characters land. */
  onBlip?: () => void;
  /** Mirror of the live reveal state for the out-of-overlay advance handler. */
  revealRef?: MutableRefObject<CutsceneReveal>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Re-render the DOM text when the running beat changes under us — the
  // engine mutates the scene in place, so we watch it from a draw loop.
  const [, setBeat] = useState(-1);

  const def = cutsceneDef(cutscene.defId);
  const line = currentLine(cutscene, def);

  // The line prints letter by letter like the in-world dialogue: blip on every
  // other character, and the tap finishes the crawl before it turns the beat.
  // Motion/fade beats carry no line — an empty page reveals as instantly done,
  // so a tap through them still cuts the beat short.
  const { rows, done, skip } = useTypewriter(
    line?.text ?? EMPTY_LINE,
    (visibleIndex) => {
      if (visibleIndex % 2 === 0) onBlip?.();
    },
  );

  // Publish the reveal so keyboard advance matches the tap: the first input
  // finishes the crawl, the next advances the beat.
  useEffect(() => {
    if (revealRef) revealRef.current = { done, skip };
  }, [revealRef, done, skip]);

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

  return (
    <div
      className="game-overlay cutscene-overlay"
      // A tap finishes the crawl if it's still printing; once the whole line is
      // up (or there's no line — a motion beat), it advances the beat.
      onPointerDown={() => (line && !done ? skip() : onTap())}
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
              text={
                def.actors.find((a) => a.id === line.actor)?.name ??
                line.actor.toUpperCase()
              }
              scale={2}
              color="#7ef0c8"
            />
          )}
          {line.text.map((row, i) => (
            // Reserve each row's full height (PixelText is fixed-height even
            // when empty) so the box never reflows as the crawl fills it in.
            <PixelText key={i} font={font} text={rows[i] ?? ""} scale={2} />
          ))}
          {/* Text waits for the player — the blink is the "your move" cue. */}
          <div className="cutscene-continue">
            <PixelText
              font={font}
              text={done ? "TAP TO CONTINUE" : "TAP TO SKIP"}
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
