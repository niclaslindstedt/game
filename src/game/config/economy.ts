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
 * GOLD — what a body was carrying, shed on the floor when it falls.
 *
 * The coin economy's SECOND faucet, and the one that answers "what did this
 * hour of play buy me". Selling loot recycles what the run already gave you;
 * gold is new money, and it is what the AUTO PILOT meter is actually paid
 * with — so this block and `AUTOPILOT.coinsPerSecond` are two ends of one
 * lever. `farmMinutesPerAutopilotMinute` below records which side is which.
 *
 * THE RULES IT OBEYS, IN THE ORDER THEY BITE:
 *
 * 1. **NOT EVERY CORPSE PAYS.** `minionChance` is one body in five, and that
 *    is a feel decision rather than an economy one: a purse out of every kill
 *    turns a fight into a coin fountain and buries the thing a kill is
 *    actually for, which is the blood. The rate is made up for in the SIZE of
 *    a pile, never in how many of them there are.
 * 2. **ONLY SOMETHING WITH POCKETS.** See `carriesGold` (items/gold.ts): a
 *    body that WALKS ON LEGS and is not a beast is a humanoid — people and the
 *    two-legged machines alike — and a humanoid was carrying money. A rover on
 *    treads, a haunting that drifts and a collapsed star were not, and a def
 *    can say otherwise either way with `EnemyDef.wealth`.
 * 3. **THE PILE IS PRICED OFF THE MONSTER'S LEVEL**, `base + perMlvl × mlvl`,
 *    so deeper ground pays better without any per-level authoring.
 * 4. **A SET PIECE PAYS LIKE ONE.** `roleMult` is the whole difference
 *    between the rank and file and the thing at the end of the map, and
 *    `wealth` is the difference between a night watchman and the man who
 *    owns the building.
 *
 * Every draw comes off the run's own `goldRng` stream, never `rng` — moving
 * any knob here must not reshuffle a single equipment drop, or the A/B that
 * calibrates it (loot sales vs. gold, see the simulator's GOLD table) would
 * move both halves at once and measure nothing.
 */
export const GOLD = {
  /**
   * THE KNOB. Multiplies every pile in the game, and it is the ONE number to
   * move when the farm rate is wrong.
   *
   * Calibrated against `farmMinutesPerAutopilotMinute` below: an hour of
   * ordinary mid-campaign farming should pay for about fifteen minutes of
   * AUTO PILOT at 1× (`AUTOPILOT.coinsPerSecond × 900`). Measure it —
   * never eyeball it — with `node scripts/simulate-run.mjs`, whose GOLD table
   * prints the two faucets apart and scores the ratio against the target.
   *
   * **TUNE IT AGAINST THE GOLD-ALONE LINE, NOT THE COMBINED ONE.** The other
   * faucet (loot sold at the counter) rides the sell ladder's ORDERS OF
   * MAGNITUDE — a single unique is worth a map of trash — so one item dropping
   * swings a campaign's combined figure by a factor of ten. Tuning this number
   * against the total would mean re-tuning it every time the loot ladder rolled
   * differently.
   *
   * SET AT 1.5 against two full medium campaigns (seeds 11 and 23, 20 min/map):
   * 222,344 coins of gold over 146 simulated minutes = 37 minutes of AUTO PILOT
   * bought, or **3.95:1** against the 4:1 target. The two seeds individually
   * read 6.0:1 and 2.7:1, and the difference is entirely whether the run got far
   * enough to kill its bosses — so re-calibrate on at least two campaigns, never
   * on one map.
   */
  dropMult: 1.5,
  /**
   * THE CALIBRATION TARGET, recorded here so the number the knob was set
   * against travels with the knob: minutes of FARMING that should buy one
   * minute of AUTO PILOT at 1×. 4 = an hour of play buys a quarter of an hour
   * of watching it play itself.
   *
   * Nothing in the simulation reads it — the simulator's `--gold` verdict
   * does, which is the point: a target nobody can check is a target that
   * silently rots.
   */
  farmMinutesPerAutopilotMinute: 4,
  /**
   * Chance a fallen MINION sheds a purse at all. One in five: gold is a
   * punctuation mark on a fight, not its texture.
   */
  minionChance: 0.2,
  /** An ELITE always paid something; so did a BOSS. They are the payday. */
  eliteChance: 1,
  bossChance: 1,
  /**
   * A pile's floor and its slope: `base + perMlvl × mlvl` coins before every
   * multiplier below.
   *
   * THE SLOPE IS DELIBERATELY SHALLOW, and that is the one number here with a
   * reason outside itself. The AUTO PILOT meter charges a FLAT rate whatever
   * the hero's level (`AUTOPILOT.coinsPerSecond`), so gold's scaling IS the
   * campaign's purchasing-power curve. A steep line (the first draft ran a
   * floor of 6 with a slope of 9) makes a JESUS mob pay eighteen times an
   * opening one, and the ratio this block is calibrated against then holds at
   * exactly one point in the campaign. A HIGH floor with a GENTLE slope keeps
   * deeper ground genuinely richer — about six times, end to end — without
   * making the target meaningless everywhere but the middle.
   */
  base: 40,
  perMlvl: 4,
  /**
   * What the body's RANK is worth, as a multiple of a minion's purse.
   *
   * KEPT SMALL ON PURPOSE, because this MULTIPLIES with `wealth` and the
   * product is what actually lands: at an earlier elite/boss of 14/70 against a
   * founder's wealth of 50, one boss kill paid 3,500 minions and a whole map's
   * trash rounded to nothing beside it — a coin economy whose only real verb is
   * "kill the man at the end". A map's rank and file should carry about half its
   * takings, its elites a fifth, and its boss the rest, which is what 1 / 8 / 24
   * comes out at against the kill mix a real run actually produces.
   */
  roleMult: { minion: 1, elite: 8, boss: 24 } as Record<
    "minion" | "elite" | "boss",
    number
  >,
  /**
   * A SPECIAL monster's purse (config RARE_MOBS): the oddity that turns up
   * once a map, and the named one-off that turns up on a fraction of runs,
   * were carrying more than the rank and file. Below the elite rung on
   * purpose — a rare mob is a lucky find, not a set piece.
   */
  rarityMult: { rare: 3, unique: 5 } as Record<"rare" | "unique", number>,
  /**
   * A HELLBORN kill's purse (config HELLGATES). The gates are the one place a
   * rampage pays instead of costing, and gold follows the gear.
   */
  hellbornMult: 6,
  /**
   * How much a pile may swing either side of its computed worth, as a
   * fraction: 0.35 = anywhere from 65% to 135%. Purely so two identical mobs
   * don't shed two identical numbers.
   */
  variance: 0.35,
  /**
   * How many SEPARATE piles a payout is split into, by role — the D2 boss
   * fountain. A boss's takings landing as one tidy pile reads like a medkit;
   * split six ways and scattered they read like the vault came open. The
   * total is unchanged, so this is spectacle and nothing else.
   */
  piles: { minion: 1, elite: 2, boss: 6 } as Record<
    "minion" | "elite" | "boss",
    number
  >,
  /** How far (world px) the split piles of one payout scatter from the body. */
  scatterPx: 34,
  /**
   * THE PILE LADDER — which sprite a pile wears, by what is in it, richest
   * rung first. The names are `content/sprites/effects/gold_*`, and each rung
   * carries SEVERAL so a floor strewn with piles doesn't read as a floor
   * strewn with one stamp; the variant is picked off the item's own id hash
   * (never a draw — see `goldSprite`).
   *
   * The thresholds are the ladder's whole grammar: the rungs are what a player
   * learns to read from across a room, so they are spaced by roughly ×5 rather
   * than evenly, and the top rung has no ceiling.
   */
  pileTiers: [
    { min: 10_000, sprites: ["gold_hoard_a", "gold_hoard_b"] },
    { min: 2500, sprites: ["gold_heap_a", "gold_heap_b", "gold_heap_c"] },
    { min: 600, sprites: ["gold_pile_a", "gold_pile_b", "gold_pile_c"] },
    { min: 150, sprites: ["gold_stack_a", "gold_stack_b", "gold_stack_c"] },
    { min: 0, sprites: ["gold_coins_a", "gold_coins_b", "gold_coins_c"] },
  ] as readonly { min: number; sprites: readonly string[] }[],
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
