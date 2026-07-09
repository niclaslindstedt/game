// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The companion catalog: who a spared unique BECOMES when it joins the party
// (see EnemyDef.spareable and companions.ts). One def per recruitable figure —
// its look, its own starting weapon, an optional party-wide aura, and the
// kill-quote banter it floats while fighting. Content is data, referenced by
// id, exactly like the enemy and equipment catalogs: a new companion is a new
// entry + the sprites its enemy twin already ships — no engine changes.

export type CompanionDef = {
  id: string;
  /** Display name (portraits, the equip screen, the join toast). */
  name: string;
  /** Sprite family the renderer draws (frames `<sprite>_0`, `<sprite>_1`) —
   * usually the same family as the enemy twin it was spared from. */
  sprite: string;
  /** Base max hp at hero level 1 (grows via COMPANIONS.hpPerLevel). */
  hp: number;
  /** Walk speed in world px/s. */
  speed: number;
  /** Collision radius in world px. */
  radius: number;
  /** The weapon this companion joins with (a WEAPON_DEFS id), minted
   * unbreakable — its signature piece, the one it fought the hero with. */
  weapon: string;
  /**
   * A party-wide AURA the companion radiates while up (silent while downed):
   * `magicFind` multiplies every loot-tier roll's chance by `1 + value` —
   * LUCKY's +50% is `0.5`. More aura kinds land here as companions do.
   */
  aura?: { magicFind?: number };
  /**
   * The joining scene: what the spared figure says the moment the SPARE
   * verdict lands — a short thanks, a life owed, a promise to follow and
   * protect — played through the ordinary dialogue box (a `companionJoin`
   * source) before the fight resumes. One entry per page, one string per
   * line; lines live in docs/manuscript.md like all spoken words.
   */
  joinWords?: string[][];
  /**
   * Banter floated above the companion when its blow kills a mob (config
   * COMPANIONS.quoteChance / quoteCooldownMs) — hovering text, never a
   * dialogue scene. Lines live in docs/manuscript.md like all spoken words.
   */
  killQuotes: string[];
};

export const COMPANION_DEFS: Record<string, CompanionDef> = {
  // The physics. Spared, he brings the coil he defended his corner with —
  // and treats every kill as a public demonstration.
  nikola_tesla: {
    id: "nikola_tesla",
    name: "NIKOLA TESLA",
    sprite: "nikola_tesla",
    hp: 160,
    speed: 52,
    radius: 12,
    weapon: "tesla_coil",
    joinWords: [
      [
        "YOU HELD THE CURRENT AND",
        "GAVE IT BACK. I OWE YOU A",
        "LIFE, LITTLE BUILDER.",
      ],
      [
        "MY COIL WALKS WITH YOU NOW.",
        "STAY CLOSE - I AM AT MY BEST",
        "NEAR A GOOD CONDUCTOR.",
      ],
    ],
    killQuotes: [
      "SCIENCE!",
      "ALTERNATING CURRENT. DIRECT RESULTS.",
      "EDISON COULD NEVER.",
      "WIRELESS. PATENT PENDING.",
      "THE PIGEONS WOULD BE PROUD.",
    ],
  },
  // The pilot. Navigates a place with no north by pure dead reckoning and
  // calls every takedown an airfield matter.
  amelia_earhart: {
    id: "amelia_earhart",
    name: "AMELIA EARHART",
    sprite: "amelia_earhart",
    hp: 150,
    speed: 58,
    radius: 12,
    weapon: "blunderbuss",
    joinWords: [
      [
        "YOU HAD ME GROUNDED AND",
        "LET ME BACK UP. THAT'S A",
        "DEBT, PILOT. I PAY THOSE.",
      ],
      [
        "I'LL FLY YOUR WING TO THE",
        "FAR DOOR AND PAST IT.",
        "NOBODY TOUCHES MY LEAD.",
      ],
    ],
    killQuotes: [
      "CLEARED FOR DEPARTURE.",
      "THAT ONE'S GROUNDED.",
      "SMOOTH LANDING.",
      "FLIGHT PLAN? NEVER FILED ONE.",
    ],
  },
  // The unkillable mystic. Finds the whole business of dying hilarious,
  // professionally speaking.
  grigori_rasputin: {
    id: "grigori_rasputin",
    name: "GRIGORI RASPUTIN",
    sprite: "grigori_rasputin",
    hp: 190,
    speed: 48,
    radius: 12,
    weapon: "executioners_axe",
    joinWords: [
      [
        "POISON. BULLETS. RIVERS.",
        "ONLY YOU EVER MADE ME KNEEL,",
        "AND YOU LET ME STAND.",
      ],
      [
        "MY LIFE IS YOURS NOW, WARM",
        "ONE. I WILL WATCH YOUR BACK.",
        "PITY WHATEVER COMES AT IT.",
      ],
    ],
    killQuotes: [
      "NOW YOU TRY DYING.",
      "I MAKE IT LOOK EASY.",
      "STAY DOWN. I NEVER DID.",
      "THE HOLY MAN SENDS REGARDS.",
    ],
  },
  // The little man with the pot of gold. His luck rubs off: +50% MAGIC FIND
  // for the whole party while he's on his feet.
  lucky: {
    id: "lucky",
    name: "LUCKY",
    sprite: "lucky",
    hp: 140,
    speed: 56,
    radius: 9,
    weapon: "sorcerers_staff",
    aura: { magicFind: 0.5 },
    joinWords: [
      [
        "YE BEAT ME FAIR AND LET ME",
        "KEEP ME HEAD. THAT'S A LIFE",
        "DEBT, THAT IS. BINDING.",
      ],
      [
        "SO I'M YOURS NOW - ME, ME",
        "LUCK, AND ME GOLD... WELL.",
        "THE LUCK, ANYWAY. C'MON.",
      ],
    ],
    killQuotes: [
      "OOPS. BAD LUCK.",
      "NOT YOUR DAY, FRIEND.",
      "FORTUNE FAVORS ME.",
      "THAT'S ME GOLD NOW.",
      "SHOULDA RUBBED A CLOVER.",
    ],
  },
};

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeCompanionDefs: Record<string, CompanionDef> = COMPANION_DEFS;

/** Test/authoring hook: replace the active companion catalog. */
export function setCompanionDefs(defs: Record<string, CompanionDef>): void {
  activeCompanionDefs = defs;
}

/** Look up a companion's def; throws on a broken id so bugs surface loudly. */
export function companionDef(defId: string): CompanionDef {
  const def = activeCompanionDefs[defId];
  if (!def) throw new Error(`unknown companion def "${defId}"`);
  return def;
}

/** Is this id in the active companion catalog? The lenient probe the loadout
 * loader uses so a save carrying a since-deleted companion loads without it
 * rather than crashing. */
export function isCompanionDef(defId: string): boolean {
  return defId in activeCompanionDefs;
}
