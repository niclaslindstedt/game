// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The QUEST schema validators — errands and the people who hand them out.
// Mirrors `story-schema.mjs` / `powerup-schema.mjs`: each `validate*` returns
// `{ errors, warnings }`, and a hard error FAILS the build, so a quest that
// sends the hero after a monster this game does not have, or whose chain waits
// on an errand nobody offers, surfaces at `npm run levels` rather than as a
// giver standing silently on a map with nothing to say.
//
// The contracts checked here live in `engine/game/defs/quests.ts` (`QuestDef`,
// `QuestGiverDef`) — keep the two in step when a field is added. What the
// AUTHORED form changes on top of those types is documented in
// `scripts/quest-data/load-yaml.mjs` (one thing: a singular objective needs no
// `count`).
//
// THE CROSS-REFERENCES ARE THE POINT. A quest names a level, a giver, monster
// breeds, sprites, unique ids, powerups and its own chain links — six ways to
// write an id that resolves to nothing, and every one of them is silent at
// runtime (a `kill` objective for a breed that never spawns is a quest that can
// never be completed, and it looks exactly like bad luck).

/** The objective kinds, and what each requires. */
const OBJECTIVE_KINDS = [
  "kill",
  "killNamed",
  "collect",
  "escort",
  "visit",
  "flag",
  "sell",
  "reachLevel",
];

/**
 * THE LENGTH BUDGET IS PER PAGE, NOT PER LINE. An authored line is a
 * PARAGRAPH: the overlay flows it into the column the box really has on the
 * device it is being read on (`wrapPage` + `useTextColumn`), so how many
 * characters fit on a ROW is the renderer's business and not the author's.
 * What the author still owns is how much of a thought lands on ONE SCREENFUL
 * before the box makes the player scroll for the rest — three rows of the
 * narrowest box the game supports, a portrait phone, which is about this many
 * characters. A longer page still reads; it just arrives in two taps.
 */
const PAGE_WARN_CHARS = 120;

/**
 * How many EXPLICIT line breaks a page may carry before it stops being
 * sparing. A second entry in a page's list is a deliberate held beat — a
 * punchline, a second hand on the same note, a pause the punctuation cannot
 * carry — and the whole shipped campaign spends five of them. A page cut into
 * four is the old fixed-box habit coming back, and it prints a ragged column.
 */
const MAX_PAGE_LINES = 2;

/**
 * The longest a `lore` paragraph — a giver's, or an errand's — runs before it
 * stops being a paragraph. Matched to `EnemyDef.lore`'s own warning.
 */
const LORE_WARN_CHARS = 420;

/** How near a map's edge an authored spot may sit before it is worth flagging
 * — roughly a body's width plus the clearance the placement passes want. */
const MAP_EDGE_MARGIN = 32;

/**
 * How long a CONVERSATION CHOICE runs before it wraps to a second row.
 *
 * Deliberately NOT the page budget above: a spoken page is a paragraph the box
 * flows, but a choice is a ROW in a list the player is scanning, and a list
 * whose rows are two lines tall reads as prose with bullets rather than as a
 * menu. So this one still counts characters — it is about the shape of the
 * list, not about how much fits on a screenful.
 */
const CHOICE_WARN_CHARS = 34;

/**
 * THE FARM CEILING: the most generous `dropChance` a piece may carry before
 * the author is asked whether its carrier is really a one-off.
 *
 * One in eight, and the smallness is what makes a fetch quest a hunt at all —
 * this game's hero clears a hundred and seventy bodies in three minutes, so a
 * piece falling off every second or third of them is a counter rather than an
 * errand. Kept in step with `QUESTS.dropChance` in `engine/game/config/quests.ts`,
 * which is the rate a piece that names none actually rolls at.
 */
const FARM_DROP_CEILING = 0.125;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isVec = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  isNum(v.x) &&
  isNum(v.y);

/** The lines of a page, whoever is saying them (`{ hero: [...] }` or a list). */
const pageLines = (page) => (Array.isArray(page) ? page : page?.hero);
/** Is this page the HERO's answer? */
const isHeroPage = (page) =>
  page !== null &&
  typeof page === "object" &&
  !Array.isArray(page) &&
  Array.isArray(page.hero);

/**
 * A QUEST CONVERSATION: ONE THING SAID, THEN ONE THING ANSWERED — and the shape
 * is a build error rather than a convention, because nothing else would hold it.
 *
 * The rule, in full: the giver's page comes first, the hero's `{ hero: [...] }`
 * answer may follow it, and there is nothing after that. No second ask, no
 * third page, no giver having the last word over the top of the hero's reply,
 * and — see `content/conversations/` for what a tree is FOR — no branch. The
 * decision the player is here to make is ACCEPT or DECLINE, and the modal under
 * these pages already carries it along with the objectives and the reward; every
 * page beyond the second is the player being held at a desk by somebody they
 * walked up to in order to find out what the job was.
 *
 * A giver who genuinely needs to be talked around is not a quest page at all —
 * that is a CONVERSATION (`QuestDef.conversation`), which is a different object
 * with different rules, and choosing one deliberately is the point of the split.
 */
