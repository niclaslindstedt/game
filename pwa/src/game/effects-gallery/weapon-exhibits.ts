// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The EFFECTS GALLERY's WEAPON shelves, GENERATED from the weapons that carry a
// signature (`UniqueDef.fx`) rather than hand-listed: one exhibit per styled
// weapon, plus the three plain class looks. Author a signature onto a weapon and
// its exhibit appears in the gallery on the next build — the shelf can't fall
// behind the FX it is there to show (`effects_gallery_test.ts` holds that line).
//
// A weapon's own base decides how it is staged: a MELEE base swings (a synthetic
// `swing` event, aimed at the crowd), a RANGED/MAGIC base is handed to the hero
// LIVE — he fires it himself at the posed targets, so the muzzle flash, the
// projectile trail and the impact are all the engine's own.

import {
  activeUniqueDefs,
  equipmentIcon,
  isWeaponDef,
  uniqueDef,
  weaponDef,
  type WeaponClass,
} from "@game/core";

import {
  horde,
  strike,
  swingEvent,
  type Exhibit,
  type ExhibitCtx,
} from "./exhibit-kit.ts";

/** The plain (unsignatured) base weapon shown for each class — the look every
 * un-listed weapon of that class wears. */
const PLAIN_WEAPONS: Record<WeaponClass, string> = {
  melee: "medieval_sword",
  ranged: "nine_mm",
  magic: "ember_wand",
};

/** A weapon exhibit's staging: swing it, or let the hero fire it for real. */
function weaponExhibit(opts: {
  id: string;
  label: string;
  blurb: string;
  keywords: string[];
  /** The weapon in hand: a base def id or a UNIQUE_DEFS id. */
  weapon: string;
  /** Which look it wears — the base's class. */
  weaponClass: WeaponClass;
  icon: string;
}): Exhibit {
  const melee = opts.weaponClass === "melee";
  return {
    id: opts.id,
    label: opts.label,
    blurb: opts.blurb,
    group: melee ? "MELEE" : "SHOTS",
    icon: opts.icon,
    keywords: [opts.weaponClass, ...opts.keywords],
    stage: melee
      ? // Posed targets inside blade reach: the swing is fired as an event so
        // the arc plays on cue rather than on the weapon's own cooldown.
        { weapon: opts.weapon, spawns: horde(6, 26, 60) }
      : // Armed and live: he picks his own targets and pulls the trigger, so
        // the flash, the round in flight and its trail are all real.
        { weapon: opts.weapon, disarmed: false, spawns: horde(10, 56, 150) },
    showMs: melee ? 700 : 1200,
    fire: melee
      ? (ctx: ExhibitCtx) => {
          ctx.emit(swingEvent(ctx));
          strike(ctx, 3);
        }
      : undefined,
  };
}

/** The class of the weapon a unique is built on, or null if it isn't a weapon
 * (a signature style keyed on a non-weapon id would be a catalog mistake). */
function uniqueWeaponClass(id: string): WeaponClass | null {
  const def = uniqueDef(id);
  if (def.slot !== "weapon" || !isWeaponDef(def.base)) return null;
  return weaponDef(def.base).class;
}

/**
 * Every weapon carrying a signature (`fx:` in its own YAML) as its own exhibit,
 * plus the plain class looks. Its BASE decides which shelf it lands on and how
 * it is staged: a blade swings, a gun or a wand is fired for real. A signature
 * on something that is not a weapon is skipped rather than shown swinging.
 */
export function weaponExhibits(): Exhibit[] {
  const plain: Exhibit[] = (["melee", "ranged", "magic"] as WeaponClass[]).map(
    (cls) =>
      weaponExhibit({
        id: `plain-${cls}`,
        label:
          cls === "melee"
            ? "PLAIN BLADE"
            : cls === "ranged"
              ? "PLAIN GUNFIRE"
              : "PLAIN SPELLCAST",
        blurb:
          cls === "melee"
            ? "THE BASE SLASH EVERY UNSIGNED BLADE SWINGS"
            : cls === "ranged"
              ? "THE BASE MUZZLE FLASH AND ROUNDS OF AN UNSIGNED GUN"
              : "THE BASE CAST RING AND BOLT OF AN UNSIGNED WAND",
        keywords: ["plain", "base", "default", "unsigned"],
        weapon: PLAIN_WEAPONS[cls],
        weaponClass: cls,
        icon: equipmentIcon(PLAIN_WEAPONS[cls]),
      }),
  );

  const signature = activeUniqueDefs()
    .filter((d) => d.fx)
    .map((d) => d.id)
    .sort()
    .flatMap((id) => {
      const cls = uniqueWeaponClass(id);
      // A signature on a piece of armor has nothing to draw; skip it rather
      // than stage a breastplate mid-swing.
      if (!cls) return [];
      const kind = cls === "melee" ? "slash" : "shot";
      const def = uniqueDef(id);
      return [
        weaponExhibit({
          id: `${kind}-${id.replace(/_/g, "-")}`,
          label: def.name.toUpperCase(),
          blurb:
            kind === "slash"
              ? "ITS SIGNATURE SLASH AND THE GORE IT THROWS"
              : "ITS SIGNATURE MUZZLE FLASH AND THE TRAIL IT LEAVES",
          keywords: [
            "unique",
            "signature",
            kind,
            def.tier ?? "unique",
            id.replace(/_/g, " "),
            weaponDef(def.base).name.toLowerCase(),
          ],
          weapon: id,
          weaponClass: cls,
          icon: equipmentIcon(def.base),
        }),
      ];
    });

  return [...plain, ...signature];
}
