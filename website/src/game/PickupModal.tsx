// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pickup card: a bordered panel — dressed like the HUD clock/kill units —
// that pops in the lower part of the screen (below the centered hero, in the
// thumb-reach zone) when a weapon or item drops into the bag, showing the
// piece's icon and its rarity-tinted name. A spark laps the frame and a sheen
// glimmers across the face so a fresh find reads as "new and shiny", not chrome.
// Special tiers (magic → legendary) get a flashy reveal on top — a rarity bloom,
// rays, sparkles, and flames for the top tiers — the way an epic card turns over
// in Hearthstone. Only bag gear triggers the card; loose pickups (medkits,
// arrows, powerups) stay in the lower-corner PickupFeed.
//
// The card is clickable: tapping a bagged find equips it on the spot (the
// caller wires `onEquip`), so a good drop is one tap from being worn. Auto-
// equipped upgrades arrive already worn and badge themselves EQUIPPED instead.
//
// One card shows at a time — the newest replaces whatever is on screen. The
// caller keys the mount by the card's id so a new pickup restarts the pop,
// spark, and reveal, and clears it after PICKUP_CARD_TTL_MS (kept in sync with
// the CSS animation length in styles.css).

import type { CSSProperties } from "react";

import type { Quality, Tier } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** How long a pickup card stays on screen before it clears, in ms. Must match
 * the `.pickup-card` animation duration in styles.css. Longer than a glance so
 * a tap-to-equip find has time to be acted on. */
export const PICKUP_CARD_TTL_MS = 5200;

/**
 * Wrap width for the pickup name, in rem: the `.pickup-card` caps at 22rem,
 * less the icon, gap, and padding — so a long, affix-built weapon name wraps
 * within the card instead of stretching it off both edges of the screen. Keep
 * in step with `.pickup-card` in styles.css.
 */
const PICKUP_NAME_REM = 17;

/** Rarity ladder rank — drives how much reveal spectacle a tier earns. */
const TIER_RANK: Record<Tier, number> = {
  regular: 0,
  magic: 1,
  rare: 2,
  unique: 3,
  legendary: 4,
};

/**
 * The card's persistent FINISH — the frame/glow treatment that plays for the
 * card's whole life (as opposed to the one-shot `RarityReveal` flourish). It
 * folds the two axes into one visual ladder: a magic-or-better TIER always
 * earns at least a glow, and within the plain regular tier the MAKE quality
 * takes over — a broken find looks dull and cracked, a superior one glows, a
 * perfect one shines. Its numeric intensity climbs monotonically so the CSS
 * can lean on the ordering.
 *
 *   broken → crude → plain → glow → radiant → shine → legendary
 *
 * (superior make reads like a magic tier; perfect make like a unique.)
 */
export type Finish =
  "broken" | "crude" | "plain" | "glow" | "radiant" | "shine" | "legendary";

/** Fold (tier, make quality) into the single finish ladder above. */
export function finishFor(tier: Tier, quality: Quality | undefined): Finish {
  switch (tier) {
    case "legendary":
      return "legendary";
    case "unique":
      return "shine";
    case "rare":
      return "radiant";
    case "magic":
      return "glow";
    default:
      // Plain regular tier: the piece's craftsmanship carries the whole look.
      switch (quality ?? "normal") {
        case "broken":
          return "broken";
        case "crude":
          return "crude";
        case "superior":
          return "glow";
        case "perfect":
          return "shine";
        default:
          return "plain";
      }
  }
}

/** Green worn by the UPGRADE / EQUIPPED status tags (matches AFFIX vitality). */
const UPGRADE_COLOR = "#5fd97a";
/** Neutral off-white for the tap-to-equip affordance. */
const HINT_COLOR = "#cfd3d8";

export type PickupCard = {
  /** Bumped per pickup; used as the mount key so the pop/spark/reveal restart. */
  id: number;
  /** The piece's icon as a data URL (equipmentIcon → spriteDataUrl), if any. */
  icon?: string;
  /** The item's display name. */
  name: string;
  /** Rarity (tier) color — tints the name, the frame, and the reveal. */
  color: string;
  /** Rarity tier — selects which reveal spectacle plays. */
  tier: Tier;
  /**
   * The piece's MAKE quality (plain regular-tier finds only). The second
   * visual axis: within the regular tier it decides whether the card looks
   * dull (broken/crude), normal, glowing (superior) or shining (perfect).
   * Undefined (loose or normal make) reads as normal.
   */
  quality?: Quality;
  /** Wearing this piece would improve its slot — badge it as an upgrade. */
  upgrade: boolean;
  /** The piece is already worn (auto-equipped on pickup) — badge EQUIPPED. */
  equipped: boolean;
  /**
   * Equip this bagged find. Present only when the piece is in the bag and the
   * hero can wear it right now; absent for already-worn or under-leveled finds.
   * Wired by the caller to `equipFromInventory` + a click sound.
   */
  onEquip?: () => void;
};

