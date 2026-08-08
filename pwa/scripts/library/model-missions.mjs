// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MISSION GUIDE's page model: one venue per page — what the place is, who
// is waiting in it, what it pays out, and (behind the covers) what it looks
// like and what the hero says on arriving.
//
// A mission page is the JOIN of the other two sections: it is where the
// bestiary and the arsenal meet, and where a reader who searched for a level
// name finds every monster and every drop it owns, each one linked. Facts
// only, as ever — ./prose-missions.mjs writes the sentences.

import {
  ABILITY_DEFS,
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  GEAR_DEFS,
  LEVELS,
  STORY_ITEM_DEFS,
  UNIQUE_DEFS,
  WEAPON_DEFS,
  WORLD_DROP,
  equipmentLevelReq,
  giversForLevel,
  gradeVariantIds,
  questsForLevel,
} from "./catalogs.mjs";
import { powerPath } from "./model-powers.mjs";
import { giverPath, questPath } from "./model-quests.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. The level YAML is
 * the biggest authored shape in the repo, so this is also the map of what a
 * mission page deliberately does NOT say: the scatter counts, the collision
 * radii, and the wave cadence are the level's ENGINEERING, and a reader wants
 * the place rather than its bill of materials. Each `note` is the record of
 * that decision, and has to stay truthful.
 */
export const LEVEL_FIELDS = {
  id: "the page's own route",
  index: "the campaign order, and the previous/next links",
  name: "the heading",
  foes: "the opening line and the FOES chip",
  biome: "the ground the page is tiled with",
  intro: "the hero's arrival monologue, behind the reveal",
  outro: "the departure monologue, behind the reveal",
  prelude: "the cutscene note, behind the reveal",
  objective: "the OBJECTIVE row and the opening line",
  width: "the SIZE row, and the scale the map render is drawn at",
  height: "the SIZE row, and the scale the map render is drawn at",
  gravity: "the GRAVITY row",
  heroSuited: "the SUIT note",
  revealed: "the KNOWN GROUND note — no fog of war on home turf",
  sky: "the NIGHTFALL note — this venue's light follows the player's own clock",
  lights: "the map render's lamps, and the NIGHTFALL note's count",
  litZones:
    "not reader-facing: which rooms keep their own lights on after dark",
  mobLevels: "the difficulty ladder table",
  intendedLevel: "the difficulty ladder table's reference hero",
  loot: "the loot section — the pools, the relics, the powers, the trophy",
  merchant: "the merchant section",
  spawns: "the roster, and the map render's set pieces",
  spawners: "the roster",
  packs: "the roster",
  waves: "the roster and the HORDE note",
  rareSpawns: "the roster's rare and unique rolls",
  openingStrike: "the roster's vanguard, and the opening line",
  landmarks: "the map render",
  path: "the map render's route",
  walls: "the map render",
  buildings: "the map render",
  doors: "the map render, and the LOCKED note",
  arrivals:
    "the WAY IN note — that the entrance opens for somebody else's badge",
  arrivalLot:
    "not reader-facing: which stretch of tarmac the arrivals happen on is rolled per run",
  gates: "the secret-gate note",
  exitTo: "the RETURNS TO row",
  riftExit: "the prose — that the way onward from here is a tear",
  travelDoors: "the DOORS list — the hub's standing doors and their roads",
  driveOut: "the DOORS list — that the car door is driven out to a real road",
  merchantBeat:
    "the merchant section — the ground the trader paces, if he does",
  wells: "the map render and the hazards section",
  chests: "the map render and the CHESTS note",
  placedItems: "the loot section's hand-placed finds",
  safeZones: "the map render's calm pockets",
  quietZones: "the map render's dead areas",
  asteroids: "the hazards section",
  sandstorms: "the hazards section",
  stampedes: "the hazards section",
  hayBalls: "the hazards section",
  firstKillThoughts: "the story section, behind the reveal",
  firstSightThoughts: "the story section, behind the reveal",
  placeThoughts: "the story section, behind the reveal",
  playerSpawn: "the map render's start marker",
  music: "not reader-facing: which track the app plays here",
  tiles: "the ground the page is tiled with (through the renderer's own rule)",
  obstacles: "not reader-facing: the scatter's kinds and counts, engineering",
  decor: "not reader-facing: the scatter's kinds and counts, engineering",
  decorClearance: "not reader-facing: how far scatter keeps off a landmark",
  merchantSpawns: "not reader-facing: which nooks the trader may open in",
  propLines: "not reader-facing: the structured prop rows, engineering",
  tempo: "not reader-facing: the wave pressure envelope over the run",
  canopy: "the OVERHEAD note — what drifts between you and the sky here",
  fauna: "the LIVE HERE note — what is grazing the place when you arrive",
  lairs:
    "not reader-facing: which named foe lives behind which door (a spoiler the bestiary already owns)",
  elevators:
    "not reader-facing: where the lift stands is rolled per run, so there is nothing stable to write",
};

