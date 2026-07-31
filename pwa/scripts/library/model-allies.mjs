// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ALLIES — the figures the campaign lets you recruit (one at a time), as pages waiting to
// be rendered.
//
// The bestiary's twin, and the only section whose subject is somebody on the
// hero's side. Every other page in the library describes something that is
// trying to kill him, something he picks up, or somewhere he goes; a companion
// is a monster he chose not to finish, which is why the recruit is the first
// thing each page says and the elite it was is a link rather than a retelling.
//
// Facts only, exactly as ./model.mjs — the sentences are ./prose-allies.mjs and
// the markup ./render-allies.mjs. Every number here comes back from the engine's
// own accessors (./catalogs.mjs), and the three that need a live recruit come
// back from a real one (`withCompanion`).

import {
  COMPANIONS,
  COMPANION_DEFS,
  ENEMY_DEFS,
  GEAR_DEFS,
  LEVELS,
  LEVEL_ORDER,
  SECRET_LEVEL_ORDER,
  WEAPON_DEFS,
  companionAuraMagicFind,
  companionMaxHp,
  companionNovaDamage,
  companionNovaRadius,
  companionPowerRank,
  companionProjectileBonus,
  companionWeaponCooldown,
  companionWeaponDamage,
  companionXpToLevelUp,
  referenceMobXp,
  withCompanion,
} from "./catalogs.mjs";
import { itemPath } from "./model-arsenal.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. The rule
 * `ENEMY_FIELDS` states in full (see ./model.mjs); this is the companion
 * roster's half of it.
 *
 * It matters more here than the field count suggests. The roster is four
 * entries and a fifth is one YAML block away, so this is the catalog most
 * likely to grow a field nobody thinks about the library while adding — a new
 * aura kind, a second signature power shape, a piece of gear a recruit arrives
 * wearing.
 */
export const COMPANION_FIELDS = {
  id: "the page's own route",
  name: "the heading",
  sprite: "the portrait",
  hp: "the stat block, and the base the training table grows",
  speed: "the stat block",
  radius: "the stat block's SIZE",
  weapon: "the SIGNATURE WEAPON row, linked to the arsenal",
  aura: "the aura section, and its rank column in the training table",
  nova: "the frost nova section, and its columns in the training table",
  power: "the signature-power section and the training table",
  joinWords: "what it says on joining, behind the reveal",
  killQuotes: "its banter, behind the reveal",
};

/**
 * The `power` block's own fields. Each `*PerRank` entry is also a MEASURE — a
 * column in the training table, computed by the accessor that owns its rule —
 * so an unlisted one would be a rank ladder silently missing the thing the rank
 * actually buys, on the page whose whole subject is what a rank buys.
 */
const POWER_FIELDS = {
  name: "the signature-power heading",
  blurb: "the line under it",
  everyLevels: "how often a rank lands — the training table's own step",
  pelletsPerRank: "the PELLETS column",
  chainPerRank: "the ARCS column",
  piercePerRank: "the PIERCE column",
  novaRadiusPerRank: "the NOVA REACH column",
  novaDamagePerRank: "the NOVA BITE column",
  magicFindPerRank: "the MAGIC FIND column",
};

const AURA_FIELDS = { magicFind: "the aura section and the MAGIC FIND column" };

const NOVA_FIELDS = {
  everyMs: "the frost nova section's cadence",
  radius: "the NOVA REACH column, as its rank-0 figure",
  damage: "the NOVA BITE column, as its rank-0 figure",
  chillMs: "the frost nova section's chill",
  chillFactor: "the frost nova section's chill",
};

const undeclared = (where, def, fields) =>
  Object.keys(def ?? {})
    .filter((key) => !(key in fields))
    .map((key) => (where ? `${where}.${key}` : key));

function assertFieldsCovered(def) {
  const unknown = [
    ...undeclared("", def, COMPANION_FIELDS),
    ...undeclared("power", def.power, POWER_FIELDS),
    ...undeclared("aura", def.aura, AURA_FIELDS),
    ...undeclared("nova", def.nova, NOVA_FIELDS),
  ];
  if (unknown.length > 0) {
    throw new Error(
      `library: companion "${def.id}" carries ${unknown.join(", ")}, which no library ` +
        `page renders. Add it to the generator (pwa/scripts/library/model-allies.mjs) ` +
        `and declare it in COMPANION_FIELDS — the pages are never edited by hand, so ` +
        `an unrendered field would silently vanish.`,
    );
  }
}

/** URL slug for a catalog id — hyphens read better in a URL than underscores. */
const slugFor = (id) => id.replace(/_/g, "-");

/** The route an ally's page lives at, relative to `/library/`. */
export const allyPath = (id) => `allies/${slugFor(id)}`;

