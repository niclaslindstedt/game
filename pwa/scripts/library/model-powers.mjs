// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE POWERS' page model: every timed power a pickup can grant, folded into the
// shape a page wants to be rendered from — plus the index of which venues' loot
// pools carry it and at what odds, which is what turns the section into a graph
// rather than a shelf.
//
// Facts only, the same rule the bestiary and arsenal models follow: every value
// here was read off a compiled catalog or returned by the engine. The sentences
// are ./prose-powers.mjs; the markup is ./render-powers.mjs.
//
// WHY THIS IS ITS OWN SECTION RATHER THAN A CORNER OF THE ARSENAL. An arsenal
// page is about a thing you CARRY: it has a slot, a level requirement, a make
// quality, a durability budget and an owner. A power has none of those. It is a
// few seconds of changed rules that never enters the inventory, is never worn,
// and is gone before the fight it was spent in ends — so filing it under items
// would mean a shelf of pages whose every column reads "—".

import {
  ABILITY,
  ABILITY_DEFAULT_RARITY,
  ABILITY_DEFS,
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  ECONOMY,
  LEVELS,
  LEVEL_ORDER,
  LEVELING,
  LOOT,
  MERCY,
  NUKE_DEF_ID,
  SECRET_LEVEL_ORDER,
  abilityBlocks,
  abilityRarity,
} from "./catalogs.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. Same contract as
 * the bestiary's `ENEMY_FIELDS` and the arsenal's `WEAPON_FIELDS` (see
 * ./model.mjs for why it exists), and it bites harder here than anywhere else:
 * a power is a COMPOSITION of effect blocks, so the catalog is designed to grow
 * a new block per idea and a page that quietly ignored one would describe half
 * a power without ever saying which half.
 */
export const POWER_FIELDS = {
  id: "the page's own route",
  name: "the heading",
  lore: "the flavor paragraph under the icon",
  kind: "the LEADS WITH chip, and the opening line",
  durationMs: "the RUNS FOR row, and the instant/timed opening line",
  stackable: "the STACKS note",
  uniqueHeld: "the ONE AT A TIME note",
  icon: "the portrait, and the rack rows",
  sfx: "not reader-facing: which authored sound the bus plays over the event's",
  rarity: "the HOW OFTEN section — the weight, and the per-venue pick odds",
  look: "not reader-facing: the colour kit the app draws the effect in",
  // …and one entry per effect block, all of them rendered by `EFFECT_BLOCKS`
  // below. Spread rather than listed so the two can never fall out of step.
  ...Object.fromEntries(
    [
      "orbit",
      "storm",
      "stasis",
      "nuke",
      "magnet",
      "trail",
      "barrier",
      "rain",
      "phase",
      "well",
      "surge",
      "pulse",
      "volley",
      "turret",
      "ward",
      "singularity",
      "immolation",
    ].map((block) => [block, "an effect block — its own numbers table"]),
  ),
};

/**
 * HOW EVERY BLOCK FIELD IS WORDED AND WHAT UNIT IT IS IN.
 *
 * Declared rather than printed raw for two reasons. A table row reading
 * `angularSpeed 3.2` is a variable name leaking onto a reader's page, and a
 * column of bare milliseconds beside a column of bare pixels is four hundred
 * numbers with no units on any of them. And declaring it is what makes the
 * coverage contract above reach INSIDE a block: add a field to `AbilityDef.well`
 * and the build stops here rather than dropping it from every page that draws a
 * well.
 *
 * EXPORTED because a CONJURED spell arrives at the very same block shape by a
 * different route (`SPELL_BLOCKS` in ./catalogs.mjs — a rank curve rather than
 * an authored block), and the talent pages table it with these labels. One
 * vocabulary for one set of numbers: a ring's ORB SIZE means the same thing
 * whether the ring was picked up off a floor or conjured by a magic-tree hero.
 *
 * `label: null` means DECLARED BUT NOT TABLED, and the note says why — the same
 * escape hatch `GEAR_FIELDS` uses for the paper-doll's silhouette. The two that
 * take it are the sprite names, which are not a fact about the power so much as
 * an instruction to the renderer; the art itself reaches the page a better way,
 * through `artOf` below.
 */
