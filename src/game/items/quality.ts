// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Make quality (the BROKEN→PERFECT craftsmanship axis) and instance naming:
// the quality accessors and rolls every mint and durability read shares, the
// Diablo-style display name, and the generic weighted pick the loot rolls use.

import type { Rng } from "@game/lib/rng.ts";
import { randomRange } from "@game/lib/rng.ts";
import { QUALITY } from "../config/index.ts";
import {
  affixNaming,
  equipmentBaseName,
  gearDef,
  isWeaponDef,
  QUALITY_ORDER,
  QUALITY_PREFIX,
  weaponDef,
} from "../defs/equipment.ts";
import type { Equipment, Quality } from "../types.ts";

/**
 * Display name of an equipment instance, Diablo-style: a plain base type when
 * it rolled no affixes (regular tier), otherwise decorated with a prefix
 * and/or "of the X" suffix drawn from its affixes — CRUEL BEAKER OF THE FOX.
 * The name is derived from the stored affixes, so it is stable for the life of
 * the item; the tier still shows through the color the app paints it. Only the
 * first prefix-lending and first suffix-lending affix feed the name (extra
 * affixes on epic/legendary pieces still list their bonuses in full below it).
 */
export function equipmentName(equipment: Equipment): string {
  // A hand-authored unique carries its own fixed name — no base/affix compose.
  if (equipment.name) return equipment.name;
  const base = equipmentBaseName(equipment.defId);
  let prefix = "";
  let suffix = "";
  for (const affix of equipment.affixes) {
    const naming = affixNaming(affix);
    if (naming.prefix && !prefix) prefix = naming.prefix;
    if (naming.suffix && !suffix) suffix = naming.suffix;
  }
  // The make quality leads the whole name (BROKEN JAGGED PIPE OF THE FOX) —
  // the craftsmanship is the first thing a scavenger sees.
  const quality = QUALITY_PREFIX[qualityOf(equipment)].trim();
  return [quality, prefix, base, suffix].filter(Boolean).join(" ");
}

// ---- Make quality --------------------------------------------------------------

/** An instance's make quality; pieces from before quality shipped (and
 * hand-minted ones — starting gear, the fallback sidearm) read as normal. */
export function qualityOf(equipment: Equipment): Quality {
  return equipment.quality ?? "normal";
}

/** The stat scale an instance's make quality applies to its base's numbers
 * (damage, armor, durability, merchant value). Returns the specific value the
 * piece ROLLED within its quality band (`Equipment.qualityRoll`, config
 * `QUALITY.ranges`), stamped at mint and frozen for life — so two SUPERIOR
 * copies of a base scale differently. Falls back to the band's MIDPOINT
 * (`QUALITY.mults`) for charms/bags, magic+ finds, and legacy instances minted
 * before the range roll shipped. */
export function qualityMult(equipment: Equipment): number {
  return equipment.qualityRoll ?? QUALITY.mults[qualityOf(equipment)];
}

/**
 * Roll a specific base-value multiplier inside a make quality's band (config
 * `QUALITY.ranges`) — the number stamped onto a fresh gradeable drop's
 * `qualityRoll`. Uniform within the band, so a SUPERIOR piece lands anywhere
 * from a hair over NORMAL to well above it. Drawn off the caller's rng; the
 * mint pulls it from `fxRng` (the flavor stream) so the base-value spread never
 * perturbs the seeded loot sequence, exactly like the per-hit damage variance.
 */
export function rollQualityMult(rng: Rng, quality: Quality): number {
  const band = QUALITY.ranges[quality];
  return randomRange(rng, band.min, band.max);
}

/**
 * The FULL wear budget of an equipment instance: the def's authored
 * durability scaled by the instance's make quality — the same number the
 * mint stamped (see `rollEquipment`). The one figure repair kits refill to
 * and every durability readout calls "max", so a CRUDE piece never repairs
 * past what it was built with. Zero when the def carries no durability
 * (charms, bags).
 */
export function equipmentMaxDurability(piece: Equipment): number {
  const base = isWeaponDef(piece.defId)
    ? weaponDef(piece.defId).durability
    : (gearDef(piece.defId).durability ?? 0);
  if (!base || base <= 0) return 0;
  return Math.max(1, Math.round(base * qualityMult(piece)));
}

/**
 * Roll a drop's MAKE QUALITY off a level-`mlvl` killer: one weighted pick
 * whose odds slide with the monster level — `QUALITY.weightsLow` at mlvl 1,
 * `QUALITY.weightsHigh` from `QUALITY.highMlvl` up, lerped between. The
 * level-1 rank and file hand out mostly BROKEN and CRUDE work; the deep
 * campaign's monsters carry SUPERIOR and PERFECT pieces.
 */
export function rollQuality(rng: Rng, mlvl: number): Quality {
  const t = Math.min(1, Math.max(0, (mlvl - 1) / (QUALITY.highMlvl - 1)));
  const pool = QUALITY_ORDER.map((quality) => ({
    quality,
    weight:
      QUALITY.weightsLow[quality] +
      (QUALITY.weightsHigh[quality] - QUALITY.weightsLow[quality]) * t,
  }));
  return pickWeighted(rng, pool).quality;
}

export function pickWeighted<T extends { weight: number }>(
  rng: Rng,
  pool: T[],
): T {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1] as T;
}
