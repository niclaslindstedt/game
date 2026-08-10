// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORY's page model: one chapter per mission, in the order they are
// played, plus the chapter for the things that only turn up on a rampage.
//
// A chapter is a JOIN of the two tiers that hold a story (CLAUDE.md, "Story &
// dialogue"): the GIST — the narrative prose, which lives only in
// `docs/story.md` — wrapped around the SCRIPT as the game actually plays it,
// read out of the compiled catalogs. Nothing here is transcribed: every line a
// chapter quotes is the string the dialogue box will put on screen.
//
// Facts only, as ever. ./render-story.mjs writes the markup.

import {
  CAP_THOUGHT_IDS,
  CUTSCENE_DEFS,
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  ENEMY_DEFS,
  LEVELS,
  LEVEL_ORDER,
  QUEST_DEFS,
  SECRET_LEVEL_ORDER,
  STORY_ITEM_DEFS,
  THOUGHT_DEFS,
  cutsceneVariant,
  itemName,
} from "./catalogs.mjs";
import { STORY_DOC, firstSentence, storySections } from "./story-doc.mjs";

const slugFor = (id) => id.replace(/_/g, "-");

/** The route a chapter lives at, relative to `/library/`. */
export const chapterPath = (id) => `story/${slugFor(id)}`;

const enemyPathOf = (id) => `bestiary/${slugFor(id)}`;
const itemPathOf = (id) => `arsenal/${slugFor(id)}`;
const missionPathOf = (id) => `missions/${slugFor(id)}`;

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. The same contract
 * the other catalogs sign (see `ENEMY_FIELDS`), for the three the story pages
 * are the only reader of.
 */
export const STORY_ITEM_FIELDS = {
  id: "the find's own anchor",
  name: "the find's name",
  icon: "not reader-facing: which sprite the ground and the lore box draw",
  lore: "the find's pages, behind the reveal",
  unlocks: "the LOCKED DOOR note",
  suitsHero: "the SUIT note",
  keepsake: "the KEPT FOR GOOD note",
};

export const THOUGHT_FIELDS = {
  id: "the beat's own anchor",
  speaker:
    "not reader-facing: the name the dialogue box prints (always the hero)",
  portrait: "not reader-facing: which face the dialogue box draws",
  voice:
    "who answers him back, on the few beats that are an exchange rather " +
    "than a monologue — printed as the other party's own turn",
  pages: "the thought itself, behind the reveal",
};

/**
 * The cutscene beat kinds, and which of them carry WORDS. A scene is a
 * timeline of staging and speech; the story pages publish the speech and say
 * nothing about the blocking, because a reader wants the scene rather than its
 * stage directions. A NEW beat kind that carries text would otherwise vanish
 * from every chapter at once, so an unlisted kind stops the build.
 */
export const CUTSCENE_BEAT_KINDS = {
  caption: "spoken: the narrator's card",
  say: "spoken: a line, attributed to its actor",
  wait: "not reader-facing: staging — how long the frame holds",
  move: "not reader-facing: staging — walking an actor",
  pose: "not reader-facing: staging — swapping an actor's sprite",
  face: "not reader-facing: staging — mirroring an actor",
  enter: "not reader-facing: staging — putting an actor on stage",
  exit: "not reader-facing: staging — taking an actor off",
  fade: "not reader-facing: staging — the fade to and from black",
  pan: "not reader-facing: staging — gliding the camera",
  shake: "not reader-facing: staging — an actor's tremble",
  jump: "not reader-facing: staging — an actor leaving the ground",
  hold: "not reader-facing: staging — putting a thing in an actor's hands",
  prop: "not reader-facing: staging — taking a prop off the stage",
  sound: "not reader-facing: staging — a noise the scene makes",
};

const SPOKEN_BEATS = new Set(
  Object.entries(CUTSCENE_BEAT_KINDS)
    .filter(([, note]) => note.startsWith("spoken"))
    .map(([kind]) => kind),
);

