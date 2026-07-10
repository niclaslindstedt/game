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

/**
 * Sparkles that SURROUND a rare+ find and drift upward like embers — fixed
 * offsets (no per-render randomness that could jitter), placed around the
 * frame (some just outside it, some below) and never across the face. `x`/`y`
 * are percentages of the sparkle layer (which overhangs the card), `d` the
 * loop delay so the twinkle staggers.
 */
const SPARKLES = [
  { x: -3, y: 82, d: 0 },
  { x: 103, y: 74, d: 300 },
  { x: 6, y: 98, d: 600 },
  { x: 94, y: 100, d: 150 },
  { x: -5, y: 46, d: 900 },
  { x: 105, y: 52, d: 450 },
  { x: 40, y: 104, d: 760 },
  { x: 66, y: 106, d: 1050 },
] as const;

/** A denser second ring layered in only for the legendary reveal. */
const LEGENDARY_SPARKLES = [
  { x: 14, y: 108, d: 200 },
  { x: 88, y: 110, d: 520 },
  { x: -6, y: 66, d: 340 },
  { x: 106, y: 90, d: 880 },
  { x: 30, y: 112, d: 1180 },
  { x: 54, y: 100, d: 60 },
] as const;

/** Flame tongues along the base for the top tiers (unique/legendary). */
const FLAMES = [20, 38, 50, 62, 80] as const;
/** The legendary blaze packs the base edge to edge. */
const LEGENDARY_FLAMES = [8, 20, 32, 44, 56, 68, 80, 92] as const;

function RarityReveal({ tier }: { tier: Tier }) {
  const rank = TIER_RANK[tier];
  // Magic reads purely from its finish (the blue frame + border glare); the
  // extra flourishes start at rare so the ladder stays subtle below it.
  if (rank < TIER_RANK.rare) return null;
  const legendary = tier === "legendary";
  const sparkles = legendary ? [...SPARKLES, ...LEGENDARY_SPARKLES] : SPARKLES;
  const flames = legendary ? LEGENDARY_FLAMES : FLAMES;
  return (
    <span
      className={`pickup-card-reveal${
        legendary ? " pickup-card-reveal--legendary" : ""
      }`}
      aria-hidden="true"
    >
      {/* The reserved glow lives here: only a legendary blooms and blasts,
          every lever to 11. Lesser tiers just twinkle. */}
      {legendary && <span className="pickup-card-blast" />}
      {legendary && <span className="pickup-card-flash" />}
      {legendary && <span className="pickup-card-rays" />}
      <span className="pickup-card-sparkles">
        {sparkles.map((s, i) => (
          <span
            key={i}
            className="pickup-card-sparkle"
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                "--spark-delay": `${s.d}ms`,
              } as CSSProperties
            }
          />
        ))}
      </span>
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
          scale={1}
          color={card.color}
          maxWidth={PICKUP_NAME_REM}
        />
        <StatusTag card={card} font={font} />
      </div>
    </button>
  );
}
