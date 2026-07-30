// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT COMES BACK ON HIM — the blood the hero is wearing.
//
// The floor already remembers every blow (`render/blood-ground.ts`); this is the
// same idea pointed at the man doing the killing. Cut something open at arm's
// length and you do not walk away clean, and a hero who stays factory-fresh
// through six hundred bodies is the single loudest thing telling the player none
// of it happened. So he SOAKS: the spray that misses the floor lands on him, it
// only ever builds up, and by the end of a bad map he is the horror-film shot.
//
// Three rules hold the whole feature up.
//
//  1. **IT IS PRICED OFF THE BLOW THAT MADE IT** — the very `BloodBlow` the
//     spray and the floor are priced off (blood-hit.ts), so the hero, the ground
//     and the burst can never disagree about how bad a hit was. Nothing here
//     re-reads the damage.
//
//  2. **IT IS ZONED, AND A ZONE IS A GEAR SLOT.** The soak is five numbers, one
//     per armor slot plus the weapon, because the thing that CLEANS a zone is
//     putting something new on it: swap the breastplate and the front of him is
//     fresh again, while the helmet he has worn all level is still crusted, and a
//     blade picked up off the floor comes up clean in his hand. Held per slot
//     rather than per costume, so a swap clears exactly what was swapped — and
//     the head zone is his FACE when he has nothing on it, which is why nothing
//     is ever cleaned by any other means. There is no decay. He does not wipe it
//     off.
//
//  3. **AND THE FLOOR MARKS HIM BACK.** Standing in a pool wets the BOOTS
//     directly, fast, and the shins a little — the half of the feature that needs
//     no fight at all: cross ground something else died on and you come out of it
//     red from the ankles down, which is exactly what the boots then track across
//     the clean floor (`render/blood-tracks.ts`). It stops at the knees. Nothing
//     the floor does reaches his chest or his face.
//
//  4. **WHAT IS THROWN AT HIM ONLY LANDS AT CONTACT RANGE, AND THAT IS THE WHOLE
//     BUILD DIFFERENCE.**
//     A blow marks him if it landed about a melee swing away and not otherwise —
//     so a hero who kills things by walking up to them wears every one of them,
//     and one who kills at two hundred px stays clean unless something dies at
//     his feet. Nothing here reads the weapon's CLASS: the difference between a
//     bladed build and a gunslinger falls out of where the bodies were, which is
//     also why a mage cornered in a doorway gets exactly as filthy as he should.
//     Distance mixes the ZONES too — his front takes it at any contact range, his
//     face only from the ones that died against him.
//
// No canvas anywhere near it: a pure rule over the hit, so it stays testable and
// `render/hero-coat.ts` (which knows nothing but four numbers) does the drawing.

import { type GameState } from "@game/core";

import { clamp01 } from "@game/lib/vec.ts";

import { bloodAmount, type BloodBlow } from "./blood-hit.ts";

/** The zones of the hero the blood is tracked over — the four armor slots plus
 * what he is holding, in paint order. A zone IS a slot: what cleans one is
 * putting something new on it. */
export const SOAK_ZONES = ["head", "chest", "legs", "feet", "weapon"] as const;
export type SoakZone = (typeof SOAK_ZONES)[number];

/** How soaked each zone is, 0 (clean) to 1 (drenched). */
export type HeroSoak = Record<SoakZone, number>;

/** How much of a blow reaches each zone, before distance. The wound is at the
 * victim's own height, so his FRONT takes most of it, his head only what is
 * thrown high, and his legs and boots the runoff — plus everything he then walks
 * through, which is the wade below. */
const ZONE_SHARE: Record<SoakZone, number> = {
  head: 0.6,
  chest: 1,
  legs: 0.5,
  feet: 0.28,
  // The most of anything, and obviously: it is the thing that opened the body.
  // A gun at its own working range never gets near a kill and stays clean on the
  // same rule, so the blade-runs-red look needs no weapon-class check anywhere.
  weapon: 1.25,
};

/** How much harder the HEAD's share falls off with distance than the rest of
 * him. A body opened up at arm's length goes over the man doing it; the same
 * blow two strides away does not reach his face. Above 1 so his face is always
 * the last thing to go — but only just: the face is the whole horror shot, and
 * squaring it (the first attempt) left him fighting through an abattoir with a
 * clean visor, which reads as a bug rather than as restraint. */
