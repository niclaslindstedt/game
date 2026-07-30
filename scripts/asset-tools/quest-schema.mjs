// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The QUEST schema validators — errands and the people who hand them out.
// Mirrors `story-schema.mjs` / `powerup-schema.mjs`: each `validate*` returns
// `{ errors, warnings }`, and a hard error FAILS the build, so a quest that
// sends the hero after a monster this game does not have, or whose chain waits
// on an errand nobody offers, surfaces at `npm run levels` rather than as a
// giver standing silently on a map with nothing to say.
//
// The contracts checked here live in `src/game/defs/quests.ts` (`QuestDef`,
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
const OBJECTIVE_KINDS = ["kill", "killNamed", "collect", "escort"];

/**
 * The longest line the quest box fits without wrapping — the same measure the
 * dialogue box takes (see story-schema.mjs), because it is the same box.
 */
const LINE_WARN_CHARS = 34;

/** The longest a giver's `lore` paragraph runs before it stops being a
 * paragraph — matched to `EnemyDef.lore`'s own warning. */
const LORE_WARN_CHARS = 420;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isVec = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  isNum(v.x) &&
  isNum(v.y);

/** A page of lines: a non-empty list of non-empty strings. */
function checkPages(pages, what, err, warn) {
  if (!Array.isArray(pages) || pages.length === 0) {
    err(`${what} must be a non-empty list of pages`);
    return;
  }
  pages.forEach((page, i) => checkLines(page, `${what}[${i}]`, err, warn));
}

function checkLines(lines, what, err, warn) {
  if (!Array.isArray(lines) || lines.length === 0) {
    err(`${what} must be a non-empty list of lines`);
    return;
  }
  for (const line of lines) {
    if (!isStr(line)) {
      err(`${what} has a line that is not text`);
    } else if (line.length > LINE_WARN_CHARS) {
      warn(
        `${what} line is ${line.length} chars — over ${LINE_WARN_CHARS} the box ` +
          `breaks it for you: "${line}"`,
      );
    }
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
  if (!isStr(def.lore)) err("lore is required — every giver owes a paragraph");
  else if (def.lore.length > LORE_WARN_CHARS) {
    warn(
      `lore is ${def.lore.length} chars — over ${LORE_WARN_CHARS} it stops
      reading as a paragraph`.replace(/\s+/g, " "),
    );
  }
  if (def.greeting !== undefined)
    checkLines(def.greeting, "greeting", err, warn);
  if (def.farewell !== undefined)
    checkLines(def.farewell, "farewell", err, warn);

  return { errors, warnings };
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
        err,
      }),
    );
  }

  for (const [i, item] of (def.items ?? []).entries()) {
    checkQuestItem(item, `items[${i}]`, refs, err);
  }
  for (const [i, escort] of (def.escorts ?? []).entries()) {
    checkEscort(escort, `escorts[${i}]`, refs, err);
  }
  checkReward(def.reward, refs, err, warn);

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

  // Something has to pay, or the errand is work for nothing. A chain LINK may
  // legitimately pay only in the next link, so this is a warning.
  if (!def.reward) warn("has no reward");

  return { errors, warnings };
}

function checkObjective(objective, what, { refs, itemIds, escortIds, err }) {
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
  // escort
  if (!isStr(objective.escort)) err(`${what} needs an escort`);
  else if (!escortIds.has(objective.escort)) {
    err(
      `${what} escorts "${objective.escort}", which the quest's escorts: does
      not define`.replace(/\s+/g, " "),
    );
  }
  if (!isVec(objective.to)) err(`${what} needs a destination \`to: { x, y }\``);
}

function checkQuestItem(item, what, refs, err) {
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
    }
  }
  for (const at of item.at ?? []) {
    if (!isVec(at)) err(`${what} at entries must be \`{ x, y }\``);
  }
  // A piece nobody drops and nobody placed is a piece that cannot be found.
  if ((item.dropFrom ?? []).length === 0 && (item.at ?? []).length === 0) {
    err(
      `${what} has neither dropFrom: nor at: — nothing would ever produce it`,
    );
  }
}

function checkEscort(escort, what, refs, err) {
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
  if (escort.at !== undefined && !isVec(escort.at)) {
    err(`${what} at must be \`{ x, y }\``);
  }
  if (escort.hp !== undefined && (!isNum(escort.hp) || escort.hp <= 0)) {
    err(`${what} hp must be positive`);
  }
}

function checkReward(reward, refs, err, warn) {
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
  for (const id of reward.abilities ?? []) {
    if (refs.abilities && !refs.abilities.has(id)) {
      err(`reward names powerup "${id}", which does not exist`);
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

  // A chain link must wait on a quest THE SAME PERSON gives, on the SAME map:
  // the gate is read while the hero stands on this level, so a prerequisite
  // from another map can never have been turned in on this run.
  for (const [id, def] of Object.entries(quests)) {
    for (const req of def.requires ?? []) {
      const prior = quests[req];
      if (prior && prior.level !== def.level) {
        errors.push(
          `quest "${id}" requires "${req}", which is on "${prior.level}" — a ` +
            `chain cannot cross maps (the log is a run's, not a save's)`,
        );
      }
    }
  }

  return { errors, warnings };
}
