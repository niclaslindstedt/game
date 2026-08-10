// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level schema validator (see the `level-design` skill). Mirrors
// `sprite-schema.mjs`: `validateLevel(def, refs)` returns `{ errors, warnings }`
// — hard errors (unknown enemy/weapon/gear/thought/story id, band out of
// [0,1], zone rect off the map, a locked door with no key) FAIL the build; soft
// issues (a missing/placeholder description) only warn. `refs` is the set of
// live def ids the generator harvests from the engine catalogs, so a typo in a
// YAML level surfaces at `npm run levels`, not at runtime.

/**
 * Fields every MISSION must declare (a missing one is a hard error).
 *
 * The geometry is deliberately absent: a mission is not a map, and every
 * positional field is carved per run from `content/maps/<id>.yaml` (the level
 * loader refuses one that authors any of them by name). What a CARVE
 * additionally owes is {@link CARVED_FIELDS}, checked when the caller says it
 * is looking at one.
 */
export const REQUIRED_FIELDS = [
  "id",
  "index",
  "name",
  "gravity",
  "biome",
  "foes",
  "tiles",
  "objective",
  "decorClearance",
  "intro",
  "loot",
  // HARD-CODED per-difficulty mob levels (easy/medium/hard/nightmare); JESUS
  // stays player-relative. Required on every level — a spawner may override it.
  "mobLevels",
];

/**
 * What a CARVED level owes on top of the mission's own fields — checked with
 * `validateLevel(def, refs, description, { carved: true })`.
 *
 * The generator emits a `LevelDef` and the rest of the engine cannot tell where
 * one came from, so it has no business emitting one a human would not have been
 * allowed to commit back when humans drew maps.
 */
export const CARVED_FIELDS = [
  "width",
  "height",
  "playerSpawn",
  "landmarks",
  "spawns",
  "obstacles",
  "decor",
];

const OBJECTIVES = new Set(["killBoss", "clearAll", "reachExit", "hub"]);

/**
 * The SKIES a venue may stand under (the engine's `SkyKind`, `engine/game/
 * daylight.ts`) — a level naming one has its light follow the clock.
 *
 * Spelled out here rather than harvested from the engine like the enemy and
 * item ids: `daylight.ts` reaches the level registry, which imports the very
 * file this compile is about to write, and a bootstrap cycle is a worse price
 * than a two-word list kept in step with the union it mirrors.
 */
const SKIES = new Set(["earth"]);

/** What `placeThoughts[].where` may say — the engine's `PlaceThoughtWhere`. */
const PLACE_THOUGHT_WHERE = new Set(["arrival", "pastDoor"]);

/**
 * The one door id with no key behind it — the engine's `ENTRANCE_DOOR`
 * (engine/game/arrivals.ts), hung by the carve across every opening off an
 * `arrivals` district. Spelled out here for the same reason the skies are: this
 * file is tooling the compile runs BEFORE the engine catalogs exist.
 */
const ENTRANCE_DOOR = "entrance";

const isVec = (v) => v && typeof v.x === "number" && typeof v.y === "number";

/**
 * Validate one LevelDef against the engine's live id catalogs.
 *
 * @param {object} def   the pure LevelDef (authoring keys already stripped)
 * @param {object} refs  `{ enemies, weapons, gear, abilities, thoughts,
 *                          storyItems, uniques, worldUniques, doorKeys,
 *                          cutscenes, music }` — each a Set<string> of live ids
 *                          (doorKeys = every story item's `unlocks` value).
 * @param {string} [description] the authoring description, for the warning.
 * @param {{ carved?: boolean }} [options] `carved` → this def is a CARVED map
 *        rather than an authored mission, so the geometry is required and every
 *        position is checked against it.
 */
