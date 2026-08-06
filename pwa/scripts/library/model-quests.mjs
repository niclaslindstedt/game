// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ERRANDS' page model: every quest the field's non-combatants ask of the
// hero, every person who asks one, and the chains that link them — folded into
// the shape a page wants to be rendered from.
//
// Facts only, the rule every model in here follows: each value below was read
// off a compiled catalog or came back from the engine. The sentences are
// ./prose-quests.mjs; the markup is ./render-quests.mjs.
//
// WHY THE GIVER GETS A PAGE OF HIS OWN AND IS NOT A FIELD ON THE ERRAND. The
// catalogs are separate for the reason `src/game/defs/quests.ts` gives — one
// person hands out a whole chain — and the section inherits that shape rather
// than flattening it: a reader who met PRIYA NAIR is looking for the person and
// everything she wants, and a reader who searched THE NIGHT LOG is looking for
// one job. Folding the two would mean either repeating a person's paragraph
// once per errand (three copies free to disagree) or having no page for the
// three-errand chain that is the actual unit of play.
//
// AND EVERY ERRAND IS ON A MAP, WHICH IS WHAT THE INDEX IS GROUPED BY: two
// givers stand on every venue and a chain may not cross one (the log is a run's,
// not a save's), so the venue is not a filing convenience here — it is the
// boundary the feature itself is built on.

import {
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  LADDER,
  LEVELS,
  LEVEL_ORDER,
  QUESTS,
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  SECRET_LEVEL_ORDER,
  UNIQUE_DEFS,
  ABILITY_DEFS,
  bandIndex,
  giversForLevel,
  questXp,
  questsForLevel,
} from "./catalogs.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. The same contract
 * the bestiary's `ENEMY_FIELDS` signs (see ./model.mjs for why it exists), and
 * the errands need it as badly as anything in the repo: a quest is authored in
 * six nested shapes (objectives, items, escorts, a reward, a chain), and a
 * field added to any of them would otherwise vanish from every page at once
 * with nothing broken to notice.
 */
export const QUEST_FIELDS = {
  id: "the page's own route",
  level: "the venue chip, the index grouping and the mission cross-link",
  giver: "the ASKED BY chip and the giver's own page",
  name: "the heading",
  lore: "the flavor paragraph under the objectives",
  order: "where it sits in the giver's chain, which is the order pages list it",
  requires: "the CHAIN section — what has to be turned in first",
  minDifficulty: "the FROM <RUNG> UP chip and note",
  campaign:
    "the CAMPAIGN CHAIN chip and note — an errand carried between venues",
  conversation:
    "the CONVERSATION section — the talk its giver holds instead of a plain offer",
  merchant:
    "the AT THE TRADER section — what he buys, and what that puts on his counter",
  objectives: "the WHAT IT ASKS section",
  items: "the WHAT IT ASKS section — the pieces, and who carries them",
  escorts: "the WHAT IT ASKS section — who is walked, and what they can take",
  reward: "the WHAT IT PAYS section",
  offer: "the conversation, behind the reveal",
  incomplete: "the conversation, behind the reveal",
  complete: "the conversation, behind the reveal",
};

/** The giver's own fields, checked the same way. */
export const QUEST_GIVER_FIELDS = {
  id: "the page's own route",
  level: "the venue chip and the mission cross-link",
  name: "the heading",
  sprite: "the portrait",
  lore: "the flavor paragraph under the portrait",
  at: "not reader-facing: a world coordinate is a number the reader is standing in, not one they can use — where the person is on the map is what the mission page's map render shows",
  greeting: "what they say, behind the reveal",
  farewell: "what they say, behind the reveal",
  intro:
    "the meeting sentence in the lead — that this person is spoken to before they are asked anything, and that their errands open from the tap after",
};

/**
 * The objective kinds a page knows how to word, and the sub-fields of each. An
 * unlisted one stops the build rather than printing an errand with a blank
 * where its ask should be — which, on a page whose entire subject is what is
 * being asked, would be the emptiest failure in the library.
 */
