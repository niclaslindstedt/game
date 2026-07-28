// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The library's PAGE MODEL: the compiled catalogs and the engine's own answers
// (./catalogs.mjs), folded into the shape a page wants to be rendered from.
//
// Facts only — every string here is a name, an id, or a number that came out of
// the game. The prose that turns those facts into a page a person wants to read
// is ./prose.mjs; the markup is ./render-bestiary.mjs. Keeping the three apart
// is what lets the coverage test assert against the model without rendering a
// byte of HTML.

import {
  COMPANION_DEFS,
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  LADDER,
  LEVELS,
  LEVEL_ORDER,
  RARE_MOBS,
  SECRET_LEVEL_ORDER,
  bandIndex,
  hardMobHpScale,
  killXp,
  mobContactScaleFor,
} from "./catalogs.mjs";
import { arsenalModel } from "./model-arsenal.mjs";
import { missionsModel } from "./model-missions.mjs";
import { storyModel } from "./model-story.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops.
 *
 * The library has no hand-written pages: a page is only ever changed by
 * changing a generator. The failure that rule invites is the quiet one — a new
 * field lands in the enemy YAML, no generator knows about it, and 104 pages go
 * on looking complete while silently omitting it. Nobody notices, because
 * nothing is broken; the pages are just wrong by omission.
 *
 * So the coverage is DECLARED here, and `assertFieldsCovered` fails the build on
 * anything unlisted. Adding a field to `EnemyDef` therefore forces a decision:
 * render it, or write down why it isn't reader-facing. Both are one edit in the
 * generator, which is the only place edits are allowed to happen.
 *
 * The `note` on each entry is the reason it is here, and is worth keeping
 * truthful — it is the record of what the pages deliberately don't say.
 */
export const ENEMY_FIELDS = {
  // Rendered on the page.
  id: "the page's own route",
  name: "the heading",
  role: "the role chip and the opening line",
  sprite: "the portrait",
  gore: "the WHEN STRUCK note",
  rarity: "the rarity chip, the opening line and the rare/unique note",
  pack: "the opening line's pack size",
  hellborn: "the HELLBORN chip and note",
  hp: "the stat block, and the base the field table scales",
  levelBonus: "the stat block, and the field table's level",
  speed: "the stat block",
  radius: "the stat block's SIZE",
  contactDamage: "the stat block, and the field table's damage",
  critChance: "the stat block",
  dodgeChance: "the stat block",
  contactCooldownMs: "the stat block's HITS EVERY",
  locomotion: "the HOW IT MOVES note",
  phasing: "the opening line and the PHASING note",
  apparition: "the opening line and the APPARITION note",
  flees: "the COWARD note",
  ranged: "the opening line and the shot section",
  shieldedBy: "the opening line",
  spareable: "the SPAREABLE note and the story section",
  xp: "the FLAT REWARD note",
  xpMobMult: "the PART OF A WHOLE note",
  dialogue: "the story section, behind the reveal",
  lastWords: "the story section, behind the reveal",
  ai: "the stat block and the movement notes",
  mechanics: "the mechanics section",
  phases: "the mechanics section",
  dropProfile: "the drops section",
  loot: "the drops section",
  uniquesByDifficulty: "the drops section's per-rung relic tables",
};

/** The `ai` sub-fields, checked the same way. */
const AI_FIELDS = {
  aggroRadius: "the stat block's NOTICES YOU AT",
  idle: "the ON SHIFT note",
  leashRadius: "the LEASHED note",
  returnSpeedFactor: "the GOING HOME note",
  rushSpeed: "the THE ENTRANCE note",
};

/** The mechanic kinds `mechanicsProse` knows how to describe. */
const MECHANIC_KINDS = ["charge", "slam", "enrage", "summon"];

/**
 * Fail the build when a monster carries something no page would show. See
 * `ENEMY_FIELDS` — this is the whole reason the library can be trusted not to
 * fall behind the content it is generated from.
 */
function assertFieldsCovered(def) {
  const unknown = [];
  for (const key of Object.keys(def)) {
    if (!(key in ENEMY_FIELDS)) unknown.push(key);
  }
  for (const key of Object.keys(def.ai ?? {})) {
    if (!(key in AI_FIELDS)) unknown.push(`ai.${key}`);
  }
  const mechanicSets = [
    def.mechanics,
    ...(def.phases ?? []).map((p) => p.mechanics),
  ];
  for (const set of mechanicSets) {
    for (const key of Object.keys(set ?? {})) {
      if (!MECHANIC_KINDS.includes(key)) unknown.push(`mechanics.${key}`);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `library: "${def.id}" carries ${unknown.join(", ")}, which no library page renders. ` +
        `Add it to the generator (pwa/scripts/library/) and declare it in ENEMY_FIELDS — ` +
        `the pages are never edited by hand, so an unrendered field would silently vanish.`,
    );
  }
}

