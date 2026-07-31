// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shared item card — the single source of truth for how an equipment
// instance READS: its pixel icon (equipmentIcon → sprite) and the WoW-style
// stat/affix lines. The inventory tooltip (InventoryPanel), the arsenal viewer
// (ArsenalScreen), and anything else that shows an item all render through
// `ItemIcon` + `ItemCardBody`, so a change to how a stat is worded or colored
// lands everywhere at once and the surfaces never drift.
//
// Two skinned presentations wrap that body, the way the achievements shelf
// reuses `AchievementCardBody`: `ItemCard` — the bordered, tier-glowing box the
// inventory floats as a tooltip and the arsenal docks beside its list — and
// `ItemCardModal` — the same box centered as a pop-up over a backdrop (the
// arsenal's narrow-phone tap-to-inspect), dismissed by the backdrop or ESC.

import {
  useEffect,
  type CSSProperties,
  type MouseEventHandler,
  type Ref,
  type ReactNode,
} from "react";

import {
  ACCURACY,
  armorTypeOf,
  armorValueOf,
  enemyDodgeChance,
  equipmentIcon,
  equipmentMaxDurability,
  equipmentName,
  gearDef,
  isWeaponDef,
  itemLevelReq,
  itemQuote,
  maxMeleeTargets,
  MELEE,
  playerMissChance,
  rawStat,
  statRequirement,
  weaponCooldownFor,
  weaponDamageFor,
  weaponDef,
  weaponDps,
  setForItem,
  uniqueDef,
  wornSetCount,
  type Affix,
  type Equipment,
  type GameState,
  type StatName,
} from "@game/core";

// How an affix WORDS itself lives in lib/ so the library's arsenal pages print
// the same lines without importing a React component — see the note there.
import { affixLine, STAT_LABELS } from "@ui/lib/affix-line.ts";
export { affixLine, STAT_LABELS };
import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { playUiSound } from "./sfx/ui.ts";
import { AFFIX_COLORS, TIER_COLORS, tierGlowClass } from "./tiers.ts";

/**
 * Wrap width (rem) for the card's stat lines and long affix-built names: the
 * `.item-card` box caps at 16rem, less its ~0.7rem side padding and 2px
 * borders — so the longest name folds onto extra lines instead of spilling off
 * the edge. Keep in step with `.item-card` in styles.css.
 */
export const ITEM_CARD_TEXT_REM = 14.3;

/** WoW's gold "ITEM LEVEL NN" line under the name — distinct from rare-yellow
 * so the promoted item level never reads as a rare-tier name. */
const ILVL_GOLD = "#e6b84d";

/**
 * The FLAVOR LINE's own antique gold (`itemQuote` — a base's `quote`, a named
 * item's `lore`). Deliberately duller and warmer than `ILVL_GOLD` above it: the
 * two are the only gold on the card and they say opposite things, so the fact
 * (ITEM LEVEL 42) reads brighter than the aside ("SMELLS BAD"). It also has to
 * stay clear of rare-yellow, which is a NAME colour, and of the menu's amber,
 * which everywhere else in the game means "the row you are on".
 */
const QUOTE_GOLD = "#c8a165";

/** Positive = upgrade (green), negative = downgrade (red). */
export const DELTA_UP = "#5fd97a";
export const DELTA_DOWN = "#e06a6a";

/** A stat line's VALUE reads in light grey so the white TITLE (DPS, DAMAGE,
 * SPEED, …) leads the eye; the number is the detail, not the headline. */
export const VALUE_COLOR = "#9aa3ad";

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
 * split, so the accent reads across the row. `hint` is the optional blue,
 * paren-less `+7` showing how much the hero's build lifts this line over the
 * weapon's printed base (the base is the value, so the two visibly SUM);
 * `delta` is the optional green/red `(+3)` comparison to the equipped piece,
 * only on lines that differ. Both trail the value on the same row — hint first
 * (your build), then delta (vs worn). */
export type CardLine = {
  text: string;
  label?: string;
  value?: string;
  color?: string;
  hint?: { text: string; color: string } | null;
  delta?: { text: string; color: string } | null;
};

