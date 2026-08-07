// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DRAWING A RESOLVED NODE — the five ordinary kinds a HUD is made of, plus the
// hand-off to a widget.
//
// Everything here is dull on purpose. The decisions were all made in
// `resolve.ts` (is it visible, what colour, what does the number read as), so
// this file only turns a resolved node into DOM. That split is what lets the
// same code draw the shipped bag pouch and a mod's brand-new one without ever
// asking which is which.
//
// THE CLASSES ARE THE APP'S, THE CHOICE IS CONTENT'S. An element wears whatever
// class it names, out of the stylesheet the game already ships — so the shipped
// HUD is byte-for-byte the look it always had, and a mod that wants a look the
// stylesheet has no class for reaches for `style:` (the bounded set in the
// schema) instead of shipping CSS the page would have to trust.

import type { CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl } from "../assets.ts";
import { hudPressAllowed, runHudPress } from "./actions.ts";
import type { HudContext } from "./context.ts";
import type { HudNodeView } from "./resolve.ts";
import { renderWidget } from "./widgets/index.tsx";

export function HudNode({
  view,
  ctx,
  onPress,
  canvasRef,
}: {
  view: HudNodeView;
  ctx: HudContext;
  /** A widget's own press, for a part drawn inside one — a card's button knows
   * which row it is standing in, and the node does not. */
  onPress?: () => void;
  /** Where a `kind: canvas` part hands its node to whoever paints it. */
  canvasRef?: (node: HTMLCanvasElement | null) => void;
}) {
  if (!view.visible) return null;
  const def = view.def;
  const style = frameStyle(view.style, def.frame, ctx);

  switch (def.kind) {
    // WHOSE registry answers a widget is the CONTEXT's: the HUD's own by
    // default, an in-game menu's when a window is drawing (`ctx.widgets`). The
    // node itself does not care — a bag pouch and a bag GRID are placed,
    // gated and framed identically, and only their insides differ.
    case "widget":
      return <>{(ctx.widgets ?? renderWidget)(view, ctx)}</>;

    case "bar":
      return (
        <div className={view.className} style={style}>
          <div
            className={def.fill?.class}
            ref={hudRef(def.fill?.ref, ctx)}
            style={{
              width: `${100 * view.value}%`,
              ...(def.fill?.color ? { background: view.color } : {}),
            }}
          />
          {def.overlay && (
            <div
              className={def.overlay.class}
              ref={hudRef(def.overlay.ref, ctx)}
              aria-hidden="true"
            />
          )}
        </div>
      );

    // THE ROUND ONE. A fraction drawn as an arc — the shape a ring around a
    // slot, a cooldown wheel and a speedometer all are, and the one primitive
    // the others cannot be bent into. `pathLength={1}` is what lets the dash
    // array be the fraction itself, whatever radius the box ends up at.
    case "gauge": {
      const sweep = Math.max(1, Math.min(360, def.sweep ?? 360)) / 360;
      const width = def.thickness ?? 3.5;
      const color = view.color ?? "#c2ccd6";
      const track = view.trackColor;
      // THE BAND PRINTED ON THE FACE — from its opening fraction to the end of
      // the sweep, laid over the track and under the needle's own arc. A dash
      // OFFSET rather than a second sweep, so it starts where it is told to
      // instead of at twelve o'clock: at `pathLength={1}` the offset is the
      // fraction itself, negated because SVG counts a dash offset backwards.
      const zoneFrom = Math.max(0, Math.min(1, def.zone?.from ?? 0));
      const zone = view.zoneColor;
      const spin = `rotate(${(def.start ?? 0) - 90} 22 22)`;
      return (
        <svg
          className={view.className}
          style={style}
          viewBox="0 0 44 44"
          aria-hidden
        >
          {track && (
            <circle
              cx="22"
              cy="22"
              r="20"
              fill="none"
              stroke={track}
              strokeWidth={width}
              pathLength={1}
              strokeDasharray={`${sweep} 1`}
              transform={spin}
            />
          )}
          {zone && zoneFrom < 1 && (
            <circle
              cx="22"
              cy="22"
              r="20"
              fill="none"
              stroke={zone}
              strokeWidth={width}
              pathLength={1}
              strokeDasharray={`${sweep * (1 - zoneFrom)} 1`}
              strokeDashoffset={-sweep * zoneFrom}
              transform={spin}
            />
          )}
          <circle
            cx="22"
            cy="22"
            r="20"
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${sweep * view.value} 1`}
            transform={spin}
          />
        </svg>
      );
    }

    // A CANVAS is a rectangle a widget PAINTS — the voice card's waveform is the
    // first of them. Content owns where it sits, how big it is and what class it
    // wears; the pixels are code's, because a strip redrawn thirty times a
    // second is not a row of divs. It is drawn here only when something handed
    // it a `ref` to paint through — a canvas nobody paints is an empty box, and
    // a widget's own parts (`HudPart`) is where one gets its painter.
    case "canvas":
      return (
        <canvas
          className={view.className}
          style={style}
          width={def.width ?? 1}
          height={def.height ?? 1}
          ref={canvasRef}
          aria-hidden="true"
        />
      );

    case "icon": {
      const src = view.sprite
        ? spriteDataUrl(ctx.assets.sprites, view.sprite)
        : undefined;
      // A sprite the atlas cannot answer for draws NOTHING rather than a broken
      // image — the shipped tree cannot reach here (the schema checked every
      // name), but a mod's element naming a sprite it forgot to ship can.
      if (!src) return null;
      return <img src={src} alt="" className={view.className} style={style} />;
    }

    // NOTHING SAID DRAWS NOTHING — not an empty frame. `undefined` here is the
    // resolver's "no answer" (a judgement that could not run, a binding this
    // build does not know), and it is distinct from the empty STRING a binding
    // may legitimately hold. A plate is furniture around a line, so furniture
    // with no line in it is not "as if nothing was said": when the road's dials
    // were disowned it left two empty frames sitting in the corners of the
    // windscreen, which read as a broken game rather than a quiet fallback.
    case "text":
      if (view.text === undefined) return null;
      return (
        <span className={view.className} style={style}>
          <PixelText
            font={ctx.font}
            text={view.text}
            scale={def.scale ?? 2}
            color={view.color}
          />
        </span>
      );

    case "button":
      return (
        <button
          type="button"
          className={view.className}
          style={style}
          aria-label={def.aria}
          onClick={() => {
            if (onPress) return onPress();
            if (!def.press) return;
            if (!hudPressAllowed(def.press, ctx)) return;
            runHudPress(def.press, ctx);
          }}
        >
          {view.children.map((child, i) => (
            <HudNode key={child.def.id ?? i} view={child} ctx={ctx} />
          ))}
        </button>
      );

    case "panel":
    default:
      return (
        <div
          className={view.className}
          style={style}
          ref={hudRef(def.ref, ctx)}
        >
          {view.children.map((child, i) => (
            <HudNode key={child.def.id ?? i} view={child} ctx={ctx} />
          ))}
        </div>
      );
  }
}

/**
 * A box's own 9-slice plate, folded into its inline style.
 *
 * The frame is a SPRITE, which is what makes it replaceable the way everything
 * else drawn in this game is — including by a PNG a mod drew somewhere else. A
 * name the atlas cannot answer leaves the box unframed rather than broken.
 */
function frameStyle(
  style: Record<string, string | number> | undefined,
  frame: string | undefined,
  ctx: HudContext,
): CSSProperties | undefined {
  if (!frame) return style as CSSProperties | undefined;
  const src = spriteDataUrl(ctx.assets.sprites, frame);
  if (!src) return style as CSSProperties | undefined;
  return { ...style, borderImageSource: `url(${src})` } as CSSProperties;
}

/**
 * The render-loop handle an authored `ref:` asks to be.
 *
 * A name this build has no handle for is simply not wired — which is the right
 * answer for a mod compiled against a newer game: the element still draws, it
 * is just not the one the loop paints.
 */
function hudRef(name: string | undefined, ctx: HudContext) {
  if (!name) return undefined;
  switch (name) {
    case "xpHeat":
      return ctx.refs.xpHeat;
    case "staminaFill":
      return ctx.refs.staminaFill;
    case "powerupDock":
      return ctx.refs.powerupDock;
    default:
      return undefined;
  }
}