const OBJECTIVE_FIELDS = {
  kind: "which sentence the objective is worded as",
  enemy: "the breed or named foe, linked to the bestiary",
  count: "how many",
  item: "which of the quest's own pieces",
  escort: "which of the quest's own followers",
  to: "not reader-facing: the destination is a world coordinate",
  // The search kinds. `at` is deliberately not reader-facing for the same
  // reason a giver's `at` is not: the coordinate is the one thing a reader
  // cannot use, and printing it would hand away the search the errand IS.
  level: "which venue the spot is on, linked to the mission",
  at: "not reader-facing: the spot is a world coordinate, and naming it would give away the search",
  name: "the sentence the objective is worded as — the place, or the thing to be told",
  radius: "not reader-facing: how close counts as standing there",
  flag: "not reader-facing: which run flag the objective waits on",
};

const QUEST_ITEM_FIELDS = {
  id: "not reader-facing: what the objective names it by",
  name: "the piece's name",
  icon: "the piece's picture",
  dropFrom: "who carries it, linked to the bestiary",
  dropChance: "the odds per kill of a carrying breed",
  at: "how many are already lying on the floor",
};

const ESCORT_FIELDS = {
  id: "not reader-facing: what the objective names it by",
  name: "who is walked",
  sprite: "their portrait",
  at: "not reader-facing: where they wait is a world coordinate",
  hp: "what they can take before the errand fails",
  setOff: "what they say, behind the reveal",
  arrived: "what they say, behind the reveal",
};

const QUEST_MERCHANT_FIELDS = {
  buys: "the AT THE TRADER section — the piece he takes and what he pays",
  sells: "the AT THE TRADER section — what that puts on his counter",
};

const MERCHANT_BUYS_FIELDS = {
  item: "which piece he takes",
  coins: "what he pays for it",
  sets: "not reader-facing: the run flags the sale sets",
};

const MERCHANT_SELLS_FIELDS = {
  item: "which piece he puts out",
  price: "what it costs",
  requires: "not reader-facing: the run flags that reveal the row",
  pitch: "his line about it, behind the reveal",
};

const REWARD_FIELDS = {
  xpShare: "the XP table — a share of the bar, priced per rung",
  coins: "the COINS row",
  uniques: "the relics row, linked to the arsenal",
  loot: "the rolled-loot row",
  abilities: "the powers row, linked to the powers section",
  cleanSlates:
    "the CLEAN SLATE row — a respec the hero carries and spends when he likes",
  cache:
    "the CACHE row — the garage chest, and its own paragraph in what it pays",
};

const REWARD_LOOT_FIELDS = {
  count: "how many pieces are rolled",
  tierBonus: "the skew on the roll",
  slot: "which slot the roll is held to",
};

/** Collect every key of `def` that `fields` does not declare, `where`-prefixed. */
function undeclared(where, def, fields) {
  return Object.keys(def ?? {})
    .filter((key) => !(key in fields))
    .map((key) => (where ? `${where}.${key}` : key));
}

/** Fail the build when an errand carries something no page would show. */
function assertQuestFieldsCovered(def) {
  const unknown = [
    ...undeclared("", def, QUEST_FIELDS),
    ...(def.objectives ?? []).flatMap((objective, i) =>
      undeclared(`objectives[${i}]`, objective, OBJECTIVE_FIELDS),
    ),
    ...(def.items ?? []).flatMap((item, i) =>
      undeclared(`items[${i}]`, item, QUEST_ITEM_FIELDS),
    ),
    ...(def.escorts ?? []).flatMap((escort, i) =>
      undeclared(`escorts[${i}]`, escort, ESCORT_FIELDS),
    ),
    ...undeclared("reward", def.reward, REWARD_FIELDS),
    ...undeclared("reward.loot", def.reward?.loot, REWARD_LOOT_FIELDS),
    ...undeclared("merchant", def.merchant, QUEST_MERCHANT_FIELDS),
    ...undeclared("merchant.buys", def.merchant?.buys, MERCHANT_BUYS_FIELDS),
    ...(def.merchant?.sells ?? []).flatMap((sale, i) =>
      undeclared(`merchant.sells[${i}]`, sale, MERCHANT_SELLS_FIELDS),
    ),
  ];
  if (unknown.length > 0) {
    throw new Error(
      `library: quest "${def.id}" carries ${unknown.join(", ")}, which no library page ` +
        `renders. Add it to the generator (pwa/scripts/library/model-quests.mjs) and ` +
        `declare it in QUEST_FIELDS — the pages are never edited by hand, so an ` +
        `unrendered field would silently vanish.`,
    );
  }
}

