// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The "GO THIS WAY" guidance arrow: the shared visibility predicate the
// renderer draws by AND the audio beacon pings on, plus the blinking chevron
// itself.

import { enemyDef, nextPathWaypoint, type GameState } from "@game/core";

import { type Camera } from "./view.ts";

/** How near a foe can be and still suppress the guidance arrow — the arrow is a
 * "you're clear, head on" cue, so any body inside this ring hides it. Sized to
 * the local threat pocket (a bit over a phone half-view's short side). */
const GUIDE_CLEAR_RADIUS = 150;

/** The guidance arrow's blink period, in ms: its brightness rides
 * `abs(sin(timeMs / 320))`, which peaks once every `π·320` ms (~1 s). */
export const GUIDE_BLINK_PERIOD_MS = Math.PI * 320;

/** Which blink the guidance arrow is on at `timeMs` — a counter that ticks up
 * by one each time the pulse reaches its bright PEAK. The audio layer reads it
 * to ping in step with the visible flash (see GameScreen's render loop). The
 * `-0.5` aligns the integer boundary to the peak (`abs(sin)` maxes at
 * `timeMs / 320 = π/2 + kπ`, i.e. `timeMs / (π·320) = k + 0.5`). */
export function guidanceArrowBlinkIndex(timeMs: number): number {
  return Math.floor(timeMs / GUIDE_BLINK_PERIOD_MS - 0.5);
}

/**
 * Whether the "GO THIS WAY" guidance arrow is currently showing: a next
 * waypoint exists (`level.path` not fully walked), the hero's immediate area is
 * CLEAR of live foes within `GUIDE_CLEAR_RADIUS` and of any spawner still owing
 * mobs, and he isn't already standing on the waypoint. The shared predicate the
 * renderer draws by AND the audio beacon pings on, so the two never disagree.
 */
export function guidanceArrowVisible(state: GameState): boolean {
  const wp = nextPathWaypoint(state);
  if (!wp) return false;
  const hero = state.player.pos;
  const clearSq = GUIDE_CLEAR_RADIUS * GUIDE_CLEAR_RADIUS;
  for (const e of state.enemies) {
    if (enemyDef(e.defId).apparition) continue;
    const dx = e.pos.x - hero.x;
    const dy = e.pos.y - hero.y;
    if (dx * dx + dy * dy < clearSq) return false; // a foe is near — no arrow yet
  }
  // A spawn point in range still owing mobs means this patch isn't cleared —
  // hold the arrow until it drains ("clear the area, then it points you on").
  for (const s of state.spawners) {
    if (s.status === "drained" || s.queue.length === 0) continue;
    const dx = s.at.x - hero.x;
    const dy = s.at.y - hero.y;
    if (dx * dx + dy * dy < s.triggerRadius * s.triggerRadius) return false;
  }
  const dx = wp.x - hero.x;
  const dy = wp.y - hero.y;
  return Math.hypot(dx, dy) >= 8; // standing on it — no arrow
}

/**
 * The "GO THIS WAY" guidance arrow: a blinking amber chevron floating just ahead
 * of the hero, pointing toward the next intended-path waypoint (`level.path`).
 * It appears only once the hero's immediate area is CLEAR (`guidanceArrowVisible`)
 * — a nudge onward the moment a room is cleared, never clutter mid-fight — and
 * stays hidden on a level that authors no path or once the whole route is
 * walked. Purely cosmetic; it reads the same shared path progress
 * (`state.pathIndex`) the autopilot navigates by.
 */
export function drawGuidanceArrow(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  timeMs: number,
): void {
  if (!guidanceArrowVisible(state)) return;
  const hero = state.player.pos;
  const wp = nextPathWaypoint(state)!; // guidanceArrowVisible guaranteed non-null
  const dx = wp.x - hero.x;
  const dy = wp.y - hero.y;
  const dist = Math.hypot(dx, dy);
  const ux = dx / dist;
  const uy = dy / dist;
  // A soft blink so the cue pulses without strobing.
  const alpha = 0.4 + 0.45 * Math.abs(Math.sin(timeMs / 320));
  const cx = Math.round(hero.x + ux * 34 - camera.x);
  const cy = Math.round(hero.y + uy * 34 - camera.y) - 6; // chest height
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(uy, ux)); // arrow points along +x, toward the waypoint
  // A solid amber arrowhead with a dark outline: a clean filled triangle with a
  // notched back, pointing along +x toward the waypoint.
  ctx.beginPath();
  ctx.moveTo(10, 0); // tip
  ctx.lineTo(-6, -9); // top back corner
  ctx.lineTo(-2, 0); // back notch
  ctx.lineTo(-6, 9); // bottom back corner
  ctx.closePath();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1a1c2c"; // dark outline
  ctx.stroke();
  ctx.fillStyle = "#ffb02e"; // amber fill
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}
