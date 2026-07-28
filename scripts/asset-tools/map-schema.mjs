// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP BLUEPRINT schema validator — the "v2" level format's gate.
// `validateMap(bp, refs)` returns `{ errors, warnings }`: hard errors (an
// unknown enemy or level id, a sprite the atlas does not carry, a region name
// nobody can parse, an object field that belongs to a different purpose) FAIL
// the build; soft issues only warn. Mirrors `level-schema.mjs`.
//
// The compass-region grammar is NOT re-implemented here: the generator hands in
// the engine's own `parseRegion` (`src/game/mapgen/regions.ts`) through `refs`,
// so a name this validator accepts is exactly a name the runtime can resolve.
//
// A blueprint is far easier to get subtly wrong than a hand-authored level,
// because nothing about it is visible until a run carves it: a typo'd wall
// material yields a map with no walls, a boss region that parses to a corner
// with no chambers silently relocates the boss, a density of 400 buries the
// floor in rock. So the checks here are deliberately strict — the purpose-typed
// object palette is validated field by field against its own type, and anything
// that reads as a copy-paste from another purpose is rejected rather than
// ignored.

/** Fields every blueprint must declare. */
export const REQUIRED_FIELDS = [
  "id",
  "level",
  "sizes",
  "areas",
  "layout",
  "objects",
  "horde",
];

const ENCLOSURES = new Set(["none", "soft", "hard"]);

const SIZE_NAMES = ["small", "medium", "large"];

const OBJECT_TYPES = new Set([
  "wall",
  "obstacle",
  "cover",
  "crate",
  "chest",
  "decor",
  "landmark",
  "building",
]);

// Which extra fields each purpose is allowed to carry. `id`/`type`/`kind`/
// `sprite` are universal; everything else must be justified by the type, so a
// `decor` entry cannot quietly carry a `radius` nothing reads or a `chest` a
// density that places nothing.
const ALLOWED_FIELDS = {
  wall: ["radius", "jumpable", "sprites", "wander"],
  obstacle: [
    "radius",
    "density",
    "jumpable",
    "rockSizes",
    "cell",
    "loot",
    "areas",
  ],
  cover: ["radius", "density", "jumpable", "areas"],
  crate: ["radius", "density", "jumpable", "loot", "areas"],
  chest: [],
  decor: ["density", "areas"],
  landmark: ["at", "anchor"],
  building: ["density", "w", "h", "jumpable", "areas"],
};

// Purposes that may be restricted to a district. A `wall`, `chest` or `landmark`
// is placed by rule, not scattered, so an `areas` list on one would read as a
// restriction that is silently ignored.
const DISTRICTABLE = new Set(["obstacle", "cover", "crate", "decor", "building"]);

// Purposes whose placement count comes from a density — one is required, or the
// palette entry would compile to a line that places nothing.
const NEEDS_DENSITY = new Set(["obstacle", "cover", "crate", "decor", "building"]);