function checkPages(pages, what, err, warn) {
  if (!Array.isArray(pages) || pages.length === 0) {
    err(`${what} must be a non-empty list of pages`);
    return;
  }
  if (pages.length > 2) {
    err(
      `${what} has ${pages.length} pages — a giver says ONE thing and the ` +
        `hero answers with ONE line; anything longer is a conversation ` +
        `(QuestDef.conversation), not an ask`,
    );
  }
  if (isHeroPage(pages[0])) {
    err(`${what}[0] is the hero's — the person with the errand speaks first`);
  }
  if (pages.length > 1 && !isHeroPage(pages[1])) {
    err(
      `${what}[1] must be the hero's answer ({ hero: [...] }) — a giver who ` +
        `carries on talking after his own ask is a giver nobody replies to`,
    );
  }
  pages.forEach((page, i) => {
    const lines = pageLines(page);
    if (lines === undefined) {
      err(`${what}[${i}] must be a list of lines or { hero: [...] }`);
      return;
    }
    checkLines(lines, `${what}[${i}]`, err, warn);
  });
}

/**
 * A DESCRIBED paragraph — a giver's `lore` or an errand's. Required in both
 * places: it is the only prose either page has that isn't spoken dialogue, and
 * a missing one is invisible until somebody reads the page it left blank.
 */
function checkLore(lore, why, err, warn) {
  if (!isStr(lore)) {
    err(`lore is required — ${why}`);
    return;
  }
  if (lore.length > LORE_WARN_CHARS) {
    warn(
      `lore is ${lore.length} chars — over ${LORE_WARN_CHARS} it stops
      reading as a paragraph`.replace(/\s+/g, " "),
    );
  }
}

/**
 * A page: a non-empty list of authored lines, each one a paragraph the box
 * flows into its own width. See PAGE_WARN_CHARS / MAX_PAGE_LINES.
 */
function checkLines(lines, what, err, warn) {
  if (!Array.isArray(lines) || lines.length === 0) {
    err(`${what} must be a non-empty list of lines`);
    return;
  }
  for (const line of lines) {
    if (!isStr(line)) {
      err(`${what} has a line that is not text`);
    }
  }
  if (lines.length > MAX_PAGE_LINES) {
    warn(
      `${what} is cut into ${lines.length} lines — a line break is an ` +
        `explicit held beat, not a way to fit a box (the box wraps for you)`,
    );
  }
  const chars = lines.join(" ").length;
  if (chars > PAGE_WARN_CHARS) {
    warn(
      `${what} is ${chars} chars — over ${PAGE_WARN_CHARS} it needs a second ` +
        `tap to read on a phone; consider splitting the PAGE`,
    );
  }
}

/**
 * IS THIS COORDINATE ACTUALLY ON THE MAP IT NAMES?
 *
 * The gap this closes is the nastiest kind the quest schema can have, because
 * it is silent in exactly the way every other refusal here exists to prevent.
 * A `{ x, y }` that parses is not a spot: the moon is 2400x1600, and an
 * objective authored at (2680, 340) is off the east edge of it. The build was
 * happy, the level loaded, and the errand simply could never be completed —
 * a `visit` the hero cannot stand on, or a piece lying past the wall. (Not
 * hypothetical: the campaign chain's first draft shipped six of these, all
 * caught by hand-diffing coordinates against map sizes.)
 *
 * A MARGIN rather than the raw rectangle, because a body has width: a spot on
 * the very edge is one no character can stand centred on. That case is a
 * WARNING, not an error — the engine nudges a blocked spot to clear ground, so
 * an edge coordinate is recoverable where an off-map one is not.
 */
function checkOnMap(at, levelId, what, refs, err, warn) {
  if (!isVec(at) || !levelId) return;
  const size = refs.levelSizes?.get(levelId);
  if (!size) return;
  if (at.x < 0 || at.y < 0 || at.x > size.width || at.y > size.height) {
    err(
      `${what} is at (${at.x}, ${at.y}), which is off "${levelId}" — that map ` +
        `is ${size.width}x${size.height}. Nothing would ever reach it.`,
    );
    return;
  }
  if (
    at.x < MAP_EDGE_MARGIN ||
    at.y < MAP_EDGE_MARGIN ||
    at.x > size.width - MAP_EDGE_MARGIN ||
    at.y > size.height - MAP_EDGE_MARGIN
  ) {
    warn(
      `${what} is at (${at.x}, ${at.y}), within ${MAP_EDGE_MARGIN}px of the ` +
        `edge of "${levelId}" (${size.width}x${size.height}) — a body cannot ` +
        `stand centred that close to a wall`,
    );
  }
}

/**
 * Validate one quest giver.
 *
 * @param {string} id    the catalog key (the giver's id).
 * @param {object} def   the authored entry.
 * @param {object} refs  `{ levels, sprites }` — Sets of live ids.
 */
