// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The coin economy: the autopilot meter, the wandering merchant, and the
// sell/buy/repair price ladders.

/**
 * AUTO PILOT (see autopilot.ts): the engine bot flies the hero while the
 * player watches, metered in COINS per SIMULATED second. The offered speed
 * rungs multiply BOTH the fast-forward and the per-game-second price, so a
 * faster ride pays a premium per real second (8× rides cost 64× per
 * wall-clock second) — paying to not play is the product, and the premium is
 * what keeps the fastest rung a splurge rather than a default.
 */
export const AUTOPILOT = {
  /** Coins burned per game-second at 1× — the meter's base rate. */
  coinsPerSecond: 100,
  /** The offered speed rungs: real-time, and the paid fast-forwards. The
   * fastest rung must stay within the app's fast-forward ceiling (the game
   * loop's max steps per frame back it). */
  speeds: [1, 2, 4, 8, 16],
} as const;

/**
 * The WANDERING MERCHANT (see merchant.ts): a lone trader who roams every
 * level, ignored by the horde. Until the hero meets him he drifts between
 * short wander legs; the first close-up ENCOUNTER (within `discoverRadius`,
 * in line of sight) roots him to the spot for the rest of the run, pins him
 * on the level map, and stocks his shop against the hero he just met.
 * Tapping him within `tradeRadius` opens the shop (the `shop` phase — the
 * world freezes like the bag). Units: world px, px/s, ms.
 */
export const MERCHANT = {
  /** Body radius (collision vs obstacles, and the tap target's core). */
  radius: 10,
  /** Wander pace — a stroll, well under the hero's walk (PLAYER.speed 56). */
  speed: 26,
  /** Each wander leg heads this far from where he stands, rolled per leg. */
  wanderRange: [50, 150] as [number, number],
  /** Pause between wander legs, rolled per pause. */
  idleMs: [900, 2800] as [number, number],
  /** Spawns at least this far from the player spawn — he is met, not given. */
  minSpawnDistance: 400,
  /**
   * Meeting distance: within this (and in line of sight) the merchant is
   * DISCOVERED — he stops wandering for good and his stall pins the map.
   * Inside the phone half-view (≈211×97), same rationale as speakRadius.
   */
  discoverRadius: 90,
  /** The shop only opens with the hero this close — walk up to trade. */
  tradeRadius: 52,
  /**
   * The merchant's WARD: monsters cannot come closer to him than this —
   * about two mob-widths — so his stall never drowns in the horde and the
   * hero can always reach the counter. Bosses are too massive to shoo and
   * apparitions too immaterial; everything else is pushed out to the rim.
   */
  repelRadius: 40,
  /** Weapons on the stall (rolled at discovery, one-off purchases). */
  stockWeapons: 2,
  /** Powerups on the stall (restocked — buy as many as you can afford). */
  stockAbilities: 3,
  /** Tier-roll bonus on the stall's weapons: merchant stock skews magic+,
   * like Diablo 2's gamble screen. */
  stockTierBonus: 0.35,
} as const;

/**
 * The COIN ECONOMY the merchant trades in. Coins enter the run one way —
 * selling loot to a discovered merchant — and leave it on his powerups and
 * weapons, so the economy is a loot-recycling loop, not a faucet.
 *
 * An item's SELL VALUE is `(itemBase + itemPerIlvl · ilvl) × tier × material`:
 * the item's LEVEL carries the base worth (a deep find genuinely sells
 * higher), the TIER multiplies it by ORDERS OF MAGNITUDE (a magic item is
 * worth 10× a regular, a rare 100×, …), and the MATERIAL sweetens it — METAL
 * items melt down for double, PRECIOUS ones (gold, gems, the genuinely
 * magical) fetch four times. BUY prices hang off the same scale: a stall
 * weapon costs its own sell value × `weaponBuyMarkup` (≈ selling a few magic
 * items, ×10 — the Diablo 2 vendor gap), and powerups are priced off the
 * hero's level so they stay a meaningful spend all campaign.
 */
export const ECONOMY = {
  /** Flat floor of an item's worth, in coins. */
  itemBase: 2,
  /** Coins of worth per point of the item's level (ilvl). */
  itemPerIlvl: 1,
  /** The tier ladder in coin terms — each rung an order of magnitude. TRASH
   * sits below 1: joke drops melt down for pocket lint, whatever their ilvl. */
  tierValueMult: {
    trash: 0.1,
    regular: 1,
    magic: 10,
    rare: 100,
    // SET (green) sits between rare and unique on the sell ladder.
    set: 300,
    unique: 1_000,
    legendary: 10_000,
    artifact: 100_000,
  } as Record<
    | "trash"
    | "regular"
    | "magic"
    | "rare"
    | "set"
    | "unique"
    | "legendary"
    | "artifact",
    number
  >,
  /** Metal items melt down: worth double (see EquipmentDef.material). */
  metalMult: 2,
  /** Precious items (gold, gems, true magic) fetch four times. */
  preciousMult: 4,
  /** A stall weapon costs its own sell value × this — the vendor's cut. */
  weaponBuyMarkup: 10,
  /** A stall powerup's price: base + perLevel × the hero's level. */
  abilityBase: 40,
  abilityPerLevel: 12,
  /**
   * REPAIR pricing at the merchant (see items.ts `repairCost`): mending one
   * worn piece to full costs `(base + perReqLevel × the piece's required level)
   * × the rarity multiplier × its make quality × the fraction of durability
   * missing`. So higher required level, rarer tier, and finer make all cost
   * more to keep whole — but the rarity ladder here is GENTLE (single digits),
   * NOT the sell-value ladder's orders of magnitude, so repairing rare gear
   * stays affordable against the coins selling brings in.
   */
  repair: {
    /** Coins to fully mend a worn-out REGULAR piece at required level 1. */
    base: 3,
    /** Extra coins per point of the piece's required level. */
    perReqLevel: 2,
    /** Rarity multiplier — dearer gear costs more to keep whole. */
    tierMult: {
      trash: 0.5,
      regular: 1,
      magic: 2,
      rare: 4,
      // SET (green) — moot in practice (set pieces mint unbreakable), but the
      // record is keyed by every Tier.
      set: 6,
      unique: 8,
      legendary: 12,
      artifact: 16,
    } as Record<
      | "trash"
      | "regular"
      | "magic"
      | "rare"
      | "set"
      | "unique"
      | "legendary"
      | "artifact",
      number
    >,
  },
} as const;