function assertFieldsCovered(what, def, fields) {
  const unknown = Object.keys(def).filter((key) => !(key in fields));
  if (unknown.length > 0) {
    throw new Error(
      `library: ${what} "${def.id}" carries ${unknown.join(", ")}, which no library page renders. ` +
        `Add it to the generator (pwa/scripts/library/) and declare it in model-story.mjs — ` +
        `the pages are never edited by hand, so an unrendered field would silently vanish.`,
    );
  }
}

// ---- the document's sections ------------------------------------------------

/**
 * How a `##` heading in `docs/story.md` becomes part of a chapter. The shapes
 * are STRUCTURAL rather than a list of headings, so a sixth level added to the
 * campaign gets its chapter for free — and an unrecognised heading stops the
 * build rather than quietly falling out of the story.
 *
 *   premise   the setup, published on the section's front page
 *   cutscene  a scene, folded into the chapter it leads INTO (forward)
 *   level     a mission chapter, matched to the venue by name
 *   epilogue  the ending, folded into the chapter it closes (backward)
 *   hellborn  its own chapter — it belongs to no single mission
 *   chain     its own chapter too — the CAMPAIGN chain crosses every venue
 *   meta      the file's own bookkeeping; deliberately not published
 */
const SECTION_KINDS = [
  { kind: "premise", match: /^Premise$/ },
  { kind: "cutscene", match: /^Prelude \(cutscene\)$/, title: () => "PRELUDE" },
  {
    kind: "cutscene",
    match: /^Travel — (.+) \(cutscene\)$/,
    title: (m) => m[1],
  },
  { kind: "level", match: /^Level \d+ — (.+)$/, venue: (m) => m[1] },
  { kind: "level", match: /^Secret level — (.+)$/, venue: (m) => m[1] },
  // The HUB is a venue chapter too — home carries story the same way a
  // mission does, it just never ends.
  { kind: "level", match: /^Home — (.+) \(hub\)$/, venue: (m) => m[1] },
  { kind: "epilogue", match: /^Epilogue\b/ },
  { kind: "hellborn", match: /^The hellborn\b/ },
  { kind: "chain", match: /^The Severance\b/ },
  {
    kind: "meta",
    match: /^Where the story lives\b/,
    note: "the chain's own file map — bookkeeping for authors, not story",
  },
];

function classify(section) {
  for (const rule of SECTION_KINDS) {
    const m = rule.match.exec(section.heading);
    if (!m) continue;
    return {
      ...section,
      kind: rule.kind,
      title: rule.title?.(m) ?? null,
      venueName: rule.venue?.(m) ?? null,
    };
  }
  throw new Error(
    `library: ${STORY_DOC} has a section the story pages don't know where to put:\n` +
      `  "## ${section.heading}"\n` +
      `Teach SECTION_KINDS (pwa/scripts/library/model-story.mjs) which chapter it belongs to, ` +
      `or declare it as bookkeeping — an unclaimed section would silently never be published.`,
  );
}

const levelByName = () => {
  const byName = new Map();
  for (const level of Object.values(LEVELS)) byName.set(level.name, level);
  return byName;
};

// ---- the script, as the game plays it ---------------------------------------

/** A cutscene's spoken beats, in order, each attributed to whoever says it. */
function sceneBeats(def) {
  const beats = [];
  for (const beat of def.beats) {
    if (!(beat.kind in CUTSCENE_BEAT_KINDS)) {
      throw new Error(
        `library: cutscene "${def.id}" plays a "${beat.kind}" beat, which no library page renders. ` +
          `Declare it in CUTSCENE_BEAT_KINDS (pwa/scripts/library/model-story.mjs) — if it carries ` +
          `words, the story pages have to publish them.`,
      );
    }
    if (!SPOKEN_BEATS.has(beat.kind)) continue;
    beats.push({
      kind: beat.kind,
      who: beat.actor ? actorName(def, beat.actor) : null,
      lines: beat.text,
    });
  }
  return beats;
}

/** Who an actor id is, in the words the scene itself uses. */
function actorName(def, actorId) {
  const actor = def.actors.find((a) => a.id === actorId);
  const id = actor?.id ?? actorId;
  return id === "hero" ? "THE HERO" : id.replace(/_/g, " ").toUpperCase();
}