/** A handful of sparkle motes for magic+ reveals — fixed offsets so the burst
 * reads the same every time (no per-render randomness that could jitter). */
const SPARKS = [
  { x: 8, y: 18, d: 0 },
  { x: 88, y: 12, d: 90 },
  { x: 22, y: 84, d: 160 },
  { x: 72, y: 82, d: 60 },
  { x: 50, y: 6, d: 120 },
  { x: 96, y: 54, d: 200 },
] as const;

/** A second, denser mote burst layered in only for the legendary explosion. */
const LEGENDARY_SPARKS = [
  { x: 2, y: 50, d: 40 },
  { x: 100, y: 34, d: 130 },
  { x: 40, y: 96, d: 220 },
  { x: 62, y: 2, d: 70 },
  { x: 14, y: 4, d: 180 },
  { x: 86, y: 92, d: 20 },
] as const;

/** Flame tongues along the base for the top tiers (unique/legendary). */
const FLAMES = [20, 38, 50, 62, 80] as const;
/** The legendary blaze packs the base edge to edge. */
const LEGENDARY_FLAMES = [8, 20, 32, 44, 56, 68, 80, 92] as const;

function RarityReveal({ tier }: { tier: Tier }) {
  const rank = TIER_RANK[tier];
  if (rank === 0) return null;
  const legendary = tier === "legendary";
  const motes = legendary ? [...SPARKS, ...LEGENDARY_SPARKS] : SPARKS;
  const flames = legendary ? LEGENDARY_FLAMES : FLAMES;
  return (
    <span
      className={`pickup-card-reveal${
        legendary ? " pickup-card-reveal--legendary" : ""
      }`}
      aria-hidden="true"
    >
      {/* Legendary breaks out of the card in a shockwave blast — every lever
          to 11 — while lesser tiers just bloom. */}
      {legendary && <span className="pickup-card-blast" />}
      <span className="pickup-card-flash" />
      {rank >= TIER_RANK.rare && <span className="pickup-card-rays" />}
      {motes.map((s, i) => (
        <span
          key={i}
          className="pickup-card-spark-mote"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              "--mote-delay": `${s.d}ms`,
            } as CSSProperties
          }
        />
      ))}
      {rank >= TIER_RANK.unique && (
        <span className="pickup-card-flames">
          {flames.map((x, i) => (
            <span
              key={i}
              className="pickup-card-flame"
              style={
                {
                  left: `${x}%`,
                  "--flame-delay": `${i * 90}ms`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}
    </span>
  );
}

function StatusTag({ card, font }: { card: PickupCard; font: PixelFont }) {
  if (card.equipped) {
    return (
      <div className="pickup-card-tag pickup-card-tag--equipped">
        <PixelText
          font={font}
          text="EQUIPPED"
          scale={1}
          color={UPGRADE_COLOR}
        />
      </div>
    );
  }
  if (card.upgrade) {
    return (
      <div className="pickup-card-tag pickup-card-tag--upgrade">
        <PixelText
          font={font}
          text="▲ UPGRADE"
          scale={1}
          color={UPGRADE_COLOR}
        />
      </div>
    );
  }
  if (card.onEquip) {
    return (
      <div className="pickup-card-tag pickup-card-tag--hint">
        <PixelText
          font={font}
          text="TAP TO EQUIP"
          scale={1}
          color={HINT_COLOR}
        />
      </div>
    );
  }
  return null;
}

export function PickupModal({
  font,
  card,
}: {
  font: PixelFont;
  card: PickupCard;
}) {
  const clickable = card.onEquip != null;
  const finish = finishFor(card.tier, card.quality);
  const className = `pickup-card pickup-card--finish-${finish}${
    clickable ? " pickup-card--clickable" : ""
  }${card.upgrade || card.equipped ? " pickup-card--upgrade" : ""}`;
  const style = { "--rarity": card.color } as CSSProperties;
  // Always a <button>, inert (disabled) when there's nothing to equip. Keeping
  // the element type stable means tapping to equip updates the card in place
  // rather than remounting it and replaying the whole pop + reveal.
  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={!clickable}
      aria-label={clickable ? `Equip ${card.name}` : card.name}
      aria-live="polite"
      onClick={card.onEquip}
    >
      <RarityReveal tier={card.tier} />
      <span className="pickup-card-spark" aria-hidden="true" />
      <span className="pickup-card-sheen" aria-hidden="true" />
      {card.icon && (
        <img src={card.icon} alt="" className="pixel-img pickup-card-icon" />
      )}
      <div className="pickup-card-body">
        <PixelText
          font={font}
          text={card.name}
          scale={2}
          color={card.color}
          maxWidth={PICKUP_NAME_REM}
        />
        <StatusTag card={card} font={font} />
      </div>
    </button>
  );
}
