// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW SOAKED IS SOAKED — the hero's blood ladder, and nothing else.
//
// Its own leaf for the same reason `./blood-rungs.ts` is one, and for one more
// that is load-bearing: **this half of the feature is on the app's STARTUP
// PATH.** The roster portraits dress a saved hero through `paper-doll.ts`, which
// has to know what a coat looks like — and its neighbour `hero-soak.ts`, which
// keeps the live run's soak, necessarily names a `GameState`. Under
// `verbatimModuleSyntax` an `import { type GameState } from "@game/core"` still
// emits the module for its side effects, so importing that file from the
// paper-doll dragged the WHOLE ENGINE into the 200 KB critical-path budget (it
// went to 328 KB, and CI said so). Splitting the ladder off is what keeps the
// menus reaching only the arithmetic.
//
// So: no engine import here, no canvas, no run state. Five numbers in, sprite
// names and alphas out.

import { clamp01 } from "@game/lib/vec.ts";

/** The zones of the hero the blood is tracked over — the four armor slots plus
 * BOTH arms, in paint order. A zone IS a slot: what cleans one is putting
 * something new on it, which is why the second arm gets its own rather than
 * being folded into the chest. A shield held up all map is the piece of him
 * that has caught the most of it, and swapping the shield is what wipes it. */
export const SOAK_ZONES = [
  "head",
  "chest",
  "legs",
  "feet",
  "offhand",
  "weapon",
] as const;
export type SoakZone = (typeof SOAK_ZONES)[number];

/** How soaked each zone is, 0 (clean) to 1 (drenched). */
export type HeroSoak = Record<SoakZone, number>;

/** A hero with nothing on him — a fresh run, a saved hero on the roster, or the
 * answer when the gore gate is shut. */
export const NO_SOAK: HeroSoak = {
  head: 0,
  chest: 0,
  legs: 0,
  feet: 0,
  offhand: 0,
  weapon: 0,
};

/** The soak ladder: how soaked a zone must be to reach each rung of authored
 * art, and the alphas a rung is drawn between so a zone darkens continuously
 * rather than stepping. The top rung is held under 1 — blood soaks INTO what he
 * is wearing (the coat multiplies, see ./hero-coat.ts) and a coat at full
 * strength stops reading as blood on a suit and starts reading as a red suit. */
export const COAT_AT = [0.06, 0.34, 0.72];
const COAT_ALPHA_MIN = 0.4;
const COAT_ALPHA_MAX = 0.94;

/** One piece of coat art to draw over a zone: the sprite and how hard. */
export type CoatLayer = { sprite: string; alpha: number };

/**
 * The coat art for one zone at one soak: which rung of the ladder it has
 * reached, and how hard to lay it on.
 *
 * The alpha RAMPS inside a rung, exactly as the floor's saturation does, so the
 * hero darkens continuously and only ever CHANGES ART when he has genuinely
 * climbed a rung — the thing that makes a three-rung ladder read as a build-up
 * rather than as three costumes.
 */
export function coatLayer(zone: SoakZone, soaked: number): CoatLayer | null {
  if (soaked < COAT_AT[0]!) return null;
  let rung = 0;
  while (rung + 1 < COAT_AT.length && soaked >= COAT_AT[rung + 1]!) rung++;
  const from = COAT_AT[rung]!;
  const to = COAT_AT[rung + 1] ?? 1;
  const into = clamp01((soaked - from) / Math.max(1e-6, to - from));
  return {
    sprite: `blood_coat_${zone}_${rung}`,
    alpha: COAT_ALPHA_MIN + (COAT_ALPHA_MAX - COAT_ALPHA_MIN) * into,
  };
}

/** The BODY's coat, in paint order — what the renderer soaks the doll's costume
 * and armor in. The weapon is separate (below) because it is drawn inside its
 * own swinging pivot, and blood masked into the standing doll would sit still
 * while the blade swept out from under it. */
export function bodyCoat(soaked: HeroSoak): CoatLayer[] {
  const layers: CoatLayer[] = [];
  for (const zone of SOAK_ZONES) {
    if (zone === "weapon") continue;
    const layer = coatLayer(zone, soaked[zone]);
    if (layer) layers.push(layer);
  }
  return layers;
}

/** The HELD WEAPON's coat — masked to the weapon sprite inside its own pivot, so
 * the blood rides the blade through the swing. */
export function weaponCoat(soaked: HeroSoak): CoatLayer[] {
  const layer = coatLayer("weapon", soaked.weapon);
  return layer ? [layer] : [];
}