/**
 * A scene and its per-difficulty variants. The prelude is the same night on
 * every rung except for the weapon on the living-room wall and the caption
 * when he takes it down — which is the run's actual starting weapon, so the
 * difference is DERIVED by diffing the variants against the base rather than
 * described. Rungs whose variant is the base scene contribute nothing.
 */
function sceneModel(id, section) {
  const def = CUTSCENE_DEFS[id];
  if (!def) throw new Error(`library: no cutscene "${id}"`);
  const base = sceneBeats(def);

  // Which beats the rungs disagree on. Read by playing every rung's resolved
  // variant side by side rather than by knowing that it is the prelude and that
  // the difference is the wall: re-arm a rung, or give another scene a variant,
  // and the page follows without being told.
  const perRung = DIFFICULTY_ORDER.map((difficulty) => ({
    difficulty,
    beats: sceneBeats(CUTSCENE_DEFS[cutsceneVariant(id, difficulty)]),
  }));
  const key = (beat) =>
    beat ? `${beat.who ?? ""}:${beat.lines.join("\n")}` : "";
  const differing = base
    .map((_, i) => i)
    .filter((i) => new Set(perRung.map((rung) => key(rung.beats[i]))).size > 1);

  const variants =
    differing.length === 0
      ? []
      : perRung.map(({ difficulty, beats }) => {
          const weapon = DIFFICULTY_DEFS[difficulty]?.startingWeapon;
          return {
            difficulty,
            name: DIFFICULTY_DEFS[difficulty].name,
            color: DIFFICULTY_DEFS[difficulty].color,
            weapon: weapon
              ? { id: weapon, name: itemName(weapon), path: itemPathOf(weapon) }
              : null,
            beats: differing.map((i) => beats[i]).filter(Boolean),
          };
        });

  return {
    id,
    title: section.title,
    gist: section.body,
    slug: slugFor(id),
    // The scene as every rung plays it; what one rung plays alone is in the
    // variants, so the scene body cannot quietly speak for one difficulty.
    beats: base.filter((_, i) => !differing.includes(i)),
    variants,
  };
}

/**
 * The hero's pinned beats on a level, in the order the run plays them: the
 * SCRIPTED STRIKE first (it is the only one a level can guarantee lands, and on
 * GOODCO HQ it is the opening scene of the whole campaign), then sightings,
 * then kills, then the STANDING DOORS he tries too early.
 *
 * A door beat is the one here that is not fired by a mob: it answers a TAP on a
 * travel door with no open road (`travelDoors[].unready` — the garage's rocket
 * before the part is home), so it names the DOOR where the others name a
 * speaker. It replays in game, and it is the only line the hub has beyond its
 * arrival monologue, so leaving it out would publish the garage as a chapter
 * with nothing in it but the door list.
 *
 * The strike used to be missing here entirely, which is the one omission this
 * section cannot afford: `LEVEL_FIELDS` claims `openingStrike` is covered by
 * "the roster's vanguard, and the opening line", and the roster half was all
 * that shipped — so the mission page named the scientist while the line he is
 * hit with, and every word of the exchange, was published nowhere.
 */
