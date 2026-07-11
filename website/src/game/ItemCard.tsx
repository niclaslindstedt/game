// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shared item card — the single source of truth for how an equipment
// instance READS: its pixel icon (equipmentIcon → sprite) and the WoW-style
// stat/affix lines. The inventory tooltip (InventoryPanel), the arsenal viewer
// (ArsenalScreen), and anything else that shows an item all render through
// `ItemIcon` + `ItemCardBody`, so a change to how a stat is worded or colored
// lands everywhere at once and the surfaces never drift.

import {
  ACCURACY,
  armorValueOf,
  enemyDodgeChance,
  equipmentIcon,
  equipmentLevelReq,
  equipmentMaxDurability,
  equipmentName,
  gearDef,
  isWeaponDef,
  playerMissChance,
  STATS,
  weaponCritMult,
  weaponCooldownFor,
  weaponDamageFor,
  weaponDamageRange,
  weaponDef,
  weaponDps,
  weaponRangeFor,
  type Affix,
  type Equipment,
  type GameState,
  type StatName,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import {
  AFFIX_COLORS,
  TIER_COLORS,
  TIER_LABELS,
  tierGlowClass,
  WEAPON_CLASS_COLORS,
} from "./tiers.ts";

/** The item card's headline per gear slot (weapons headline their class). */
const SLOT_HEADLINES: Record<Exclude<Equipment["slot"], "weapon">, string> = {
  head: "HEAD ARMOR",
  chest: "CHEST ARMOR",
  legs: "LEG ARMOR",
  feet: "FOOT ARMOR",
  charm: "CHARM",
  bag: "BAG",
};

export const STAT_LABELS: Record<StatName, string> = {
  stamina: "STAMINA",
  strength: "STRENGTH",
  dexterity: "DEXTERITY",
  intelligence: "INTELLECT",
  speed: "SPEED",
  luck: "LUCK",
};

/** Positive = upgrade (green), negative = downgrade (red). */
export const DELTA_UP = "#5fd97a";
export const DELTA_DOWN = "#e06a6a";

export function affixLine(affix: Affix): string {
  switch (affix.kind) {
    case "damagePct":
      return `+${Math.round(affix.value * 100)}% DAMAGE`;
    case "maxHp":
      return `+${affix.value} MAX HP`;
    case "crit":
      return `+${Math.round(affix.value * 100)}% CRIT`;
    case "armor":
      return `+${affix.value} ARMOR`;
    case "stat":
      return `+${affix.value} ${STAT_LABELS[affix.stat]}`;
    case "statPct":
      return `+${Math.round(affix.value * 100)}% ${STAT_LABELS[affix.stat]}`;
    case "maxHpPct":
      return `+${Math.round(affix.value * 100)}% MAX HP`;
  }
}

/**
 * The hero's effective HIT rate against a standing foe: the chance a weapon
 * blow both clears the hero's own MISS and isn't DODGED by a default-evasion
 * enemy. DEXTERITY lifts both terms, so the panel shows the accuracy a build
 * actually plays with. Nimble mobs dodge more than this reference number.
 */
export function hitRate(state: GameState): number {
  return (
    (1 - playerMissChance(state)) *
    (1 - enemyDodgeChance(state, ACCURACY.enemyDodge))
  );
}

/** A stat line in the item card: text with an optional accent color (the
 * default white reads as a plain fact; a color flags a class or a bonus), plus
 * an optional green/red `(+3)` delta comparing this stat to the equipped
 * piece — only set on the lines that differ from what's worn. */
export type CardLine = {
  text: string;
  color?: string;
  delta?: { text: string; color: string } | null;
};

/**
 * Format the difference between an inspected stat and the equipped piece's for
 * the tooltip's `(+3)` comparison chip: green when the change is an upgrade,
 * red when it's a downgrade, null when it rounds to nothing (so identical
 * stats stay clean). `lowerBetter` flips the coloring for stats where less is
 * more — attack cadence, where a shorter time between swings is faster.
 */
function compareChip(
  delta: number,
  opts: { lowerBetter?: boolean; digits?: number } = {},
): { text: string; color: string } | null {
  const digits = opts.digits ?? 0;
  const rounded = Number(delta.toFixed(digits));
  if (rounded === 0) return null;
  const good = opts.lowerBetter ? rounded < 0 : rounded > 0;
  const sign = rounded > 0 ? "+" : "";
  return {
    text: `${sign}${rounded.toFixed(digits)}`,
    color: good ? DELTA_UP : DELTA_DOWN,
  };
}

/**
 * The item card's stat lines. When `equipped` is a different piece in the same
 * slot, each comparable stat carries a green/red `(+N)` delta versus what's
 * worn, so a bag find reads as an upgrade or a downgrade at a glance.
 */
export function itemLines(
  state: GameState,
  item: Equipment,
  equipped: Equipment | null,
): CardLine[] {
  const lines: CardLine[] = [];
  // The Diablo birth certificate: the item's own LEVEL (which sized its
  // affixes) and the base's requirement — red while the hero hasn't grown
  // into it (the engine refuses to equip it until then, see meetsLevelReq).
  const meta: CardLine[] = [
    { text: `ITEM LEVEL ${item.ilvl}`, color: "#9aa3ad" },
  ];
  const req = equipmentLevelReq(item.defId);
  if (req > 1) {
    meta.push({
      text: `REQUIRES LEVEL ${req}`,
      color: state.player.level < req ? "#e06a6a" : "#9aa3ad",
    });
  }
  if (isWeaponDef(item.defId)) {
    const def = weaponDef(item.defId);
    // Compare against the equipped weapon (only when inspecting a different
    // one) — the deltas below read this game's stats in the SAME hands, so a
    // bag find's numbers stack fairly against what's currently held.
    const eq = equipped && isWeaponDef(equipped.defId) ? equipped : null;
    // The weapon's class, tinted by class (magic=purple, melee=gold,
    // ranged=orange) so it reads as "what kind of weapon" — never confused
    // with the blue MAGIC quality tier the name color carries.
    lines.push({
      text: `${def.class.toUpperCase()} WEAPON`,
      color: WEAPON_CLASS_COLORS[def.class].border,
    });
    // Lead with DPS — the one figure that folds damage, attack speed, and crit
    // into "how hard this hits over time", so a slow heavy weapon and a quick
    // light one compare at a glance. Tinted the same accent as the character
    // sheet's derived combat stats.
    const dps = Math.round(weaponDps(state, item));
    lines.push({
      text: `DPS ${formatCompact(dps)}`,
      color: "#7ef0c8",
      delta: eq ? compareChip(dps - Math.round(weaponDps(state, eq))) : null,
    });
    // Show the damage this weapon would deal in the player's hands as the RANGE
    // every blow rolls inside (stats + affixes folded in), with the bonus of
    // the average over the raw base as a "+x" hint. A range, not a fixed
    // figure, because that is how the weapon actually hits.
    const effective = Math.round(weaponDamageFor(state, item));
    const { min, max } = weaponDamageRange(state, item);
    const bonus = effective - def.damage;
    lines.push({
      text:
        bonus > 0
          ? `DAMAGE ${formatCompact(min)}-${formatCompact(max)} (+${formatCompact(bonus)})`
          : `DAMAGE ${formatCompact(min)}-${formatCompact(max)}`,
      delta: eq
        ? compareChip(effective - Math.round(weaponDamageFor(state, eq)))
        : null,
    });
    // Attack speed as plain seconds between attacks (lower is faster). The
    // unit is spelled " SEC" — never a bare trailing "S", which the pixel font
    // renders close enough to a "5" to read as part of the number. The speed
    // stat (DEX for melee & ranged, INT for magic) quickens the cadence, so
    // show the base-relative time shaved off as a "-X" hint.
    const secs = weaponCooldownFor(state, item) / 1000;
    const saved = def.cooldownMs / 1000 - secs;
    lines.push({
      text:
        saved > 0.005
          ? `SPEED ${secs.toFixed(2)} SEC (-${saved.toFixed(2)})`
          : `SPEED ${secs.toFixed(2)} SEC`,
      // Shorter cadence is faster, so a smaller number is the upgrade.
      delta: eq
        ? compareChip(secs - weaponCooldownFor(state, eq) / 1000, {
            lowerBetter: true,
            digits: 2,
          })
        : null,
    });
    // Reach the same way: INTELLIGENCE lengthens every weapon's range.
    const effRange = Math.round(weaponRangeFor(state, item));
    const rangeBonus = effRange - def.range;
    lines.push({
      text:
        rangeBonus > 0
          ? `RANGE ${effRange} (+${rangeBonus})`
          : `RANGE ${effRange}`,
      delta: eq
        ? compareChip(effRange - Math.round(weaponRangeFor(state, eq)))
        : null,
    });
    // Projectile physics that multiply a shot's reach across the crowd — the
    // weapon's own, fixed count. (How many foes a MELEE swing cleaves is
    // INTELLIGENCE's business, not the weapon's — see maxMeleeTargets — so a
    // melee weapon carries no "hits up to" line here.)
    const p = def.projectile;
    const label =
      p?.count && p.count > 1
        ? `${p.count} PELLETS`
        : p?.pierce
          ? `PIERCES ${p.pierce + 1}`
          : p?.chain
            ? `CHAINS TO ${p.chain}`
            : null;
    if (label) {
      lines.push({ text: label, color: "#7ecbff" });
    }
    // The cadence-weighted crit when it differs from the global default —
    // slow weapons crit like trucks.
    const critMult = weaponCritMult(def);
    if (critMult !== STATS.critMultiplier) {
      lines.push({
        text: `CRIT DAMAGE X${critMult.toFixed(1)}`,
        color: AFFIX_COLORS.crit,
        delta: eq
          ? compareChip(critMult - weaponCritMult(weaponDef(eq.defId)), {
              digits: 1,
            })
          : null,
      });
    }
    const maxDur = equipmentMaxDurability(item);
    lines.push(
      item.durability === undefined
        ? { text: "UNBREAKABLE" }
        : {
            text: `DURABILITY ${item.durability}/${maxDur}`,
            // A near-broken weapon warns in red.
            color: item.durability <= maxDur * 0.25 ? "#e06a6a" : undefined,
          },
    );
  } else {
    const def = gearDef(item.defId);
    // Compare against the gear worn in the same slot.
    const eqGear =
      equipped && !isWeaponDef(equipped.defId) ? gearDef(equipped.defId) : null;
    lines.push({ text: SLOT_HEADLINES[def.slot] });
    // An armor piece leads with its rolled armor points (the ilvl-grown
    // stamp), compared against what the same slot wears now.
    if (def.armor !== undefined) {
      const value = armorValueOf({ ...item, durability: undefined });
      const worn = equipped ? armorValueOf(equipped) : 0;
      lines.push({
        text: `${value} ARMOR`,
        color: AFFIX_COLORS.armor,
        delta: equipped ? compareChip(value - worn) : null,
      });
    }
    if (def.bonuses.maxHp) {
      lines.push({
        text: `+${def.bonuses.maxHp} MAX HP`,
        color: AFFIX_COLORS.maxHp,
        delta: eqGear
          ? compareChip((def.bonuses.maxHp ?? 0) - (eqGear.bonuses.maxHp ?? 0))
          : null,
      });
    }
    if (def.bonuses.critChance) {
      lines.push({
        text: `+${Math.round(def.bonuses.critChance * 100)}% CRIT`,
        color: AFFIX_COLORS.crit,
        delta: eqGear
          ? compareChip(
              Math.round(def.bonuses.critChance * 100) -
                Math.round((eqGear.bonuses.critChance ?? 0) * 100),
            )
          : null,
      });
    }
    if (def.durability !== undefined && item.durability !== undefined) {
      const maxDur = equipmentMaxDurability(item);
      lines.push(
        item.durability <= 0
          ? { text: "BROKEN - REPAIR TO RESTORE", color: "#e06a6a" }
          : {
              text: `DURABILITY ${item.durability}/${maxDur}`,
              color: item.durability <= maxDur * 0.25 ? "#e06a6a" : undefined,
            },
      );
    }
  }
  // The class/slot headline stays first; the level lines slide in under it.
  lines.splice(1, 0, ...meta);
  return lines;
}

/** The item's pixel icon (equipmentIcon → sprite), the same glyph the field
 * pickup and inventory cell draw — so every surface shows the same art. */
export function ItemIcon({
  sprites,
  item,
}: {
  sprites: Sprites;
  item: Equipment;
}) {
  const src = spriteDataUrl(sprites, equipmentIcon(item.defId));
  if (!src) return null;
  return (
    <img
      src={src}
      alt={equipmentName(item)}
      className="pixel-img inv-item-icon"
      draggable={false}
    />
  );
}

/**
 * The card's CONTENT: the tier-colored name, the stat/affix lines, and the
 * rolled affixes — everything but the box it sits in. The inventory tooltip
 * floats this next to a cell; the arsenal viewer lays it out in a detail pane.
 * `compareTo` (a piece worn in the same slot) drives the green/red deltas; pass
 * null for a standalone read. `maxWidth` wraps long names/lines to a rem cap.
 * `lineScale` sizes the stat/affix lines (the hover tooltip pumps it up so the
 * numbers read at arm's length; the arsenal viewer keeps the default 1).
 */
export function ItemCardBody({
  font,
  state,
  item,
  compareTo,
  maxWidth,
  lineScale = 1,
}: {
  font: PixelFont;
  state: GameState;
  item: Equipment;
  compareTo: Equipment | null;
  maxWidth?: number;
  lineScale?: number;
}) {
  const tierLabel = TIER_LABELS[item.tier];
  return (
    <>
      {/* Unique/legendary names carry a soft glow (tierGlowClass) on top of
          the tier color — gold alone sits too close to rare yellow. */}
      <PixelText
        font={font}
        text={equipmentName(item)}
        scale={2}
        color={TIER_COLORS[item.tier]}
        className={tierGlowClass(item.tier).trim() || undefined}
        maxWidth={maxWidth}
      />
      {itemLines(state, item, compareTo).map((line) =>
        line.delta ? (
          <div key={line.text} className="tooltip-row">
            <PixelText
              font={font}
              text={line.text}
              scale={lineScale}
              color={line.color}
              maxWidth={maxWidth}
            />
            <PixelText
              font={font}
              text={`(${line.delta.text})`}
              scale={lineScale}
              color={line.delta.color}
            />
          </div>
        ) : (
          <PixelText
            key={line.text}
            font={font}
            text={line.text}
            scale={lineScale}
            color={line.color}
            maxWidth={maxWidth}
          />
        ),
      )}
      {item.affixes.map((affix, i) => (
        <PixelText
          key={i}
          font={font}
          text={affixLine(affix)}
          scale={lineScale}
          color={AFFIX_COLORS[affix.kind]}
          maxWidth={maxWidth}
        />
      ))}
      {/* The quality tier, spelled out at the card's foot in the tier color —
          the explicit answer to "is this rare or unique?" that the name color
          alone can't give. Plain finds carry no label (see TIER_LABELS). */}
      {tierLabel && (
        <PixelText
          font={font}
          text={tierLabel}
          scale={lineScale}
          color={TIER_COLORS[item.tier]}
          className={tierGlowClass(item.tier).trim() || undefined}
        />
      )}
    </>
  );
}