function assertLevelFieldsCovered(def) {
  const unknown = Object.keys(def).filter((key) => !(key in LEVEL_FIELDS));
  if (unknown.length > 0) {
    throw new Error(
      `library: level "${def.id}" carries ${unknown.join(", ")}, which no library page renders. ` +
        `Add it to the generator (pwa/scripts/library/) and declare it in LEVEL_FIELDS — ` +
        `the pages are never edited by hand, so an unrendered field would silently vanish.`,
    );
  }
}

const slugFor = (id) => id.replace(/_/g, "-");

/** The route a mission page lives at, relative to `/library/`. */
export const missionPath = (id) => `missions/${slugFor(id)}`;

const enemyPathOf = (id) => `bestiary/${slugFor(id)}`;
const itemPathOf = (id) => `arsenal/${slugFor(id)}`;

const itemLink = (id) => {
  const def = WEAPON_DEFS[id] ?? GEAR_DEFS[id] ?? UNIQUE_DEFS[id];
  return def ? { id, name: def.name, path: itemPathOf(id) } : null;
};

const enemyLink = (id) => {
  const def = ENEMY_DEFS[id];
  return def
    ? { id, name: def.name, role: def.role, path: enemyPathOf(id) }
    : null;
};

// ---- who is waiting -------------------------------------------------------------

/**
 * Every monster this venue can put on the board, and how. The five placement
 * kinds a level authors are folded down to one list per enemy, because a
 * reader wants "who is here" answered once, with the how as a footnote.
 */
function roster(level) {
  const seen = new Map();
  const note = (id, kind) => {
    if (!ENEMY_DEFS[id]) return;
    if (!seen.has(id)) seen.set(id, { ...enemyLink(id), kinds: new Set() });
    seen.get(id).kinds.add(kind);
  };

  for (const spawn of level.spawns ?? [])
    note(spawn.enemy, spawn.at ? "pinned" : "placed");
  for (const spawner of level.spawners ?? []) {
    for (const member of spawner.members ?? []) {
      note(member.enemy, spawner.hellgate ? "hellgate" : "spawner");
    }
  }
  for (const pack of level.packs ?? []) {
    for (const member of pack.members ?? []) note(member.enemy, "pack");
  }
  for (const window of level.waves?.budget ?? []) {
    for (const member of window.members ?? []) note(member.enemy, "wave");
  }
  for (const id of level.rareSpawns?.rare ?? []) note(id, "rare");
  for (const id of level.rareSpawns?.unique ?? []) note(id, "unique");
  if (level.openingStrike) note(level.openingStrike.enemy, "vanguard");

  const ROLE_ORDER = { boss: 0, elite: 1, minion: 2 };
  return [...seen.values()]
    .map((entry) => ({ ...entry, kinds: [...entry.kinds] }))
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
    );
}

// ---- the ladder ------------------------------------------------------------------