function thoughtsOn(level) {
  const strike = level.openingStrike;
  const triggers = [
    ...(strike
      ? [...(strike.warnings ?? []), strike.thought].map((thought, blow) => ({
          enemy: strike.enemy,
          thought,
          when: "strike",
          // Which blow this is. The strike is ONE scene in several rounds, so
          // only the first round names the man doing the swinging — heading
          // each round with him again would read as three different people.
          blow,
        }))
      : []),
    ...(level.firstSightThoughts ?? []).map((t) => ({ ...t, when: "sight" })),
    ...(level.firstKillThoughts ?? []).map((t) => ({ ...t, when: "kill" })),
    ...(level.travelDoors ?? [])
      .filter((door) => door.unready)
      .map((door) => ({
        thought: door.unready,
        when: "door",
        door: door.name,
      })),
    // …the beat the venue's OWN ENDING raises (`LevelDef.exitByCar`): the
    // objective clears and the hero says where he is going, because there is no
    // LEVEL CLEAR button here to say it for him. A trigger rather than a mob or
    // a door, so it needs its own entry — a beat fired by anything this list
    // does not name is authored, shipped, playable and published nowhere.
    ...(level.exitByCar?.thought
      ? [{ thought: level.exitByCar.thought, when: "exit" }]
      : []),
    // …and the PLACE-pinned beats, which have no speaker and no door either:
    // they fire on the hero BEING somewhere (`placeThoughts`), so `where` is
    // what the others carry in `enemy`. Same reason the door beats are here —
    // without them the hub publishes as a chapter with a door list in it.
    ...(level.placeThoughts ?? []).map((t) => ({
      thought: t.thought,
      when: "place",
      where: t.where,
    })),
  ];
  return triggers.map((trigger) => {
    const def = THOUGHT_DEFS[trigger.thought];
    if (!def) throw new Error(`library: no thought "${trigger.thought}"`);
    assertFieldsCovered("thought", def, THOUGHT_FIELDS);
    const enemy = ENEMY_DEFS[trigger.enemy];
    return {
      id: def.id,
      when: trigger.when,
      blow: trigger.blow,
      // The door a "door" beat answers, by its picker name (THE ROCKET) —
      // the slot a mob-fired beat fills with its speaker.
      door: trigger.door ?? null,
      // …and the PLACE a "place" beat answers, in the same slot.
      where: trigger.where ?? null,
      enemy: enemy
        ? {
            id: enemy.id,
            name: enemy.name,
            path: enemyPathOf(enemy.id),
            hellborn: !!enemy.hellborn,
          }
        : null,
      voice: def.voice ?? null,
      pages: def.pages,
    };
  });
}

/** Everyone on this map with something to say, bosses first. */
function speakersOn(level) {
  const ids = new Set();
  for (const spawn of level.spawns ?? []) ids.add(spawn.enemy);
  for (const spawner of level.spawners ?? []) {
    for (const member of spawner.members ?? []) ids.add(member.enemy);
  }
  for (const pack of level.packs ?? []) {
    for (const member of pack.members ?? []) ids.add(member.enemy);
  }
  for (const id of level.rareSpawns?.unique ?? []) ids.add(id);

  const ROLE_ORDER = { boss: 0, elite: 1, minion: 2 };
  return [...ids]
    .map((id) => ENEMY_DEFS[id])
    .filter((def) => def && (def.dialogue?.length || def.lastWords?.length))
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
    )
    .map((def) => ({
      id: def.id,
      name: def.name,
      role: def.role,
      path: enemyPathOf(def.id),
      sprite: `${def.sprite}_0`,
      hellborn: !!def.hellborn,
      apparition: !!def.apparition,
      spareable: !!def.spareable,
      dialogue: def.dialogue ?? [],
      lastWords: def.lastWords ?? [],
    }));
}

/**
 * The found lore on this map: what is left lying, and what a named body gives
 * up. The two are told apart because "read the room" and "beat it out of
 * someone" are different beats.
 */
function findsOn(level) {
  const finds = new Map();
  const add = (id, from) => {
    const def = STORY_ITEM_DEFS[id];
    if (!def || finds.has(id)) return;
    assertFieldsCovered("story item", def, STORY_ITEM_FIELDS);
    finds.set(id, {
      id: def.id,
      name: def.name,
      lore: def.lore,
      unlocks: def.unlocks ?? null,
      suitsHero: !!def.suitsHero,
      keepsake: !!def.keepsake,
      from,
    });
  };

  for (const placed of level.placedItems ?? []) {
    if (placed.kind === "story") add(placed.defId, null);
  }
  for (const enemy of speakersOn(level)) {
    for (const id of ENEMY_DEFS[enemy.id].loot?.storyItems ?? []) {
      add(id, { name: enemy.name, path: enemy.path });
    }
  }
  return [...finds.values()];
}

// ---- the chapters -----------------------------------------------------------