function assertGiverFieldsCovered(def) {
  const unknown = undeclared("", def, QUEST_GIVER_FIELDS);
  if (unknown.length > 0) {
    throw new Error(
      `library: quest giver "${def.id}" carries ${unknown.join(", ")}, which no library ` +
        `page renders. Add it to the generator (pwa/scripts/library/model-quests.mjs) ` +
        `and declare it in QUEST_GIVER_FIELDS.`,
    );
  }
}

/** URL slug for a catalog id — hyphens read better in a URL than underscores. */
const slugFor = (id) => id.replace(/_/g, "-");

/** The route an errand's page lives at, relative to `/library/`. */
export const questPath = (id) => `errands/${slugFor(id)}`;
/** The route a giver's page lives at. */
export const giverPath = (id) => `errands/who/${slugFor(id)}`;

const missionPath = (id) => `missions/${slugFor(id)}`;
const enemyPath = (id) => `bestiary/${slugFor(id)}`;
const itemPath = (id) => `arsenal/${slugFor(id)}`;
const powerPath = (id) => `powers/${slugFor(id)}`;

const enemyLink = (id) => {
  const def = ENEMY_DEFS[id];
  return def
    ? {
        id,
        name: def.name,
        role: def.role,
        sprite: `${def.sprite}_0`,
        path: enemyPath(id),
      }
    : null;
};

const uniqueLink = (id) => {
  const def = UNIQUE_DEFS[id];
  return def
    ? { id, name: def.name, tier: def.tier, path: itemPath(id) }
    : null;
};

const powerLink = (id) => {
  const def = ABILITY_DEFS[id];
  return def
    ? { id, name: def.name, icon: def.icon, path: powerPath(id) }
    : null;
};

/**
 * The venue an errand belongs to. It carries the ladder's own `intendedLevel`
 * as well as the link, because the reward's XP is a share of a BAR and the only
 * honest way to price one is against the hero the ladder intends to be standing
 * here (see `rewardModel`).
 */
const venueLink = (id) => {
  const level = LEVELS[id];
  return level
    ? {
        id,
        name: level.name,
        path: missionPath(id),
        intendedLevel: level.intendedLevel,
      }
    : null;
};

// ---- what an errand asks for --------------------------------------------------

/**
 * ONE OBJECTIVE, with everything it names already resolved.
 *
 * The `to` of an escort and the `at` of a piece are deliberately dropped: they
 * are world coordinates, and a coordinate is the one kind of fact this section
 * cannot honestly publish — a reader has no ruler and the game draws no grid.
 * What is publishable about a placed piece is that it EXISTS on the floor at
 * all, which changes how the errand is finished, so that survives as a count.
 */
