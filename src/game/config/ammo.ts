// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AMMUNITION: the resource a RANGED weapon spends instead of wearing out.
// Three kinds, the pouch they stack in, what a pickup carries, and how hard
// the drop ladder leans toward the one the hero's holster actually eats.

import type { AmmoType } from "../types/core.ts";

/**
 * Every ammunition kind, in pouch order (the HUD and the inventory read it) —
 * the runtime companion to the `AmmoType` union, which carries the reasoning
 * for why there are three of them and not eleven. A ranged weapon spends ONE
 * of its kind per TRIGGER PULL: a shotgun's eight pellets are one shell, a
 * VOLLEY talent's extra arrows are one nock.
 */
export const AMMO_TYPES: readonly AmmoType[] = ["bullets", "arrows", "cells"];

/**
 * The per-kind presentation and pickup sizing. `name` is what a pickup card
 * announces, `sprite` what lies on the ground, `icon` what the HUD and the
 * pouch draw, and `pickup` the band a single dropped box/quiver/pack carries.
 *
 * The bands differ because the weapons that eat them do: a firearm's cadence
 * is the fastest in the game, so bullets fall in the deepest boxes; arrows and
 * cells come in smaller lots because a bow and a rail gun each get more out of
 * one. Every band is authored against the 200-deep stack below — a single find
 * is a meaningful top-up, never a whole pouch.
 */
export const AMMO_KINDS: Record<
  AmmoType,
  {
    /** Pickup-card name. */
    name: string;
    /** Ground-item sprite. */
    sprite: string;
    /** HUD / pouch icon (12×12, the equipment-icon family). */
    icon: string;
    /** How many rounds one dropped pickup carries, `[min, max]` inclusive. */
    pickup: [number, number];
  }
> = {
  bullets: {
    name: "BULLETS",
    sprite: "ammo_bullets",
    icon: "icon_ammo_bullets",
    pickup: [14, 30],
  },
  arrows: {
    name: "ARROWS",
    sprite: "ammo_arrows",
    icon: "icon_ammo_arrows",
    pickup: [10, 22],
  },
  cells: {
    name: "CELLS",
    sprite: "ammo_cells",
    icon: "icon_ammo_cells",
    pickup: [10, 20],
  },
};

/**
 * The ammunition economy. The pouch is a POUCH and not bag cells on purpose:
 * ammo the hero cannot pick up because he is carrying a spare helmet is a
 * frustration with nothing to say, and the bag's own pressure (loot vs loot)
 * is a better game than loot vs bullets.
 */
export const AMMO = {
  /**
   * How deep ONE KIND stacks. Each kind has its own stack, so a hero may hold
   * 200 bullets AND 200 arrows AND 200 cells — the cap is what a kind is worth
   * hoarding, not what the pouch weighs. A pickup that would overflow tops the
   * stack up to the cap and leaves the remainder on the ground, so the last
   * few rounds of a box are never simply destroyed.
   */
  stackCap: 200,
  /**
   * THE OPENING HOLSTER: how many rounds of the SIDEARM's kind a run starts
   * with. A hundred shots is a long opening — over a minute of steady fire —
   * which is the point: the first thing a new player learns about ammunition
   * should be that it exists, not that it is about to run out.
   */
  starting: 100,
  /**
   * The share of the KILL drop ladder ammunition takes, alongside `LOOT`'s
   * medkit / repair / drink slices (and fitted under the same one roll they
   * are — see `dropLoot`). Read through `ammoAppetite`, so this is what a hero
   * with a half-empty pouch and a ranged weapon in hand earns; a hero swinging
   * a sword earns `offClassShare` of it and a full pouch earns the floor.
   *
   * Sized between the medkit and repair slices. Ammunition is spent
   * CONTINUOUSLY rather than in deliberate gulps, so a shooter burns through
   * far more of it than of anything else in the ladder — but the crates are
   * meant to be where he actually stocks up, and a rain that keeps him topped
   * up from kills alone would make walking to them pointless.
   */
  dropShare: 0.15,
  /**
   * A hero holding a MELEE or MAGIC weapon still finds the odd box — this much
   * of the slice — because the weapon he is holding now is not the weapon he
   * will be holding in five minutes, and a pouch that only fills while you are
   * already armed for it makes swapping to a found rifle a punishment.
   */
  offClassShare: 0.3,
  /**
   * SUPPLY: the pouch fill at which ammunition's slice starts thinning, and
   * the floor a completely full pouch still earns — the `CONSUMABLES` appetite
   * shape, retuned for a resource that is spent continuously rather than in
   * discrete gulps. The taper starts LATE (a 60%-full pouch is still a pouch
   * with room) and the floor is LOW, because unlike a medkit there is nothing
   * strategic about a box of bullets you cannot lift.
   */
  appetiteStart: 0.6,
  appetiteFloor: 0.12,
  /** …and the NEED lean a bone-dry pouch adds on top (the `CONSUMABLES` idiom). */
  appetiteNeedBonus: 1.5,
  /**
   * How many boxes of AMMUNITION a special CHEST pays on top of its marquee
   * item and its consumables. A weapon locker is a weapon locker: the reason
   * to detour for one is that it settles the ammunition question for a while,
   * and a single box would not.
   *
   * (A plain crate's ammunition weight lives with the rest of its spill, in
   * `CRATES.drop.ammo`.)
   */
  chestDrops: 2,
  /**
   * THE MERCY ROPE. A hero whose pouch is under this fraction of a full stack
   * of the kind his weapon eats — with nothing else in the bag he can fight
   * with — is in the one genuinely unrecoverable state ammunition can create,
   * and the rescue ladder answers it like any other (see `items/mercy.ts`).
   * The ramp reaches full desperation at empty.
   */
  mercyStart: 0.08,
  /**
   * …and how hard the slice widens at full desperation (`1 + this × ramp`),
   * flown in by the guardian like every other rescue.
   *
   * DELIBERATELY NOT PER-DIFFICULTY, unlike every other mercy bonus. The
   * others taper to nothing by JESUS because they are KINDNESSES — a dying
   * hero on the top rung is supposed to back off rather than loot his way out.
   * This one is not a kindness, it is the guard on the only genuinely
   * unrecoverable state the system can create: a hero holding a weapon he
   * cannot fire, with nothing in the bag he can fight with, cannot kill his
   * way back to a drop no matter how well he plays. That is a soft lock at
   * every difficulty, so the rope hangs at every difficulty.
   */
  mercyBonus: 4,
  /**
   * How many rounds a mercy delivery carries — a real reprieve rather than a
   * teaspoon, because the drop only fires when the hero is otherwise finished.
   */
  mercyAmount: 40,
} as const;
