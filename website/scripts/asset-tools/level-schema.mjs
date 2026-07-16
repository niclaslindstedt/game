// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level schema validator (see the `level-design` skill). Mirrors
// `sprite-schema.mjs`: `validateLevel(def, refs)` returns `{ errors, warnings }`
// — hard errors (unknown enemy/weapon/gear/thought/story id, band out of
// [0,1], zone rect off the map, a locked door with no key) FAIL the build; soft
// issues (a missing/placeholder description) only warn. `refs` is the set of
// live def ids the generator harvests from the engine catalogs, so a typo in a
// YAML level surfaces at `npm run levels`, not at runtime.

/** Fields every level must declare (a missing one is a hard error). */
export const REQUIRED_FIELDS = [
  "id",
  "index",
  "name",
  "width",
  "height",
  "gravity",
  "biome",
  "foes",
  "tiles",
  "playerSpawn",
  "objective",
  "spawns",
  "obstacles",
  "decor",
  "decorClearance",
  "intro",
  "loot",
];

const OBJECTIVES = new Set(["killBoss", "clearAll", "reachExit"]);

const isVec = (v) => v && typeof v.x === "number" && typeof v.y === "number";

/**
 * Validate one LevelDef against the engine's live id catalogs.
 *
 * @param {object} def   the pure LevelDef (authoring keys already stripped)
 * @param {object} refs  `{ enemies, weapons, gear, abilities, thoughts,
 *                          storyItems, uniques, worldUniques, doorKeys }` — each
 *                          a Set<string> of live ids (doorKeys = every story
 *                          item's `unlocks` value).
 * @param {string} [description] the authoring description, for the warning.
 */
