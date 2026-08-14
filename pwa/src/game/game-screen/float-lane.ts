// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TWO NUMBERS OVER ONE HEAD ARE ZERO NUMBERS. Combat text is anchored to where
// the thing happened — a hit's damage over the body, a kill's XP over the
// corpse, a handful of gold over the hero — and the busiest instant of a fight
// is exactly the one that puts several on the same spot: a mob dies at the
// hero's feet and sheds a purse, so the hit number, "+42 XP" in blue and "+822"
// in gold are drawn into the same pixels and none of them can be read. The
// player is told three things at once and receives none of them.
//
// So a float that would land on a live one takes the FIRST FREE ROW above it,
// and a busy fight reads as a ladder of numbers climbing off the melee rather
// than as a smear. Three things make that work:
//
//   - THE TEST IS IN SCREEN SPACE. The floats are drawn in screen px over a
//     projected anchor (render/effects.ts), and the ground is pitched and may be
//     yawed — two bodies a comfortable 24 world units apart can be 12 px apart
//     on the glass. Comparing raw world offsets silently lets those two collide.
//   - IT IS THE REAL GLYPH WIDTH, not a blanket radius: two numbers side by side
//     on one row never overlapped and must not pay for a collision they don't
//     have.
//   - A FLOAT THAT HAS CLIMBED FREES THE ROW IT LEFT. Combat text rises, so the
//     space under a half-risen number is real space — a newcomer takes it and
//     the ladder stays short instead of walking into the sky.
//
// EVERY floating word goes through `pushFloat` (or, for the hit numbers,
// `pushDamage`). A float pushed straight onto the effect list is one that can be
// drawn into another's pixels.

import { clamp01, type Vec2 } from "@game/lib/vec.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

import { damageTextScale, projectX, projectY, type Effect } from "../render.ts";

/** One line of pixel glyphs at 1×, plus a pixel of air, in screen px (the font
 * is 5 tall — pwa/src/game/assets/font.json). */
const LANE_LINE_PX = 6;

/** What one glyph advances the cursor at 1× (3px wide + 1px of spacing), and the
 * air two neighbouring floats want between them. Estimated rather than measured
 * because the font lives in the loaded assets and a spawn has no business
 * waiting on them — an over-estimate merely lifts a float that would have
 * squeaked past. */
const GLYPH_ADVANCE_PX = 4;
const LANE_GAP_PX = 3;

/** How far apart two anchors must be on the glass, in screen px, before neither
 * can reach the other however they stack. Beyond a few rows a float has left the
 * thing it belongs to, which is the same bound as `LANE_MAX_PX`. */
const LANE_REACH_PX = 64;

/** The most a float may be pushed up, in screen px. Past a few lines the number
 * has left the thing it belongs to, which is worse than the overlap it was
 * dodging — so a real pile-up stops climbing and takes the collision. */
const LANE_MAX_PX = 48;

/** How wide this many glyphs draw at this scale, in screen px. */
function textWidth(text: string, scale: number): number {
  return Math.max(0, text.length * GLYPH_ADVANCE_PX - 1) * scale;
}

/** What a live float is showing and how big — the two kinds differ in where they
 * keep it (a damage number formats its `value` and sizes itself off the crit
 * roll, exactly as the draw does). */
function shownText(effect: Effect): string {
  return effect.kind === "damage"
    ? formatCompact(effect.value ?? 0)
    : (effect.text ?? "");
}

function shownScale(effect: Effect): number {
  return effect.kind === "damage"
    ? damageTextScale(effect.crit ?? false, effect.critPower)
    : (effect.scale ?? 1);
}

/** The rows a spot's live floats are sitting in right now, as [bottom, top]
 * pairs measured UP from the newcomer's own anchor. Module-scoped and reused:
 * a heavy fight spawns dozens of numbers a second and none of them should cost
 * an allocation. */
const bands: number[] = [];

/**
 * How far above its anchor a float has to sit to land in a free row, in screen
 * px. 0 when the spot is free — the overwhelmingly common case, and the one that
 * must cost nothing.
 */