/** URL slug for a catalog id — hyphens read better in a URL than underscores. */
export const slugFor = (id) => id.replace(/_/g, "-");

/** The route a catalog id's page lives at, relative to `/library/`. */
export const enemyPath = (id) => `bestiary/${slugFor(id)}`;

// ---- venues -----------------------------------------------------------------

/**
 * The levels, in story order with the secret venues after them. A venue is how
 * the bestiary groups itself: a reader looks up "the thing on the moon", not
 * "the thing with role=elite".
 */
export function venues() {
  return [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER].map((id) => {
    const level = LEVELS[id];
    return {
      id,
      slug: slugFor(id),
      name: level.name,
      biome: level.biome,
      foes: level.foes,
      secret: SECRET_LEVEL_ORDER.includes(id),
      storyIndex: level.index,
      intendedLevel: level.intendedLevel,
      mobLevels: level.mobLevels,
      tiles: level.tiles,
    };
  });
}

// ---- where a monster is met -------------------------------------------------

/**
 * Every way a level can put a monster on the board, gathered per enemy id. The
 * five sources are the level def's own: hand-placed `spawns`, the `spawners`
 * that arm on approach, dormant `packs`, the ambient `waves` budget, the
 * once-a-run `rareSpawns` roll, and the scripted `openingStrike` vanguard.
 */
function placementsByEnemy() {
  const found = new Map();
  const add = (enemyId, placement) => {
    if (!found.has(enemyId)) found.set(enemyId, []);
    found.get(enemyId).push(placement);
  };

  for (const level of Object.values(LEVELS)) {
    const base = { levelId: level.id, mobLevels: level.mobLevels };

    for (const spawn of level.spawns ?? []) {
      add(spawn.enemy, {
        ...base,
        kind: spawn.at ? "pinned" : "placed",
        count: spawn.count,
        minDifficulty: spawn.minDifficulty,
        // A pinned elite/boss carries the ladder's own per-rung level and hp,
        // compiled in from content/ladder.yaml — the exact numbers the run uses.
        mobLevels: spawn.level ?? level.mobLevels,
        hp: spawn.hp,
      });
    }
    for (const spawner of level.spawners ?? []) {
      for (const member of spawner.members ?? []) {
        add(member.enemy, {
          ...base,
          kind: spawner.hellgate ? "hellgate" : "spawner",
          count: member.count,
          minDifficulty: member.minDifficulty ?? spawner.minDifficulty,
          mobLevels: spawner.mobLevels ?? level.mobLevels,
          lingering: spawner.lingering,
        });
      }
    }
    for (const pack of level.packs ?? []) {
      for (const member of pack.members ?? []) {
        add(member.enemy, {
          ...base,
          kind: "pack",
          count: typeof member.count === "number" ? member.count : undefined,
          countByDifficulty:
            typeof member.count === "number" ? undefined : member.count,
        });
      }
    }
    for (const window of level.waves?.budget ?? []) {
      for (const member of window.members ?? []) {
        add(member.enemy, { ...base, kind: "wave", weight: member.weight });
      }
    }
    for (const id of level.rareSpawns?.rare ?? []) {
      add(id, { ...base, kind: "rare" });
    }
    for (const id of level.rareSpawns?.unique ?? []) {
      add(id, { ...base, kind: "unique" });
    }
    if (level.openingStrike) {
      add(level.openingStrike.enemy, { ...base, kind: "vanguard", count: 1 });
    }
  }
  return found;
}

/** Which enemies conjure which others (`mechanics.summon`, base and phases). */
function summonGraph() {
  const summonedBy = new Map();
  for (const def of Object.values(ENEMY_DEFS)) {
    const sets = [def.mechanics, ...(def.phases ?? []).map((p) => p.mechanics)];
    for (const mechanics of sets) {
      const summoned = mechanics?.summon?.defId;
      if (!summoned) continue;
      if (!summonedBy.has(summoned)) summonedBy.set(summoned, new Set());
      summonedBy.get(summoned).add(def.id);
    }
  }
  return summonedBy;
}