export const EFFECT_BLOCKS = {
  orbit: {
    title: "The ring",
    fields: {
      count: { label: "ORBS", unit: "n" },
      radius: { label: "RING RADIUS", unit: "px" },
      angularSpeed: { label: "SWEEP", unit: "rad" },
      damage: { label: "DAMAGE PER BITE", unit: "dmg" },
      hitCooldownMs: { label: "ONE ORB BITES EVERY", unit: "sec" },
      orbRadius: { label: "ORB SIZE", unit: "px" },
      sprite: { label: null, note: "drawn on the page as art, not as a name" },
    },
  },
  storm: {
    title: "The bolts",
    fields: {
      intervalMs: { label: "STRIKES EVERY", unit: "sec" },
      damage: { label: "DAMAGE PER BOLT", unit: "dmg" },
      range: { label: "REACHES", unit: "px" },
    },
  },
  stasis: {
    title: "The field",
    fields: {
      radius: { label: "RADIUS", unit: "px" },
      slowFactor: { label: "SPEED INSIDE", unit: "pct" },
    },
  },
  nuke: {
    title: "The blast",
    fields: { radius: { label: "RADIUS", unit: "px" } },
  },
  magnet: {
    title: "The pull",
    fields: {
      radius: { label: "RADIUS", unit: "px" },
      radiusPerInt: { label: "RADIUS PER INT", unit: "px" },
      pullSpeed: { label: "ITEMS FLY AT", unit: "speed" },
    },
  },
  trail: {
    title: "The wake",
    fields: {
      dropMs: { label: "LAYS A PATCH EVERY", unit: "sec" },
      patchMs: { label: "A PATCH BURNS FOR", unit: "sec" },
      radius: { label: "PATCH RADIUS", unit: "px" },
      damage: { label: "DAMAGE PER TICK", unit: "dmg" },
      tickMs: { label: "TICKS EVERY", unit: "sec" },
    },
  },
  barrier: {
    title: "The shell",
    fields: {
      poolFrac: { label: "ABSORBS", unit: "pct", of: "your own max health" },
    },
  },
  rain: {
    title: "The barrage",
    fields: {
      intervalMs: { label: "FALLS EVERY", unit: "sec" },
      count: { label: "IMPACTS PER FALL", unit: "n" },
      radius: { label: "BLAST RADIUS", unit: "px" },
      damage: { label: "DAMAGE PER IMPACT", unit: "dmg" },
      range: { label: "LANDS WITHIN", unit: "px" },
    },
  },
  phase: {
    title: "Spectral",
    fields: { speedMult: { label: "WALK SPEED", unit: "mult" } },
  },
  well: {
    title: "The core",
    fields: {
      radius: { label: "RADIUS", unit: "px" },
      damage: { label: "DAMAGE PER TICK", unit: "dmg" },
      tickMs: { label: "GRINDS EVERY", unit: "sec" },
      pull: { label: "DRAGS THE CAUGHT AT", unit: "speed" },
      chase: { label: "ROAMS AT", unit: "speed" },
    },
  },
  surge: {
    title: "Your own weapon",
    fields: {
      damageMult: { label: "WEAPON DAMAGE", unit: "mult" },
      cooldownMult: { label: "TIME BETWEEN BLOWS", unit: "mult" },
    },
  },
  pulse: {
    title: "The wave",
    fields: {
      intervalMs: { label: "WASHES OUT EVERY", unit: "sec" },
      radius: { label: "REACHES", unit: "px" },
      damage: { label: "DAMAGE PER WAVE", unit: "dmg" },
      push: { label: "SHOVES THE CAUGHT", unit: "px" },
    },
  },
  volley: {
    title: "The shots",
    fields: {
      intervalMs: { label: "LOOSES EVERY", unit: "sec" },
      count: { label: "SHOTS PER VOLLEY", unit: "n" },
      spread: { label: "FAN", unit: "deg" },
      speed: { label: "SHOT SPEED", unit: "speed" },
      radius: { label: "SHOT SIZE", unit: "px" },
      damage: { label: "DAMAGE PER SHOT", unit: "dmg" },
      lifetimeMs: { label: "A SHOT LIVES", unit: "sec" },
      range: { label: "PICKS TARGETS WITHIN", unit: "px" },
      homing: { label: "TURNS AT", unit: "rad" },
      pierce: { label: "PUNCHES THROUGH", unit: "n", of: "bodies" },
      burst: { label: "BLAST ON IMPACT", unit: "px" },
      sprite: { label: null, note: "drawn on the page as art, not as a name" },
    },
  },
  turret: {
    title: "The guns",
    fields: {
      count: { label: "GUNS", unit: "n" },
      radius: { label: "PLANTED ON A RING OF", unit: "px" },
      intervalMs: { label: "ONE GUN FIRES EVERY", unit: "sec" },
      damage: { label: "DAMAGE PER SHOT", unit: "dmg" },
      range: { label: "A GUN SEES", unit: "px" },
      speed: { label: "SHOT SPEED", unit: "speed" },
      projectileRadius: { label: "SHOT SIZE", unit: "px" },
      sprite: { label: null, note: "drawn on the page as art, not as a name" },
      gunSprite: {
        label: null,
        note: "drawn on the page as art, not as a name",
      },
    },
  },
  ward: {
    title: "The floor under you",
    fields: { floor: { label: "A CLIPPED BLOW LEAVES YOU ON", unit: "hp" } },
  },
  singularity: {
    title: "The collapse",
    fields: {
      intervalMs: { label: "COLLAPSES EVERY", unit: "sec" },
      radius: { label: "RADIUS", unit: "px" },
      damage: { label: "DAMAGE PER COLLAPSE", unit: "dmg" },
      pull: { label: "DRAGS THE CAUGHT", unit: "px" },
      range: { label: "PICKS A CLUSTER WITHIN", unit: "px" },
    },
  },
  immolation: {
    title: "The ring",
    fields: {
      radius: { label: "RADIUS", unit: "px" },
      damage: { label: "DAMAGE PER TICK", unit: "dmg" },
      tickMs: { label: "TICKS EVERY", unit: "sec" },
    },
  },
};

