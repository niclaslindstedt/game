// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shared item card — the single source of truth for how an equipment
// instance READS: its pixel icon (equipmentIcon → sprite) and the WoW-style
// stat/affix lines. The inventory tooltip (InventoryPanel), the arsenal viewer
// (ArsenalScreen), and anything else that shows an item all render through
// `ItemIcon` + `ItemCardBody`, so a change to how a stat is worded or colored
// lands everywhere at once and the surfaces never drift.

import type { ReactNode } from "react";

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
} from "./tiers.ts";

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

/** A stat line's VALUE reads in light grey so the white TITLE (DPS, DAMAGE,
 * SPEED, …) leads the eye; the number is the detail, not the headline. */
export const VALUE_COLOR = "#9aa3ad";

/** How a granted forever spell reads on the card (see the `spell` affix). */
const SPELL_LABELS: Record<string, string> = {
  orbit: "CIRCLING FLAME",
  storm: "STORMCALL",
  stasis: "STASIS FIELD",
};

/** How a proc's effect reads on the card (see the `proc` affix). */
const PROC_LABELS: Record<string, string> = {
  bolt: "LIGHTNING",
  nova: "NOVA",
};

/** Roman numeral for a spell/proc RANK — ranks are small by design. */
function rankNumeral(rank: number): string {
  const numerals = ["I", "II", "III", "IV", "V"];
  return numerals[Math.min(rank, numerals.length) - 1] ?? `${rank}`;
}

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
    case "spell":
      return `GRANTS ${SPELL_LABELS[affix.spell] ?? affix.spell.toUpperCase()} ${rankNumeral(affix.rank)}`;
    case "proc":
      return `${Math.round(affix.chance * 100)}% ${PROC_LABELS[affix.spell] ?? affix.spell.toUpperCase()} ${rankNumeral(affix.rank)} ON ${affix.trigger === "hit" ? "HIT" : "KILL"}`;
    case "sureStrike":
      return "NEVER MISSES";
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

/** A stat line in the item card. A plain fact splits into a white `label`
 * (DPS, DAMAGE, …) and a light-grey `value` (the number). Lines that carry
 * meaning in their color instead — an affix, the REQUIRES-LEVEL freshness
 * gauge, a low-durability warning — set a whole-line `color` and skip the
 * split, so the accent reads across the row. `delta` is the optional green/red
 * `(+3)` comparison to the equipped piece, only on lines that differ. */