function objectiveModel(objective, def) {
  const base = { kind: objective.kind, count: objective.count ?? 1 };
  if (objective.kind === "kill" || objective.kind === "killNamed") {
    return { ...base, enemy: enemyLink(objective.enemy) };
  }
  if (objective.kind === "collect") {
    const item = (def.items ?? []).find((i) => i.id === objective.item);
    return {
      ...base,
      item: item
        ? {
            id: item.id,
            name: item.name,
            icon: item.icon,
            // The odds are the ENGINE's default when the piece names none —
            // asked of the config rather than restated, so a rebalance moves
            // the page with it.
            dropChance: item.dropChance ?? QUESTS.dropChance,
            authoredChance: item.dropChance !== undefined,
            carriers: (item.dropFrom ?? []).map(enemyLink).filter(Boolean),
            placed: (item.at ?? []).length,
          }
        : null,
    };
  }
  if (objective.kind === "visit") {
    // The SENTENCE and the venue, never the coordinate: a search objective's
    // whole difficulty is finding the place, and a page that printed the number
    // would hand it over — the same restraint a giver's `at` keeps.
    return {
      ...base,
      name: objective.name,
      venue: venueLink(objective.level),
    };
  }
  if (objective.kind === "flag") {
    return { ...base, name: objective.name };
  }
  if (objective.kind === "sell") {
    const sold = (def.items ?? []).find((i) => i.id === objective.item);
    return {
      ...base,
      item: sold ? { id: sold.id, name: sold.name, icon: sold.icon } : null,
    };
  }
  if (objective.kind === "reachLevel") {
    return { ...base, level: objective.level };
  }
  const escort = (def.escorts ?? []).find((e) => e.id === objective.escort);
  return {
    ...base,
    escort: escort
      ? {
          id: escort.id,
          name: escort.name,
          sprite: `${escort.sprite}_0`,
          hp: escort.hp ?? QUESTS.escortHp,
          authoredHp: escort.hp !== undefined,
          // Their two lines — the only spoken text an escort has, and story
          // like any other, so it goes behind the page's own cover.
          setOff: escort.setOff ?? null,
          arrived: escort.arrived ?? null,
        }
      : null,
  };
}

// ---- what it pays -------------------------------------------------------------

/**
 * THE REWARD, WITH THE SHARE PRICED OUT PER RUNG.
 *
 * `xpShare: 0.35` is a third of the bar the hero is standing on, which is the
 * whole design (see the note atop `src/game/defs/quests.ts`) and also exactly
 * why it cannot be printed as authored: nobody reads a level bar in decimals.
 * So the page states what the errand pays a hero the ladder INTENDED to be
 * standing here — the venue's own `intendedLevel` for the rung — by asking the
 * engine's `questXpReward`, which is the function the offer box quotes and the
 * handover pays. JESUS is absent for the reason it is absent everywhere else:
 * it keeps the player-relative ladder and has no fixed reference hero.
 */
function rewardModel(reward, venue) {
  if (!reward) return null;
  const share = reward.xpShare ?? 0;
  return {
    xpShare: share || null,
    xp:
      share > 0
        ? LADDER.map((difficulty) => {
            const index = bandIndex(difficulty.id);
            const hero = venue?.intendedLevel?.[index] ?? null;
            return hero === null
              ? null
              : {
                  difficulty: difficulty.id,
                  name: difficulty.name,
                  heroLevel: hero,
                  xp: questXp(reward, hero, difficulty.id),
                };
          }).filter(Boolean)
        : [],
    coins: reward.coins ?? 0,
    uniques: (reward.uniques ?? []).map(uniqueLink).filter(Boolean),
    abilities: (reward.abilities ?? []).map(powerLink).filter(Boolean),
    loot: reward.loot
      ? {
          count: reward.loot.count,
          tierBonus: reward.loot.tierBonus ?? 0,
          slot: reward.loot.slot ?? null,
        }
      : null,
    // A CLEAN SLATE — the respec charge the hero carries and spends when he
    // likes. Exactly one errand in the game pays one, and a reader looking at
    // the arsenal for a way to re-pick a build will find no item to find:
    // this row is the only place the answer exists.
    cleanSlates: reward.cleanSlates ?? 0,
    // THE CACHE — the garage chest (src/game/cache.ts). One errand in the game
    // pays it, and a reader hunting the arsenal for a way to keep a piece they
    // cannot carry will find no ITEM to find: this row is the only place the
    // answer exists.
    cache: reward.cache === true,
  };
}