export function validateQuestGiver(id, def, refs) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`quest giver "${id}": ${m}`);
  const warn = (m) => warnings.push(`quest giver "${id}": ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    err("expected a mapping");
    return { errors, warnings };
  }
  if (!isStr(def.name)) err("name is required");
  if (!isStr(def.level)) err("level is required");
  else if (refs.levels && !refs.levels.has(def.level)) {
    err(`level "${def.level}" does not exist`);
  }
  if (!isStr(def.sprite)) err("sprite is required");
  else if (refs.sprites && !refs.sprites.has(`${def.sprite}_0`)) {
    err(
      `sprite "${def.sprite}" has no "${def.sprite}_0" frame — a giver is ` +
        `drawn from a walk pair like the merchant's`,
    );
  } else if (refs.sprites && !refs.sprites.has(`${def.sprite}_1`)) {
    err(`sprite "${def.sprite}" has no "${def.sprite}_1" frame`);
  }
  if (!isVec(def.at)) err("at must be `{ x, y }` (world px)");
  else checkOnMap(def.at, def.level, "at", refs, err, warn);
  // ARRIVING: where they walk in from, and how fast. Both coordinates are
  // checked against the map, because a doorstep off the edge of the lot is a
  // person who walks in out of the void.
  if (def.arrive !== undefined) {
    if (
      !def.arrive ||
      typeof def.arrive !== "object" ||
      Array.isArray(def.arrive)
    ) {
      err("arrive must be a mapping with `from` (and optionally `speed`)");
    } else {
      if (!isVec(def.arrive.from)) {
        err("arrive.from must be `{ x, y }` (world px)");
      } else {
        checkOnMap(def.arrive.from, def.level, "arrive.from", refs, err, warn);
      }
      // THE CORNERS THE WALK TURNS, checked like every other coordinate: a
      // waypoint off the lot is a person who detours through the void.
      if (def.arrive.via !== undefined) {
        if (!Array.isArray(def.arrive.via)) {
          err("arrive.via must be a list of `{ x, y }` corners (world px)");
        } else {
          def.arrive.via.forEach((at, i) => {
            if (!isVec(at)) err(`arrive.via[${i}] must be \`{ x, y }\``);
            else checkOnMap(at, def.level, `arrive.via[${i}]`, refs, err, warn);
          });
        }
      }
      if (
        def.arrive.speed !== undefined &&
        (typeof def.arrive.speed !== "number" || !(def.arrive.speed > 0))
      ) {
        err("arrive.speed must be a positive walking pace (world px/s)");
      }
      if (
        def.arrive.delayMs !== undefined &&
        (typeof def.arrive.delayMs !== "number" || def.arrive.delayMs < 0)
      ) {
        err(
          "arrive.delayMs must be a non-negative pause before setting off (ms)",
        );
      }
    }
  }
  // WHAT BEING RUN OVER MEANS. Only an ARRIVING giver can be — nothing reaches
  // one standing at their spot — so a `runDown` on somebody who never walks in
  // is a beat that can never play, which is worth saying out loud.
  if (def.runDown !== undefined) {
    if (
      !def.runDown ||
      typeof def.runDown !== "object" ||
      Array.isArray(def.runDown)
    ) {
      err("runDown must be a mapping with `thought` and/or `flag`");
    } else {
      if (def.arrive === undefined) {
        err(
          "runDown needs `arrive` — only a giver still walking in can be hit, " +
            "so this beat could never play",
        );
      }
      if (def.runDown.thought !== undefined) {
        if (!isStr(def.runDown.thought)) err("runDown.thought must be an id");
        else if (refs.thoughts && !refs.thoughts.has(def.runDown.thought)) {
          err(`runDown.thought "${def.runDown.thought}" does not exist`);
        }
      }
      if (def.runDown.flag !== undefined && !isStr(def.runDown.flag)) {
        err("runDown.flag must be a run-flag id");
      }
    }
  }
  checkLore(def.lore, "every giver owes a paragraph", err, warn);
  // A HELLO IS ONE LINE. It heads the slate every single time the hero walks
  // up, so it is the most re-read text this person owns — and a greeting that
  // runs to three lines is a person clearing their throat before the menu on
  // every visit. What they have to SAY belongs in the errand's own ask, where
  // the player is standing when it matters.
  if (def.greeting !== undefined) {
    checkLines(def.greeting, "greeting", err, warn);
    if (Array.isArray(def.greeting) && def.greeting.length > 1) {
      err(
        `greeting is ${def.greeting.length} lines — a giver says ONE thing; ` +
          `the rest belongs in the errand's own ask`,
      );
    }
  }
  if (def.farewell !== undefined) {
    checkLines(def.farewell, "farewell", err, warn);
    if (Array.isArray(def.farewell) && def.farewell.length > 1) {
      err(
        `farewell is ${def.farewell.length} lines — one line, like the hello`,
      );
    }
  }
  if (def.intro !== undefined) checkGiverIntro(def.intro, refs, err);

  return { errors, warnings };
}

/**
 * THE MEETING THIS PERSON OWES THE HERO BEFORE THEIR SLATE OPENS
 * (`QuestGiverDef.intro`). Both halves are hard errors, and both fail the same
 * silent way at runtime: a tap that opens a tree that is not there, or one that
 * opens a tree nothing can ever retire — a person standing over their own
 * errands forever, with nothing on screen to say why the list never comes up.
 *
 * @param {unknown} intro  the authored `intro:` block.
 * @param {object} refs    `{ conversations, flags }` — Sets of live ids.
 * @param {(m: string) => void} err
 */
function checkGiverIntro(intro, refs, err) {
  if (!intro || typeof intro !== "object" || Array.isArray(intro)) {
    err("intro must be `{ conversation, until }`");
    return;
  }
  if (!isStr(intro.conversation)) err("intro.conversation is required");
  else if (refs.conversations && !refs.conversations.has(intro.conversation)) {
    err(`intro conversation "${intro.conversation}" does not exist`);
  }
  if (!isStr(intro.until)) err("intro.until is required (a run flag)");
  else if (refs.flags && !refs.flags.has(intro.until)) {
    err(
      `intro flag "${intro.until}" is set by no conversation branch — the ` +
        `meeting would never end, and this person could never hand out an errand`,
    );
  }
}

/**
 * Validate one quest.
 *
 * @param {string} id    the file stem (the quest's id).
 * @param {object} def   the authored errand, as loaded.
 * @param {object} refs  `{ levels, enemies, sprites, uniques, abilities,
 *                         givers, quests, difficulties }` — Sets of live ids.
 */