export type CardLine = {
  text: string;
  label?: string;
  value?: string;
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
/**
 * The REQUIRES LEVEL line doubles as a freshness gauge — how current the
 * piece is against the hero's own level: red = above the hero (the engine
 * refuses to equip it, see meetsLevelReq), yellow = current (within 2
 * levels), green = recent (3–7 below), grey = outgrown.
 */
function levelReqColor(playerLevel: number, req: number): string {
  const behind = playerLevel - req;
  if (behind < 0) return "#e06a6a";
  if (behind <= 2) return "#ffe14d";
  if (behind <= 7) return "#5fd97a";
  return "#9aa3ad";
}

export function itemLines(
  state: GameState,
  item: Equipment,
  equipped: Equipment | null,
): CardLine[] {
  const lines: CardLine[] = [];
  // The base's requirement, freshness-colored (the item's own LEVEL sits at
  // the card's foot, drawn by ItemCardBody). Weapons lead with it; gear
  // slides it in under the slot headline.
  const req = equipmentLevelReq(item.defId);
  const reqLine: CardLine | null =
    req > 1
      ? {
          text: `REQUIRES LEVEL ${req}`,
          color: levelReqColor(state.player.level, req),
        }
      : null;
  if (isWeaponDef(item.defId)) {
    const def = weaponDef(item.defId);
    // Compare against the equipped weapon (only when inspecting a different
    // one) — the deltas below read this game's stats in the SAME hands, so a
    // bag find's numbers stack fairly against what's currently held.
    const eq = equipped && isWeaponDef(equipped.defId) ? equipped : null;
    // The weapon's CLASS is the glyph beside the name (ItemCardBody), not a
    // line — the card saves the row.
    if (reqLine) lines.push(reqLine);
    // Lead with DPS — the one figure that folds damage, attack speed, and crit
    // into "how hard this hits over time", so a slow heavy weapon and a quick
    // light one compare at a glance. Tinted the same accent as the character
    // sheet's derived combat stats.
    const dps = Math.round(weaponDps(state, item));
    lines.push({
      text: `DPS ${formatCompact(dps)}`,
      label: "DPS",
      value: formatCompact(dps),
      delta: eq ? compareChip(dps - Math.round(weaponDps(state, eq))) : null,
    });
    // Show the damage this weapon would deal in the player's hands as the RANGE
    // every blow rolls inside (stats + affixes folded in), with the bonus of
    // the average over the raw base as a "+x" hint. A range, not a fixed
    // figure, because that is how the weapon actually hits.
    const effective = Math.round(weaponDamageFor(state, item));
    const { min, max } = weaponDamageRange(state, item);
    const bonus = effective - def.damage;
    const dmgValue =
      bonus > 0
        ? `${formatCompact(min)}-${formatCompact(max)} (+${formatCompact(bonus)})`
        : `${formatCompact(min)}-${formatCompact(max)}`;
    lines.push({
      text: `DAMAGE ${dmgValue}`,
      label: "DAMAGE",
      value: dmgValue,
      delta: eq
        ? compareChip(effective - Math.round(weaponDamageFor(state, eq)))
        : null,
    });
    // Attack speed as plain seconds between attacks (lower is faster), the
    // unit left off — the two decimals already read as a time. The speed
    // stat (DEX for melee & ranged, INT for magic) quickens the cadence, so
    // show the base-relative time shaved off as a "-X" hint.
    const secs = weaponCooldownFor(state, item) / 1000;
    const saved = def.cooldownMs / 1000 - secs;
    const spdValue =
      saved > 0.005
        ? `${secs.toFixed(2)} (-${saved.toFixed(2)})`
        : `${secs.toFixed(2)}`;
    lines.push({
      text: `SPEED ${spdValue}`,
      label: "SPEED",
      value: spdValue,
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
    const rangeValue =
      rangeBonus > 0 ? `${effRange} (+${rangeBonus})` : `${effRange}`;
    lines.push({
      text: `RANGE ${rangeValue}`,
      label: "RANGE",
      value: rangeValue,
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
        label: "CRIT DAMAGE",
        value: `X${critMult.toFixed(1)}`,
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
            label: "DURABILITY",
            value: `${item.durability}/${maxDur}`,
            // A near-broken weapon warns in red across the whole row (the
            // whole-line color suppresses the label/value split).
            color: item.durability <= maxDur * 0.25 ? "#e06a6a" : undefined,
          },
    );
  } else {
    const def = gearDef(item.defId);
    // Compare against the gear worn in the same slot.
    const eqGear =
      equipped && !isWeaponDef(equipped.defId) ? gearDef(equipped.defId) : null;
    // The slot itself is the glyph beside the name (ItemCardBody), like a
    // weapon's class — no headline row.
    if (reqLine) lines.push(reqLine);
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
              label: "DURABILITY",
              value: `${item.durability}/${maxDur}`,
              color: item.durability <= maxDur * 0.25 ? "#e06a6a" : undefined,
            },
      );
    }
  }
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
 * The card's CONTENT: the weapon-class glyph + tier-colored name, the
 * stat/affix lines, the rolled affixes, and the foot row (tier callout +
 * item level) — everything but the box it sits in. The inventory tooltip
 * floats this next to a cell; the arsenal viewer lays it out in a detail pane.
 * `compareTo` (a piece worn in the same slot) drives the green/red deltas; pass
 * null for a standalone read. `maxWidth` wraps long names/lines to a rem cap.
 * `lineScale` sizes the stat/affix lines (the hover tooltip pumps it up so the
 * numbers read at arm's length; the arsenal viewer keeps the default 1).
 * `subtitle` prints a small grey kicker above the name ("EQUIPPED"; only the
 * worn piece carries it) and `icon` seats the item's pixel icon beside the
 * name — every inventory card shows it (sized to one row of the name, so the
 * two align), which keeps the piece identifiable even when the card floats
 * over the equip slot whose icon it describes.
 */
export function ItemCardBody({
  font,
  sprites,
  state,
  item,
  compareTo,
  maxWidth,
  lineScale = 1,
  subtitle,
  icon,
}: {
  font: PixelFont;
  sprites: Sprites;
  state: GameState;
  item: Equipment;
  compareTo: Equipment | null;
  maxWidth?: number;
  lineScale?: number;
  subtitle?: string;
  icon?: ReactNode;
}) {
  const tierLabel = TIER_LABELS[item.tier];
  // What this thing IS, as a glyph in the card's lower-right corner beside
  // the item level: a weapon's class (sword/reticle/spark, class-colored) or
  // a gear piece's slot (helmet/vest/pants/boot/clover/satchel) — the
  // "MELEE WEAPON" / "HEAD ARMOR" headline it replaces saved a card row.
  const weaponClass = isWeaponDef(item.defId)
    ? weaponDef(item.defId).class
    : null;
  const glyph = spriteDataUrl(
    sprites,
    weaponClass ? `icon_class_${weaponClass}` : `icon_slot_${item.slot}`,
  );
  // Unique/legendary names carry a soft glow (tierGlowClass) on top of the
  // tier color — gold alone sits too close to rare yellow. The icon eats
  // into the wrap width, so long names still stay inside.
  const name = (
    <PixelText
      font={font}
      text={equipmentName(item)}
      scale={2}
      color={TIER_COLORS[item.tier]}
      className={tierGlowClass(item.tier).trim() || undefined}
      maxWidth={icon && maxWidth ? maxWidth - 1 : maxWidth}
    />
  );
  return (
    <>
      {subtitle && (
        <PixelText font={font} text={subtitle} scale={1} color="#9aa3ad" />
      )}
      {icon ? (
        <div className="tooltip-name-row">
          {icon}
          {name}
        </div>
      ) : (
        name
      )}
      {itemLines(state, item, compareTo).map((line) => {
        // A plain stat splits into a white TITLE + light-grey VALUE; a line
        // that carries meaning in its color (affix, freshness, low-durability
        // warning) stays a single tinted string. Either way a delta chip, when
        // present, trails on the same row.
        const split = line.label !== undefined && !line.color;
        if (split || line.delta) {
          return (
            <div key={line.text} className="tooltip-row">
              {split ? (
                <>
                  <PixelText
                    font={font}
                    text={line.label ?? ""}
                    scale={lineScale}
                  />
                  <PixelText
                    font={font}
                    text={line.value ?? ""}
                    scale={lineScale}
                    color={VALUE_COLOR}
                  />
                </>
              ) : (
                <PixelText
                  font={font}
                  text={line.text}
                  scale={lineScale}
                  color={line.color}
                  maxWidth={maxWidth}
                />
              )}
              {line.delta && (
                <PixelText
                  font={font}
                  text={`(${line.delta.text})`}
                  scale={lineScale}
                  color={line.delta.color}
                />
              )}
            </div>
          );
        }
        return (
          <PixelText
            key={line.text}
            font={font}
            text={line.text}
            scale={lineScale}
            color={line.color}
            maxWidth={maxWidth}
          />
        );
      })}
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
      {/* The card's foot: the quality tier spelled out in the tier color on
          the left — the explicit answer to "is this rare or unique?" that
          the name color alone can't give (plain finds carry no label, see
          TIER_LABELS) — and, tucked lower-right, the item's own LEVEL
          (which sized its bonuses) with the class/slot glyph beside it. */}
      <div className="card-foot">
        {tierLabel && (
          <PixelText
            font={font}
            text={tierLabel}
            scale={lineScale}
            color={TIER_COLORS[item.tier]}
            className={tierGlowClass(item.tier).trim() || undefined}
          />
        )}
        <div className="card-foot-right">
          <PixelText font={font} text={`ILVL ${item.ilvl}`} scale={lineScale} />
          {glyph && (
            <img
              src={glyph}
              alt={weaponClass ? `${weaponClass} weapon` : item.slot}
              className="pixel-img card-class-glyph"
              draggable={false}
            />
          )}
        </div>
      </div>
    </>
  );
}