/** The block fields that name a sprite — the art a page shows rather than
 * names. Derived from the declaration above so the two cannot disagree. */
const ART_FIELDS = ["sprite", "gunSprite"];

/** Fail the build when a power carries something no page would show. */
function assertPowerFieldsCovered(def) {
  const unknown = Object.keys(def).filter((key) => !(key in POWER_FIELDS));
  for (const [block, spec] of Object.entries(EFFECT_BLOCKS)) {
    for (const key of Object.keys(def[block] ?? {})) {
      if (!(key in spec.fields)) unknown.push(`${block}.${key}`);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `library: powerup "${def.id}" carries ${unknown.join(", ")}, which no library page renders. ` +
        `Add it to the generator (pwa/scripts/library/model-powers.mjs) and declare it in ` +
        `POWER_FIELDS / EFFECT_BLOCKS — the pages are never edited by hand, so an ` +
        `unrendered field would silently vanish.`,
    );
  }
}

/** URL slug for a catalog id — hyphens read better in a URL than underscores. */
const slugFor = (id) => id.replace(/_/g, "-");

/** The route a power's page lives at, relative to `/library/`. */
export const powerPath = (id) => `powers/${slugFor(id)}`;

/** The route a mission page lives at — needed here for the pool cross-links. */
const missionPath = (id) => `missions/${slugFor(id)}`;

// ---- where a power turns up --------------------------------------------------

/**
 * THE POOLS, AND THE ODDS INSIDE THEM.
 *
 * A power reaches a player exactly one way — a level's `loot.abilityPool` — and
 * a pool is a FLAT list picked from by WEIGHT (`pickAbility`, weighting each
 * entry by `abilityRarity`). So "how often do I see this" has a real answer per
 * venue, and it is the single most useful number the section can publish: the
 * bunker's pool is fourteen entries deep, and knowing that the CONTINUITY
 * PROTOCOL is a fortieth of it rather than a fourteenth is the difference
 * between a power and a rumour.
 *
 * The odds are the weight over the pool's total weight, which is exactly the
 * band `pickAbility` hands that id — and the library suite pins that by rolling
 * the engine's own picker at each band edge rather than trusting this comment.
 */