// ---- the field table --------------------------------------------------------

/**
 * A `[min, max]` band (or a bare number) as a pair. The level ladder authors
 * both forms; the engine's `bandToLevel` rolls uniformly between them.
 */
function bandRange(band) {
  if (band == null) return null;
  if (typeof band === "number") return [band, band];
  return [Math.min(band[0], band[1]), Math.max(band[0], band[1])];
}

/**
 * What this monster actually IS on each rung of the ladder, at one venue: its
 * monster level, its health, the damage its touch carries, and what the kill
 * pays. Every figure comes back from the engine — the same `hardMobHpScale`,
 * `mobContactScaleFor` and `enemyKillXp` a live run reads — except a pinned
 * elite's hp, which the level ladder authors outright and the run uses verbatim.
 *
 * JESUS is absent by design: it is the one rung that keeps the player-relative
 * ladder, so it has no fixed number to state.
 */
function fieldRungs(def, placements, venue) {
  const rarity = def.rarity ? RARE_MOBS.tuning[def.rarity] : undefined;
  const rungs = [];

  for (const difficulty of LADDER) {
    const index = bandIndex(difficulty.id);
    if (index === null) continue;

    let lo = Infinity;
    let hi = -Infinity;
    let authoredHp = null;
    for (const placement of placements) {
      if (
        placement.minDifficulty &&
        DIFFICULTY_DEFS[placement.minDifficulty].index > difficulty.index
      ) {
        continue;
      }
      const range = bandRange(placement.mobLevels?.[index]);
      if (!range) continue;
      lo = Math.min(lo, range[0]);
      hi = Math.max(hi, range[1]);
      if (placement.hp?.[index] != null) {
        authoredHp = Math.max(authoredHp ?? 0, placement.hp[index]);
      }
    }
    if (!Number.isFinite(lo)) continue;

    // The def's own head start rides on top of the horde baseline for a set
    // piece that was NOT pinned to an authored level (`maybePowerScale`), and a
    // rare/unique mob's tier adds its own.
    const pinned = placements.some((p) => p.hp != null || p.kind === "pinned");
    const bonus =
      (pinned ? 0 : def.role !== "minion" ? (def.levelBonus ?? 0) : 0) +
      (rarity?.levelBonus ?? 0);
    const level = [lo + bonus, hi + bonus];

    // The reference hero for the rung — what the ladder intends a player to be
    // when they get here. It is the only player-side input the hp and XP rules
    // read.
    const hero = venue.intendedLevel?.[index] ?? level[1];
    const hp = authoredHp
      ? [authoredHp, authoredHp]
      : level.map((l) =>
          Math.round(
            def.hp *
              hardMobHpScale(l, hero, difficulty.id) *
              (rarity?.hpMult ?? 1),
          ),
        );

    rungs.push({
      difficulty: difficulty.id,
      name: difficulty.name,
      color: difficulty.color,
      heroLevel: hero,
      level,
      authoredHp: authoredHp != null,
      hp,
      contact: level.map((l) =>
        Math.round(
          def.contactDamage * mobContactScaleFor(l) * (rarity?.damageMult ?? 1),
        ),
      ),
      xp: level.map((l) => Math.round(killXp(def, l, hero))),
    });
  }
  return rungs;
}

// ---- the enemy model --------------------------------------------------------

function dropModel(def) {
  const loot = def.loot;
  const uniques = Object.entries(def.uniquesByDifficulty ?? {}).map(
    ([difficulty, ids]) => ({
      difficulty,
      name: DIFFICULTY_DEFS[difficulty]?.name ?? difficulty.toUpperCase(),
      ids,
    }),
  );
  if (!loot && uniques.length === 0 && !def.dropProfile) return null;
  return {
    items: (loot?.items ?? []).map((entry) =>
      typeof entry === "string" ? { id: entry } : { ...entry, id: entry.defId },
    ),
    storyItems: loot?.storyItems ?? [],
    uniqueItems: loot?.uniqueItems ?? [],
    tierDrops: Object.entries(loot?.tierDrops ?? {}),
    counts: loot
      ? {
          weapons: loot.weapons,
          gear: loot.gear,
          xpArrows: loot.xpArrows,
          repairs: loot.repairs,
          medkits: loot.medkits,
          tierBonus: loot.tierBonus,
        }
      : null,
    dropProfile: def.dropProfile ?? null,
    uniques,
  };
}