export function validateQuest(id, def, refs) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`quest "${id}": ${m}`);
  const warn = (m) => warnings.push(`quest "${id}": ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    err("expected a mapping");
    return { errors, warnings };
  }
  if (!isStr(def.name)) err("name is required");
  if (!isStr(def.level)) err("level is required");
  else if (refs.levels && !refs.levels.has(def.level)) {
    err(`level "${def.level}" does not exist`);
  }
  if (!isStr(def.giver)) err("giver is required");
  else if (refs.givers && !refs.givers.has(def.giver)) {
    err(`giver "${def.giver}" does not exist`);
  } else if (
    refs.giverLevels &&
    refs.giverLevels.get(def.giver) !== def.level
  ) {
    // The giver stands on ONE map. An errand filed under another is offered by
    // nobody — the offer gate reads the run's level, so it never comes up.
    err(
      `giver "${def.giver}" stands on "${refs.giverLevels.get(def.giver)}", ` +
        `not on "${def.level}"`,
    );
  }

  checkLore(
    def.lore,
    "every errand owes a paragraph a reader can read",
    err,
    warn,
  );

  checkPages(def.offer, "offer", err, warn);
  checkPages(def.complete, "complete", err, warn);
  if (def.incomplete !== undefined) {
    checkLines(def.incomplete, "incomplete", err, warn);
  }

  const itemIds = new Set((def.items ?? []).map((i) => i?.id));
  const escortIds = new Set((def.escorts ?? []).map((e) => e?.id));

  if (!Array.isArray(def.objectives) || def.objectives.length === 0) {
    err("objectives must be a non-empty list");
  } else {
    def.objectives.forEach((objective, i) =>
      checkObjective(objective, `objectives[${i}]`, {
        refs,
        itemIds,
        escortIds,
        questLevel: def.level,
        err,
        warn,
      }),
    );
  }

  // Which of this errand's pieces some conversation hands over — needed by the
  // "nothing produces this" check below, since a piece given across a counter
  // legitimately lies nowhere and falls off nothing.
  const givenInConversation = new Set([...(refs.givenPieces?.get(id) ?? [])]);
  for (const [i, item] of (def.items ?? []).entries()) {
    checkQuestItem(item, `items[${i}]`, {
      refs,
      deal: def.merchant,
      givenInConversation,
      questLevel: def.level,
      err,
      warn,
    });
  }
  for (const [i, escort] of (def.escorts ?? []).entries()) {
    checkEscort(escort, `escorts[${i}]`, refs, err, warn, def.level);
  }
  checkReward(def.reward, refs, err, warn, def.level);

  for (const req of def.requires ?? []) {
    if (!isStr(req)) err("requires entries must be quest ids");
    else if (refs.quests && !refs.quests.has(req)) {
      err(`requires "${req}", which is not a quest`);
    } else if (req === id) err("requires itself");
  }
  if (def.order !== undefined && !isNum(def.order)) {
    err("order must be a number (low sorts first in the giver's list)");
  }
  if (def.minDifficulty !== undefined) {
    if (refs.difficulties && !refs.difficulties.has(def.minDifficulty)) {
      err(`minDifficulty "${def.minDifficulty}" is not a difficulty`);
    }
  }
  if (def.campaign !== undefined && typeof def.campaign !== "boolean") {
    err("campaign must be true or false");
  }
  if (def.conversation !== undefined) {
    if (!isStr(def.conversation)) err("conversation must be an id");
    else if (refs.conversations && !refs.conversations.has(def.conversation)) {
      err(`conversation "${def.conversation}" does not exist`);
    }
  }
  checkMerchantDeal(def.merchant, itemIds, err);

  // Something has to pay, or the errand is work for nothing. A chain LINK may
  // legitimately pay only in the next link, so this is a warning.
  if (!def.reward) warn("has no reward");

  return { errors, warnings };
}

function checkObjective(
  objective,
  what,
  { refs, itemIds, escortIds, questLevel, err, warn },
) {
  if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
    err(`${what} must be a mapping`);
    return;
  }
  if (!OBJECTIVE_KINDS.includes(objective.kind)) {
    err(`${what} has unknown kind "${objective.kind}"`);
    return;
  }
  if (objective.kind === "kill" || objective.kind === "killNamed") {
    if (!isStr(objective.enemy)) err(`${what} needs an enemy`);
    else if (refs.enemies && !refs.enemies.has(objective.enemy)) {
      err(`${what} names enemy "${objective.enemy}", which does not exist`);
    }
    if (objective.kind === "kill") {
      if (!isNum(objective.count) || objective.count < 1) {
        err(`${what} needs a count of at least 1`);
      }
    }
    return;
  }
  if (objective.kind === "collect") {
    if (!isStr(objective.item)) err(`${what} needs an item`);
    else if (!itemIds.has(objective.item)) {
      err(
        `${what} collects "${objective.item}", which the quest's items: does
        not define`.replace(/\s+/g, " "),
      );
    }
    if (!isNum(objective.count) || objective.count < 1) {
      err(`${what} needs a count of at least 1`);
    }
    return;
  }
  if (objective.kind === "visit") {
    if (!isStr(objective.level)) err(`${what} needs a level`);
    else if (refs.levels && !refs.levels.has(objective.level)) {
      err(`${what} visits level "${objective.level}", which does not exist`);
    }
    if (!isVec(objective.at)) err(`${what} needs \`at: { x, y }\` (world px)`);
    else
      checkOnMap(objective.at, objective.level, `${what} at`, refs, err, warn);
    // The NAME is what the tracker prints instead of a coordinate, and a
    // search objective without one is an errand that says "go somewhere".
    if (!isStr(objective.name)) {
      err(
        `${what} needs a name — the tracker prints it in place of the
        coordinate, so it has to describe the place to look for`.replace(
          /\s+/g,
          " ",
        ),
      );
    }
    if (
      objective.radius !== undefined &&
      (!isNum(objective.radius) || objective.radius <= 0)
    ) {
      err(`${what} radius must be positive`);
    }
    return;
  }
  if (objective.kind === "flag") {
    if (!isStr(objective.flag)) err(`${what} needs a flag`);
    else if (refs.flags && !refs.flags.has(objective.flag)) {
      // The invisible failure this exists for: an errand waiting on a flag no
      // branch and no sale ever sets can never be finished, and it looks
      // exactly like a bug in the conversation the player just had.
      err(
        `${what} waits on flag "${objective.flag}", which nothing sets — no
        conversation branch lists it in sets: and no merchant deal does
        either`.replace(/\s+/g, " "),
      );
    }
    if (!isStr(objective.name)) {
      err(
        `${what} needs a name — a flag id is not a sentence the tracker
      can print`.replace(/\s+/g, " "),
      );
    }
    return;
  }
  if (objective.kind === "sell") {
    if (!isStr(objective.item)) err(`${what} needs an item`);
    else if (!itemIds.has(objective.item)) {
      err(
        `${what} sells "${objective.item}", which the quest's items: does not
        define`.replace(/\s+/g, " "),
      );
    }
    return;
  }
  if (objective.kind === "reachLevel") {
    if (!isNum(objective.level) || objective.level < 2) {
      err(`${what} needs a level of at least 2`);
    } else if (refs.maxHeroLevel && objective.level > refs.maxHeroLevel) {
      err(
        `${what} asks for level ${objective.level}, past the game's cap of
        ${refs.maxHeroLevel} — an errand nobody can ever finish`.replace(
          /\s+/g,
          " ",
        ),
      );
    }
    return;
  }
  // escort
  if (!isStr(objective.escort)) err(`${what} needs an escort`);
  else if (!escortIds.has(objective.escort)) {
    err(
      `${what} escorts "${objective.escort}", which the quest's escorts: does
      not define`.replace(/\s+/g, " "),
    );
  }
  if (!isVec(objective.to)) err(`${what} needs a destination \`to: { x, y }\``);
  else checkOnMap(objective.to, questLevel, `${what} to`, refs, err, warn);
}