function poolsByPower() {
  const found = new Map();
  const order = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];

  for (const levelId of order) {
    const level = LEVELS[levelId];
    const pool = level?.loot?.abilityPool ?? [];
    if (pool.length === 0) continue;
    const total = pool.reduce((sum, id) => sum + abilityRarity(id), 0);
    let cursor = 0;
    for (const id of pool) {
      const weight = abilityRarity(id);
      const entry = {
        venue: { id: levelId, name: level.name, path: missionPath(levelId) },
        poolSize: pool.length,
        weight,
        // The half-open band of `pickAbility`'s single roll this id owns.
        band: [cursor / total, (cursor + weight) / total],
        odds: weight / total,
      };
      cursor += weight;
      if (!found.has(id)) found.set(id, []);
      found.get(id).push(entry);
    }
  }
  return found;
}

/**
 * THE ONE POWER THE POOLS DO NOT HAND OUT.
 *
 * The bomb is in no venue's `abilityPool`, and the section would have filed it
 * under "reachable only through a mod" — which would have been a page saying
 * something plainly untrue about the commonest bailout in the game. It has two
 * channels of its own, both written into the loot rules and both keyed on the
 * engine's own `NUKE_DEF_ID`:
 *
 *   - a flat SLICE of every ordinary payout (`LOOT.nukeShare`), everywhere, all
 *     campaign;
 *   - the PACKED-FIELD mercy roll (`crowdBombChance`): nothing at all until the
 *     on-screen crowd passes `MERCY.crowdBombThreshold`, then ramping per kill
 *     to the rung's own cap by `MERCY.crowdBombFull` — a cap that TAPERS down
 *     the ladder and is zero on JESUS, which is the whole shape of the mercy
 *     system in one table.
 *
 * Returns null for every other power, so nothing else in the model has to know
 * the bomb is special.
 */
function bombChannelsFor(id) {
  if (id !== NUKE_DEF_ID) return null;
  return {
    share: LOOT.nukeShare,
    crowd: {
      threshold: MERCY.crowdBombThreshold,
      full: MERCY.crowdBombFull,
      rungs: DIFFICULTY_ORDER.map((difficultyId) => {
        const def = DIFFICULTY_DEFS[difficultyId];
        return {
          difficulty: difficultyId,
          name: def.name,
          max: def.mercy.crowdBombChanceMax,
        };
      }),
    },
  };
}

// ---- one power ---------------------------------------------------------------

/** The effect blocks a power carries, each with its numbers already worded. */
function effectsOf(def) {
  return abilityBlocks(def).map((block) => {
    const spec = EFFECT_BLOCKS[block];
    const params = def[block];
    return {
      block,
      title: spec.title,
      // `label: null` fields are declared but not tabled — see EFFECT_BLOCKS.
      rows: Object.entries(spec.fields)
        .filter(([key, field]) => field.label && params[key] !== undefined)
        .map(([key, field]) => ({
          key,
          label: field.label,
          value: params[key],
          unit: field.unit,
          of: field.of ?? null,
        })),
    };
  });
}

/**
 * THE ART A POWER PUTS ON THE FIELD — the orb, the round, the charging bull,
 * the gun and its slug.
 *
 * The icon says what the pickup looks like lying on the floor, which is what a
 * player recognises it by; this says what they will be looking at once it is
 * spent, and for half the catalog the two share nothing at all (the SENTRY
 * GRID's pickup is a red panel and its effect is four guns). Both are real
 * sprites out of the game's own atlas, so both are shown rather than described.
 */
function artOf(def) {
  const art = [];
  for (const block of abilityBlocks(def)) {
    for (const field of ART_FIELDS) {
      const sprite = def[block]?.[field];
      if (sprite && !art.some((entry) => entry.sprite === sprite)) {
        art.push({ sprite, block });
      }
    }
  }
  return art;
}