/**
 * HOW FAR UP THE LADDER THE TRAINING TABLE GOES.
 *
 * A companion levels indefinitely (`COMPANIONS.maxLevel` is set high enough to
 * read as forever), so any table of it is a window and the page has to say so
 * rather than let six rows imply a ceiling — the section's own version of the
 * "no silent caps" rule. Six rungs is what it takes to show every measure
 * moving twice, which is the least that makes a slope legible.
 */
const LADDER_RANKS = 6;

/** The level a given power RANK arrives at, from the def's own step. */
const levelForRank = (def, rank) => rank * (def.power?.everyLevels ?? 1) + 1;

/**
 * WHAT A RANK ACTUALLY BUYS, one measure per column.
 *
 * Derived from what the def CARRIES rather than declared per companion: the
 * blunderbuss grows pellets and the coil grows arcs, so a fixed column set
 * would print an empty PELLETS column on three of the four pages. Each entry
 * names the accessor that owns its rule, which is what stops the table from
 * being `perRank × rank` arithmetic — the trap the talents' rank ladders
 * already walked into once (see the reference-hero note in ./catalogs.mjs).
 */
function measuresFor(def) {
  const power = def.power ?? {};
  const measures = [];
  if (power.pelletsPerRank) {
    measures.push({
      key: "pellets",
      label: "PELLETS",
      // The volley the weapon already throws, plus what the rank adds — the
      // sum is what leaves the barrel, and the base alone is what a reader
      // would otherwise have to go and find on the arsenal page.
      read: (level) =>
        (WEAPON_DEFS[def.weapon].projectile?.count ?? 1) +
        companionProjectileBonus(def, level).pellets,
    });
  }
  if (power.chainPerRank) {
    measures.push({
      key: "chain",
      label: "ARCS",
      read: (level) => companionProjectileBonus(def, level).chain,
    });
  }
  if (power.piercePerRank) {
    measures.push({
      key: "pierce",
      label: "PIERCE",
      read: (level) => companionProjectileBonus(def, level).pierce,
    });
  }
  // The nova's two measures are asked of a companion that HAS one, not of a
  // power that ranks one up: the bite grows with training at every level while
  // the reach only moves on a rank, and a table that showed the reach alone
  // would report a signature power as flat between rank-ups.
  if (def.nova) {
    measures.push({
      key: "novaDamage",
      label: "NOVA BITE",
      read: (level) =>
        Math.round(
          withCompanion(def.id, level, (companion) =>
            companionNovaDamage(companion),
          ),
        ),
    });
    measures.push({
      key: "novaRadius",
      label: "NOVA REACH",
      unit: "px",
      read: (level) => companionNovaRadius(def, level),
    });
  }
  if (def.aura?.magicFind || power.magicFindPerRank) {
    measures.push({
      key: "magicFind",
      label: "MAGIC FIND",
      unit: "%",
      read: (level) => Math.round(companionAuraMagicFind(def, level) * 100),
    });
  }
  return measures;
}

/**
 * The training ladder: a row per power rank, and what the companion is at the
 * level that rank lands on.
 *
 * HP and per-hit damage are on every row rather than in a table of their own
 * because they are what a rank-less companion would still be gaining — a
 * reader asking "is it worth keeping it alive" is asking about all of it at
 * once, and two tables of the same six levels is two tables nobody reads.
 */
function trainingLadder(def) {
  const measures = measuresFor(def);
  return {
    measures,
    step: def.power?.everyLevels ?? null,
    rows: Array.from({ length: LADDER_RANKS }, (_, rank) => {
      const level = levelForRank(def, rank);
      const blow = withCompanion(def.id, level, (companion) => ({
        damage: companionWeaponDamage(companion),
        cooldownMs: companionWeaponCooldown(companion),
      }));
      return {
        // ASKED, not assumed. `levelForRank` is the inverse of the engine's own
        // rule and exists only to pick which levels to sample; what the table
        // then PRINTS as the rank is what `companionPowerRank` says a companion
        // of that level has actually reached, so a change to how ranks land
        // shows up in the table rather than being papered over by the
        // arithmetic that chose the rows.
        rank: companionPowerRank(def, level),
        level,
        hp: companionMaxHp(def, level),
        damage: Math.round(blow.damage),
        // What a level costs at this rung, in the unit the curve is authored
        // in: `COMPANIONS.levelKills` of a reference mob's worth of XP. The
        // count is the engine's own two figures divided, never the config
        // constant re-grown here.
        kills: Math.round(companionXpToLevelUp(level) / referenceMobXp(level)),
        values: Object.fromEntries(
          measures.map((measure) => [measure.key, measure.read(level)]),
        ),
      };
    }),
  };
}

