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
  /**
   * Powerups on the stall — one UNIT each, rolled once at the meeting. The
   * stall used to restock them (stand at the counter, sell loot, buy the same
   * storm again), which made the merchant a better powerup source than the
   * whole drop ladder and left the dock permanently full for anyone who walked
   * back. What he sells is what he sells.
   */
  stockAbilities: 3,
  /**
   * CONSUMABLE slots on the stall, and how deep each pile is. The counter is
   * the one place a hero can CHOOSE to be stocked before a boss instead of
   * hoping the rain pays a medkit — but a pile that refilled would remove every
   * reason to ration one, so it is a few units and then it is gone. `qty` is
   * held under the dock's own `CONSUMABLES.stackCap` so one purchase run can
   * never overflow a stack the pickup pass would then refuse.
   */
  stockConsumables: 3,
  stockConsumableQty: 3,
  /** Tier-roll bonus on the stall's weapons: merchant stock skews magic+,
   * like Diablo 2's gamble screen. */
  stockTierBonus: 0.35,
  /**
   * Bottles of SMELLING SALTS on the shelf (`GearDef.revive`) — the ONLY thing
   * in the game that puts a downed companion back on its feet.
   *
   * Stocked on EVERY stall, whether or not the hero has a friend at the time
   * the stall is rolled, and that is deliberate rather than lazy: nothing here
   * restocks, so a shelf that only appeared for a hero who already had a
   * companion would strand the one who recruited his AFTER meeting the trader
   * — dead until the next map, with the answer visibly absent from the counter
   * he is standing at. A curiosity on a solo run is the cheaper mistake.
   */
  stockRevives: 2,
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
   * …and its RARITY markup: the same weight that makes a strong power a rarer
   * drop (`AbilityDef.rarity`) makes it dearer on the counter, at
   * `defaultRarity / rarity` capped here. Without it the stall would be a way
   * to BUY past the rarity — the drop ladder would ration a CONTINUITY PROTOCOL
   * while the merchant sold one for the price of a storm cloud.
   */
  abilityRarityMarkupCap: 5,
  /**
   * CONSUMABLE prices on the stall, per kind: `base + perLevel × the hero's
   * level`, the same shape a powerup is priced on, so a top-up stays a real
   * spend all campaign rather than pocket change by the bunker. A MEDKIT is
   * additionally scaled by its quality's share of the lightest tier's heal
   * (`MEDKIT.tiers[].healPct`), so a SUPERIOR costs what it mends. The repair
   * kit is dearest per unit — it is the whole kit mended, at the counter's own
   * wrench price or better, carried out for later.
   */
  consumablePrices: {
    medkit: { base: 24, perLevel: 5 },
    repair: { base: 40, perLevel: 8 },
    drink: { base: 16, perLevel: 3 },
  } as Record<
    "medkit" | "repair" | "drink",
    { base: number; perLevel: number }
  >,
  /**
   * A bottle of SMELLING SALTS, priced on the same `base + perLevel × level`
   * line the consumables ride. Dearest of the lot per unit, and it should be:
   * it is the only cure for the only permanent loss in a softcore run, and a
   * cheap one would make a companion's death a formality rather than a blow.
   * Still well under a stall weapon — the answer must be affordable on the
   * takings of one sell-run, or a player who loses a friend early is simply
   * without one for the rest of the campaign.
   */
  revivePrice: { base: 60, perLevel: 10 },
  /**
   * REPAIR pricing at the merchant (see items/durability.ts `repairCost`): mending one
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

/**
 * THE LOST & FOUND — the vault that catches what the AUTO PILOT throws away.
 *
 * An unattended bot fills a bag it cannot empty: it sheds the worst piece to
 * make room for the next find (see bot/economy.ts `cullWorstLoot`), and on a
 * long enough flight even a genuinely good item can be the worst thing in a
 * bag of treasure. Rather than destroy it, the ride BANKS it here, and the
 * player buys it back afterwards for coins (the title screen's LOST & FOUND).
 *
 * The price ladder is deliberately STEEP — a rung roughly every ×3, from 10
 * million for a magic find to 2 BILLION for an artifact. Reclaiming is not
 * meant to be routine housekeeping; it is a rescue, priced on the same scale
 * as the AUTO PILOT meter (`AUTOPILOT.coinsPerSecond`) and the coin store's
 * packs rather than on the merchant's pocket-change economy. Needing to buy a
 * UNIQUE or better back should be all but unheard of, because the cull sheds
 * strictly by preciousness: a unique only ever leaves a bag whose every other
 * cell holds something at least as precious.
 *
 * Only MAGIC and better is banked (`minTier`) — plain and trash finds are the
 * junk the cull is there to shed, and a vault full of grey mops would bury the
 * one item worth rescuing.
 */
export const VAULT = {
  /** The worst tier worth banking; anything below is simply dropped. */
  minTier: "magic" as const,
  /**
   * How many pieces the vault holds. A ride can run for days, so the list is
   * bounded: at capacity the LEAST precious entry is pushed out (by tier, then
   * by sell value) — the vault keeps the treasure, not the backlog.
   */
  capacity: 24,
  /**
   * Coins to buy a piece back, by tier. Roughly ×3 a rung, 10M → 2B. Tiers
   * below `minTier` never reach the vault; their entries keep the record whole
   * (and price a legacy vault entry sanely if one ever appears).
   */
  reclaimCost: {
    trash: 1_000_000,
    regular: 3_000_000,
    magic: 10_000_000,
    rare: 30_000_000,
    // SET (green) sits between rare and unique here as it does everywhere.
    set: 80_000_000,
    unique: 250_000_000,
    legendary: 700_000_000,
    artifact: 2_000_000_000,
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
} as const;