function chapterModel(level, sections) {
  const gist = sections.gist;
  return {
    id: level.id,
    slug: slugFor(level.id),
    path: chapterPath(level.id),
    kind: "mission",
    name: level.name,
    heading: sections.heading,
    index: level.index,
    secret: !LEVEL_ORDER.includes(level.id),
    venue: { id: level.id, name: level.name, path: missionPathOf(level.id) },
    boss: (level.spawns ?? [])
      .filter((spawn) => ENEMY_DEFS[spawn.enemy]?.role === "boss")
      .map((spawn) => ({
        id: spawn.enemy,
        name: ENEMY_DEFS[spawn.enemy].name,
        path: enemyPathOf(spawn.enemy),
      })),
    gist,
    blurb: firstSentence(gist),
    // The scenes that play on the way in, paired with the prose that describes
    // them — the level's own `prelude` chain, in the order it plays.
    scenes: chainOf(level.prelude).map((id, i) =>
      sceneModel(id, sections.cutscenes[i]),
    ),
    // …and the scenes on the way OUT, written after the chapter they close.
    farewellScenes: chainOf(level.farewell).map((id, i) =>
      sceneModel(id, sections.farewell?.[i]),
    ),
    intro: level.intro ?? [],
    outro: level.outro ?? [],
    epilogue: sections.epilogue,
    // The hellborn are not part of this crime and say so themselves — their
    // beats live in their own chapter rather than crowding a mission's.
    thoughts: thoughtsOn(level).filter((t) => !t.enemy?.hellborn),
    speakers: speakersOn(level).filter((s) => !s.hellborn),
    finds: findsOn(level),
    previous: null,
    next: null,
    sourceFiles: [STORY_DOC, `content/levels/${level.id}.yaml`],
  };
}

/** A level's cutscene chain (`prelude` or `farewell`) as a plain list. */
const chainOf = (chain) =>
  chain == null ? [] : Array.isArray(chain) ? [...chain] : [chain];

/**
 * The hellborn chapter. They are not part of the campaign's crime and they
 * belong to no single venue, so they get the one chapter that is not a mission
 * — the map each pair tears its way into, and the rung it takes to meet them,
 * both read off the hellgate the level actually arms.
 */
function hellbornChapter(order, section) {
  const arrivals = [];
  for (const id of order) {
    const level = LEVELS[id];
    const thoughts = thoughtsOn(level);
    for (const spawner of level.spawners ?? []) {
      if (!spawner.hellgate) continue;
      for (const member of spawner.members ?? []) {
        const def = ENEMY_DEFS[member.enemy];
        if (!def || arrivals.some((a) => a.id === def.id)) continue;
        const rung = member.minDifficulty ?? spawner.minDifficulty;
        arrivals.push({
          id: def.id,
          name: def.name,
          path: enemyPathOf(def.id),
          sprite: `${def.sprite}_0`,
          venue: { id, name: level.name, path: missionPathOf(id) },
          difficulty: rung,
          rung: DIFFICULTY_DEFS[rung]?.name ?? rung.toUpperCase(),
          color: DIFFICULTY_DEFS[rung]?.color ?? null,
          // His own read on the thing, the first time he sees it — the only
          // account of a hellborn the game ever gives.
          thoughts: thoughts.filter((t) => t.enemy?.id === def.id),
          lastWords: def.lastWords ?? [],
          dialogue: def.dialogue ?? [],
        });
      }
    }
  }

  const orphans = Object.values(ENEMY_DEFS)
    .filter((def) => def.hellborn && !arrivals.some((a) => a.id === def.id))
    .map((def) => def.id);
  if (orphans.length > 0) {
    throw new Error(
      `library: hellborn ${orphans.join(", ")} reach the board without a hellgate, ` +
        `so the story pages cannot say where they come through. Teach hellbornChapter ` +
        `(pwa/scripts/library/model-story.mjs) about the new route.`,
    );
  }

  return {
    id: "the-hellborn",
    slug: "the-hellborn",
    path: chapterPath("the-hellborn"),
    kind: "hellborn",
    name: "THE HELLBORN",
    heading: section.heading,
    secret: false,
    venue: null,
    boss: [],
    gist: section.body,
    blurb: firstSentence(section.body),
    scenes: [],
    sceneTitles: [],
    intro: [],
    outro: [],
    epilogue: null,
    thoughts: [],
    speakers: [],
    finds: [],
    arrivals,
    previous: null,
    next: null,
    sourceFiles: [STORY_DOC, "content/levels", "content/enemies"],
  };
}