const HEAD_FALLOFF = 1.3;

/** Soak one full-volume blow landed point-blank is worth.
 *
 * The ladder is meant to be climbed over a MAP, not over a pack: a hero drenched
 * by his fourth kill has nowhere left to go for the next ten minutes, and one
 * still pristine at the boss never had the feature at all. Measured on real
 * autopilot runs of SPACEZ HQ, this puts a bladed hero's chest into the top rung
 * somewhere around the two-hundredth body — most of the way through a map — with
 * his face following a good while after, while a gunslinger over the same stretch
 * comes out at less than half of it. */
const SOAK_PER_BLOW = 0.075;

/** CONTACT RANGE, in world px — how far a blow can land and still mark him.
 * Held UNDER a melee swing's own reach (the shipped blades run 24–48 px),
 * because that is exactly the promise: things that die against you go over you.
 * A ranged weapon works at 160–300 px, so it marks a gunslinger only when
 * something gets close enough to die in his face — which is the right answer
 * rather than an exemption, and the reason the two builds look different without
 * a line of code reading a weapon's class. Measured: generous is the failure
 * mode here. At 40 px a ranged autopilot came out DIRTIER than a melee one,
 * because in a swarm map almost everything eventually dies within a stride. */
const SPLASH_RANGE = 28;
/** …plus a share of the blow's OWN spray reach, capped. A body that genuinely
 * bursts throws further than one that is cut, and should catch him from a step
 * further back — but the cap is what stops a vast ranged one-shot across the
 * room painting a man who was never near it. */
const SPLASH_REACH_SHARE = 0.25;
const SPLASH_RANGE_MAX = 52;

/** Soak per second of WADING through a fully-soaked tile, and the share of it
 * the shins take over the boots.
 *
 * The boots get it FAST, because they are the part of him that is actually in it
 * — cross a pool and they come out red, whatever he is fighting with, which is
 * the whole point of the second half of this feature. The legs only get what
 * splashes up, so their share is small: the wade is the one source of soak that
 * does not care how he fights, and a generous one climbing past his knees would
 * quietly erase the difference between a build that kills at arm's length and one
 * that never does. It never reaches his chest or his face at all. */
const WADE_PER_SEC = 0.2;
const WADE_LEG_SHARE = 0.22;
/** The longest step the wade will bill in one go (ms). A frame lost to a level
 * load or a backgrounded tab must not soak him through in one tick. */
const WADE_MAX_STEP_MS = 100;

/** The soak ladder: how soaked a zone must be to reach each rung of authored
 * art, and the alphas a rung is drawn between so a zone darkens continuously
 * rather than stepping. The top rung is held under 1 — blood soaks INTO what he
 * is wearing (the coat multiplies, see render/hero-coat.ts) and a coat at full
 * strength stops reading as blood on a suit and starts reading as a red suit. */
export const COAT_AT = [0.06, 0.34, 0.72];
const COAT_ALPHA_MIN = 0.4;
const COAT_ALPHA_MAX = 0.94;

/** One piece of coat art to draw over a zone: the sprite and how hard. */
export type CoatLayer = { sprite: string; alpha: number };

const CLEAN: HeroSoak = { head: 0, chest: 0, legs: 0, feet: 0, weapon: 0 };

/** The run this soak belongs to — the same ownership trick the floor's
 * saturation grid uses: `step()` mutates state in place, so the object identity
 * IS the run and a new level, a retry after a death or a fresh mount hands us a
 * different object and the hero turns up clean. */
let owner: GameState | null = null;
let soak: HeroSoak = { ...CLEAN };
/** The `Equipment.id` worn in each slot when it was last looked at — the thing
 * a swap is detected by. `null` is an empty slot, which is still a state a swap
 * can move away from (putting the first helmet on cleans his head). */
let worn: Record<SoakZone, number | null> = {
  head: null,
  chest: null,
  legs: null,
  feet: null,
  weapon: null,
};

/** Wipe it — a new run, or a hot reload. */
export function resetHeroSoak(): void {
  owner = null;
  soak = { ...CLEAN };
  worn = { head: null, chest: null, legs: null, feet: null, weapon: null };
}