export function floatLift(
  effects: readonly Effect[],
  pos: Vec2,
  nowMs: number,
  text: string,
  scale = 1,
): number {
  const halfWidth = textWidth(text, scale) / 2;
  const height = LANE_LINE_PX * scale;
  bands.length = 0;
  for (const effect of effects) {
    if (effect.kind !== "text" && effect.kind !== "damage") continue;
    if (nowMs > effect.untilMs) continue;
    // Where this one sits RELATIVE TO THE NEWCOMER on the glass — through the
    // live projection, because the pitch squashes the world's y and a yawed
    // camera mixes the two axes into each other.
    const dx = effect.pos.x - pos.x;
    const dy = effect.pos.y - pos.y;
    const screenX = projectX(dx, dy);
    const screenY = projectY(dx, dy);
    if (Math.abs(screenY) > LANE_REACH_PX) continue;
    const otherScale = shownScale(effect);
    const reach =
      halfWidth + textWidth(shownText(effect), otherScale) / 2 + LANE_GAP_PX;
    if (Math.abs(screenX) > reach) continue;
    // How far it has ALREADY climbed (its rise eased over its life — close
    // enough without replaying the shake timeline, which only delays the climb).
    // A damage number is pinned to the body and never climbs, so it holds its
    // row for its whole life.
    const duration = effect.durationMs ?? 650;
    const risen =
      effect.kind === "damage"
        ? 0
        : (effect.rise ?? 16) *
          clamp01(1 - (effect.untilMs - nowMs) / duration);
    // Its glyph row, measured up from OUR anchor: the anchors differ on screen,
    // and a float further down the glass occupies a lower row than its own lift
    // suggests.
    const bottom = (effect.lift ?? 0) + risen - screenY;
    bands.push(bottom, bottom + LANE_LINE_PX * otherScale);
  }
  if (bands.length === 0) return 0;
  // Sweep the rows from the ground up, stepping over each one that the newcomer
  // would land in. Taking the gap UNDER a half-risen float is the point: the
  // ladder only grows as tall as the fight actually needs.
  let lift = 0;
  for (let pass = 0; pass < bands.length / 2; pass++) {
    let moved = false;
    for (let i = 0; i < bands.length; i += 2) {
      const bottom = bands[i]!;
      const top = bands[i + 1]!;
      if (top > lift && bottom < lift + height) {
        lift = top;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return Math.min(Math.round(lift), LANE_MAX_PX);
}

/** A floating word, minus the two things this module decides for it. */
export type FloatSpec = Omit<Effect, "kind" | "lift"> & { text: string };

/**
 * Push a floating word in the first row clear of whatever already occupies its
 * spot. A MULTI-LINE block (a boss's bark) simply pushes its lines one at a
 * time, bottom line first: each one sees the row the last took and lands above
 * it, so the paragraph lays itself out through the same allocator.
 */
export function pushFloat(
  effects: Effect[],
  nowMs: number,
  spec: FloatSpec,
): void {
  effects.push({
    ...spec,
    kind: "text",
    lift: floatLift(effects, spec.pos, nowMs, spec.text, spec.scale),
  });
}

/** …and the hit numbers, which say their piece in `value` and size themselves
 * off the crit roll. Same rows, same list — a damage number and an XP float over
 * one body are two messages and want two lines. */
export function pushDamage(
  effects: Effect[],
  nowMs: number,
  spec: Omit<Effect, "kind" | "lift"> & { value: number },
): void {
  effects.push({
    ...spec,
    kind: "damage",
    lift: floatLift(
      effects,
      spec.pos,
      nowMs,
      formatCompact(spec.value),
      damageTextScale(spec.crit ?? false, spec.critPower),
    ),
  });
}

/**
 * A FLOAT THAT BELONGS TO A BODY GOES WHERE THE BODY GOES — run once a tick,
 * beside `expireEffects`.
 *
 * Almost nothing needs this: combat text belongs to the BLOW, and the blow
 * happened at a spot no amount of walking moves. A HERO'S OWN LINE is the
 * exception, because the man saying it is the thing that moves — three words
 * thought pulling off a driveway (`heroThought`, engine/game/story.ts) live
 * nearly two seconds, which at driving speed is most of a street. Left pinned,
 * the wagon drives out from under them and the words read as belonging to the
 * tarmac rather than to the driver.
 *
 * The lane the float was given at spawn (`lift`) is NOT recomputed: it was the
 * free row over a spot the float has now left, and re-allocating it every tick
 * would make a word that is already moving jitter between rows as it went.
 *
 * `bodies` is the seat list — `state.players`. A seat that is not there (a
 * client holding fewer, a hero gone from the world) simply leaves the float
 * where it was, which is the old behaviour and a fine one.
 */
export function trackFloats(
  effects: readonly Effect[],
  bodies: readonly { pos: Vec2 }[],
): void {
  for (const effect of effects) {
    const follow = effect.follow;
    if (!follow) continue;
    const body = bodies[follow.seat];
    if (!body) continue;
    effect.pos.x = body.pos.x;
    effect.pos.y = body.pos.y - follow.dy;
  }
}