/**
 * THE CAMPAIGN CHAIN's chapter. Like the hellborn's, it belongs to no single
 * venue — it crosses all five — so it gets a chapter of its own rather than
 * being cut up between the missions it walks through.
 *
 * The GUARD is the point of building it from the catalog rather than only from
 * the prose: a chain the document describes but the game no longer ships (or
 * the reverse) is a story page about content that is not there, which is the
 * one failure this whole section exists to make impossible.
 */
function chainChapter(section) {
  const links = Object.values(QUEST_DEFS)
    .filter((def) => def.campaign)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (links.length === 0) {
    throw new Error(
      `library: ${STORY_DOC} describes THE SEVERANCE, but the game ships no ` +
        `campaign errands. Either the chain was retired (drop the section) or ` +
        `its quests lost \`campaign: true\`.`,
    );
  }
  // In narrative order: by the venue the link is handed out on, then by the
  // giver's own ordering within it. The document walks the venues in campaign
  // order, so the two readings agree by construction.
  const venueOrder = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];
  links.sort(
    (a, b) =>
      venueOrder.indexOf(a.level) - venueOrder.indexOf(b.level) ||
      (a.order ?? 0) - (b.order ?? 0),
  );
  return {
    id: "the-severance",
    slug: "the-severance",
    path: chapterPath("the-severance"),
    kind: "chain",
    name: "THE SEVERANCE",
    heading: section.heading,
    secret: false,
    venue: null,
    boss: [],
    gist: section.body,
    blurb: firstSentence(section.body),
    scenes: [],
    sceneTitles: [],
    intro: [],
    outro: [],
    epilogue: null,
    thoughts: [],
    speakers: [],
    finds: [],
    arrivals: [],
    // The errands themselves, so the chapter links out to the pages that hold
    // what each one actually asks for.
    links: links.map((def) => ({
      id: def.id,
      name: def.name,
      path: `errands/${def.id.replace(/_/g, "-")}`,
      venue: {
        id: def.level,
        name: LEVELS[def.level]?.name ?? def.level,
        path: missionPathOf(def.level),
      },
      minDifficulty: def.minDifficulty ?? null,
    })),
    previous: null,
    next: null,
    sourceFiles: [STORY_DOC, "content/quests", "content/quest-givers.yaml"],
  };
}

/**
 * Every chapter, in narrative order, plus the premise the section's front page
 * opens with.
 *
 * The document drives the ORDER and the prose; the game drives the CONTENT.
 * Where the two describe the same thing they are checked against each other:
 * a level named in `docs/story.md` has to exist, every level has to be
 * written about, and the scenes a chapter describes on the way in have to be
 * the scenes the level actually plays.
 */