const ANCHORS = new Set(["spawn", "goal"]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPosNum = (v) => isNum(v) && v > 0;

/**
 * Validate one map blueprint against the engine's live id catalogs.
 *
 * @param {object} bp    the raw blueprint document (authoring keys included)
 * @param {object} refs  `{ enemies, levels, sprites, ramps, parseRegion }` —
 *                       the first four Set<string> of live ids (`ramps` from
 *                       ladder.yaml), `parseRegion` the engine's own region
 *                       parser so this gate accepts exactly what runs
 * @param {string} [description] the authoring description, for the warning
 */
export function validateMap(bp, refs, description = "") {
  const errors = [];
  const warnings = [];
  const tag = bp?.id ? `map "${bp.id}"` : "map";
  const err = (m) => errors.push(`${tag}: ${m}`);

  for (const field of REQUIRED_FIELDS) {
    if (bp[field] === undefined) err(`missing required field "${field}"`);
  }
  if (!description || description.trim().length < 40)
    warnings.push(`${tag}: description is missing or too short to be useful`);

  if (bp.level !== undefined && !refs.levels.has(bp.level))
    err(`inherits from unknown level "${bp.level}"`);

  const enemy = (id, where) => {
    if (id === undefined) {
      err(`missing enemy id in ${where}`);
      return;
    }
    if (!refs.enemies.has(id)) err(`unknown enemy "${id}" in ${where}`);
  };
  const ramp = (name, where) => {
    if (name === undefined) {
      err(`${where} needs a ramp`);
      return;
    }
    if (!refs.ramps.has(name)) err(`unknown ramp "${name}" in ${where}`);
  };
  const sprite = (name, where) => {
    if (name !== undefined && refs.sprites.size > 0 && !refs.sprites.has(name))
      err(`unknown sprite "${name}" in ${where}`);
  };
  const region = (name, where) => {
    try {
      refs.parseRegion(name);
    } catch (e) {
      err(`${where}: ${e.message}`);
    }
  };

  // ---- sizes ---------------------------------------------------------------
  if (bp.sizes !== undefined) {
    for (const name of SIZE_NAMES) {
      const spec = bp.sizes[name];
      if (!spec) {
        err(`sizes.${name} is missing — all three sizes must be priced`);
        continue;
      }
      if (!isPosNum(spec.width) || !isPosNum(spec.height))
        err(`sizes.${name} needs positive width/height`);
      if (!Number.isInteger(spec.rooms) || spec.rooms < 4)
        err(`sizes.${name}.rooms must be an integer >= 4`);
      const min = bp.layout?.minRoom;
      // A size that cannot fit the chambers it asks for silently carves fewer,
      // which reads as "LARGE is the same as MEDIUM" — a confusing bug to chase.
      if (isPosNum(min) && isPosNum(spec.width) && isPosNum(spec.height)) {
        const capacity = Math.floor(spec.width / min) * Math.floor(spec.height / min);
        if (capacity < spec.rooms)
          err(
            `sizes.${name} asks for ${spec.rooms} chambers but ${spec.width}x${spec.height} ` +
              `fits at most ~${capacity} at minRoom ${min}`,
          );
      }
    }
    for (let i = 1; i < SIZE_NAMES.length; i++) {
      const prev = bp.sizes[SIZE_NAMES[i - 1]];
      const cur = bp.sizes[SIZE_NAMES[i]];
      if (!prev || !cur) continue;
      if (cur.width * cur.height <= prev.width * prev.height)
        err(
          `sizes.${SIZE_NAMES[i]} is no bigger than sizes.${SIZE_NAMES[i - 1]} — ` +
            `the three sizes must climb`,
        );
    }
  }

  // ---- layout --------------------------------------------------------------
  const layout = bp.layout;
  if (layout !== undefined) {
    if (!isPosNum(layout.minRoom)) err("layout.minRoom must be positive");
    if (!isPosNum(layout.doorWidth)) err("layout.doorWidth must be positive");
    // A doorway needs an opening plus half of one at each end of the border it
    // is punched through (see `carveChambers`), so a door wider than half a
    // chamber can never be placed and the grid seals itself.
    if (isPosNum(layout.minRoom) && isPosNum(layout.doorWidth)) {
      if (layout.doorWidth * 2 > layout.minRoom)
        err(
          `layout.doorWidth ${layout.doorWidth} is too wide for minRoom ` +
            `${layout.minRoom} — a doorway plus its end margins must fit a chamber border`,
        );
      // Narrow doorways plug: the scatter pass keeps furniture clear of walls
      // but not of openings, so a rock can land in a thin gap.
      if (layout.doorWidth < 160)
        warnings.push(
          `${tag}: layout.doorWidth ${layout.doorWidth} is narrow — scattered ` +
            `obstacles may plug it`,
        );
    }
    if (!isNum(layout.loopDoors) || layout.loopDoors < 0 || layout.loopDoors > 1)
      err("layout.loopDoors must be a fraction in [0, 1]");
    if (!isNum(layout.cluster) || layout.cluster < 0 || layout.cluster > 1)
      err("layout.cluster must be a fraction in [0, 1]");
    if (typeof layout.wall !== "string") err("layout.wall must name a wall object");
  }

  // ---- areas ---------------------------------------------------------------
  // The area palette is what the whole map is made of: get it wrong and every
  // cell, wall, prop and role placement is wrong with it.
  const areaIds = new Set();
  const areaWalls = [];
  const areaNests = [];
  if (Array.isArray(bp.areas)) {
    if (bp.areas.length === 0) err("areas must name at least one kind of place");
    let enclosed = 0;
    let bossable = 0;
    let spawnable = 0;
    for (const a of bp.areas) {
      const where = `area "${a?.id ?? "?"}"`;
      if (typeof a?.id !== "string" || a.id.length === 0) {
        err(`${where}: needs a string id`);
        continue;
      }
      if (areaIds.has(a.id)) err(`duplicate area id "${a.id}"`);
      areaIds.add(a.id);
      if (!ENCLOSURES.has(a.enclosure))
        err(
          `${where}: enclosure must be one of ${[...ENCLOSURES].join(", ")}`,
        );
      if (a.enclosure !== "none") enclosed++;
      if (!isNum(a.weight) || a.weight < 0)
        err(`${where}: weight must be a non-negative number`);
      else if (a.weight === 0 && a.shellOf === undefined)
        err(`${where}: weight 0 means never seeded, which only makes sense for a shell`);
      if (a.horde !== undefined && (!isNum(a.horde) || a.horde < 0))
        err(`${where}: horde must be a non-negative multiplier`);
      if (a.boss !== undefined && typeof a.boss !== "boolean")
        err(`${where}: boss must be a boolean`);
      if (a.spawn !== undefined && typeof a.spawn !== "boolean")
        err(`${where}: spawn must be a boolean`);
      if (a.wall !== undefined) {
        if (typeof a.wall !== "string")
          err(`${where}: wall must name a wall object`);
        else if (a.enclosure === "none")
          // An open district never raises a barrier of its own, so a material on
          // one reads as an intent the generator will silently ignore.
          err(`${where}: enclosure "none" builds no walls, so a wall material does nothing`);
        else areaWalls.push([a.wall, where]);
      }
      // A shell owns no cells, so it can hold neither the boss nor the hero.
      if (a.boss !== false && !a.shellOf) bossable++;
      if (a.spawn !== false && !a.shellOf) spawnable++;
      const allowed = new Set([
        "id",
        "enclosure",
        "weight",
        "horde",
        "boss",
        "spawn",
        "label",
        "ground",
        "patch",
        "wall",
        "shellOf",
        "shellWidth",
        "apron",
      ]);
      for (const key of Object.keys(a))
        if (!allowed.has(key)) err(`${where}: unknown field "${key}"`);
      // The district's own floor (compiled into the level's `tiles.zones`). It is
      // what makes an area READ as an area, so a typo'd tile name here is a
      // district that silently looks like every other one.
      if (a.ground !== undefined) {
        sprite(a.ground.common, `${where} ground.common`);
        sprite(a.ground.rare, `${where} ground.rare`);
        if (!Number.isInteger(a.ground.rareEvery) || a.ground.rareEvery < 1)
          err(`${where}: ground.rareEvery must be an integer >= 1`);
      }
      if (a.shellOf !== undefined) {
        if (typeof a.shellOf !== "string")
          err(`${where}: shellOf must name an area`);
        else if (a.shellOf === a.id) err(`${where}: shellOf names itself`);
        else areaNests.push([a.shellOf, where]);
        if (a.shellWidth !== undefined && !isPosNum(a.shellWidth))
          err(`${where}: shellWidth must be positive`);
        // A shell is a band inside something else, so seeding it as a district of
        // its own would put loose rings of concrete out in the desert.
        if (a.weight !== 0)
          err(`${where}: a shell area must have weight 0 — it is never seeded on its own`);
      } else if (a.shellWidth !== undefined) {
        err(`${where}: shellWidth means nothing without shellOf`);
      }
      if (a.apron !== undefined) {
        if (!a.apron.ground) err(`${where}: apron needs a ground pair`);
        else {
          sprite(a.apron.ground.common, `${where} apron.common`);
          sprite(a.apron.ground.rare, `${where} apron.rare`);
          if (!Number.isInteger(a.apron.ground.rareEvery) || a.apron.ground.rareEvery < 1)
            err(`${where}: apron.ground.rareEvery must be an integer >= 1`);
        }
        if (a.apron.radius !== undefined && !isPosNum(a.apron.radius))
          err(`${where}: apron.radius must be positive`);
      }
      if (a.patch !== undefined) {
        if (a.ground === undefined)
          err(`${where}: a patch pair needs a ground pair to sit in`);
        sprite(a.patch.a, `${where} patch.a`);
        sprite(a.patch.b, `${where} patch.b`);
        if (!Number.isInteger(a.patch.every) || a.patch.every < 1)
          err(`${where}: patch.every must be an integer >= 1`);
      }
    }
    // A palette of nothing but open ground yields a map with no walls anywhere:
    // legal geometry, but no architecture and nothing to break a sightline.
    if (bp.areas.length > 0 && enclosed === 0)
      err("every area has enclosure \"none\" — the map would have no walls at all");
    if (bossable === 0) err("no area may hold the boss — set `boss: true`");
    if (spawnable === 0) err("no area may hold the hero — set `spawn: true`");
  } else if (bp.areas !== undefined) {
    err("areas must be a list");
  }

  // ---- objects -------------------------------------------------------------
  const ids = new Set();
  let walls = 0;
  if (Array.isArray(bp.objects)) {
    for (const o of bp.objects) {
      const where = `object "${o?.id ?? "?"}"`;
      if (typeof o?.id !== "string" || o.id.length === 0) {
        err(`${where}: needs a string id`);
        continue;
      }
      if (ids.has(o.id)) err(`duplicate object id "${o.id}"`);
      ids.add(o.id);
      if (!OBJECT_TYPES.has(o.type)) {
        err(`${where}: unknown type "${o.type}"`);
        continue;
      }
      if (o.type === "wall") walls++;
      if (o.sprites !== undefined) {
        if (!Array.isArray(o.sprites) || o.sprites.length === 0)
          err(`${where}: sprites must be a non-empty list`);
        else {
          for (const name of o.sprites) sprite(name, where);
          // One stone in the pool is the lattice this field exists to break.
          if (o.sprites.length < 2)
            warnings.push(
              `${tag}: ${where} sprites has a single entry — the chain will still repeat`,
            );
        }
      }
      if (o.wander !== undefined && (!isNum(o.wander) || o.wander < 0))
        err(`${where}: wander must be a non-negative distance`);
      // A sized rock has no base sprite of its own — the renderer blits the
      // per-footprint `<base>_<w>x<h>`, so that is what must be in the atlas.
      // A `chest` names no sprite at all: the engine draws every reward
      // container from its own art (`ChestSpec` carries a position and nothing
      // else), so the palette entry is purely the declaration that this map pays
      // its dead ends out.
      const base = o.sprite ?? o.kind ?? o.id;
      if (o.type === "chest") {
        // nothing to check
      } else if (Array.isArray(o.rockSizes)) {
        for (const size of o.rockSizes) {
          if (Array.isArray(size) && size.length === 2)
            sprite(`${base}_${size[0]}x${size[1]}`, where);
        }
      } else {
        sprite(base, where);
      }
      const allowed = new Set([
        "id",
        "type",
        "kind",
        "sprite",
        ...(ALLOWED_FIELDS[o.type] ?? []),
      ]);
      for (const key of Object.keys(o)) {
        if (!allowed.has(key))
          err(`${where}: field "${key}" means nothing to a "${o.type}" object`);
      }
      // `loot` is what makes a prop breakable (see buildObstacles), so it belongs
      // only on the two scattered purposes that can carry break hp.
      if (o.loot !== undefined && o.type !== "obstacle" && o.type !== "crate")
        err(`${where}: only an obstacle or a crate can carry a loot spill`);
      if (NEEDS_DENSITY.has(o.type) && !isPosNum(o.density))
        err(`${where}: a "${o.type}" needs a positive density`);
      if (isPosNum(o.density) && o.density > 200)
        warnings.push(
          `${tag}: ${where} density ${o.density} is very thick (>200 per 1M px²)`,
        );
      if (o.type === "building" && (!isPosNum(o.w) || !isPosNum(o.h)))
        err(`${where}: a building needs a positive w/h footprint`);
      if (o.type === "landmark") {
        if (!ANCHORS.has(o.at))
          err(`${where}: landmark "at" must be one of ${[...ANCHORS].join(", ")}`);
        if (o.anchor !== undefined && o.anchor !== "base" && o.anchor !== "center")
          err(`${where}: anchor must be "base" or "center"`);
      }
      if (o.areas !== undefined) {
        if (!DISTRICTABLE.has(o.type))
          err(`${where}: a "${o.type}" is placed by rule, so an areas list does nothing`);
        else if (!Array.isArray(o.areas) || o.areas.length === 0)
          err(`${where}: areas must be a non-empty list of area ids`);
        else
          for (const id of o.areas)
            if (!areaIds.has(id))
              err(`${where}: unknown area "${id}"`);
      }
      if (o.rockSizes !== undefined) {
        if (
          !Array.isArray(o.rockSizes) ||
          o.rockSizes.length === 0 ||
          o.rockSizes.some(
            (s) =>
              !Array.isArray(s) ||
              s.length !== 2 ||
              !s.every((n) => Number.isInteger(n) && n > 0),
          )
        )
          err(`${where}: rockSizes must be a non-empty list of [wCells, hCells]`);
      }
    }
  } else if (bp.objects !== undefined) {
    err("objects must be a list");
  }
  if (walls === 0) err("no `wall` object — the chambers would have no partitions");
  if (layout?.wall !== undefined && !ids.has(layout.wall))
    err(`layout.wall "${layout.wall}" is not in the object palette`);
  for (const [id, where] of areaWalls)
    if (!ids.has(id)) err(`${where}: wall "${id}" is not in the object palette`);
  for (const [id, where] of areaNests)
    if (!areaIds.has(id)) err(`${where}: shellOf names unknown area "${id}"`);
  if (!bp.objects?.some((o) => o.type === "chest"))
    warnings.push(`${tag}: no chest object — the dead ends pay nothing`);

  // ---- horde ---------------------------------------------------------------
  const horde = bp.horde;
  if (horde !== undefined) {
    if (
      !Array.isArray(horde.perRoom) ||
      horde.perRoom.length !== 2 ||
      !horde.perRoom.every(isPosNum) ||
      horde.perRoom[0] > horde.perRoom[1]
    )
      err("horde.perRoom must be [min, max] positive numbers");
    if (!isPosNum(horde.maxAlive)) err("horde.maxAlive must be positive");
    if (horde.lingering !== undefined && !isNum(horde.lingering))
      err("horde.lingering must be a number");
    if (!Array.isArray(horde.ramps) || horde.ramps.length === 0)
      err("horde.ramps must be a non-empty ladder of ramp names");
    else horde.ramps.forEach((r, i) => ramp(r, `horde.ramps[${i}]`));
    if (!Array.isArray(horde.members) || horde.members.length === 0)
      err("horde.members must be a non-empty list of breeds");
    else {
      let covered = false;
      for (const m of horde.members) {
        enemy(m?.enemy, "horde.members");
        const w = m?.window;
        if (
          !Array.isArray(w) ||
          w.length !== 2 ||
          !w.every((n) => isNum(n) && n >= 0 && n <= 1) ||
          w[0] > w[1]
        ) {
          err(`horde member "${m?.enemy}" needs a window [from, to] within [0, 1]`);
          continue;
        }
        if (m.weight !== undefined && !isPosNum(m.weight))
          err(`horde member "${m.enemy}" weight must be positive`);
        if (w[0] <= 0) covered = true;
      }
      // Depth 0 is the hero's own chamber; a horde whose first window opens
      // later leaves the opening rooms to the fallback breed, which is never
      // what an author meant.
      if (!covered)
        warnings.push(
          `${tag}: no horde member covers depth 0 — the opening chambers fall back`,
        );
    }
    if (horde.hellgates !== undefined) {
      if (!Number.isInteger(horde.hellgates) || horde.hellgates < 0)
        err("horde.hellgates must be a non-negative integer");
      if (horde.hellgates > 0 && !bp.hellborn)
        err("horde.hellgates is set but no `hellborn` mix is authored");
    }
  }

  // ---- set pieces ----------------------------------------------------------
  const setPiece = (piece, where) => {
    enemy(piece?.enemy, where);
    ramp(piece?.ramp, where);
    if (!isPosNum(piece?.hp)) err(`${where} needs a single positive base hp`);
    for (const guard of piece?.escort ?? []) {
      enemy(guard?.enemy, `${where} escort`);
      ramp(guard?.ramp, `${where} escort`);
      if (!isPosNum(guard?.hp)) err(`${where} escort needs a positive base hp`);
      if (!Number.isInteger(guard?.count) || guard.count < 1)
        err(`${where} escort needs an integer count >= 1`);
    }
  };
  for (const [i, piece] of (bp.elites ?? []).entries())
    setPiece(piece, `elites[${i}]`);
  for (const [i, piece] of (bp.guardians ?? []).entries())
    setPiece(piece, `guardians[${i}]`);
  if (bp.guardians !== undefined && bp.guardians.length === 0)
    err("guardians must not be empty — the chest rooms need a keeper");

  if (bp.hellborn !== undefined) {
    ramp(bp.hellborn.ramp, "hellborn");
    if (!Array.isArray(bp.hellborn.members) || bp.hellborn.members.length === 0)
      err("hellborn.members must be a non-empty list");
    for (const m of bp.hellborn.members ?? []) {
      enemy(m?.enemy, "hellborn.members");
      if (!Number.isInteger(m?.count) || m.count < 1)
        err("hellborn member needs an integer count >= 1");
    }
  }

  // ---- the boss and the search ---------------------------------------------
  if (bp.boss !== undefined && bp.boss !== null) {
    setPiece(bp.boss, "boss");
    if (!Array.isArray(bp.boss.regions) || bp.boss.regions.length === 0)
      err("boss.regions must name at least one compass region");
    else {
      bp.boss.regions.forEach((r, i) => region(r, `boss.regions[${i}]`));
      // One candidate region means the boss is always in the same corner, which
      // is the one thing a generated map exists not to do.
      if (bp.boss.regions.length < 2)
        warnings.push(
          `${tag}: boss.regions names a single region — the boss will always be there`,
        );
    }
  }
  for (const [i, r] of (bp.spawnRegions ?? []).entries())
    region(r, `spawnRegions[${i}]`);

  for (const tier of ["rare", "unique"]) {
    for (const id of bp.rareSpawns?.[tier] ?? []) enemy(id, `rareSpawns.${tier}`);
  }

  return { errors, warnings };
}