const bandLabel = (band) =>
  band == null
    ? null
    : typeof band === "number"
      ? [band, band]
      : [Math.min(...band), Math.max(...band)];

/**
 * What this venue IS on each rung: the monster levels the ladder stamps on its
 * ordinary spawns, the hero level it is tuned for, and the level a single clear
 * is expected to leave him at. All three come out of `content/ladder.yaml` by
 * way of the compiled level, so the table is the tuning itself rather than a
 * description of it. JESUS is absent for the same reason it is absent from the
 * bestiary: it is the one rung that scales to the hero, so it has no fixed
 * number to state.
 */
function ladder(level) {
  return ["easy", "medium", "hard", "nightmare"].map((id, index) => ({
    difficulty: id,
    name: DIFFICULTY_DEFS[id].name,
    color: DIFFICULTY_DEFS[id].color,
    mobLevels: bandLabel(level.mobLevels?.[index]),
    intendedLevel: level.intendedLevel?.[index] ?? null,
    leavesAt: level.loot?.arrowCapByDifficulty?.[id] ?? null,
    // The gate on this venue's own world relics: they only start dropping once
    // the hero has out-levelled a first pass, so they are farmed on a return.
    relicFloor: WORLD_DROP.minPlayerLevel[id] ?? null,
  }));
}

// ---- the loot -----------------------------------------------------------------