function checkQuestItem(
  item,
  what,
  { refs, deal, givenInConversation, questLevel, err, warn },
) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    err(`${what} must be a mapping`);
    return;
  }
  if (!isStr(item.id)) err(`${what} needs an id`);
  if (!isStr(item.name)) err(`${what} needs a name`);
  if (!isStr(item.icon)) err(`${what} needs an icon`);
  else if (refs.sprites && !refs.sprites.has(item.icon)) {
    err(`${what} icon "${item.icon}" is not a sprite`);
  }
  for (const breed of item.dropFrom ?? []) {
    if (refs.enemies && !refs.enemies.has(breed)) {
      err(`${what} names a dropFrom breed "${breed}", which is not an enemy`);
    }
  }
  if (item.dropChance !== undefined) {
    if (
      !isNum(item.dropChance) ||
      item.dropChance <= 0 ||
      item.dropChance > 1
    ) {
      err(`${what} dropChance must be in (0, 1]`);
    } else {
      // A GENEROUS RATE IS ONLY EVER RIGHT OFF A ONE-OFF. Which this is is a
      // question about the MAP, not about the number: off an elite, a guardian,
      // a bystander or a rampage-only hellborn the hero meets once, a certainty
      // is the beat happening at all; off a breed the knots pour out by the
      // hundred it is an errand that finishes before the player has read what
      // it asked for. So the ceiling binds exactly the farmable carriers, and
      // the exception needs no opt-in flag — the blueprint already says which
      // breeds the horde is made of.
      const farmed = hordeCarriers(item, questLevel, refs);
      if (farmed.length > 0 && item.dropChance > FARM_DROP_CEILING) {
        err(
          `${what} dropChance ${item.dropChance} is above ${FARM_DROP_CEILING} ` +
            `(one in ${Math.round(1 / FARM_DROP_CEILING)}) off ` +
            `${farmed.join(", ")} — the horde is made of those, so the piece ` +
            `would fall out faster than the errand can be read`,
        );
      }
    }
  }
  for (const [i, at] of (item.at ?? []).entries()) {
    if (!isVec(at)) err(`${what} at entries must be \`{ x, y }\``);
    else checkOnMap(at, questLevel, `${what} at[${i}]`, refs, err, warn);
  }
  // A piece nobody drops, nobody placed, nobody sells and nobody hands over is
  // a piece that cannot be found. The last two producers are why this takes
  // the whole def: a piece the TRADER stocks (`merchant.sells`) or a bystander
  // hands across in conversation legitimately lies nowhere and falls off
  // nothing, and refusing it would rule out the two beats a chain most wants.
  const stocked = (deal?.sells ?? []).some((s) => s?.item === item.id);
  if (
    (item.dropFrom ?? []).length === 0 &&
    (item.at ?? []).length === 0 &&
    !stocked &&
    !givenInConversation.has(item.id)
  ) {
    err(
      `${what} has neither dropFrom: nor at:, and nothing sells or hands it ` +
        `over — nothing would ever produce it`,
    );
  }
}