export function validateLevel(def, refs, description = "", options = {}) {
  const errors = [];
  const warnings = [];
  const carved = options.carved === true;
  const tag = def?.id ? `level "${def.id}"` : "level";
  const err = (m) => errors.push(`${tag}: ${m}`);

  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined) err(`missing required field "${field}"`);
  }
  if (carved)
    for (const field of CARVED_FIELDS) {
      if (def[field] === undefined) err(`carve emitted no "${field}"`);
    }
  if (def.width !== undefined && (def.width <= 0 || def.height <= 0))
    err("width/height must be positive");
  // A `music` id nobody ships is the quietest bug in the level format: the
  // player silently falls back to the default theme, so the venue plays the
  // moon's music and reads as a decision rather than a typo.
  if (def.music !== undefined && refs.music && !refs.music.has(def.music)) {
    err(`unknown music "${def.music}" — no such track (see content/music/)`);
  }
  // A mission has no map to be off, so a bounds check is only meaningful on a
  // carve — every position on one belongs to the carve that put it there.
  const inBounds = (v) =>
    def.width === undefined ||
    (isVec(v) && v.x >= 0 && v.x <= def.width && v.y >= 0 && v.y <= def.height);

  // ---- hard-coded per-difficulty mob levels / hp ----------------------------
  // A LEVEL BAND is one difficulty's authored mob level: an exact level (>=1) or
  // a rolled [min,max] range. A tuple is four of them (easy/medium/hard/
  // nightmare); JESUS is deliberately absent (it stays player-relative).
  const isBand = (b) =>
    (typeof b === "number" && b >= 1) ||
    (Array.isArray(b) &&
      b.length === 2 &&
      b.every((n) => typeof n === "number" && n >= 1) &&
      b[0] <= b[1]);
  const validMobLevels = (spec, where) => {
    if (!Array.isArray(spec) || spec.length !== 4) {
      err(
        `${where} mobLevels must be 4 entries [easy, medium, hard, nightmare]`,
      );
      return;
    }
    spec.forEach((b, i) => {
      if (!isBand(b))
        err(
          `${where} mobLevels[${i}] must be a level >=1 or a [min,max] range`,
        );
    });
  };
  const validHp = (spec, where) => {
    if (!Array.isArray(spec) || spec.length !== 4) {
      err(`${where} hp must be 4 entries [easy, medium, hard, nightmare]`);
      return;
    }
    spec.forEach((n, i) => {
      if (typeof n !== "number" || n < 1)
        err(`${where} hp[${i}] must be a positive number`);
    });
  };
  if (def.mobLevels !== undefined) validMobLevels(def.mobLevels, "level");
  // Optional design-intent anchor: the intended hero level per difficulty.
  if (def.intendedLevel !== undefined) {
    if (
      !Array.isArray(def.intendedLevel) ||
      def.intendedLevel.length !== 4 ||
      def.intendedLevel.some((n) => typeof n !== "number" || n < 1)
    )
      err(
        "intendedLevel must be 4 positive numbers [easy, medium, hard, nightmare]",
      );
  }

  // ---- enemy references -----------------------------------------------------
  const enemy = (id, where) => {
    if (id !== undefined && !refs.enemies.has(id))
      err(`unknown enemy "${id}" in ${where}`);
  };
  // Known spawn-point ids — referenced by spawner chains (`after`) and by
  // pinned spawns' alarm links (`alarms`).
  const spawnerIds = new Set(
    (def.spawners ?? []).map((s) => s.id).filter(Boolean),
  );
  for (const s of def.spawns ?? []) {
    enemy(s.enemy, "spawns");
    // Pinned-only fields: a PATROL route must be in-bounds vecs, an ALARM
    // link must name a spawn point that exists.
    if (s.patrol !== undefined) {
      if (!Array.isArray(s.patrol) || s.patrol.length === 0)
        err(
          `pinned spawn "${s.enemy}" patrol must be a non-empty waypoint list`,
        );
      else
        for (const p of s.patrol) {
          if (!isVec(p))
            err(`pinned spawn "${s.enemy}" patrol waypoint is not an { x, y }`);
          else if (!inBounds(p))
            err(
              `pinned spawn "${s.enemy}" patrol waypoint ${JSON.stringify(p)} is off the map`,
            );
        }
      if (!("at" in s) || !isVec(s.at))
        err(`patrol route on "${s.enemy}" needs a pinned { at } spawn`);
    }
    if (s.alarms !== undefined && !spawnerIds.has(s.alarms))
      err(`pinned spawn "${s.enemy}" alarms unknown spawner id "${s.alarms}"`);
    if ("band" in s) {
      // Bands are fractions of the spawn→objective distance; the far edge may
      // exceed 1 (spawns placed beyond the objective), so only floor + order
      // are hard rules.
      const [lo, hi] = s.band ?? [];
      if (!(lo >= 0 && lo <= hi))
        err(`spawn band ${JSON.stringify(s.band)} must have 0<=lo<=hi`);
    } else if (!isVec(s.at)) {
      err(`pinned spawn for "${s.enemy}" needs an { at } position`);
    } else if ((refs.enemyRoles?.get(s.enemy) ?? "elite") === "minion") {
      // A pinned MINION needs no authored numbers: a plain stationed worker
      // takes the map's default mob band and ordinary minion hp scaling.
      // A pinned unique guardian may still author both (validated if given).
      if (s.level !== undefined)
        validMobLevels(s.level, `pinned spawn "${s.enemy}"`);
      if (s.hp !== undefined) validHp(s.hp, `pinned spawn "${s.enemy}"`);
    } else {
      // A PINNED elite/boss/guardian hard-codes its level + base hp per
      // difficulty (JESUS stays relative). Both are required. (When the
      // caller passes no role catalog, every pinned spawn is held to this —
      // the safe default.)
      if (s.level === undefined)
        err(`pinned spawn "${s.enemy}" needs a per-difficulty "level"`);
      else validMobLevels(s.level, `pinned spawn "${s.enemy}"`);
      if (s.hp === undefined)
        err(`pinned spawn "${s.enemy}" needs a per-difficulty "hp"`);
      else validHp(s.hp, `pinned spawn "${s.enemy}"`);
    }
  }
  for (const p of def.packs ?? []) {
    if (!isVec(p.at)) err("pack needs an { at } position");
    for (const m of p.members ?? []) enemy(m.enemy, "pack");
  }
  // Spawn points: each on the map, every member resolves, and a chain `after`
  // must name a spawner that actually exists (`spawnerIds`, hoisted above the
  // spawns loop so alarm links share it).
  for (const s of def.spawners ?? []) {
    if (!isVec(s.at)) err("spawner needs an { at } position");
    else if (!inBounds(s.at))
      err(`spawner at ${JSON.stringify(s.at)} is off the map`);
    for (const m of s.members ?? []) enemy(m.enemy, "spawner");
    if (s.mobLevels !== undefined)
      validMobLevels(s.mobLevels, `spawner${s.id ? ` "${s.id}"` : ""}`);
    if (s.after !== undefined && !spawnerIds.has(s.after))
      err(`spawner chains after unknown spawner id "${s.after}"`);
    if (
      s.maxAlive !== undefined &&
      (typeof s.maxAlive !== "number" || s.maxAlive < 1)
    )
      err(`spawner maxAlive must be a positive number`);
    if (s.lingering !== undefined) {
      const total = (s.members ?? []).reduce((n, m) => n + (m.count ?? 0), 0);
      if (typeof s.lingering !== "number" || s.lingering < 0)
        err(`spawner lingering must be a non-negative number`);
      else if (s.lingering > total)
        err(
          `spawner lingering (${s.lingering}) exceeds its member total (${total})`,
        );
    }
  }
  for (const b of def.waves?.budget ?? []) enemy(b.enemy, "wave budget");
  for (const id of def.rareSpawns?.rare ?? []) enemy(id, "rareSpawns.rare");
  for (const id of def.rareSpawns?.unique ?? []) enemy(id, "rareSpawns.unique");
  if (def.openingStrike) {
    enemy(def.openingStrike.enemy, "openingStrike");
    if (carved && !isVec(def.openingStrike.at))
      err("openingStrike needs an { at }");
  }
  // THE STAFF LOT (see `ArrivalsSpec`). Everything positional about it is the
  // carve's — which district the cars roll onto, where the entrance landed — so
  // what a mission can get wrong here is the CAST and the CLOCK, and both are
  // silent failures: an empty `staff` list is a car nobody gets out of, and a
  // door that no arrival ever reaches is a mission that cannot be started.
  if (def.arrivals) {
    const a = def.arrivals;
    if (!Array.isArray(a.staff) || a.staff.length === 0)
      err("arrivals needs a non-empty `staff` list — somebody has to get out");
    for (const id of a.staff ?? []) enemy(id, "arrivals.staff");
    if (a.guards) {
      enemy(a.guards.enemy, "arrivals.guards");
      if (!Number.isInteger(a.guards.count) || a.guards.count < 0)
        err("arrivals.guards.count must be a whole number of people");
    }
    if (
      !Array.isArray(a.everyMs) ||
      a.everyMs.length !== 2 ||
      !(a.everyMs[0] > 0) ||
      a.everyMs[1] < a.everyMs[0]
    ) {
      err("arrivals.everyMs must be an ascending [min, max] pair of ms");
    }
    if (a.firstMs !== undefined && !(a.firstMs >= 0))
      err("arrivals.firstMs must be a non-negative number of ms");
    if (
      a.maxCars !== undefined &&
      (!Number.isInteger(a.maxCars) || a.maxCars < 1)
    )
      err("arrivals.maxCars must be at least 1 — the rank needs a bay in it");
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
  // PLACE-pinned beats: a thought pinned to being somewhere rather than to a
  // mob. `where` is a closed vocabulary the ENGINE answers (see
  // `PlaceThoughtWhere`), so an unknown word here would be a beat that silently
  // never fires — the exact failure a schema exists to turn into a build error.
  //
  // What is NOT checked here, deliberately: whether a `pastDoor` beat has a door
  // to be past. A mission carries no geometry — the roll-up is a `type: door`
  // object on the blueprint the floor plan is CARVED from — so a mission simply
  // cannot see whether its venue hangs an approach door, and a check that
  // guessed would fail the one level that actually does.
  for (const t of def.placeThoughts ?? []) {
    thought(t.thought, "placeThoughts");
    thought(t.after, "placeThoughts.after");
    if (!PLACE_THOUGHT_WHERE.has(t.where)) {
      err(
        `placeThoughts "${t.thought}" has unknown where "${t.where}" ` +
          `(expected ${[...PLACE_THOUGHT_WHERE].join(" | ")})`,
      );
    }
  }
  thought(def.arrivals?.thought, "arrivals");
  if (def.openingStrike) {
    thought(def.openingStrike.thought, "openingStrike");
    thought(def.openingStrike.after, "openingStrike.after");
    // The blows he takes before he answers one. Each names a beat, so a typo
    // here would otherwise be a scene that silently never plays — the hero
    // standing there holstered while the ledger waits on a thought that does
    // not exist.
    const warnings = def.openingStrike.warnings;
    if (warnings !== undefined) {
      if (!Array.isArray(warnings) || warnings.length === 0) {
        err("openingStrike.warnings must be a non-empty list of thought ids");
      } else {
        warnings.forEach((id, i) =>
          thought(id, `openingStrike.warnings[${i}]`),
        );
        if (warnings.includes(def.openingStrike.thought)) {
          err(
            "openingStrike.warnings names the arming thought — the beat it " +
              "gates on would be read before the blow that draws the weapon",
          );
        }
        if (new Set(warnings).size !== warnings.length) {
          err(
            "openingStrike.warnings repeats a thought — the ledger is the " +
              "counter, so a repeat is a blow that plays nothing",
          );
        }
      }
    }
  }
  thought(def.asteroids?.struckThought, "asteroids.struckThought");
  thought(def.sandstorms?.struckThought, "sandstorms.struckThought");

  // ---- the prelude chain -----------------------------------------------------
  // A scene id that resolves to nothing used to throw out of `cutsceneDef` at
  // the moment the venue opened — the worst place to learn about a typo, and
  // invisible to every test that does not actually start that level. `refs` may
  // omit the catalog (an older caller), in which case the check is skipped
  // rather than failing every level.
  // `farewell` is the same chain at the other end of the run — the level's
  // send-off, played when the objective falls — and is checked identically.
  for (const field of ["prelude", "farewell"]) {
    const chain = def[field];
    const scenes =
      chain === undefined ? [] : Array.isArray(chain) ? chain : [chain];
    for (const id of scenes) {
      if (typeof id !== "string") err(`${field} must name cutscenes by id`);
      else if (refs.cutscenes && !refs.cutscenes.has(id))
        err(`unknown cutscene "${id}" in ${field}`);
    }
  }

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
    if (d.gear && !refs.gear.has(d.gear))
      err(`unknown earlyDrops gear "${d.gear}"`);
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
  // Travel doors: id + name + at least one destination, every destination a
  // real level and never this one (a door home from home is a no-op that
  // reads like a bug). The id must match a blueprint landmark object — that
  // half is positional and is asserted by the content tests, not here.
  {
    const doorIds = new Set();
    for (const d of def.travelDoors ?? []) {
      if (typeof d.id !== "string" || d.id.length === 0)
        err("travelDoors entry needs an id");
      else if (doorIds.has(d.id)) err(`travelDoors repeats id "${d.id}"`);
      else doorIds.add(d.id);
      if (typeof d.name !== "string" || d.name.length === 0)
        err(`travel door "${d.id}" needs a name (the picker's heading)`);
      const to = Array.isArray(d.to) ? d.to : [];
      if (to.length === 0)
        err(`travel door "${d.id}" needs at least one destination`);
      for (const dest of to) {
        if (dest === def.id)
          err(`travel door "${d.id}" leads to its own level`);
        else if (refs.levels && !refs.levels.has(dest))
          err(`travel door "${d.id}" leads to unknown level "${dest}"`);
      }
      if (d.requires !== undefined && !refs.storyItems.has(d.requires))
        err(
          `travel door "${d.id}" requires unknown story item "${d.requires}"`,
        );
      // The line he says when the door can take him nowhere yet. A typo here
      // would be a tap that silently does nothing at all — the picker is
      // withheld precisely BECAUSE there is a line to play instead.
      if (d.unready !== undefined && !refs.thoughts.has(d.unready))
        err(`travel door "${d.id}" names unknown thought "${d.unready}"`);
      if (d.reached !== undefined && typeof d.reached !== "boolean")
        err(`travel door "${d.id}" reached must be a boolean`);
      if (d.direct !== undefined && typeof d.direct !== "boolean")
        err(`travel door "${d.id}" direct must be a boolean`);
      // "SET DESTINATION" HAS TO MEAN ONE. A `direct` door skips the picker and
      // takes its single road, so a second entry in `to` would be a place the
      // player could never reach and would never be told about.
      if (d.direct && to.length !== 1)
        err(
          `travel door "${d.id}" is direct and must name exactly one destination (has ${to.length})`,
        );
      // The two are opposites: `reached` exists to put a question, `direct`
      // exists to skip one.
      if (d.direct && d.reached)
        err(`travel door "${d.id}" cannot be both direct and reached`);
    }
  }
  if (def.riftExit !== undefined && typeof def.riftExit !== "boolean")
    err("riftExit must be a boolean");
  // THE VENUE WHOSE WAY OUT IS THE CAR (`LevelDef.exitByCar`). Two things it
  // cannot be authored without, and both are silent failures rather than loud
  // ones: with no `car` travel door there is no destination for the trip home,
  // so the countdown falls back to the ordinary splash the field exists to
  // remove; and with no line the objective clears onto a swept floor with
  // nothing at all telling the player the run is still going.
  if (def.exitByCar !== undefined) {
    if (typeof def.exitByCar !== "object" || Array.isArray(def.exitByCar)) {
      err("exitByCar must be a mapping");
    } else {
      const thought = def.exitByCar.thought;
      if (thought === undefined) err("exitByCar needs a thought");
      else if (!refs.thoughts.has(thought))
        err(`exitByCar names unknown thought "${thought}"`);
      if (!(def.travelDoors ?? []).some((d) => d?.id === "car"))
        err('exitByCar needs a travel door with id "car" to drive out to');
    }
  }
  if (
    def.merchant?.parked !== undefined &&
    typeof def.merchant.parked !== "boolean"
  )
    err("merchant.parked must be a boolean");
  if (
    def.merchant?.beat !== undefined &&
    typeof def.merchant.beat !== "boolean"
  )
    err("merchant.beat must be a boolean");
  // The two RESIDENT postings are alternatives, not layers: one stands at a
  // counter and never moves, the other never stops moving. Asking for both
  // silently picks whichever guard the step pass reads first.
  if (def.merchant?.parked === true && def.merchant?.beat === true)
    err("merchant cannot be both parked and on a beat — pick one");
  if (def.merchant?.line !== undefined && typeof def.merchant.line !== "string")
    err("merchant.line must be a string");
  for (const d of def.doors ?? []) {
    // An APPROACH door (the garage door) opens on proximity — no key exists
    // for it, by design. Every KEY door still owes a story item.
    if (d.opens === "approach") continue;
    // …and so does THE ENTRANCE, for the opposite reason: it is a keyed door
    // that DELIBERATELY has no key, because the only thing that opens it is a
    // member of staff badging in (`arrivals`, engine/game/arrivals.ts). A story
    // item for it would hand the hero a way past the whole beat.
    if (d.id === ENTRANCE_DOOR) continue;
    if (!refs.doorKeys.has(d.id))
      err(`locked door "${d.id}" has no story-item key that unlocks it`);
  }
  for (const it of def.placedItems ?? []) {
    if (it.kind === "story" && !refs.storyItems.has(it.defId))
      err(`placedItems story defId "${it.defId}" unknown`);
    if (it.kind === "equipment" && !equip(it.defId))
      err(`placedItems equipment defId "${it.defId}" unknown`);
  }
  for (const id of def.merchant?.stockUniques ?? [])
    if (!knownUnique(id)) err(`merchant stockUniques unknown unique "${id}"`);

  // ---- objective + geometry --------------------------------------------------
  // THE SKY — misspell it and the venue simply never gets dark, which is the
  // kind of silence a schema exists to break.
  if (def.sky !== undefined && !SKIES.has(def.sky))
    err(`sky "${def.sky}" not one of ${[...SKIES].join(" | ")}`);
  if (def.objective && !OBJECTIVES.has(def.objective.type))
    err(`objective type "${def.objective.type}" not one of ${[...OBJECTIVES]}`);
  if (carved && def.objective?.type === "reachExit" && !isVec(def.objective.at))
    err("reachExit objective needs an { at }");
  if (def.playerSpawn !== undefined && !inBounds(def.playerSpawn))
    err("playerSpawn is off the map");

  // The intended-path waypoints (navigation aid) must sit on the map.
  for (const p of def.path ?? []) {
    if (!isVec(p)) err(`path waypoint ${JSON.stringify(p)} is not a { x, y }`);
    else if (!inBounds(p))
      err(`path waypoint ${JSON.stringify(p)} is off the map`);
  }

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

  // Design zones: rect | circle, each on the map.
  const checkZone = (z, where) => {
    if (z.shape === "rect") rectOnMap(z.rect, where);
    else if (z.shape === "circle") {
      if (!isVec(z.pos) || typeof z.radius !== "number")
        err(`${where} circle needs { pos, radius }`);
      else if (!inBounds(z.pos)) err(`${where} circle center is off the map`);
    } else err(`${where} zone needs shape "rect" or "circle"`);
  };
  for (const z of def.safeZones ?? []) checkZone(z, "safeZones");
  for (const z of def.quietZones ?? []) checkZone(z, "quietZones");

  // Tempo curve: ascending `at` in [0,1], numeric intensity.
  let lastAt = -Infinity;
  for (const pt of def.tempo ?? []) {
    if (typeof pt.at !== "number" || pt.at < 0 || pt.at > 1)
      err(`tempo point at ${JSON.stringify(pt.at)} must be 0..1`);
    if (typeof pt.intensity !== "number")
      err(`tempo point intensity must be a number`);
    if (pt.at < lastAt) err(`tempo points must ascend by "at"`);
    lastAt = pt.at;
  }

  // Obstacle loot profiles: a chance-based spill (`loot`) only makes sense on
  // a breakable, its chance must be a probability, and its themed drop weights
  // must be non-negative with at least one way to pay.
  for (const o of def.obstacles ?? []) {
    if (o.loot === undefined) continue;
    const where = `obstacle "${o.kind}"`;
    if (!o.breakable) err(`${where} has loot but is not breakable`);
    if (
      o.loot.chance !== undefined &&
      !(
        typeof o.loot.chance === "number" &&
        o.loot.chance >= 0 &&
        o.loot.chance <= 1
      )
    )
      err(`${where} loot.chance must be a number in [0,1]`);
    if (o.loot.drop !== undefined) {
      const weights = Object.values(o.loot.drop);
      if (weights.some((w) => typeof w !== "number" || w < 0))
        err(`${where} loot.drop weights must be non-negative numbers`);
      else if (!weights.some((w) => w > 0))
        err(`${where} loot.drop needs at least one positive weight`);
    }
  }

  // Chests + merchant spawn points must sit on the map.
  for (const c of def.chests ?? [])
    if (!inBounds(c.at)) err(`chest at ${JSON.stringify(c.at)} is off the map`);
  for (const p of def.merchantSpawns ?? [])
    if (!inBounds(p)) err(`merchantSpawn ${JSON.stringify(p)} is off the map`);

  // ---- soft checks -----------------------------------------------------------
  if (!description || /^\s*TODO/i.test(description))
    warnings.push(`${tag}: missing or placeholder description`);

  // ---- the canopy (see LevelDef.canopy) -------------------------------------
  // Purely presentational, but a typo here is invisible until somebody looks at
  // the level: a bad sprite name simply draws nothing, and the layer that was
  // supposed to give the place depth is quietly absent.
  for (const [i, line] of (def.canopy ?? []).entries()) {
    const where = `canopy[${i}]`;
    if (typeof line.kind !== "string" || line.kind.length === 0)
      err(`${where} needs a kind`);
    if (!Number.isInteger(line.count) || line.count < 1)
      err(`${where} count must be an integer >= 1`);
    for (const [key, lo, hi] of [
      ["parallax", 0.1, 4],
      ["blur", 0, 12],
      ["alpha", 0.01, 1],
    ]) {
      const v = line[key];
      if (v === undefined) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
        err(`${where} ${key} must be a number in [${lo}, ${hi}]`);
    }
    for (const key of ["drift", "scale"]) {
      const v = line[key];
      if (v === undefined) continue;
      if (
        !Array.isArray(v) ||
        v.length !== 2 ||
        v.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0) ||
        v[0] > v[1]
      )
        err(`${where} ${key} must be [min, max] non-negative numbers`);
    }
    // A canopy over the whole field, opaque, is a blindfold.
    if ((line.alpha ?? 0.55) > 0.75)
      warnings.push(
        `${tag}: ${where} alpha ${line.alpha} is heavy — the canopy sits between ` +
          `the player and the horde`,
      );
  }

  // ---- the fauna (see LevelDef.fauna) ---------------------------------------
  // Same reasoning as the canopy: a typo draws nothing at all, and an empty
  // range or a zero speed produces a herd of statues, which is worse than no
  // herd — a still cow reads as a bad sprite rather than as scenery.
  for (const [i, line] of (def.fauna ?? []).entries()) {
    const where = `fauna[${i}]`;
    if (typeof line.kind !== "string" || line.kind.length === 0)
      err(`${where} needs a kind`);
    if (!Number.isInteger(line.count) || line.count < 1)
      err(`${where} count must be an integer >= 1`);
    for (const key of ["range", "speed", "scale"]) {
      const v = line[key];
      if (v === undefined) continue;
      if (
        !Array.isArray(v) ||
        v.length !== 2 ||
        v.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0) ||
        v[0] > v[1]
      )
        err(`${where} ${key} must be [min, max] non-negative numbers`);
    }
    if (line.speed && line.speed[1] === 0)
      err(`${where} speed tops out at 0 — a critter that never moves is decor`);
  }

  // ---- the elevators (see LevelDef.elevators) -------------------------------
  // The pad is a mission-critical link on a generated map — it is the only way
  // to the boss — so unlike the two decorative layers above, everything here is
  // an ERROR. A lift whose car lands outside the level, or two pads sharing an
  // id, is a run that cannot be finished.
  const elevatorIds = new Set();
  for (const [i, lift] of (def.elevators ?? []).entries()) {
    const where = `elevators[${i}]`;
    if (typeof lift.id !== "string" || lift.id.length === 0)
      err(`${where} needs an id`);
    else if (elevatorIds.has(lift.id))
      err(`${where} duplicate id "${lift.id}"`);
    else elevatorIds.add(lift.id);
    for (const key of ["pos", "to"]) {
      const p = lift[key];
      if (
        !p ||
        typeof p.x !== "number" ||
        typeof p.y !== "number" ||
        p.x < 0 ||
        p.y < 0 ||
        (def.width !== undefined && p.x > def.width) ||
        (def.height !== undefined && p.y > def.height)
      )
        err(`${where} ${key} must be a point inside the level`);
    }
    if (
      lift.radius !== undefined &&
      (typeof lift.radius !== "number" || lift.radius <= 0)
    )
      err(`${where} radius must be a positive number`);
  }

  return { errors, warnings };
}