export function validateLevel(def, refs, description = "") {
  const errors = [];
  const warnings = [];
  const tag = def?.id ? `level "${def.id}"` : "level";
  const err = (m) => errors.push(`${tag}: ${m}`);

  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined) err(`missing required field "${field}"`);
  }
  if (def.width <= 0 || def.height <= 0) err("width/height must be positive");
  const inBounds = (v) =>
    isVec(v) && v.x >= 0 && v.x <= def.width && v.y >= 0 && v.y <= def.height;

  // ---- enemy references -----------------------------------------------------
  const enemy = (id, where) => {
    if (id !== undefined && !refs.enemies.has(id))
      err(`unknown enemy "${id}" in ${where}`);
  };
  for (const s of def.spawns ?? []) {
    enemy(s.enemy, "spawns");
    if ("band" in s) {
      // Bands are fractions of the spawn→objective distance; the far edge may
      // exceed 1 (spawns placed beyond the objective), so only floor + order
      // are hard rules.
      const [lo, hi] = s.band ?? [];
      if (!(lo >= 0 && lo <= hi))
        err(`spawn band ${JSON.stringify(s.band)} must have 0<=lo<=hi`);
    } else if (!isVec(s.at)) {
      err(`pinned spawn for "${s.enemy}" needs an { at } position`);
    }
  }
  for (const p of def.packs ?? []) {
    if (!isVec(p.at)) err("pack needs an { at } position");
    for (const m of p.members ?? []) enemy(m.enemy, "pack");
  }
  for (const b of def.waves?.budget ?? []) enemy(b.enemy, "wave budget");
  for (const id of def.rareSpawns?.rare ?? []) enemy(id, "rareSpawns.rare");
  for (const id of def.rareSpawns?.unique ?? []) enemy(id, "rareSpawns.unique");
  if (def.openingStrike) {
    enemy(def.openingStrike.enemy, "openingStrike");
    if (!isVec(def.openingStrike.at)) err("openingStrike needs an { at }");
  }

  // ---- thought references ----------------------------------------------------
  const thought = (id, where) => {
    if (id !== undefined && !refs.thoughts.has(id))
      err(`unknown thought "${id}" in ${where}`);
  };
  for (const t of def.firstKillThoughts ?? []) {
    enemy(t.enemy, "firstKillThoughts");
    thought(t.thought, "firstKillThoughts");
    thought(t.after, "firstKillThoughts.after");
  }
  for (const t of def.firstSightThoughts ?? []) {
    enemy(t.enemy, "firstSightThoughts");
    thought(t.thought, "firstSightThoughts");
    thought(t.after, "firstSightThoughts.after");
  }
  if (def.openingStrike) {
    thought(def.openingStrike.thought, "openingStrike");
    thought(def.openingStrike.after, "openingStrike.after");
  }
  thought(def.asteroids?.struckThought, "asteroids.struckThought");

  // ---- loot references -------------------------------------------------------
  const loot = def.loot ?? {};
  for (const id of loot.weaponPool ?? [])
    if (!refs.weapons.has(id)) err(`unknown weapon "${id}" in weaponPool`);
  for (const id of loot.gearPool ?? [])
    if (!refs.gear.has(id)) err(`unknown gear "${id}" in gearPool`);
  for (const id of loot.abilityPool ?? [])
    if (!refs.abilities.has(id)) err(`unknown ability "${id}" in abilityPool`);
  if (loot.allClearWeapon && !refs.weapons.has(loot.allClearWeapon))
    err(`unknown allClearWeapon "${loot.allClearWeapon}"`);
  for (const d of loot.earlyDrops ?? []) {
    if (d.weapon && !refs.weapons.has(d.weapon))
      err(`unknown earlyDrops weapon "${d.weapon}"`);
    if (d.ability && !refs.abilities.has(d.ability))
      err(`unknown earlyDrops ability "${d.ability}"`);
  }
  const knownUnique = (id) => refs.uniques.has(id) || refs.worldUniques.has(id);
  for (const [rung, ids] of Object.entries(loot.worldUniques ?? {}))
    for (const id of ids ?? [])
      if (!knownUnique(id))
        err(`unknown world unique "${id}" (worldUniques.${rung})`);

  // ---- equipment / gates / doors / placed items -----------------------------
  const equip = (id) =>
    refs.weapons.has(id) || refs.gear.has(id) || refs.abilities.has(id);
  for (const g of def.gates ?? [])
    if (!refs.gear.has(g.opensWith))
      err(`gate "${g.id}" opensWith unknown gear "${g.opensWith}"`);
  for (const d of def.doors ?? [])
    if (!refs.doorKeys.has(d.id))
      err(`locked door "${d.id}" has no story-item key that unlocks it`);
  for (const it of def.placedItems ?? []) {
    if (it.kind === "story" && !refs.storyItems.has(it.defId))
      err(`placedItems story defId "${it.defId}" unknown`);
    if (it.kind === "equipment" && !equip(it.defId))
      err(`placedItems equipment defId "${it.defId}" unknown`);
  }
  for (const id of def.merchant?.stockUniques ?? [])
    if (!knownUnique(id)) err(`merchant stockUniques unknown unique "${id}"`);

  // ---- objective + geometry --------------------------------------------------
  if (def.objective && !OBJECTIVES.has(def.objective.type))
    err(`objective type "${def.objective.type}" not one of ${[...OBJECTIVES]}`);
  if (def.objective?.type === "reachExit" && !isVec(def.objective.at))
    err("reachExit objective needs an { at }");
  if (!inBounds(def.playerSpawn)) err("playerSpawn is off the map");

  // Tile zones + the new design zones must sit on the map.
  const rectOnMap = (r, where) => {
    if (!r) return;
    const off =
      r.x < 0 ||
      r.y < 0 ||
      r.x + r.width > def.width ||
      r.y + r.height > def.height;
    if (off) err(`${where} rect ${JSON.stringify(r)} runs off the map`);
  };
  for (const z of def.tiles?.zones ?? []) rectOnMap(z.rect, "tiles.zones");
  for (const z of def.safeZones ?? [])
    if (z.shape === "rect") rectOnMap(z.rect, "safeZones");
  for (const z of def.quietZones ?? [])
    if (z.shape === "rect") rectOnMap(z.rect, "quietZones");

  // ---- soft checks -----------------------------------------------------------
  if (!description || /^\s*TODO/i.test(description))
    warnings.push(`${tag}: missing or placeholder description`);

  return { errors, warnings };
}