/**
 * Which of a piece's carriers are breeds the horde is actually MADE of on the
 * venue the errand is handed out on — the ones a drop rate is a farm rate for.
 *
 * A hub errand is carried across the campaign and its carriers live on whatever
 * map the trail has reached, so it is checked against every horde at once.
 * Empty when the pipeline was given no blueprints (a mod that ships none), which
 * turns the rule off rather than firing it at everything.
 */
function hordeCarriers(item, questLevel, refs) {
  if (!refs.hordeBreeds) return [];
  const level = refs.hordeBreeds.get(questLevel);
  const hub = !level || level.size === 0;
  const horde = hub ? refs.anyHordeBreed : level;
  if (!horde) return [];
  return (item.dropFrom ?? []).filter((breed) => horde.has(breed));
}

function checkEscort(escort, what, refs, err, warn, questLevel) {
  if (!escort || typeof escort !== "object" || Array.isArray(escort)) {
    err(`${what} must be a mapping`);
    return;
  }
  if (!isStr(escort.id)) err(`${what} needs an id`);
  if (!isStr(escort.name)) err(`${what} needs a name`);
  if (!isStr(escort.sprite)) err(`${what} needs a sprite`);
  else if (refs.sprites && !refs.sprites.has(`${escort.sprite}_0`)) {
    err(`${what} sprite "${escort.sprite}" has no "${escort.sprite}_0" frame`);
  } else if (refs.sprites && !refs.sprites.has(`${escort.sprite}_1`)) {
    err(`${what} sprite "${escort.sprite}" has no "${escort.sprite}_1" frame`);
  }
  if (escort.at !== undefined) {
    if (!isVec(escort.at)) err(`${what} at must be \`{ x, y }\``);
    else checkOnMap(escort.at, questLevel, `${what} at`, refs, err, warn);
  }
  if (escort.hp !== undefined && (!isNum(escort.hp) || escort.hp <= 0)) {
    err(`${what} hp must be positive`);
  }
}

/**
 * The trader's side of an errand (`QuestDef.merchant`). Both halves name the
 * quest's OWN pieces, because the deal only makes sense for something the
 * errand is counting — a row selling a piece no objective wants is a row the
 * player pays for and gets nothing from.
 */
function checkMerchantDeal(deal, itemIds, err) {
  if (deal === undefined) return;
  if (!deal || typeof deal !== "object" || Array.isArray(deal)) {
    err("merchant must be a mapping");
    return;
  }
  const buys = deal.buys;
  if (buys !== undefined) {
    if (!isStr(buys.item)) err("merchant.buys needs an item");
    else if (!itemIds.has(buys.item)) {
      err(
        `merchant.buys takes "${buys.item}", which the quest's items: does not
        define`.replace(/\s+/g, " "),
      );
    }
    if (!isNum(buys.coins) || buys.coins < 0) {
      err("merchant.buys.coins must be a non-negative number");
    }
    for (const flag of buys.sets ?? []) {
      if (!isStr(flag)) err("merchant.buys.sets entries must be flag ids");
    }
  }
  for (const [i, sale] of (deal.sells ?? []).entries()) {
    const what = `merchant.sells[${i}]`;
    if (!isStr(sale.item)) err(`${what} needs an item`);
    else if (!itemIds.has(sale.item)) {
      err(
        `${what} sells "${sale.item}", which the quest's items: does not
        define`.replace(/\s+/g, " "),
      );
    }
    if (!isNum(sale.price) || sale.price < 0) {
      err(`${what} price must be a non-negative number`);
    }
    for (const flag of sale.requires ?? []) {
      if (!isStr(flag)) err(`${what} requires entries must be flag ids`);
    }
    if (sale.pitch !== undefined && !isStr(sale.pitch)) {
      err(`${what} pitch must be a line of text`);
    }
  }
  if (buys === undefined && (deal.sells ?? []).length === 0) {
    err("merchant is empty — it must buy something, sell something, or go");
  }
}

function checkReward(reward, refs, err, warn, levelId) {
  if (reward === undefined) return;
  if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
    err("reward must be a mapping");
    return;
  }
  if (reward.xpShare !== undefined) {
    if (!isNum(reward.xpShare) || reward.xpShare <= 0) {
      err("reward.xpShare must be a positive share of a level bar");
    } else if (reward.xpShare > 2) {
      warn(
        `reward.xpShare is ${reward.xpShare} — over two whole levels for one ` +
          `errand out-paces the kill curve the campaign is tuned on`,
      );
    }
  }
  if (
    reward.coins !== undefined &&
    (!isNum(reward.coins) || reward.coins < 0)
  ) {
    err("reward.coins must be a non-negative number");
  }
  for (const id of reward.uniques ?? []) {
    if (refs.uniques && !refs.uniques.has(id)) {
      err(`reward names unique "${id}", which does not exist`);
    }
  }
  if (reward.cleanSlates !== undefined) {
    if (!isNum(reward.cleanSlates) || reward.cleanSlates < 1) {
      err("reward.cleanSlates must be at least 1");
    } else if (reward.cleanSlates > 1) {
      warn(
        `reward.cleanSlates is ${reward.cleanSlates} — a respec's whole weight
        comes from a build being a decision, and handing out more than one at a
        time makes it a postponed one`.replace(/\s+/g, " "),
      );
    }
  }
  for (const id of reward.abilities ?? []) {
    if (refs.abilities && !refs.abilities.has(id)) {
      err(`reward names powerup "${id}", which does not exist`);
    }
  }
  // THE CACHE — the garage chest (engine/game/cache.ts). It is a FIXTURE on a map
  // rather than an item, so an errand can only pay it where a map has somewhere
  // to put one: paid anywhere else the handover is a silent no-op that still
  // tells the player they were given something.
  if (reward.cache !== undefined) {
    if (typeof reward.cache !== "boolean") {
      err("reward.cache must be true or false — there is only one chest");
    } else if (reward.cache && refs.cacheLevels && levelId) {
      if (!refs.cacheLevels.has(levelId)) {
        err(
          `reward pays the CACHE, but "${levelId}" stands none — the map ` +
            `needs a \`cache\` landmark for the chest to arrive at`,
        );
      }
    }
  }
  if (reward.loot !== undefined) {
    if (!isNum(reward.loot.count) || reward.loot.count < 1) {
      err("reward.loot.count must be at least 1");
    }
    if (
      reward.loot.slot !== undefined &&
      !["weapon", "gear"].includes(reward.loot.slot)
    ) {
      err('reward.loot.slot must be "weapon" or "gear"');
    }
  }
}

