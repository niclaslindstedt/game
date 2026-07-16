// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DESIGN ZONES — the level-design levers that carve a map into regions of
// different feel (see the `level-design` skill). A zone is a rect or a circle
// in world coordinates; two lists on a `LevelDef` read them:
//
//   safeZones   NO monsters spawn inside, and the wandering horde is gently
//               REPELLED out — a genuine safe pocket (a rest spot, a merchant
//               nook, the breather before the boss door).
//   quietZones  a DEAD area: no ambient wave/pack spawns inside, so the horde
//               thins to nothing there — but authored content still lives in it
//               (a chest to find, a lone rare/unique mob guarding it). The lull
//               that rewards exploring off the main line, without going soft.
//
// Both share the spawn-exclusion predicate (`anyZoneContains`); only safeZones
// also repel (`repelFromZones`). The rules live here so every placement and
// movement site reads the same geometry — the create.ts spawn loops, the
// step.ts wave/pack spawner, and the enemy movement pass.

import { type Vec2 } from "@game/lib/vec.ts";

/** A rectangular region (top-left origin, world px). */
export type ZoneRect = {
  shape: "rect";
  rect: { x: number; y: number; width: number; height: number };
  /** Optional label the map renderer prints over the region. */
  label?: string;
};

/** A circular region (world px). */
export type ZoneCircle = {
  shape: "circle";
  pos: Vec2;
  radius: number;
  label?: string;
};

export type Zone = ZoneRect | ZoneCircle;

/** Is `pos` inside this one zone? */
export function zoneContains(zone: Zone, pos: Vec2): boolean {
  if (zone.shape === "circle") {
    const dx = pos.x - zone.pos.x;
    const dy = pos.y - zone.pos.y;
    return dx * dx + dy * dy <= zone.radius * zone.radius;
  }
  const r = zone.rect;
  return (
    pos.x >= r.x &&
    pos.x <= r.x + r.width &&
    pos.y >= r.y &&
    pos.y <= r.y + r.height
  );
}

/** Is `pos` inside ANY of the zones? (undefined/empty = never.) */
export function anyZoneContains(
  zones: readonly Zone[] | undefined,
  pos: Vec2,
): boolean {
  if (!zones) return false;
  for (const zone of zones) if (zoneContains(zone, pos)) return true;
  return false;
}

/**
 * Push `pos` (mutated in place) just OUTSIDE the first zone it is inside, by
 * `margin` world px — the safe-zone counterpart to obstacle resolution. A rect
 * ejects along its shallowest penetration axis; a circle ejects radially. Only
 * one zone is resolved per call (like `resolveObstacles`, which runs every
 * tick), so overlapping zones settle over a few frames.
 */
export function repelFromZones(
  zones: readonly Zone[] | undefined,
  pos: Vec2,
  margin: number,
): void {
  if (!zones) return;
  for (const zone of zones) {
    if (!zoneContains(zone, pos)) continue;
    if (zone.shape === "circle") {
      const dx = pos.x - zone.pos.x;
      const dy = pos.y - zone.pos.y;
      const dist = Math.hypot(dx, dy);
      const out = zone.radius + margin;
      // Dead centre has no outward bearing — eject along +x so a mob spawned
      // (or nudged) onto the anchor still leaves the pocket.
      const nx = dist > 1e-6 ? dx / dist : 1;
      const ny = dist > 1e-6 ? dy / dist : 0;
      pos.x = zone.pos.x + nx * out;
      pos.y = zone.pos.y + ny * out;
      return;
    }
    const r = zone.rect;
    // Distances to each edge; eject across the nearest one.
    const left = pos.x - r.x;
    const right = r.x + r.width - pos.x;
    const top = pos.y - r.y;
    const bottom = r.y + r.height - pos.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) pos.x = r.x - margin;
    else if (min === right) pos.x = r.x + r.width + margin;
    else if (min === top) pos.y = r.y - margin;
    else pos.y = r.y + r.height + margin;
    return;
  }
}