export function storyModel() {
  const order = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];
  const byName = levelByName();
  const sections = storySections().map(classify);

  let premise = null;
  let hellborn = null;
  let chain = null;
  const perLevel = new Map();
  let pendingScenes = [];
  let last = null;
  /** How many send-off scenes the chapter just closed is still owed. */
  let farewellOwed = 0;

  for (const section of sections) {
    switch (section.kind) {
      case "meta":
        break;
      case "premise":
        premise = section.body;
        break;
      case "cutscene":
        // A SCENE STRAIGHT AFTER A CHAPTER IS THAT LEVEL'S SEND-OFF, not the
        // next one's opening: the moon's ghost has the last word on the moon
        // (`LevelDef.farewell`). Claimed by COUNT and in order, so the document
        // reads exactly as the game plays — a chapter, its goodbyes, then the
        // scenes on the way to the next place.
        if (last && perLevel.get(last).farewell.length < farewellOwed) {
          perLevel.get(last).farewell.push(section);
        } else {
          pendingScenes.push(section);
        }
        break;
      case "hellborn":
        hellborn = section;
        break;
      case "chain":
        chain = section;
        break;
      case "epilogue": {
        if (!last) {
          throw new Error(
            `library: ${STORY_DOC}'s "${section.heading}" closes a chapter, but no chapter comes before it.`,
          );
        }
        perLevel.get(last).epilogue = section.body;
        break;
      }
      case "level": {
        const level = byName.get(section.venueName);
        if (!level) {
          throw new Error(
            `library: ${STORY_DOC} writes about "${section.venueName}", which is not a level the game ships. ` +
              `Either the venue was renamed (fix the heading) or the chapter is describing something that no longer exists.`,
          );
        }
        if (perLevel.has(level.id)) {
          throw new Error(
            `library: ${STORY_DOC} has two chapters for ${level.name}.`,
          );
        }
        const scenes = chainOf(level.prelude);
        if (scenes.length !== pendingScenes.length) {
          throw new Error(
            `library: ${STORY_DOC} describes ${pendingScenes.length} scene(s) on the way into ${level.name} ` +
              `(${pendingScenes.map((s) => s.title).join(", ") || "none"}), but the level plays ${scenes.length} ` +
              `(${scenes.join(", ") || "none"}). The story and the game disagree about how he gets there.`,
          );
        }
        if (last && perLevel.get(last).farewell.length < farewellOwed) {
          const owed = perLevel.get(last);
          throw new Error(
            `library: ${STORY_DOC} gives ${owed.heading} ${owed.farewell.length} send-off ` +
              `scene(s), but the level plays ${farewellOwed}. A level's farewell is ` +
              `written straight after its own chapter.`,
          );
        }
        perLevel.set(level.id, {
          heading: section.heading,
          gist: section.body,
          cutscenes: pendingScenes,
          farewell: [],
          epilogue: null,
        });
        pendingScenes = [];
        last = level.id;
        farewellOwed = chainOf(level.farewell).length;
        break;
      }
    }
  }

  if (last && perLevel.get(last).farewell.length < farewellOwed) {
    const owed = perLevel.get(last);
    throw new Error(
      `library: ${STORY_DOC} gives ${owed.heading} ${owed.farewell.length} send-off ` +
        `scene(s), but the level plays ${farewellOwed}.`,
    );
  }
  if (pendingScenes.length > 0) {
    throw new Error(
      `library: ${STORY_DOC} ends with ${pendingScenes.length} scene(s) that lead nowhere ` +
        `(${pendingScenes.map((s) => s.title).join(", ")}).`,
    );
  }
  if (!premise) throw new Error(`library: ${STORY_DOC} has no premise.`);
  if (!hellborn) {
    throw new Error(`library: ${STORY_DOC} no longer describes the hellborn.`);
  }
  if (!chain) {
    throw new Error(
      `library: ${STORY_DOC} no longer describes THE SEVERANCE, the campaign chain.`,
    );
  }
  const unwritten = order.filter((id) => !perLevel.has(id));
  if (unwritten.length > 0) {
    throw new Error(
      `library: ${STORY_DOC} has no chapter for ${unwritten.join(", ")}. ` +
        `Every venue the game ships is part of the story — write it at the top of the chain first ` +
        `(the update-story skill), then it gets its page.`,
    );
  }

  const chapters = order.map((id) =>
    chapterModel(LEVELS[id], perLevel.get(id)),
  );
  chapters.push(hellbornChapter(order, hellborn));
  chapters.push(chainChapter(chain));

  // Chapter-to-chapter navigation, once the whole run is known — including the
  // hellborn, which reads as the campaign's own coda.
  const linkOf = (chapter) =>
    chapter && { id: chapter.id, name: chapter.name, path: chapter.path };
  for (const [i, chapter] of chapters.entries()) {
    chapter.previous = linkOf(chapters[i - 1]);
    chapter.next = linkOf(chapters[i + 1]);
  }

  return {
    premise,
    chapters,
    // The one thought that belongs to no chapter: it replays on any map the
    // hero has out-levelled, which is the counter-melody the premise describes.
    refrain: CAP_THOUGHT_IDS.map((id) => {
      const def = THOUGHT_DEFS[id];
      assertFieldsCovered("thought", def, THOUGHT_FIELDS);
      return { id, voice: def.voice ?? null, pages: def.pages };
    }),
  };
}