function lootModel(level) {
  const loot = level.loot ?? {};
  const pool = (ids, family) =>
    (ids ?? [])
      .map((id) => {
        const link = itemLink(id);
        if (!link) return null;
        return {
          ...link,
          family,
          levelReq: equipmentLevelReq(id),
          // The pool entry carries its exceptional and elite versions with it,
          // which is what keeps a first-map base dropping into the endgame.
          grades: gradeVariantIds(id)
            .map((variant) => itemLink(variant))
            .filter(Boolean),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.levelReq - b.levelReq || a.name.localeCompare(b.name));

  return {
    weapons: pool(loot.weaponPool, "weapon"),
    gear: pool(loot.gearPool, "gear"),
    powers: (loot.abilityPool ?? [])
      .map((id) =>
        ABILITY_DEFS[id]
          ? {
              id,
              name: ABILITY_DEFS[id].name,
              icon: ABILITY_DEFS[id].icon,
              // Every power has a page of its own now, so a venue's pool is a
              // list of links rather than a list of names — which is the only
              // thing that made the pool chips worth printing at all.
              path: powerPath(id),
            }
          : null,
      )
      .filter(Boolean),
    relics: Object.entries(loot.worldUniques ?? {}).map(
      ([difficulty, ids]) => ({
        difficulty,
        name: DIFFICULTY_DEFS[difficulty]?.name ?? difficulty.toUpperCase(),
        items: ids.map((id) => itemLink(id)).filter(Boolean),
      }),
    ),
    namedMult: loot.namedDropMult ?? 1,
    trophy: loot.allClearWeapon ? itemLink(loot.allClearWeapon) : null,
    early: (loot.earlyDrops ?? []).map((drop) => ({
      atKills: drop.atKills,
      item: itemLink(drop.weapon),
    })),
    placed: (level.placedItems ?? [])
      .map((placed) =>
        placed.kind === "equipment"
          ? itemLink(placed.defId)
          : placed.kind === "story"
            ? {
                id: placed.defId,
                name: STORY_ITEM_DEFS[placed.defId]?.name ?? placed.defId,
                story: true,
              }
            : null,
      )
      .filter(Boolean),
  };
}

// ---- hazards --------------------------------------------------------------------

function hazards(level) {
  const out = [];
  if (level.asteroids) out.push({ kind: "asteroids", spec: level.asteroids });
  if (level.sandstorms)
    out.push({ kind: "sandstorms", spec: level.sandstorms });
  if (level.stampedes) out.push({ kind: "stampedes", spec: level.stampedes });
  if (level.hayBalls) out.push({ kind: "hayBalls", spec: level.hayBalls });
  if (level.wells?.length)
    out.push({ kind: "wells", count: level.wells.length });
  return out;
}

// ---- one mission ------------------------------------------------------------------

/**
 * A level's errands, grouped by the person who hands them out and then in that
 * person's own list order. A quest filed under nobody on this map still comes
 * back, at the end — this is a reading order, not a filter.
 */
function sortedByGiver(levelId) {
  const people = giversForLevel(levelId).map((giver) => giver.id);
  const rank = (quest) => {
    const at = people.indexOf(quest.giver);
    return at === -1 ? people.length : at;
  };
  return questsForLevel(levelId)
    .map((quest, i) => ({ quest, i }))
    .sort((a, b) => rank(a.quest) - rank(b.quest) || a.i - b.i)
    .map((entry) => entry.quest);
}

function missionModel(level, order) {
  assertLevelFieldsCovered(level);
  const at = order.indexOf(level.id);

  return {
    id: level.id,
    slug: slugFor(level.id),
    path: missionPath(level.id),
    name: level.name,
    index: level.index,
    foes: level.foes,
    biome: level.biome,
    secret: at === -1,
    previous: at > 0 ? missionLink(order[at - 1]) : null,
    next: at >= 0 && at < order.length - 1 ? missionLink(order[at + 1]) : null,
    objective: level.objective,
    boss: (level.spawns ?? [])
      .filter((spawn) => ENEMY_DEFS[spawn.enemy]?.role === "boss")
      .map((spawn) => enemyLink(spawn.enemy))
      .filter(Boolean),
    size: { width: level.width, height: level.height },
    gravity: level.gravity,
    suited: level.heroSuited !== false,
    revealed: level.revealed === true,
    // NIGHTFALL: does this venue stand under a sky (`LevelDef.sky`), and what
    // is still burning on it when that sky goes dark? Reader-facing, because
    // "come home at midnight and it is midnight" is the kind of thing a player
    // notices and then wants confirmed.
    sky: level.sky ?? null,
    lamps: (level.lights ?? []).length,
    exitTo: level.exitTo ? missionLink(level.exitTo) : null,
    // THE WAY ONWARD IS A TEAR rather than a road (`LevelDef.riftExit`), which
    // is why the seam back home grows a branch the first time it is walked.
    riftExit: level.riftExit === true,
    gates: (level.gates ?? []).map((gate) => ({
      to: missionLink(gate.to),
      key: itemLink(gate.opensWith),
    })),
    // The hub's STANDING doors (LevelDef.travelDoors): each named, with the
    // roads it opens and — for the sealed one — the keepsake it answers to.
    travelDoors: (level.travelDoors ?? []).map((door) => ({
      name: door.name,
      to: door.to.map((id) => missionLink(id)).filter(Boolean),
      requires: door.requires ? (itemLink(door.requires) ?? null) : null,
    })),
    // Does this venue have a ROAD OUT (LevelDef.driveOut) — tarmac a driven car
    // leaves by, rather than a threshold it books the trip at? Reader-facing as
    // a fact about the car door: you drive off the property, you don't blink out
    // of the driveway.
    driveOut: (level.driveOut ?? []).length > 0,
    lockedDoors: (level.doors ?? []).length,
    // THE WAY IN (LevelDef.arrivals): this venue's entrance is a door the hero
    // cannot open — it answers a staff badge, so getting inside means following
    // somebody who has one. Reader-facing because it is the first thing the
    // venue asks of the player and nothing on the page would otherwise say so.
    arrivals: level.arrivals
      ? {
          guards: level.arrivals.guards?.count ?? 0,
          everyMs: level.arrivals.everyMs,
        }
      : null,
    chests: (level.chests ?? []).length,
    safeZones: (level.safeZones ?? []).length,
    quietZones: (level.quietZones ?? []).length,
    // What floats between you and the sky here (LevelDef.canopy) — ambience
    // rather than a rule, so the page mentions it as an observation about the
    // place rather than as a mechanic.
    canopy: (level.canopy ?? []).reduce((n, line) => n + line.count, 0),
    // What lives here and is not trying to kill you (LevelDef.fauna) — the same
    // kind of note as the canopy, on the ground plane.
    fauna: (level.fauna ?? []).reduce((n, line) => n + line.count, 0),
    // WHO IS NOT FIGHTING YOU HERE. The errands are their own section — this is
    // the link into it, and it belongs on a mission page because "who is
    // waiting" is the question that page already answers for everything else on
    // the map. Note it does NOT come off the level def: quests are a catalog of
    // their own, keyed BY level, which is exactly why a venue can gain an
    // errand without its own YAML changing a byte.
    errands: {
      givers: giversForLevel(level.id).map((giver) => ({
        id: giver.id,
        name: giver.name,
        sprite: `${giver.sprite}_0`,
        path: giverPath(giver.id),
      })),
      // Grouped by PERSON and then in that person's own list order. The engine
      // orders a level's errands for the offer gate, which interleaves the two
      // givers' chains — right there, and wrong in a sentence that reads them
      // out: a venue's errands are met two people at a time, not five at once.
      quests: sortedByGiver(level.id).map((quest) => ({
        id: quest.id,
        name: quest.name,
        giver: quest.giver,
        path: questPath(quest.id),
      })),
    },
    hasHorde: !!level.waves,
    hasSpawners: !!level.spawners?.length,
    hazards: hazards(level),
    roster: roster(level),
    ladder: ladder(level),
    loot: lootModel(level),
    merchant: level.merchant
      ? {
          name: level.merchant.name ?? "THE MERCHANT",
          greeting: level.merchant.greeting ?? [],
          returnGreeting: level.merchant.returnGreeting ?? [],
          // What he says across the counter on every visit, and whether he is
          // standing still to say it: a trader on a BEAT walks a strip of this
          // map all run instead of keeping a pitch (`LevelDef.merchant.beat`,
          // carved into `merchantBeat`), which is a fact about how you shop
          // here rather than an engine detail.
          line: level.merchant.line ?? null,
          beat:
            level.merchant.beat === true &&
            (level.merchantBeat ?? []).length > 0,
          parked: level.merchant.parked === true,
          stock: (level.merchant.stockUniques ?? [])
            .map((id) => itemLink(id))
            .filter(Boolean),
        }
      : null,
    // Story text. Everything under here goes behind the reveal panel.
    story: {
      intro: level.intro ?? [],
      outro: level.outro ?? [],
      prelude: level.prelude
        ? Array.isArray(level.prelude)
          ? level.prelude
          : [level.prelude]
        : [],
      thoughts: [
        ...(level.firstSightThoughts ?? []).map((trigger) => ({
          ...trigger,
          when: "sight",
          enemy: enemyLink(trigger.enemy),
        })),
        ...(level.firstKillThoughts ?? []).map((trigger) => ({
          ...trigger,
          when: "kill",
          enemy: enemyLink(trigger.enemy),
        })),
        // The PLACE-pinned beats have no speaker at all — they are pinned to
        // being somewhere (the hub's "take the car", and its "you are walking")
        // — so `where` carries what the others carry in `enemy`.
        ...(level.placeThoughts ?? []).map((trigger) => ({
          ...trigger,
          when: "place",
          enemy: null,
        })),
      ],
    },
    sourceFiles: [`content/levels/${level.id}.yaml`, "content/ladder.yaml"],
  };
}

function missionLink(id) {
  const level = LEVELS[id];
  return level ? { id, name: level.name, path: missionPath(id) } : null;
}

/** Every mission page, in the order the campaign plays them. */
export function missionsModel(order) {
  return order.map((id) => missionModel(LEVELS[id], order));
}