function enemyModel(def, placementIndex, summonedBy, venueById) {
  assertFieldsCovered(def);
  const placements = placementIndex.get(def.id) ?? [];
  const byLevel = new Map();
  for (const placement of placements) {
    if (!byLevel.has(placement.levelId)) byLevel.set(placement.levelId, []);
    byLevel.get(placement.levelId).push(placement);
  }

  const sightings = [...byLevel.entries()]
    .map(([levelId, entries]) => {
      const venue = venueById.get(levelId);
      return {
        venue,
        kinds: [...new Set(entries.map((e) => e.kind))],
        entries,
        rungs: fieldRungs(def, entries, venue),
      };
    })
    .sort((a, b) => a.venue.storyIndex - b.venue.storyIndex);

  const home = sightings[0]?.venue ?? null;
  const rarity = def.rarity ? RARE_MOBS.tuning[def.rarity] : undefined;

  return {
    id: def.id,
    slug: slugFor(def.id),
    path: enemyPath(def.id),
    name: def.name,
    role: def.role,
    rarity: def.rarity ?? null,
    rarityTuning: rarity ?? null,
    hellborn: !!def.hellborn,
    sprite: `${def.sprite}_0`,
    gore: def.gore ?? "blood",
    home,
    sightings,
    summonedBy: [...(summonedBy.get(def.id) ?? [])].map((id) => ({
      id,
      name: ENEMY_DEFS[id].name,
      path: enemyPath(id),
    })),
    guardedBy: (def.shieldedBy ?? []).map((id) => ({
      id,
      name: ENEMY_DEFS[id]?.name ?? id,
      path: enemyPath(id),
    })),
    base: {
      hp: def.hp,
      speed: def.speed,
      radius: def.radius,
      contactDamage: def.contactDamage,
      contactCooldownMs: def.contactCooldownMs,
      critChance: def.critChance,
      dodgeChance: def.dodgeChance ?? null,
      levelBonus: def.levelBonus ?? 0,
      xp: def.xp ?? null,
      xpMobMult: def.xpMobMult ?? null,
      aggroRadius: def.ai.aggroRadius,
      leashRadius: def.ai.leashRadius ?? null,
      idle: def.ai.idle ?? null,
      rushSpeed: def.ai.rushSpeed ?? null,
      returnSpeedFactor: def.ai.returnSpeedFactor ?? null,
    },
    traits: {
      locomotion: def.locomotion ?? "legs",
      phasing: !!def.phasing,
      apparition: !!def.apparition,
      flees: def.flees ?? null,
      spareable: def.spareable
        ? {
            ...def.spareable,
            name:
              COMPANION_DEFS[def.spareable.companion]?.name ??
              def.spareable.companion,
          }
        : null,
      ranged: def.ranged ?? null,
      pack: def.pack ?? null,
    },
    mechanics: def.mechanics ?? null,
    phases: def.phases ?? [],
    drops: dropModel(def),
    // Story text. Everything under here goes behind the reveal panel.
    story: {
      dialogue: def.dialogue ?? [],
      lastWords: def.lastWords ?? [],
    },
    // The YAML this page is compiled from, so the sitemap can date the page by
    // when its content last actually changed.
    sources: sourcesFor(def),
  };
}

/**
 * The authored files a page is built from. `lastmod` is only worth publishing
 * while it is verifiably accurate, so an enemy page is dated by the commit that
 * last touched its own YAML (plus the ladder that levels it), never the build
 * clock.
 */
function sourcesFor(def) {
  return [`content/enemies/*/${def.id}.yaml`, "content/ladder.yaml"];
}

/**
 * WHAT TELLS TWO MONSTERS OF THE SAME NAME APART.
 *
 * Several monsters legitimately share a display name — a boss who turns up
 * again on a later venue, a body double, a second variant of the same staffer.
 * On the monster's own page that reads fine: the heading has a venue chip under
 * it and a whole page of numbers around it. Anywhere the name travels ALONE it
 * does not, and the site does that in three places at once — a search result
 * (three pages titled `ELON MOSQUE` are three pages Google consolidates into
 * one and drops the rest of, and the two `LAB SCIENTIST` pages came out
 * byte-identical), a flat rack of monsters, and a drop line that says who hands
 * an item over. All three want the same string.
 *
 * So a shared name takes a qualifier, and the qualifier is a fact the reader
 * came for: the VENUE, which is what actually separates the two Putains and the
 * three Mosques. When the venue ties as well — both lab scientists work at
 * SPACEZ HQ — fall back to whatever the ids do NOT have in common, so
 * `vanguard_scientist` beside `scientist` yields `VANGUARD`. Whichever one has
 * nothing left over keeps the bare name, which is what makes the set unique
 * rather than uniformly suffixed.
 *
 * Two fields fall out of it, because a page and a rack want it set differently:
 * `nameQualifier` (null when the name stands alone) is the raw word, which a
 * rack row prints dim in its own column; `distinctName` is the name with the
 * qualifier folded in parentheses, for a `<title>` or a sentence.
 *
 * The visible `<h1>` is deliberately NOT touched. On the page itself the name
 * is not ambiguous — the chips already say where you meet it — and the in-game
 * name is the thing the reader arrived looking for.
 */