function ensureRun(state: GameState): void {
  if (owner === state) return;
  owner = state;
  soak = { ...CLEAN };
  worn = { head: null, chest: null, legs: null, feet: null, weapon: null };
  syncHeroGear(state);
}

/**
 * How soaked the hero is right now — all zeroes when he is clean, when the gore
 * gate is shut, or when this isn't the run we've been tracking.
 */
export function heroSoak(state: GameState): HeroSoak {
  if (owner !== state) return CLEAN;
  // Gore switched off mid-run washes him clean on the spot. Reading the gate
  // here is NOT the draw-time gate this system forbids: nothing accumulates
  // while it is shut (`soakHero` and `wadeHero` stop at the same check), so
  // there is no hidden mess waiting to be handed back — switching it on again
  // returns him to exactly what he was wearing when it went off.
  if (bloodAmount() == null) return CLEAN;
  return soak;
}

/**
 * Notice gear changing hands and wash the zones it changed.
 *
 * The one way a zone ever gets cleaner. Compared on the piece's INSTANCE id
 * rather than its def id, so swapping one pair of boots for an identical pair
 * still counts — they are a different pair, and they are clean.
 *
 * Called every frame from the tracks' step, which is cheap (four comparisons)
 * and means nothing has to remember to announce a swap: auto-equip, the shop,
 * the inventory screen and a story grant all clean him by construction.
 */
export function syncHeroGear(state: GameState): void {
  ensureRun(state);
  for (const zone of SOAK_ZONES) {
    const id = state.player.equipment[zone]?.id ?? null;
    if (worn[zone] === id) continue;
    worn[zone] = id;
    soak[zone] = 0;
  }
}

/**
 * A blow landed at `at` — put what sprayed back onto the hero.
 *
 * `blow` is the very one the floor and the spray were priced off, so nothing
 * here re-reads the damage; all this decides is how much of it came his way,
 * which is a question about how close he was standing.
 */
export function soakHero(
  state: GameState,
  blow: BloodBlow,
  at: { x: number; y: number },
): void {
  const amount = bloodAmount();
  if (amount == null) return;
  ensureRun(state);
  const dist = Math.hypot(at.x - state.player.pos.x, at.y - state.player.pos.y);
  // CONTACT range, widened a little by how violently this particular body came
  // apart and capped so it stays contact range. Everything past it lands on the
  // floor and on nobody.
  const range = Math.min(
    SPLASH_RANGE_MAX,
    SPLASH_RANGE + blow.reach * SPLASH_REACH_SHARE * blow.body,
  );
  const closeness = clamp01(1 - dist / range);
  if (closeness <= 0) return;
  // VOLUME, not force: how much blood there was to land on him. Force already
  // had its say in the reach that got it here.
  const landed = blow.volume * SOAK_PER_BLOW * amount;
  for (const zone of SOAK_ZONES) {
    const height = zone === "head" ? closeness ** HEAD_FALLOFF : closeness;
    soak[zone] = Math.min(1, soak[zone] + landed * ZONE_SHARE[zone] * height);
  }
}

/**
 * He is standing in it — wet his boots and the legs above them.
 *
 * `wetness` is the floor's own saturation under his feet, 0..1 — and its floor is
 * LOWER than the trail's pickup threshold on purpose: there can be far too little
 * on a tile to track a print out of and still plenty to stain a boot.
 */
export function wadeHero(
  state: GameState,
  wetness: number,
  dtMs: number,
): void {
  const amount = bloodAmount();
  if (amount == null || wetness <= 0 || dtMs <= 0) return;
  ensureRun(state);
  const dt = Math.min(dtMs, WADE_MAX_STEP_MS) / 1000;
  const gain = WADE_PER_SEC * clamp01(wetness) * amount * dt;
  soak.feet = Math.min(1, soak.feet + gain);
  soak.legs = Math.min(1, soak.legs + gain * WADE_LEG_SHARE);
}

/** Whether anything is soaked at all — the cheap check the renderer leans on so
 * a clean hero costs it no compositing whatsoever. */
export function anySoak(soaked: HeroSoak): boolean {
  return SOAK_ZONES.some((zone) => soaked[zone] >= COAT_AT[0]!);
}

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