/** The blue of the stat-lift `hint` — the same hue as a +STAT affix, tying
 * "this bonus comes from your stats" together across the card. */
const STAT_LIFT_BLUE = "#4da6ff";

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
 * The `(+N)` comparison chip for a bonus line whose VALUE is itself that bonus
 * (`+30 MAX HP`, `16 ARMOR`, `+2 STRENGTH`) — the inspected piece's `value`
 * against the `worn` piece's total for the same stat. Unlike `compareChip` it
 * DROPS the chip when the delta would merely restate the value — i.e. the worn
 * piece has none of this stat, so the whole bonus is new and `+30 MAX HP (+30)`
 * says the same number twice. A real difference (the worn piece has some) still
 * shows its `(+N)` / `(-N)`.
 */
function bonusDelta(
  value: number,
  worn: number,
): { text: string; color: string } | null {
  const chip = compareChip(value - worn);
  // worn === 0 ⇒ delta === value ⇒ the chip only echoes the value: drop it.
  return chip && worn === 0 ? null : chip;
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

/**
 * A gear piece's TOTAL for a stat that can come from BOTH its base slot bonus
 * AND rolled affixes — so the card shows ONE combined figure instead of a base
 * row and an affix row for the same thing (the `+30 MAX HP` twice a unique with
 * a base-HP slot plus an HP roll used to print). Mirrors how the engine sums
 * each stat (`maxHpOf`, `critChanceOf`, `effectiveStat` in items/derived.ts): the base
 * `bonuses.*` plus every matching affix. `armorValueOf` already folds armor the
 * same way, so armor isn't repeated here.
 */
function gearMaxHp(item: Equipment): number {
  let v = gearDef(item.defId).bonuses.maxHp ?? 0;
  for (const a of item.affixes) if (a.kind === "maxHp") v += a.value;
  return v;
}
function gearCritPct(item: Equipment): number {
  let f = gearDef(item.defId).bonuses.critChance ?? 0;
  for (const a of item.affixes) if (a.kind === "crit") f += a.value;
  return Math.round(f * 100);
}
function gearStat(item: Equipment, stat: StatName): number {
  // A base's OWN flat attribute grant (`bonuses.stats`) counts here beside the
  // rolled affixes — it is a ring's or amulet's whole identity, and the engine
  // sums the two into one number (`computeStatParts`), so the card shows one
  // number too. Omitting it would leave the jewellery's headline bonus applied
  // but invisible.
  let v = gearDef(item.defId).bonuses.stats?.[stat] ?? 0;
  for (const a of item.affixes)
    if (a.kind === "stat" && a.stat === stat) v += a.value;
  return v;
}

/** The affix kinds a GEAR piece folds into a combined stat row above (armor is
 * folded by `armorValueOf`); everything else stays its own listed affix line. */
const GEAR_FOLDED_AFFIX_KINDS = new Set<Affix["kind"]>([
  "maxHp",
  "crit",
  "armor",
  "stat",
]);

/**
 * The affixes the card lists on their OWN line. A weapon lists all of them; a
 * gear piece omits the ones already summed into a combined stat row (MAX HP,
 * CRIT, ARMOR, the flat +STAT rolls) so nothing is shown twice — the base-plus-
 * affix duplication the combined rows exist to fix.
 */
export function displayAffixes(item: Equipment): Affix[] {
  if (isWeaponDef(item.defId)) return item.affixes;
  return item.affixes.filter((a) => !GEAR_FOLDED_AFFIX_KINDS.has(a.kind));
}

/**
 * The item's REQUIREMENT lines — its level gate and (when applicable) its
 * attribute gate. These sit at the card foot (drawn by ItemCardBody), WoW-
 * tooltip style, out of the stat block; the attribute gate is shown ONLY when
 * the hero fails to meet it (a met requirement is noise). The level line keeps
 * its freshness coloring (see levelReqColor).
 */
export function requirementLines(
  state: GameState,
  item: Equipment,
): CardLine[] {
  const lines: CardLine[] = [];
  // The attribute gate (STR/DEX/INT) reads first, in red, as a hard "you can't
  // wield this yet" warning — but only when unmet; a met gate is dropped.
  const statReq = statRequirement(item.defId);
  if (statReq && rawStat(state, statReq.stat) < statReq.amount) {
    lines.push({
      text: `REQUIRES ${statReq.amount} ${statReq.stat.toUpperCase()}`,
      color: "#e06a6a",
    });
  }
  // The level gate sits LAST — the WoW "Requires Level NN" footer.
  const req = itemLevelReq(item);
  if (req > 1) {
    lines.push({
      text: `REQUIRES LEVEL ${req}`,
      color: levelReqColor(state.players[0].level, req),
    });
  }
  return lines;
}

export function itemLines(
  state: GameState,
  item: Equipment,
  equipped: Equipment | null,
): CardLine[] {
  const lines: CardLine[] = [];
  // The item's REQUIREMENTS (level + attribute gate) no longer lead the stat
  // block — they relocate to the card foot (see requirementLines /
  // ItemCardBody), WoW-tooltip style. So the stat lines below carry only what
  // the piece DOES.
  if (isWeaponDef(item.defId)) {
    const def = weaponDef(item.defId);
    // Compare against the equipped weapon (only when inspecting a different
    // one) — the deltas below read this game's stats in the SAME hands, so a
    // bag find's numbers stack fairly against what's currently held.
    const eq = equipped && isWeaponDef(equipped.defId) ? equipped : null;
    // The weapon's CLASS is the glyph beside the name (ItemCardBody), not a
    // line — the card saves the row.
    // Lead with DAMAGE — the concrete hit is what the eye wants first; DPS
    // folds it into a rate just below. Read as the weapon's printed BASE plus a
    // blue `+N` for how much the hero's build lifts it (stats/ilvl/affixes) —
    // base and lift shown side by side so they visibly SUM to the real hit,
    // rather than one pre-summed number with a confusing parenthetical.
    const effective = Math.round(weaponDamageFor(state, item));
    const dmgLift = effective - def.damage;
    lines.push({
      text: `DAMAGE ${formatCompact(def.damage)}`,
      label: "DAMAGE",
      value: formatCompact(def.damage),
      hint:
        dmgLift !== 0
          ? {
              text: `${dmgLift > 0 ? "+" : "-"}${formatCompact(Math.abs(dmgLift))}`,
              color: STAT_LIFT_BLUE,
            }
          : null,
      delta: eq
        ? compareChip(effective - Math.round(weaponDamageFor(state, eq)))
        : null,
    });
    // ENHANCED DAMAGE rides directly under the base it multiplies — D2's
    // headline weapon roll, and the single biggest reason one copy of a base
    // out-hits another. It gets its OWN colored line rather than disappearing
    // into the blue stat-lift `+N` above, because unlike the build lift it is
    // a permanent property of THIS instance: the number the player kept the
    // drop for. Only magic-or-better weapons roll one (a white weapon swings
    // its catalog damage flat), so the row is simply absent otherwise.
    if (item.enhancedDamage) {
      const pct = Math.round(item.enhancedDamage * 100);
      lines.push({
        text: `+${pct}% ENHANCED DAMAGE`,
        color: AFFIX_COLORS.damagePct,
        delta: eq
          ? compareChip(pct - Math.round((eq.enhancedDamage ?? 0) * 100))
          : null,
      });
    }
    // DPS sits just under DAMAGE — the one figure that folds damage, attack
    // speed, and crit into "how hard this hits over time", so a slow heavy
    // weapon and a quick light one compare at a glance. Carried to one decimal
    // so two close weapons still separate. Tinted the same accent as the
    // character sheet's derived combat stats.
    const dps = weaponDps(state, item);
    const dpsValue = dps.toFixed(1);
    lines.push({
      text: `DPS ${dpsValue}`,
      label: "DPS",
      value: dpsValue,
      delta: eq ? compareChip(dps - weaponDps(state, eq), { digits: 1 }) : null,
    });
    // Attack speed as plain seconds between attacks (lower is faster), the unit
    // left off — the two decimals already read as a time. Shown as the weapon's
    // BASE cadence plus a blue `-N` for the time the hero's speed stat shaves
    // off, so base and lift sum to the real cadence (same read as DAMAGE).
    const secs = weaponCooldownFor(state, item) / 1000;
    const spdBase = def.cooldownMs / 1000;
    const spdSaved = spdBase - secs;
    lines.push({
      text: `SPEED ${spdBase.toFixed(2)}`,
      label: "SPEED",
      value: spdBase.toFixed(2),
      hint:
        spdSaved > 0.005
          ? { text: `-${spdSaved.toFixed(2)}`, color: STAT_LIFT_BLUE }
          : null,
      // Shorter cadence is faster, so a smaller number is the upgrade.
      delta: eq
        ? compareChip(secs - weaponCooldownFor(state, eq) / 1000, {
            lowerBetter: true,
            digits: 2,
          })
        : null,
    });
    // The MULTI-TARGET line, in AoE cyan — and PIERCES/PELLETS (ranged) and
    // HITS (melee) are mutually exclusive, since only a ranged weapon carries a
    // projectile:
    //   • Ranged: the weapon's OWN fixed projectile physics — a pellet spread,
    //     a piercing shot, a chaining bolt.
    //   • Melee: how many foes the cone cleaves — the BASE swing plus a blue
    //     `+N` for the extra foes INTELLIGENCE buys (maxMeleeTargets), the same
    //     base-plus-lift read as DAMAGE/SPEED.
    const p = def.projectile;
    if (p) {
      const label =
        p.count && p.count > 1
          ? `${p.count} PELLETS`
          : p.pierce
            ? `PIERCES ${p.pierce + 1}`
            : p.chain
              ? `CHAINS TO ${p.chain}`
              : null;
      if (label) lines.push({ text: label, color: "#7ecbff" });
    } else {
      const baseHits = Math.max(1, Math.floor(MELEE.baseAoeTargets));
      const intBonus = maxMeleeTargets(state) - baseHits;
      lines.push({
        text: `HITS ${baseHits}`,
        color: "#7ecbff",
        hint:
          intBonus > 0 ? { text: `+${intBonus}`, color: STAT_LIFT_BLUE } : null,
      });
    }
    // TWO-HANDED, in the same AoE cyan as the multi-target line above it — it
    // belongs with the "what does swinging this actually cost" group rather
    // than with the stats. It is the one line on the card that reads as a
    // MINUS, so it says what is lost rather than what is gained: the off hand
    // is spoken for and the shield or bag in it comes off.
    if (def.twoHanded) {
      lines.push({ text: "TWO-HANDED - NO OFF HAND", color: "#7ecbff" });
    }
    // Crit DAMAGE is a CLASS trait now (ranged > melee > magic, deepened by DEX),
    // not a per-item number — so the item card carries no crit-damage line.
    // DURABILITY is appended below the affixes (durabilityLine / ItemCardBody),
    // right above the requirement footer — the WoW tooltip order.
  } else {
    const def = gearDef(item.defId);
    // Compare against the gear worn in the same slot (never a weapon there, but
    // guard anyway) — its TOTAL for each stat, base bonus + affixes, so the
    // `(+N)` chips weigh combined figure against combined figure.
    const eqGear = equipped && !isWeaponDef(equipped.defId) ? equipped : null;
    // The slot itself is the glyph beside the name (ItemCardBody), like a
    // weapon's class — no headline row. The requirement gates ride the foot.
    // An armor piece leads with its rolled armor points (the ilvl-grown stamp
    // plus any +armor affixes, already folded by armorValueOf), compared
    // against what the same slot wears now. The MATERIAL rides the same row —
    // it says at a glance what the piece is made of, and thus its stat lean.
    if (def.armor !== undefined) {
      const value = armorValueOf({ ...item, durability: undefined });
      const worn = equipped ? armorValueOf(equipped) : 0;
      lines.push({
        text: `${value} ARMOR · ${armorTypeOf(item.defId).toUpperCase()}`,
        color: AFFIX_COLORS.armor,
        delta: equipped ? bonusDelta(value, worn) : null,
      });
    }
    // A BAG leads with the ROOM it buys, which is its whole reason to exist —
    // the instance's ilvl-grown stamp when it carries one, so a deep find reads
    // as the upgrade it is. Compared against the bag in the off hand now; a
    // SHIELD there counts as zero cells, which is exactly the trade being made.
    const cells = bagSlotsOf(item);
    if (cells) {
      lines.push({
        text: `+${cells} BAG SLOTS`,
        color: "#7ecbff",
        delta: equipped ? bonusDelta(cells, bagSlotsOf(equipped)) : null,
      });
    }
    // MAX HP and CRIT each combine the base slot bonus with their rolled affixes
    // into a single row (see gearMaxHp / gearCritPct), so a piece that carries
    // both no longer prints the stat twice.
    const maxHp = gearMaxHp(item);
    if (maxHp) {
      lines.push({
        text: `+${maxHp} MAX HP`,
        color: AFFIX_COLORS.maxHp,
        delta: eqGear ? bonusDelta(maxHp, gearMaxHp(eqGear)) : null,
      });
    }
    const critPct = gearCritPct(item);
    if (critPct) {
      lines.push({
        text: `+${critPct}% CRIT`,
        color: AFFIX_COLORS.crit,
        delta: eqGear ? bonusDelta(critPct, gearCritPct(eqGear)) : null,
      });
    }
    // Flat +STAT rolls, one combined row per stat (base gear carries none, so
    // these come purely from affixes, but multiple rolls of the same stat still
    // sum into one line).
    for (const stat of Object.keys(STAT_LABELS) as StatName[]) {
      const amount = gearStat(item, stat);
      if (!amount) continue;
      lines.push({
        text: `+${amount} ${STAT_LABELS[stat]}`,
        color: AFFIX_COLORS.stat,
        delta: eqGear ? bonusDelta(amount, gearStat(eqGear, stat)) : null,
      });
    }
    // DURABILITY is appended below the affixes (durabilityLine / ItemCardBody),
    // right above the requirement footer — the WoW tooltip order.
  }
  return lines;
}

/**
 * The cells a BAG buys — the instance's ilvl-grown stamp first, then the frozen
 * def a unique's override rides on, then the catalog. The same ladder the engine
 * reads through `equippedBagSlots`, so the card can never promise room the bag
 * will not give. Zero for everything that is not a bag, the SHIELD in the same
 * slot included.
 */
function bagSlotsOf(item: Equipment): number {
  if (item.slot !== "bag" || isWeaponDef(item.defId)) return 0;
  if (item.bagSlots !== undefined) return item.bagSlots;
  const frozen = item.def;
  if (frozen && "bagSlots" in frozen) return frozen.bagSlots ?? 0;
  return gearDef(item.defId).bagSlots ?? 0;
}

/**
 * The DURABILITY line, rendered by ItemCardBody BELOW the affixes and right
 * above the requirement footer (the WoW tooltip order: stats, effects,
 * durability, requires-level). Weapons read UNBREAKABLE when they never wear
 * out (uniques); breakable gear reads BROKEN when spent, and any piece warns in
 * red across the whole row once it drops under a quarter left. Returns null for
 * gear that carries no durability at all (charms, bags, unbreakable finds).
 */
export function durabilityLine(item: Equipment): CardLine | null {
  const maxDur = equipmentMaxDurability(item);
  if (isWeaponDef(item.defId)) {
    if (item.durability === undefined) return { text: "UNBREAKABLE" };
  } else {
    const def = gearDef(item.defId);
    if (def.durability === undefined || item.durability === undefined)
      return null;
    if (item.durability <= 0)
      return { text: "BROKEN - REPAIR TO RESTORE", color: "#e06a6a" };
  }
  return {
    text: `DURABILITY ${item.durability}/${maxDur}`,
    label: "DURABILITY",
    value: `${item.durability}/${maxDur}`,
    // A near-broken piece warns in red across the whole row (the whole-line
    // color suppresses the label/value split).
    color:
      item.durability !== undefined && item.durability <= maxDur * 0.25
        ? "#e06a6a"
        : undefined,
  };
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

/** Green when a set threshold is met (or a member is worn), dim green-grey when
 * it isn't — the D2 set-tooltip read: what you have vs what you're chasing. */
const SET_ACTIVE = "#4ade80";
const SET_INACTIVE = "#5b6b60";

/**
 * The SET block on a green piece's card: the set name with worn/total count,
 * the member checklist (worn pieces green, missing ones dim), and each bonus
 * threshold's lines — active (enough pieces worn) in green, latent in dim. Reads
 * `wornSetCount` (broken pieces excluded, like the engine's `setBonusAffixes`)
 * so the card and the actual bonus never disagree. Renders nothing for a piece
 * that isn't a set member.
 */
function SetBlock({
  font,
  state,
  uniqueId,
  lineScale,
  maxWidth,
}: {
  font: PixelFont;
  state: GameState;
  uniqueId: string;
  lineScale: number;
  maxWidth?: number;
}) {
  const set = setForItem(uniqueId);
  if (!set) return null;
  const worn = wornSetCount(state, set.id);
  const equipment = state.players[0].equipment;
  const wornIds = new Set<string>();
  for (const slot of ["head", "chest", "legs", "feet"] as const) {
    const piece = equipment[slot];
    if (piece?.uniqueId) wornIds.add(piece.uniqueId);
  }
  return (
    <div className="item-card-set">
      <PixelText
        font={font}
        text={`SET: ${set.name}  ${worn}/${set.members.length}`}
        scale={lineScale}
        color={SET_ACTIVE}
        className="tier-set"
        maxWidth={maxWidth}
      />
      {set.members.map((id) => (
        <PixelText
          key={id}
          font={font}
          text={`- ${uniqueDef(id).name}`}
          scale={lineScale}
          color={wornIds.has(id) ? SET_ACTIVE : SET_INACTIVE}
          maxWidth={maxWidth}
        />
      ))}
      {set.bonuses.flatMap((tier) =>
        tier.bonuses.map((affix, j) => (
          <PixelText
            key={`${tier.pieces}-${j}`}
            font={font}
            text={`(${tier.pieces}) ${affixLine(affix)}`}
            scale={lineScale}
            color={worn >= tier.pieces ? SET_ACTIVE : SET_INACTIVE}
            maxWidth={maxWidth}
          />
        )),
      )}
    </div>
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
  relicFonts,
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
  /**
   * The pre-colored golden display fonts (assets.relicFonts). When present, a
   * unique/legendary/artifact item's NAME is struck in its tier's own metal
   * instead of the flat-tinted UI font. Omitted → every tier's name falls
   * back to the UI font in its tier color (the pre-relic look).
   */
  relicFonts?: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  state: GameState;
  item: Equipment;
  compareTo: Equipment | null;
  maxWidth?: number;
  lineScale?: number;
  subtitle?: string;
  icon?: ReactNode;
}) {
  // The card reads WoW-tooltip style: rarity lives in the NAME color (no
  // spelled-out "MAGIC ITEM" label), the item level is promoted to a gold line
  // under the name, and the requirement gates drop to the foot. The LEVEL gate
  // rides the foot row beside the class/slot glyph; an UNMET attribute gate
  // (STR/DEX/INT) reads as its own red line just above it (a met gate is
  // dropped — requirementLines handles that).
  const reqLines = requirementLines(state, item);
  const levelReqLine = reqLines.find((l) =>
    l.text.startsWith("REQUIRES LEVEL"),
  );
  const statReqLine = reqLines.find(
    (l) => !l.text.startsWith("REQUIRES LEVEL"),
  );
  // What this thing IS, as a glyph in the card's lower-right corner beside
  // the requirement level: a weapon's class (sword/reticle/spark, class-colored)
  // or a gear piece's slot (helmet/vest/pants/boot/clover/satchel) — the
  // "MELEE WEAPON" / "HEAD ARMOR" headline it replaces saved a card row.
  const weaponClass = isWeaponDef(item.defId)
    ? weaponDef(item.defId).class
    : null;
  // A SHIELD borrows the OFF HAND frame's own glyph (`icon_slot_offhand`, which
  // IS a shield silhouette) rather than shipping an identical second copy of it.
  // A BAG keeps its satchel glyph: the two share a slot, and the glyph is how
  // the card says which of them this is.
  const slotGlyph = item.slot === "shield" ? "offhand" : item.slot;
  const glyph = spriteDataUrl(
    sprites,
    weaponClass ? `icon_class_${weaponClass}` : `icon_slot_${slotGlyph}`,
  );
  // A unique/legendary/artifact name is struck in its tier's own golden RELIC
  // font (pre-colored, so no `color` — see assets.relicFonts), each rung
  // richer than the last; every other tier stays the flat-tinted UI font in
  // its tier color. Either way the name carries the tier glow (tierGlowClass)
  // — gold alone sits too close to rare yellow. The icon eats into the wrap
  // width, so long names still stay inside.
  const relicFont =
    relicFonts &&
    (item.tier === "unique" ||
      item.tier === "legendary" ||
      item.tier === "artifact")
      ? relicFonts[item.tier]
      : null;
  const name = (
    <PixelText
      font={relicFont ?? font}
      text={equipmentName(item)}
      scale={2}
      color={relicFont ? undefined : TIER_COLORS[item.tier]}
      className={tierGlowClass(item.tier).trim() || undefined}
      maxWidth={icon && maxWidth ? maxWidth - 1 : maxWidth}
    />
  );
  // One stat/affix row: a plain fact splits into a white TITLE + light-grey
  // VALUE; a line that carries meaning in its color (affix, freshness, low-
  // durability warning) stays a single tinted string. Either way a delta chip,
  // when present, trails on the same row. Shared by the stat block and the
  // durability line below the affixes.
  const renderLine = (line: CardLine, key: string) => {
    const split = line.label !== undefined && !line.color;
    if (split || line.hint || line.delta) {
      return (
        <div key={key} className="tooltip-row">
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
          {line.hint && (
            <PixelText
              font={font}
              text={line.hint.text}
              scale={lineScale}
              color={line.hint.color}
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
        key={key}
        font={font}
        text={line.text}
        scale={lineScale}
        color={line.color}
        maxWidth={maxWidth}
      />
    );
  };
  const durability = durabilityLine(item);
  const quote = itemQuote(item);
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
      <PixelText
        font={font}
        text={`ITEM LEVEL ${item.ilvl}`}
        scale={lineScale}
        color={ILVL_GOLD}
      />
      {itemLines(state, item, compareTo).map((line) =>
        renderLine(line, line.text),
      )}
      {displayAffixes(item).map((affix, i) => (
        <PixelText
          key={i}
          font={font}
          text={affixLine(affix)}
          scale={lineScale}
          color={AFFIX_COLORS[affix.kind]}
          maxWidth={maxWidth}
        />
      ))}
      {item.uniqueId && (
        <SetBlock
          font={font}
          state={state}
          uniqueId={item.uniqueId}
          lineScale={lineScale}
          maxWidth={maxWidth}
        />
      )}
      {/* DURABILITY reads LAST among the lines — below the affixes, right above
          the requirement footer (the WoW tooltip order). */}
      {durability && renderLine(durability, "durability")}
      {/* The FLAVOR LINE, in its own antique gold, under everything the piece
          DOES and above what it REQUIRES — WoW's italic quote at the foot of a
          tooltip. It is the one line on the card that is not a number, which is
          why it gets a colour of its own rather than sharing the grey the stat
          values use; on the SMELLING SALTS it is also the only place the game
          says out loud what the bottle is for. */}
      {quote && (
        <PixelText
          font={font}
          text={quote}
          scale={lineScale}
          color={QUOTE_GOLD}
          maxWidth={maxWidth}
        />
      )}
      {/* The item's REQUIREMENTS sit at the foot (WoW's "Requires Level NN"
          footer). An UNMET attribute gate (STR/DEX/INT) reads as its own red
          line first; the LEVEL gate rides the foot row itself, beside the
          class/slot glyph. */}
      {statReqLine && (
        <PixelText
          font={font}
          text={statReqLine.text}
          scale={lineScale}
          color={statReqLine.color}
          maxWidth={maxWidth}
        />
      )}
      {/* The card's foot: the REQUIRES LEVEL gate on the LEFT (WoW's bottom-left
          "Requires Level NN"), the class/slot glyph pushed to the RIGHT — sized
          to the text. Rarity is read from the NAME color, so no spelled-out
          tier label rides here. */}
      <div className="card-foot">
        {levelReqLine && (
          <PixelText
            font={font}
            text={levelReqLine.text}
            scale={lineScale}
            color={levelReqLine.color}
          />
        )}
        <div className="card-foot-right">
          {glyph && (
            <img
              src={glyph}
              alt={weaponClass ? `${weaponClass} weapon` : item.slot}
              className="pixel-img card-class-glyph card-class-glyph-lg"
              draggable={false}
            />
          )}
        </div>
      </div>
    </>
  );
}

/** The shared, layout-agnostic props for a skinned item card. */
export type ItemCardProps = {
  font: PixelFont;
  relicFonts?: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  state: GameState;
  item: Equipment;
  /** The piece worn in the same slot, for the green/red `(+N)` deltas; null (the
   * default) for a standalone read, as the arsenal shows — no diff hints. */
  compareTo?: Equipment | null;
  /** Small grey kicker above the name (e.g. "EQUIPPED"). */
  subtitle?: string;
};

/**
 * The item's stat card in its bordered, tier-glowing box: the shared
 * `ItemCardBody` (icon + name + stat/affix lines) framed by the `.item-card`
 * skin, the rarity color set inline from the tier. The inventory floats this as
 * a tooltip (`className="item-tooltip"` + positioning `style`) and the arsenal
 * docks it beside its list — one card, so the two never drift. `children` seats
 * an optional trailing control (the tooltip's USE button); `cardRef` exposes the
 * box for measuring; `onClick` lets a wrapper (the modal) stop backdrop taps.
 */
export function ItemCard({
  font,
  relicFonts,
  sprites,
  state,
  item,
  compareTo = null,
  subtitle,
  className,
  style,
  cardRef,
  children,
  onClick,
}: ItemCardProps & {
  className?: string;
  style?: CSSProperties;
  cardRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      ref={cardRef}
      className={`item-card${tierGlowClass(item.tier)}${
        className ? ` ${className}` : ""
      }`}
      style={{ borderColor: TIER_COLORS[item.tier], ...style }}
      onClick={onClick}
    >
      <ItemCardBody
        font={font}
        relicFonts={relicFonts}
        sprites={sprites}
        state={state}
        item={item}
        compareTo={compareTo}
        maxWidth={ITEM_CARD_TEXT_REM}
        lineScale={2}
        subtitle={subtitle}
        icon={<ItemIcon sprites={sprites} item={item} />}
      />
      {children}
    </div>
  );
}

/**
 * The item card as a centered modal over a dimming backdrop — the arsenal's
 * tap-to-inspect on narrow phones (the achievements shelf's pop-up shape). The
 * backdrop tap or ESC dismisses it; the figure swallows its own clicks so a tap
 * ON it doesn't fall through. ESC is caught in the capture phase so it closes
 * the card before the shelf's own ESC handler underneath.
 *
 * The piece's own icon rides LARGE and un-dimmed ABOVE the card: the backdrop
 * dims the shelf behind, but the item you tapped keeps its full-size art — a
 * nod to the tiny icon the card carries in its name row.
 */
export function ItemCardModal({
  onClose,
  ...card
}: ItemCardProps & { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="item-card-overlay"
      onClick={() => {
        playUiSound(synth, "back");
        onClose();
      }}
    >
      <div
        className="item-card-figure"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className={`inv-cell item-card-figure-icon${tierGlowClass(
            card.item.tier,
          )}`}
          style={{ borderColor: TIER_COLORS[card.item.tier] }}
        >
          <ItemIcon sprites={card.sprites} item={card.item} />
        </span>
        <ItemCard {...card} />
      </div>
    </div>
  );
}