function nameApart(enemies) {
  const byName = new Map();
  for (const enemy of enemies) {
    if (!byName.has(enemy.name)) byName.set(enemy.name, []);
    byName.get(enemy.name).push(enemy);
  }
  const tokens = (id) => id.split(/[_-]/).filter(Boolean);
  const stamp = (enemy, qualifier) => {
    enemy.nameQualifier = qualifier || null;
    enemy.distinctName = qualifier
      ? `${enemy.name} (${qualifier})`
      : enemy.name;
  };
  for (const [, peers] of byName) {
    if (peers.length === 1) {
      stamp(peers[0], null);
      continue;
    }
    const venues = peers.map((enemy) => enemy.home?.name ?? "");
    const byVenue =
      venues.every(Boolean) && new Set(venues).size === peers.length;
    const shared = byVenue
      ? null
      : peers
          .map((enemy) => new Set(tokens(enemy.id)))
          .reduce((a, b) => new Set([...a].filter((token) => b.has(token))));
    for (const enemy of peers) {
      stamp(
        enemy,
        byVenue
          ? enemy.home.name
          : tokens(enemy.id)
              .filter((token) => !shared.has(token))
              .join(" ")
              .toUpperCase(),
      );
    }
  }
}

/** The whole library, as pages waiting to be rendered. */
export function libraryModel() {
  const placementIndex = placementsByEnemy();
  const summonedBy = summonGraph();
  const venueList = venues();
  const venueById = new Map(venueList.map((v) => [v.id, v]));

  const enemies = Object.values(ENEMY_DEFS)
    .map((def) => enemyModel(def, placementIndex, summonedBy, venueById))
    .sort((a, b) => a.name.localeCompare(b.name));
  nameApart(enemies);

  // Group the bestiary by VENUE — the way a reader thinks about monsters — with
  // an "elsewhere" bucket so nothing can silently fall out of the index.
  const groups = venueList.map((venue) => ({
    venue,
    entries: enemies.filter((e) => e.home?.id === venue.id),
  }));
  const homeless = enemies.filter((e) => !e.home);
  if (homeless.length > 0) groups.push({ venue: null, entries: homeless });

  // The arsenal's drop lines name monsters with nothing else around them, so
  // they take the bestiary's disambiguated name rather than the bare one.
  const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  const arsenal = arsenalModel(
    (id, name) => byId.get(id)?.distinctName ?? name,
  );
  const missions = missionsModel([...LEVEL_ORDER, ...SECRET_LEVEL_ORDER]);
  const story = storyModel();

  return {
    enemies,
    venues: venueList,
    groups,
    items: arsenal.items,
    bases: arsenal.bases,
    named: arsenal.named,
    missions,
    story,
  };
}

/**
 * Every route the library emits, with the sources each page is dated from.
 * `generate-seo.mjs` reads this to enumerate the sitemap, so a page that exists
 * without a sitemap entry (or the reverse) is impossible by construction.
 */
export function libraryRoutes() {
  const { enemies, items, missions, story } = libraryModel();
  return [
    { path: "", sources: ["content", "pwa/scripts/library"] },
    { path: "bestiary", sources: ["content/enemies"] },
    { path: "arsenal", sources: ["content/items"] },
    { path: "missions", sources: ["content/levels", "content/ladder.yaml"] },
    { path: "story", sources: ["docs/story.md", "src/game/defs"] },
    ...enemies.map((enemy) => ({ path: enemy.path, sources: enemy.sources })),
    ...items.map((item) => ({ path: item.path, sources: item.sourceFiles })),
    ...missions.map((mission) => ({
      path: mission.path,
      sources: mission.sourceFiles,
    })),
    ...story.chapters.map((chapter) => ({
      path: chapter.path,
      sources: chapter.sourceFiles,
    })),
  ];
}