// ---- one errand ---------------------------------------------------------------

/**
 * THE FACE OF AN ERRAND — the sprite its card and its rack row are drawn with.
 *
 * An errand is the one subject in the library with no art of its own: it is a
 * conversation and a tally. So it borrows the picture of the thing it is ABOUT,
 * in the order a player would recognise it by — the piece they are hunting for,
 * the person they are walking, the foe they are sent at — and falls back to the
 * face of whoever is asking, which is what they walked up to in the first place.
 */
function faceOf(objectives, giverSprite) {
  for (const objective of objectives) {
    if (objective.item) return objective.item.icon;
    if (objective.escort) return objective.escort.sprite;
    if (objective.enemy) return objective.enemy.sprite;
  }
  return giverSprite;
}

function questModel(def, venue) {
  assertQuestFieldsCovered(def);
  const objectives = def.objectives.map((o) => objectiveModel(o, def));
  const giver = QUEST_GIVER_DEFS[def.giver];

  return {
    id: def.id,
    slug: slugFor(def.id),
    path: questPath(def.id),
    name: def.name,
    // The one authored paragraph about what the errand IS, in the same dry
    // register as an item's description. It sits in the open: it says nothing
    // the player does not learn by walking up to the person.
    lore: def.lore,
    venue,
    giver: {
      id: def.giver,
      name: giver?.name ?? def.giver,
      sprite: giver ? `${giver.sprite}_0` : null,
      path: giverPath(def.giver),
    },
    order: def.order ?? null,
    objectives,
    face: faceOf(objectives, giver ? `${giver.sprite}_0` : null),
    // The single shape the page leads with — a label, in the way `AbilityDef`'s
    // `kind` is a label: an errand with two objectives is described by both,
    // and this only names the one the chips and the card lead with.
    leads: objectives[0]?.kind ?? null,
    reward: rewardModel(def.reward, venue),
    // The chain, in both directions. `requires` is authored backwards (each
    // link names its predecessor), which is right for the offer gate and wrong
    // for a reader: the question on a page is "what does taking this unlock",
    // and that answer only exists once the whole catalog has been walked.
    requires: (def.requires ?? []).map((id) => questLink(id)).filter(Boolean),
    unlocks: [],
    minDifficulty: def.minDifficulty
      ? {
          id: def.minDifficulty,
          name: DIFFICULTY_DEFS[def.minDifficulty]?.name ?? def.minDifficulty,
        }
      : null,
    // A CAMPAIGN errand belongs to the hero rather than to the run — it is
    // carried between venues and its chain crosses maps, which is the single
    // most useful thing a reader can be told about one before they take it.
    campaign: def.campaign === true,
    // What the TRADER will do with this errand's pieces, in the order the beat
    // happens: sell him one, and what that puts on his counter.
    merchant: merchantModel(def),
    // The talk its giver holds instead of a plain offer page, if any. The tree
    // itself is story and goes behind the reveal with the rest.
    conversation: def.conversation ?? null,
    // Story text. Everything under here goes behind the reveal panel.
    story: {
      offer: def.offer,
      incomplete: def.incomplete ?? [],
      complete: def.complete,
    },
    sourceFiles: [`content/quests/${def.id}.yaml`, "content/quest-givers.yaml"],
  };
}

/**
 * THE TRADER'S SIDE OF AN ERRAND. Printed as the three-step beat it is —
 * because the ORDER is the mechanic, not any one row: the counter does not
 * hold the piece the errand wants until the hero has sold him the one he took
 * off a body. A page listing "he sells X" without that would describe a
 * purchase and miss the whole thing.
 *
 * The `requires` flags and the `sets` flags are deliberately absent: a run flag
 * is an internal id, and naming it would say less than the sentence around it.
 */