/**
 * Whole-catalog checks — the ones no single file can make.
 *
 * @param {object} quests       `{ id → def }`, as loaded.
 * @param {object} questGivers  `{ id → def }`, as loaded.
 */
export function validateQuestCatalog(quests, questGivers) {
  const errors = [];
  const warnings = [];

  // A person standing on a map with nothing to hand out is a person the player
  // walks up to and gets silence from — the most confusing thing a quest
  // system can ship.
  for (const id of Object.keys(questGivers)) {
    if (!Object.values(quests).some((q) => q.giver === id)) {
      errors.push(`quest giver "${id}" hands out no quests`);
    }
  }

  // A CHAIN THAT EATS ITS OWN TAIL is a chain nobody can start, and it is
  // invisible at runtime: every link simply never becomes offerable.
  const seen = new Map();
  const walk = (id, trail) => {
    if (trail.includes(id)) {
      errors.push(`quest chain loops: ${[...trail, id].join(" → ")}`);
      return;
    }
    if (seen.get(id)) return;
    seen.set(id, true);
    for (const req of quests[id]?.requires ?? []) {
      if (quests[req]) walk(req, [...trail, id]);
    }
  };
  for (const id of Object.keys(quests)) walk(id, []);

  // A RUN chain link must wait on a quest on the SAME map: the gate is read
  // while the hero stands on this level, and a run's log dies with the level,
  // so a prerequisite from another map can never have been turned in.
  //
  // A CAMPAIGN chain is the exception, and crossing maps is the entire point
  // of one — its log rides the hero (see quests/campaign.ts). The two may not
  // be mixed either way round: a campaign link waiting on a run quest waits on
  // something that will be forgotten before he arrives, and a run link waiting
  // on a campaign one is a gate that reads as random to a player who did the
  // prerequisite three venues ago.
  for (const [id, def] of Object.entries(quests)) {
    for (const req of def.requires ?? []) {
      const prior = quests[req];
      if (!prior) continue;
      if (!!prior.campaign !== !!def.campaign) {
        errors.push(
          `quest "${id}" (${def.campaign ? "campaign" : "run"}) requires ` +
            `"${req}" (${prior.campaign ? "campaign" : "run"}) — a chain must ` +
            `be all campaign or all run, or the gate is unreadable`,
        );
        continue;
      }
      if (!def.campaign && prior.level !== def.level) {
        errors.push(
          `quest "${id}" requires "${req}", which is on "${prior.level}" — a ` +
            `run chain cannot cross maps (the log is a run's, not a save's). ` +
            `Mark both \`campaign: true\` if it is meant to.`,
        );
      }
    }
  }

  // A CAMPAIGN errand's `visit` objectives may sit on any map, but a RUN
  // errand's must sit on its own: the hero is never anywhere else while it is
  // running, so a spot on another venue is an objective he cannot reach.
  for (const [id, def] of Object.entries(quests)) {
    if (def.campaign) continue;
    for (const [i, objective] of (def.objectives ?? []).entries()) {
      if (objective?.kind !== "visit" || objective.level === def.level)
        continue;
      errors.push(
        `quest "${id}" objectives[${i}] visits "${objective.level}" but the ` +
          `errand is on "${def.level}" — a run errand cannot send the hero ` +
          `to another map. Mark it \`campaign: true\` if it is meant to.`,
      );
    }
  }

  return { errors, warnings };
}

// ------------------------------------------------------------- conversations

/**
 * Validate one CONVERSATION tree (see engine/game/defs/conversations.ts).
 *
 * The cross-references here are the same point they are for an errand, one
 * step nastier: a `goto` naming a node that does not exist is a branch that
 * silently ENDS the conversation, which at runtime is indistinguishable from a
 * branch that was authored to end it — so the player is left with a person who
 * stops talking mid-sentence and no error anywhere.
 *
 * @param {string} id    the file stem (the conversation's id).
 * @param {object} def   the authored tree, as loaded.
 * @param {object} refs  `{ quests }` — Sets of live ids.
 */
