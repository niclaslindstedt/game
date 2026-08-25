// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIND VANE — the flight's wind meter, and the one instrument on this HUD
// whose insides could not be authored as boxes.
//
// IT IS AN ARROW BLOWING THE WAY THE WIND BLOWS. Not a needle on a rose: a
// needle answers "what bearing" and the only question up here is "which way is
// the air shoving me, and how hard" — which an arrow answers in the shape a
// player already knows off every weather map they have ever seen. It points
// the way the wind is PUSHING the ship, so the correction the thumb owes is
// simply the other way, and the streaks blowing through it are what make the
// picture read as weather HAPPENING rather than as an icon of weather.
//
// WHAT IS DRAWN, AND WHAT EACH PART SAYS:
//
//   the HEAD        which way the air is going
//   the SHAFT       how hard, as length — a gust visibly grows the arrow
//   the STREAKS     that it is live, and roughly how fast, by how quickly they
//                   blow through
//   the TREMBLE     that this one is an emergency (past the SHEAR rung): the
//                   arrow is thrown about and wrenched around, hard, while the
//                   figure under it stays perfectly still and legible
//   no head at all  CALM: there is no direction to point, and an arrow that
//                   pointed anyway would be a reading acted on for nothing
//
// The number and its unit sit UNDER it, and they are content's
// (`content/hud/elements/rocket_wind.yaml`) — as is the colour every part of
// this draws in, which is the same Lua ladder the figure wears.
//
// WHY IT IS CODE AT ALL. Everything above is a HISTORY rather than a value: an
// arrow that lags its reading, streaks at a phase, a tremble reseeded per
// frame. No binding can hold any of it, which is precisely what the widget
// escape hatch is for.
//
// REDUCED MOTION TAKES THE TREMBLE AND STILLS THE STREAKS, NEVER THE READING.
// The arrow still points where the wind is going and is still as long as the
// wind is strong; the colour ladder and the figure say the rest.

import { useEffect, useRef, useState } from "react";

import type { HudContext } from "../context.ts";
import type { HudNodeView } from "../resolve.ts";
import {
  CALM_BELOW,
  streakSpeed,
  vaneShakeDeg,
  vaneShakePx,
  vaneStep,
  windPush,
} from "./wind-vane.ts";

/** The box the arrow is drawn in. Wide and short — it is a thing travelling
 * across, not a dial. */
const BOX_W = 44;
const BOX_H = 15;
const MID_Y = BOX_H / 2;

/** The shaft's half-length at a dead calm and at the profile's worst (box px),
 * measured from the centre — so a gust grows the arrow from the middle out
 * rather than sliding it across its own box. */
const REACH_MIN = 7;
const REACH_MAX = 19;

/** The head's own size (box px). */
const HEAD_LEN = 5.5;
const HEAD_RISE = 3.6;

/** The streaks blowing through, as their offsets off the shaft (box px) and
 * the length of one dash / the gap after it. They repeat every `STREAK_STEP`,
 * which is what lets one phase scroll all of them. */
const STREAK_ROWS = [-3.8, 3.8];
const STREAK_DASH = 4;
const STREAK_STEP = 9;

export function WindVane({
  ctx,
  view,
}: {
  ctx: HudContext;
  view: HudNodeView;
}) {
  /** The arrow's own reading — signed, -1 port to +1 starboard, chasing the
   * wind rather than equal to it. */
  const [push, setPush] = useState(0);
  const [phase, setPhase] = useState(0);
  const [jitter, setJitter] = useState({ x: 0, y: 0, deg: 0 });
  // The live values, read through a ref: the animation frame below outlives
  // any one publish, and closing over `ctx` would leave it chasing whichever
  // wind was blowing when the loop started.
  const valuesRef = useRef(ctx.values);
  const pushRef = useRef(0);
  const phaseRef = useRef(0);
  useEffect(() => {
    valuesRef.current = ctx.values;
  }, [ctx.values]);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      // A backgrounded tab hands back one enormous step on the way in; clamp
      // it, or the streaks jump a screen's worth in the frame the player
      // returns on.
      const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const values = valuesRef.current;
      const frac = Number(values["rocket.windFrac"] ?? 0);
      const want = windPush(Number(values["rocket.windDir"] ?? 0), frac);
      const next = vaneStep(pushRef.current, want);
      pushRef.current = next;
      // Rounded before it reaches React: the arrow moves in thousandths and a
      // re-render per ten-thousandth is a re-render for nothing.
      setPush(Math.round(next * 1000) / 1000);
      if (!calm) {
        // The streaks travel the way the wind does, so the phase runs backward
        // for a wind on the port shoulder.
        const travel = streakSpeed(frac) * dt * Math.sign(next || want || 1);
        phaseRef.current =
          (((phaseRef.current + travel) % STREAK_STEP) + STREAK_STEP) %
          STREAK_STEP;
        setPhase(Math.round(phaseRef.current * 10) / 10);
      }
      // THE TREMBLE IS RESEEDED EVERY FRAME rather than run on a wave: a sine
      // would read as a wobble with a rhythm the eye can follow, and this is
      // meant to look like nothing up there is holding it.
      const amp = calm ? 0 : vaneShakePx(frac);
      const spin = calm ? 0 : vaneShakeDeg(frac);
      const throwBy = (by: number) =>
        Math.round((Math.random() * 2 - 1) * by * 10) / 10;
      setJitter(
        amp === 0
          ? { x: 0, y: 0, deg: 0 }
          : { x: throwBy(amp), y: throwBy(amp * 0.7), deg: throwBy(spin) },
      );
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const ink = view.color ?? "#e8e4d8";
  const strength = Math.abs(push);
  const blowing = strength > CALM_BELOW;
  // Which way the picture faces. In calm there is no answer, and the arrow is
  // drawn as a bar with no head rather than pointed at a guess.
  const way = push < 0 ? -1 : 1;
  const reach = REACH_MIN + strength * (REACH_MAX - REACH_MIN);
  const cx = BOX_W / 2;
  const tail = cx - way * reach;
  const tip = cx + way * reach;
  const neck = tip - way * HEAD_LEN;
  return (
    <svg
      className={view.className}
      viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      aria-hidden
      style={{
        transform:
          `translate(${jitter.x}px, ${jitter.y}px) ` +
          `rotate(${jitter.deg}deg)`,
      }}
    >
      {/* THE STREAKS — two lines of moving air above and below the shaft. They
          are the dash pattern scrolling, not a hundred nodes: one `<line>` per
          row, offset by the phase the loop advances. */}
      {STREAK_ROWS.map((dy) => (
        <line
          key={dy}
          x1={2}
          y1={MID_Y + dy}
          x2={BOX_W - 2}
          y2={MID_Y + dy}
          stroke={ink}
          strokeOpacity={0.22}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeDasharray={`${STREAK_DASH} ${STREAK_STEP - STREAK_DASH}`}
          strokeDashoffset={-phase}
        />
      ))}
      <line
        x1={tail}
        y1={MID_Y}
        x2={blowing ? neck : tip}
        y2={MID_Y}
        stroke={ink}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      {blowing && (
        <polygon
          points={`${tip},${MID_Y} ${neck},${MID_Y - HEAD_RISE} ${neck},${
            MID_Y + HEAD_RISE
          }`}
          fill={ink}
        />
      )}
    </svg>
  );
}