function powerModel(def, pools, stocked) {
  assertPowerFieldsCovered(def);
  const carried = pools.get(def.id) ?? [];
  const weight = abilityRarity(def.id);

  return {
    id: def.id,
    slug: slugFor(def.id),
    path: powerPath(def.id),
    name: def.name,
    // The one authored sentence about what this power IS and how it wants to be
    // spent. Nothing in the game itself ever says either.
    lore: def.lore,
    // The block it LEADS with — a label, never a dispatch key, so the page says
    // "leads with" rather than "is".
    kind: def.kind,
    icon: def.icon,
    durationMs: def.durationMs,
    // A NUKE is over the instant it is spent; everything else runs on a clock.
    instant: def.durationMs === 0,
    stackable: !!def.stackable,
    uniqueHeld: !!def.uniqueHeld,
    effects: effectsOf(def),
    art: artOf(def),
    // Whether INTELLIGENCE reaches this power beyond the flat damage deepening
    // every conjured blow rides — two blocks grow their own radius with it.
    intRadius: def.magnet ? "pull" : def.stasis ? "field" : null,
    rarity: {
      weight,
      // What "ordinary" means on the ladder every authored weight is written
      // against, so a page can say "a fifth as often" rather than quote a 20.
      standard: ABILITY_DEFAULT_RARITY,
      share: weight / ABILITY_DEFAULT_RARITY,
      // The counter reads the same weight, and marks a rare power up so coins
      // cannot buy past the rationing.
      markupCap: ECONOMY.abilityRarityMarkupCap,
    },
    pools: carried,
    // The bomb's own two channels, and null for everything else.
    bomb: bombChannelsFor(def.id),
    // Where it first turns up, in campaign order — the campaign introduces two
    // new powers per venue, so this is the fact that groups the whole index.
    introducedBy: carried[0]?.venue ?? null,
    // Whether every venue from the one that introduced it onward still carries
    // it. The catalog's stated rule is that a pool KEEPS what came before, and
    // for most powers it does — but a page must never assert a rule the table
    // underneath it denies, so this is ASKED of the data rather than assumed,
    // and a power a later venue drops is described honestly instead.
    keptThroughout:
      carried.length > 0 &&
      carried.length === stocked.length - stocked.indexOf(carried[0].venue.id),
    sourceFiles: ["content/powerups.yaml"],
  };
}

// ---- the catalog ---------------------------------------------------------------

/**
 * Every power page, plus the yardstick the damage figures are read against.
 *
 * `refMobHp` is the level-1 reference minion's healthbar, and it is the only
 * thing that makes an authored damage number mean anything: every figure in the
 * catalog was picked against it (`content/powerups.yaml` says so outright —
 * "damage: 45" is "one reference minion per tick"), and `abilityPowerScale`
 * then holds that fraction steady for the whole campaign. So the page states
 * both, and the reader's own division is the honest answer — a "damage per
 * second" this module worked out for itself would be a number no surface of the
 * game shows.
 */
export function powersModel() {
  const pools = poolsByPower();
  const order = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];
  // The venues that stock powers at all, in campaign order — the spine both the
  // grouping and the "is it kept from here on" question are measured against.
  const stocked = order.filter(
    (levelId) => (LEVELS[levelId]?.loot?.abilityPool ?? []).length > 0,
  );
  const powers = Object.values(ABILITY_DEFS)
    .map((def) => powerModel(def, pools, stocked))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Grouped the way the campaign hands them out — the index's whole spine.
  const groups = order
    .map((levelId) => ({
      venue: LEVELS[levelId]
        ? {
            id: levelId,
            name: LEVELS[levelId].name,
            path: missionPath(levelId),
          }
        : null,
      entries: powers.filter((power) => power.introducedBy?.id === levelId),
    }))
    .filter((group) => group.venue && group.entries.length > 0);
  // Nothing may fall out of the index: a power in no level's pool has no venue
  // to be filed under, and still gets a shelf of its own rather than vanishing.
  // The shelf is named for what those powers HAVE rather than for what they
  // lack, because the one standing on it today is the screen-nuke — the most
  // familiar power in the game, which it would be absurd to file as missing.
  const orphans = powers.filter((power) => !power.introducedBy);
  if (orphans.length > 0) groups.push({ venue: null, entries: orphans });

  return {
    powers,
    groups,
    refMobHp: LEVELING.refMobHp,
    intDamagePerPoint: ABILITY.intDamagePerPoint,
    stasisRadiusPerInt: ABILITY.stasisRadiusPerInt,
  };
}