/** Which elite kneels into this companion, and where it is standing when it does. */
function recruitOf(def, venueById) {
  const elite = Object.values(ENEMY_DEFS).find(
    (enemy) => enemy.spareable?.companion === def.id,
  );
  // An ally nobody can be spared into is left as a hole rather than papered
  // over — the same call `model-achievements.mjs` makes about its badge, and
  // the honest one: a page claiming a recruit that cannot happen is worse than
  // a page saying the recruit is unreachable.
  if (!elite) return null;
  const venueId = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER].find((id) =>
    (LEVELS[id].spawns ?? []).some((spawn) => spawn.enemy === elite.id),
  );
  return {
    enemy: {
      id: elite.id,
      name: elite.name,
      path: `bestiary/${slugFor(elite.id)}`,
      // The elite's own authored paragraph, quoted and attributed rather than
      // restated: it is the tier that owns what this figure IS, and a
      // companion def has no such field of its own. Its `lastWords` are
      // deliberately NOT here — those are what it says when you take the other
      // option, and they belong on the bestiary page they already sit on.
      lore: elite.lore,
    },
    venue: venueById.get(venueId) ?? null,
  };
}

function allyModel(def, venueById) {
  assertFieldsCovered(def);
  const weaponDef = WEAPON_DEFS[def.weapon];
  // A generated grade variant has no page of its own — it is described on the
  // ancestor it came from — so the link goes where the weapon is written up.
  const weaponPage = weaponDef.gradeBase ?? weaponDef.id;
  const recruited = withCompanion(def.id, 1, (companion) => ({
    damage: Math.round(companionWeaponDamage(companion)),
    cooldownMs: companionWeaponCooldown(companion),
  }));

  return {
    id: def.id,
    slug: slugFor(def.id),
    path: allyPath(def.id),
    name: def.name,
    sprite: `${def.sprite}_0`,
    recruit: recruitOf(def, venueById),
    weapon: {
      id: def.weapon,
      name: weaponDef.name,
      path: `arsenal/${slugFor(weaponPage)}`,
      class: weaponDef.class,
      range: weaponDef.range,
      sweepDeg: weaponDef.sweepDeg ?? null,
      // Does it throw something, or does it swing? It decides what the damage
      // figure MEANS, and getting that wrong is the one way this table could
      // mislead: `companionAttack` gives every pellet of a volley the FULL
      // per-hit damage, so a rank of FULL BROADSIDE is a fifth more damage
      // rather than the same damage spread thinner — while a melee blow is per
      // foe, across at most `COMPANIONS.meleeTargets` of them.
      throws: !!weaponDef.projectile,
      // Does the weapon already throw a volley / already chain? Both decide
      // whether a rank ADDS to something or GRANTS it outright — the coil has
      // no base chain at all, so Tesla's first rank is a new trick rather than
      // a bigger one.
      pellets: weaponDef.projectile?.count ?? null,
      chain: weaponDef.projectile?.chain ?? null,
    },
    base: {
      hp: def.hp,
      speed: def.speed,
      radius: def.radius,
      damage: recruited.damage,
      cooldownMs: recruited.cooldownMs,
    },
    power: def.power
      ? {
          name: def.power.name,
          blurb: def.power.blurb,
          everyLevels: def.power.everyLevels,
        }
      : null,
    nova: def.nova ?? null,
    aura: def.aura?.magicFind ? { magicFind: def.aura.magicFind } : null,
    training: trainingLadder(def),
    // Spoken words, and the one thing on the page that is a spoiler: the join
    // is the payoff of a choice the game makes you stop the run to take.
    story: {
      joinWords: def.joinWords ?? [],
      killQuotes: def.killQuotes,
    },
    sourceFiles: ["content/companions.yaml", "content/enemies"],
  };
}

/**
 * The REVIVE item's name and page — the one thing outside the roster the party
 * rules have to point at, since a reader just told their friend never gets up
 * on its own is owed the answer in one click. Null if no base carries the
 * marker, so a game without one simply prints no note.
 */
function reviveItemModel() {
  const def = Object.values(GEAR_DEFS).find((gear) => gear.revive);
  return def ? { name: def.name, path: itemPath(def.id) } : null;
}

/** The whole roster, plus the party rules that are true of all of them. */
export function alliesModel(venueList) {
  const venueById = new Map(venueList.map((venue) => [venue.id, venue]));
  const allies = Object.values(COMPANION_DEFS)
    .map((def) => allyModel(def, venueById))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    allies,
    // The knobs every ally obeys — the formation, the bubble they fight in, the
    // damper that keeps a party from doing the hero's job, how many of them you
    // may keep, and what it costs to wake and mend one. None of it is visible
    // from inside the game, and none of it belongs on one ally's page, which is
    // what the index is for.
    tuning: COMPANIONS,
    // The bottle that wakes a downed companion, for the index's cross-link.
    // Found by the `revive` MARKER rather than by id — the engine finds it the
    // same way (`reviveGearIds`), so a total conversion that renames the thing
    // still links to its own rather than to a page that isn't there.
    reviveItem: reviveItemModel(),
    sourceFiles: ["content/companions.yaml", "src/game/config/companions.ts"],
  };
}