export function validateConversation(id, def, refs) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`conversation "${id}": ${m}`);
  const warn = (m) => warnings.push(`conversation "${id}": ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    err("expected a mapping");
    return { errors, warnings };
  }
  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
    err("nodes must be a non-empty mapping of id → node");
    return { errors, warnings };
  }

  const nodeIds = new Set();
  for (const [i, node] of def.nodes.entries()) {
    if (!isStr(node?.id)) {
      err(`nodes[${i}] has no id`);
      continue;
    }
    if (nodeIds.has(node.id)) err(`two nodes are called "${node.id}"`);
    nodeIds.add(node.id);
    checkLines(node.say, `node "${node.id}" say`, err, warn);
    for (const [j, choice] of (node.choices ?? []).entries()) {
      checkChoice(choice, `node "${node.id}" choices[${j}]`, refs, err, warn);
    }
    checkNodeChoices(node, warn);
  }

  if (!isStr(def.start)) err("start is required — a tree needs a first node");
  else if (!nodeIds.has(def.start)) {
    err(`start names node "${def.start}", which does not exist`);
  }
  for (const [i, entry] of (def.reentry ?? []).entries()) {
    if (!Array.isArray(entry?.requires) || entry.requires.length === 0) {
      err(`reentry[${i}] needs a non-empty requires: list of flags`);
    }
    if (!isStr(entry?.node)) err(`reentry[${i}] needs a node`);
    else if (!nodeIds.has(entry.node)) {
      err(`reentry[${i}] names node "${entry.node}", which does not exist`);
    }
  }

  // Every `goto` has to land somewhere. This is the check the whole validator
  // exists for — see the note above about how invisible the failure is.
  for (const node of def.nodes) {
    for (const choice of node.choices ?? []) {
      if (choice?.goto === undefined) continue;
      if (!isStr(choice.goto) || !nodeIds.has(choice.goto)) {
        err(
          `node "${node.id}" has a choice going to "${choice.goto}", which is ` +
            `not a node — at runtime that branch just ends the conversation`,
        );
      }
    }
  }

  // A node nothing reaches is a page the player can never be shown. Warned
  // rather than failed: a tree under construction legitimately has one.
  const reached = new Set([
    def.start,
    ...(def.reentry ?? []).map((r) => r.node),
  ]);
  for (const node of def.nodes) {
    for (const choice of node.choices ?? []) {
      if (isStr(choice?.goto)) reached.add(choice.goto);
    }
  }
  for (const node of def.nodes) {
    if (!reached.has(node.id)) {
      warn(`node "${node.id}" is unreachable — nothing goes to it`);
    }
  }

  return { errors, warnings };
}

function checkChoice(choice, what, refs, err, warn) {
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
    err(`${what} must be a mapping`);
    return;
  }
  if (!isStr(choice.text)) err(`${what} needs text — what the hero says`);
  else if (choice.text.length > CHOICE_WARN_CHARS) {
    warn(
      `${what} text is ${choice.text.length} chars — over ${CHOICE_WARN_CHARS} ` +
        `the row wraps to a second line: "${choice.text}"`,
    );
  }
  for (const key of ["requires", "forbids", "sets"]) {
    for (const flag of choice[key] ?? []) {
      if (!isStr(flag)) err(`${what} ${key} entries must be flag ids`);
    }
  }
  if (choice.provoke !== undefined && typeof choice.provoke !== "boolean") {
    err(`${what} provoke must be true or false`);
  }
  if (choice.gives !== undefined) {
    const quest = choice.gives?.quest;
    if (!isStr(quest)) err(`${what} gives needs a quest`);
    else if (refs.quests && !refs.quests.has(quest)) {
      err(`${what} gives a piece of quest "${quest}", which does not exist`);
    }
    if (!isStr(choice.gives?.item)) err(`${what} gives needs an item`);
  }
}

/**
 * A node whose ONLY row does nothing and goes nowhere is a dead end wearing a
 * button: the player is shown a choice, picks the one thing on offer, and the
 * conversation closes as if they had walked away.
 *
 * Checked per NODE rather than per choice, because a walk-away row beside real
 * ones ("NEVER MIND", "I'LL COME BACK") is the most ordinary thing in a
 * conversation tree and warning about each one would train authors to ignore
 * the warning that matters.
 */
function checkNodeChoices(node, warn) {
  const choices = node.choices ?? [];
  if (choices.length !== 1) return;
  const only = choices[0];
  if (
    only?.goto === undefined &&
    only?.gives === undefined &&
    !only?.provoke &&
    (only?.sets ?? []).length === 0
  ) {
    warn(
      `node "${node.id}" offers exactly one row and it does nothing — the ` +
        `player is shown a choice that is indistinguishable from walking away`,
    );
  }
}

/**
 * Whole-catalog conversation checks — the ones no single tree can make.
 *
 * @param {object} conversations  `{ id → def }`, as loaded.
 * @param {object} quests         `{ id → def }`, for the `gives` cross-ref.
 */
export function validateConversationCatalog(conversations, quests) {
  const errors = [];
  const warnings = [];

  // A `gives` must hand over a piece the named quest actually defines,
  // otherwise the hero picks up a token no objective is counting.
  for (const [id, def] of Object.entries(conversations)) {
    for (const node of def.nodes ?? []) {
      for (const choice of node.choices ?? []) {
        const gives = choice?.gives;
        if (!gives || !quests[gives.quest]) continue;
        const items = quests[gives.quest].items ?? [];
        if (!items.some((i) => i?.id === gives.item)) {
          errors.push(
            `conversation "${id}" node "${node.id}" gives "${gives.item}", ` +
              `which quest "${gives.quest}" does not define as an item`,
          );
        }
      }
    }
  }

  return { errors, warnings };
}
