// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DOES THIS BLOW CUT, OR DOES IT CRUSH — the one question a body has to be able
// to ask about the thing that killed it.
//
// Its own leaf beside `toss.ts` for the same reason: it is a rule over the
// catalogs and nothing else, so the two paths that land a weapon blow (the
// hero's melee sweep in step/weapon.ts, a companion's in companions.ts) can
// both read it without either owning it, and a test can ask it without building
// a run.
//
// The engine does not care about the answer. Damage, reach, cadence, armor and
// crit are all untouched by it — it rides out on the `enemyKilled` event as
// `edged` purely so the APP can decide how the body comes apart (an edged blow
// cleaves it in two, a blunt one bursts it into gibs; see
// pwa/src/game/game-screen/kill-presentation.ts). That is deliberate: sharpness
// is a property of a weapon, which is CONTENT, and the alternative — an
// app-side list of which weapon names sound like hammers — would drift the
// moment anyone authored a new one, and a MOD's weapon could never be in it.
//
// ONE RULE, and it is the default that carries it: a melee weapon is SHARP
// unless it says otherwise, and everything else is BLUNT whatever it says. Most
// things that swing are blades, so the mauls and the batons are the short list
// that declares itself; a bullet, a bolt, a bomb, a hazard and a bare fist are
// all blunt by construction and none of them has an `edge` to author.
//
// THE THIRD WORD IS `shred`, AND IT IS NOT A THIRD OUTCOME. A chainsaw neither
// cuts a body in two nor crushes it — it reduces it — so a def has to be able
// to say so, and authoring one `blunt` would be a lie in the catalog rather
// than a shortcut in the app. What the hit paths pass along is still the one
// BIT the presentation asks (`isEdgedWeapon` — does this open a body along a
// line?), so a shredded body bursts exactly as a crushed one does and the event
// never had to grow a field. When a burst by teeth wants its own picture, the
// word is already in the catalog waiting for it.

import { isWeaponDef, weaponDef, type WeaponEdge } from "../defs/equipment.ts";

export type { WeaponEdge };

/**
 * How `defId` lands, in one word. Unknown ids (a fixture, a retired base still
 * sitting in an old save) read as blunt — the plainest of the deaths.
 */
export function weaponEdge(defId: string): WeaponEdge {
  if (!isWeaponDef(defId)) return "blunt";
  const def = weaponDef(defId);
  if (def.class !== "melee") return "blunt";
  return def.edge ?? "sharp";
}

/** Whether `defId` cuts — the form the hit paths actually pass along. */
export function isEdgedWeapon(defId: string): boolean {
  return weaponEdge(defId) === "sharp";
}