function merchantModel(def) {
  const deal = def.merchant;
  if (!deal) return null;
  const named = (id) => (def.items ?? []).find((i) => i.id === id) ?? null;
  const buys = deal.buys
    ? {
        item: named(deal.buys.item),
        coins: deal.buys.coins,
      }
    : null;
  return {
    buys,
    sells: (deal.sells ?? []).map((sale) => ({
      item: named(sale.item),
      price: sale.price,
      pitch: sale.pitch ?? null,
      // Whether this row is one a SALE reveals, which is the beat itself.
      gated: (sale.requires ?? []).length > 0,
    })),
  };
}

const questLink = (id) => {
  const def = QUEST_DEFS[id];
  return def ? { id, name: def.name, path: questPath(id) } : null;
};

// ---- one person ---------------------------------------------------------------

function giverModel(def, venue, chain) {
  assertGiverFieldsCovered(def);
  return {
    id: def.id,
    slug: slugFor(def.id),
    path: giverPath(def.id),
    name: def.name,
    lore: def.lore,
    sprite: `${def.sprite}_0`,
    venue,
    // Their whole chain, in the order their own pick list shows it.
    quests: chain,
    // A person who is MET before they are asked anything. The tree itself is
    // not printed — it is a talk the reader steers, and transcribing it here
    // would hand away every branch of it — but that there IS one belongs in
    // the lead, because it changes what the first walk-up does.
    meets: def.intro !== undefined,
    story: {
      greeting: def.greeting ?? [],
      farewell: def.farewell ?? [],
    },
    sourceFiles: ["content/quest-givers.yaml", "content/quests"],
  };
}

// ---- the catalog ---------------------------------------------------------------

/**
 * Every errand page and every giver page, grouped by the venue they stand on.
 *
 * The walk is per LEVEL rather than over the flat catalogs, because the engine's
 * own `questsForLevel` / `giversForLevel` answer the ordering question this
 * section is built around (a giver's chain reads in the order their pick list
 * shows it, which is `order` and then id — a fallback a second implementation
 * would get subtly wrong). Anything filed under a level the campaign does not
 * run still gets a group, so nothing can silently fall out of the index.
 */
export function questsModel() {
  const order = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];
  const levelIds = [
    ...order,
    ...Object.values(QUEST_DEFS)
      .map((def) => def.level)
      .filter((id) => !order.includes(id)),
  ];

  const quests = [];
  const givers = [];
  const groups = [];

  for (const levelId of [...new Set(levelIds)]) {
    const venue = venueLink(levelId);
    const onMap = questsForLevel(levelId).map((def) => questModel(def, venue));
    if (onMap.length === 0) continue;
    quests.push(...onMap);

    const byGiver = giversForLevel(levelId).map((def) =>
      giverModel(
        def,
        venue,
        onMap
          .filter((quest) => quest.giver.id === def.id)
          .map((quest) => ({
            id: quest.id,
            name: quest.name,
            path: quest.path,
          })),
      ),
    );
    givers.push(...byGiver);
    groups.push({ venue, givers: byGiver, quests: onMap });
  }

  // THE CHAIN, READ FORWARD. Authored backwards on purpose (see `requires`),
  // so the "what does this open" half is derived once here rather than by every
  // page re-walking the catalog to find out whether anything named it.
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  for (const quest of quests) {
    for (const prior of quest.requires) {
      byId.get(prior.id)?.unlocks.push({
        id: quest.id,
        name: quest.name,
        path: quest.path,
      });
    }
  }

  return {
    quests,
    givers,
    groups,
    // The reach a conversation opens at and the escort's own numbers — true of
    // every errand rather than of any one, so they are stated once, on the
    // index.
    tuning: {
      talkRadius: QUESTS.talkRadius,
      tapRadius: QUESTS.tapRadius,
      dropChance: QUESTS.dropChance,
      dropPity: QUESTS.dropPity,
      escortHp: QUESTS.escortHp,
      escortSpeed: QUESTS.escortSpeed,
      escortLeashDistance: QUESTS.escortLeashDistance,
      escortDamageMult: QUESTS.escortDamageMult,
    },
  };
}
