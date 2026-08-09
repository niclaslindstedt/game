// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP BLUEPRINT schema validator — the "v2" level format's gate.
// `validateMap(bp, refs)` returns `{ errors, warnings }`: hard errors (an
// unknown enemy or level id, a sprite the atlas does not carry, a region name
// nobody can parse, an object field that belongs to a different purpose) FAIL
// the build; soft issues only warn. Mirrors `level-schema.mjs`.
//
// The compass-region grammar is NOT re-implemented here: the generator hands in
// the engine's own `parseRegion` (`engine/game/mapgen/regions.ts`) through `refs`,
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
  "size",
  "areas",
  "layout",
  "objects",
  "horde",
];

const ENCLOSURES = new Set(["none", "soft", "hard"]);

const SPACES = new Set(["inside", "outside"]);

/** What an area that names no `space` is (see `MapArea.space`). */
const DEFAULT_SPACE = "outside";

const OBJECT_TYPES = new Set([
  "wall",
  "obstacle",
  "cover",
  "crate",
  "chest",
  "decor",
  "landmark",
  "building",
  "row",
  "critter",
  "lair",
  "door",
  "light",
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
    "space",
    "edge",
  ],
  cover: ["radius", "density", "jumpable", "areas", "space", "edge"],
  crate: ["radius", "density", "jumpable", "loot", "areas", "space", "edge"],
  chest: [],
  decor: ["density", "areas", "space"],
  landmark: ["at", "anchor", "offset"],
  building: ["density", "w", "h", "jumpable", "areas", "space"],
  row: [
    "areas",
    "space",
    "chance",
    "spacing",
    "gap",
    "bank",
    "aisle",
    "coverage",
    "collide",
    "half",
    "radius",
    "jumpable",
  ],
  critter: ["density", "areas", "space", "animated", "range", "speed", "scale"],
  lair: ["w", "h", "door", "doorOpen", "trigger", "areas", "space"],
  // A real DOOR: a chain of `radius` circles wearing `sprite`, hung across a
  // doorway by rule — `at: spawn` across the hero's own chamber (the garage's
  // roll-up), or across a district's own doorways when one names it in
  // `MapArea.doors` — and optionally the PAIR OF LAMPS bolted either side of
  // the opening, hung with it because only the carve knows where the opening
  // ended up.
  door: ["radius", "at", "openSprite", "rollUp", "lamps"],
  // A LAMP: a pool of light pinned to a carved anchor, a nudge off it, burning
  // only once the venue's sky has gone dark — plus, unless the fitting is
  // genuinely overhead, the FIXTURE throwing it.
  light: ["at", "offset", "light", "fixture"],
};

// Purposes that may be restricted to a district. A `wall`, `chest` or `landmark`
// is placed by rule, not scattered, so an `areas` list on one would read as a
// restriction that is silently ignored.
const DISTRICTABLE = new Set([
  "obstacle",
  "cover",
  "crate",
  "decor",
  "building",
  "row",
  "critter",
  "lair",
]);

// Purposes whose placement count comes from a density — one is required, or the
// palette entry would compile to a line that places nothing.
const NEEDS_DENSITY = new Set([
  "obstacle",
  "cover",
  "crate",
  "decor",
  "building",
  "critter",
]);

const ANCHORS = new Set(["spawn", "goal", "stall", "counter", "home"]);

/** How far a PREFAB's solid props are held off the room's own edges (world px),
 * before the piece's own radius is added — roughly the scatter's own wall
 * clearance (`OBSTACLES.spacing` plus a wall stone's radius). */
const PREFAB_EDGE_CLEAR = 48;

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
  // Which side of a building's wall each district is on — read straight off the
  // palette up here, because half the checks below (a prop's sprite, a prefab's
  // host) are questions about it rather than about the areas themselves.
  const areaSpace = new Map(
    (Array.isArray(bp.areas) ? bp.areas : [])
      .filter((a) => typeof a?.id === "string")
      .map((a) => [a.id, a.space ?? DEFAULT_SPACE]),
  );

  for (const field of REQUIRED_FIELDS) {
    if (bp[field] === undefined) err(`missing required field "${field}"`);
  }
  if (!description || description.trim().length < 40)
    warnings.push(`${tag}: description is missing or too short to be useful`);

  if (bp.level !== undefined && !refs.levels.has(bp.level))
    err(`inherits from unknown level "${bp.level}"`);

  // A pinned carve (the STATIC hub) must pin to a real seed — a string or a
  // negative here would quietly carve something else than intended.
  if (
    bp.carveSeed !== undefined &&
    (!Number.isInteger(bp.carveSeed) || bp.carveSeed <= 0)
  )
    err(
      `carveSeed must be a positive integer, got ${JSON.stringify(bp.carveSeed)}`,
    );

  // ---- plan (the authored floor plan — see MapBlueprint.plan) ---------------
  if (bp.plan !== undefined) {
    const areaIds = new Set((bp.areas ?? []).map((a) => a.id));
    if (!Array.isArray(bp.plan.rooms) || bp.plan.rooms.length < 2)
      err("plan.rooms must list at least two rooms");
    else {
      const planAreas = new Set();
      bp.plan.rooms.forEach((room, i) => {
        const where = `plan.rooms[${i}]`;
        if (!areaIds.has(room.area))
          err(`${where}: unknown area "${room.area}"`);
        else planAreas.add(room.area);
        const r = room.rect ?? {};
        if (
          !isNum(r.x) ||
          !isNum(r.y) ||
          !isPosNum(r.width) ||
          !isPosNum(r.height)
        )
          err(`${where}: rect needs numeric x/y and positive width/height`);
        for (const key of Object.keys(room))
          if (!["area", "rect"].includes(key))
            err(`${where}: unknown field "${key}"`);
      });
      for (const [i, d] of (bp.plan.doors ?? []).entries()) {
        const where = `plan.doors[${i}]`;
        if (!Array.isArray(d.between) || d.between.length !== 2)
          err(`${where}: between must name exactly two areas`);
        else
          for (const id of d.between)
            if (!planAreas.has(id))
              err(`${where}: names "${id}", which no plan room wears`);
      }
      for (const field of ["goal", "stall"]) {
        const named = bp.plan[field];
        if (named !== undefined && !planAreas.has(named))
          err(`plan.${field}: names "${named}", which no plan room wears`);
      }
      for (const key of Object.keys(bp.plan))
        if (!["rooms", "doors", "goal", "stall"].includes(key))
          err(`plan: unknown field "${key}"`);
    }
  }

  // Every palette object a prefab stands somewhere — the entries that are
  // placed by an authored offset rather than by a density.
  const prefabProps = new Set(
    (Array.isArray(bp.prefabs) ? bp.prefabs : []).flatMap((p) =>
      (p?.props ?? []).map((prop) => prop?.object),
    ),
  );

  // ---- prefabs (the static rooms — see MapBlueprint.prefabs) ----------------
  // Every check here is a build error rather than a warning for one reason: a
  // prefab that cannot be placed is SILENT. The carve tries, fails to find a
  // district with room for it, and carries on — which is the correct runtime
  // behaviour (nothing the run needs may live in one) and exactly why an
  // authoring mistake has to be caught here instead.
  if (bp.prefabs !== undefined) {
    const areaIdSet = new Set((bp.areas ?? []).map((a) => a?.id));
    const objectIds = new Set((bp.objects ?? []).map((o) => o?.id));
    if (!Array.isArray(bp.prefabs)) err("prefabs must be a list");
    else {
      const seen = new Set();
      bp.prefabs.forEach((p, i) => {
        const where = `prefabs[${i}]`;
        if (typeof p?.id !== "string" || p.id.length === 0) {
          err(`${where}: needs a string id`);
          return;
        }
        if (seen.has(p.id)) err(`duplicate prefab id "${p.id}"`);
        seen.add(p.id);
        if (!areaIdSet.has(p.area)) err(`${where}: unknown area "${p.area}"`);
        if (!isPosNum(p.width) || !isPosNum(p.height))
          err(`${where}: needs a positive width/height`);
        if (!Array.isArray(p.in) || p.in.length === 0)
          err(`${where}: "in" must name the districts it may be cut out of`);
        else
          for (const id of p.in)
            if (!areaIdSet.has(id)) err(`${where}: unknown host area "${id}"`);
        // A room cut out of a district it IS: legal (a bank of parking bays is
        // not walled off from the car park), but a room cut out of a district on
        // the other side of a wall is not — an office cut into a car park is a
        // shed with a carpet in it.
        for (const id of Array.isArray(p.in) ? p.in : []) {
          if (!areaIdSet.has(id) || !areaIdSet.has(p.area)) continue;
          if (areaSpace.get(id) !== areaSpace.get(p.area))
            err(
              `${where}: a ${areaSpace.get(p.area)} room cannot be cut out of ` +
                `"${id}", which is ${areaSpace.get(id)}`,
            );
        }
        // It has to FIT: the host has to give it its corner and still leave a
        // room beside it on the map it is cut into.
        const size = bp.size;
        if (size && isPosNum(p.width) && isPosNum(p.height)) {
          if (p.width >= size.width || p.height >= size.height)
            err(
              `${where}: ${p.width}×${p.height} does not fit size ` +
                `(${size.width}×${size.height})`,
            );
        }
        for (const [j, prop] of (p.props ?? []).entries()) {
          const at = `${where}.props[${j}]`;
          if (!objectIds.has(prop?.object))
            err(`${at}: unknown object "${prop?.object}"`);
          if (
            !Array.isArray(prop?.at) ||
            prop.at.length !== 2 ||
            !prop.at.every((n) => isNum(n) && n >= 0)
          ) {
            err(`${at}: "at" must be an [x, y] offset inside the room`);
            continue;
          }
          // An offset past the wall is dropped at carve time, which would leave
          // the room quietly missing a piece of the furniture that IS the room.
          if (
            isPosNum(p.width) &&
            isPosNum(p.height) &&
            (prop.at[0] > p.width || prop.at[1] > p.height)
          ) {
            err(
              `${at}: [${prop.at[0]}, ${prop.at[1]}] is outside the ` +
                `${p.width}×${p.height} room`,
            );
            continue;
          }
          // …AND OFF THE WALLS. A prefab is cut to a district's CORNER, so at
          // least two of its edges are somebody's wall — and a solid piece
          // planted against one is a piece standing inside it. Cheap to get
          // wrong and invisible until a render, because the offsets look
          // perfectly reasonable next to the room's own dimensions.
          const solid = (bp.objects ?? []).find(
            (o) => o?.id === prop.object && o.type !== "decor",
          );
          const clear = Math.max(
            PREFAB_EDGE_CLEAR,
            (solid?.radius ?? 0) + PREFAB_EDGE_CLEAR / 2,
          );
          if (
            solid &&
            isPosNum(p.width) &&
            isPosNum(p.height) &&
            (prop.at[0] < clear ||
              prop.at[1] < clear ||
              p.width - prop.at[0] < clear ||
              p.height - prop.at[1] < clear)
          )
            warnings.push(
              `${tag}: ${at} stands "${prop.object}" within ${Math.round(clear)}px of the ` +
                `room's edge — a prefab's edges are walls, and the scatter's ` +
                `clearance rules do not apply to an authored offset`,
            );
        }
        for (const key of Object.keys(p))
          if (!["id", "area", "width", "height", "in", "props"].includes(key))
            err(`${where}: unknown field "${key}"`);
      });
    }
  }

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
  /** A lamp's numbers — the `light:` block on a `light` object, and the one
   * inside a door's `lamps` (see `MapLightSpec`). */
  const checkLight = (light, where) => {
    if (!isPosNum(light.radius)) err(`${where}: light.radius must be positive`);
    // A pool wider than the phone's whole landscape view lights the LEVEL
    // rather than a place in it, which is the one thing a lamp must not do —
    // and on a small lot two of those wash the night away entirely.
    else if (light.radius > 200)
      warnings.push(
        `${tag}: ${where} light.radius ${light.radius} is wide — a pool much ` +
          `past this reads as daylight rather than as a lamp`,
      );
    for (const key of ["intensity", "flicker"]) {
      const v = light[key];
      if (v !== undefined && (!isNum(v) || v < 0 || v > 1))
        err(`${where}: light.${key} must be a fraction in [0, 1]`);
    }
    if (light.color !== undefined && typeof light.color !== "string")
      err(`${where}: light.color must be a colour string`);
    for (const key of Object.keys(light))
      if (!["radius", "color", "intensity", "flicker"].includes(key))
        err(`${where}: light has no field "${key}"`);
  };

  // ---- size ----------------------------------------------------------------
  if (bp.size !== undefined) {
    const spec = bp.size;
    if (!isPosNum(spec.width) || !isPosNum(spec.height))
      err("size needs positive width/height");
    // An authored plan draws its own rooms; `rooms` is ignored with one.
    if (!bp.plan && (!Number.isInteger(spec.rooms) || spec.rooms < 4))
      err("size.rooms must be an integer >= 4");
    const min = bp.layout?.minRoom;
    // A map that cannot fit the chambers it asks for silently carves fewer,
    // which reads as a venue that never grew its districts — a confusing bug
    // to chase, because nothing in the render says the count was ignored.
    if (isPosNum(min) && isPosNum(spec.width) && isPosNum(spec.height)) {
      const capacity =
        Math.floor(spec.width / min) * Math.floor(spec.height / min);
      if (capacity < spec.rooms)
        err(
          `size asks for ${spec.rooms} chambers but ${spec.width}x${spec.height} ` +
            `fits at most ~${capacity} at minRoom ${min}`,
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
      // but not of openings, so a rock can land in a thin gap. A PINNED
      // blueprint (`carveSeed` — the static hub) is exempt: its one carve was
      // authored and eyeballed, so "a random scatter MIGHT plug it" cannot
      // happen to a layout that never re-rolls.
      if (layout.doorWidth < 160 && bp.carveSeed === undefined)
        warnings.push(
          `${tag}: layout.doorWidth ${layout.doorWidth} is narrow — scattered ` +
            `obstacles may plug it`,
        );
    }
    if (
      !isNum(layout.loopDoors) ||
      layout.loopDoors < 0 ||
      layout.loopDoors > 1
    )
      err("layout.loopDoors must be a fraction in [0, 1]");
    if (!isNum(layout.cluster) || layout.cluster < 0 || layout.cluster > 1)
      err("layout.cluster must be a fraction in [0, 1]");
    if (typeof layout.wall !== "string")
      err("layout.wall must name a wall object");
  }

  // ---- areas ---------------------------------------------------------------
  // The area palette is what the whole map is made of: get it wrong and every
  // cell, wall, prop and role placement is wrong with it.
  const areaIds = new Set();
  const areaWalls = [];
  const areaNests = [];
  const areaDoors = [];
  if (Array.isArray(bp.areas)) {
    if (bp.areas.length === 0)
      err("areas must name at least one kind of place");
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
        err(`${where}: enclosure must be one of ${[...ENCLOSURES].join(", ")}`);
      if (a.enclosure !== "none") enclosed++;
      if (!isNum(a.weight) || a.weight < 0)
        err(`${where}: weight must be a non-negative number`);
      else if (
        a.weight === 0 &&
        a.shellOf === undefined &&
        bp.annex?.area !== a.id &&
        !(bp.prefabs ?? []).some((p) => p?.area === a.id)
      )
        err(
          `${where}: weight 0 means never seeded, which only makes sense for a ` +
            `shell, a prefab's room or the annex`,
        );
      if (a.horde !== undefined && (!isNum(a.horde) || a.horde < 0))
        err(`${where}: horde must be a non-negative multiplier`);
      if (a.space !== undefined && !SPACES.has(a.space))
        err(`${where}: space must be one of ${[...SPACES].join(", ")}`);
      if (a.boss !== undefined && typeof a.boss !== "boolean")
        err(`${where}: boss must be a boolean`);
      if (a.spawn !== undefined && typeof a.spawn !== "boolean")
        err(`${where}: spawn must be a boolean`);
      if (a.landing !== undefined) {
        if (typeof a.landing !== "boolean")
          err(`${where}: landing must be a boolean`);
        // The two say opposite things about the same cell, and the carve reads
        // `landing` first — so a palette that sets both is one where the author
        // has changed their mind in only one place.
        else if (a.landing === true && a.spawn === false)
          err(`${where}: landing and "spawn: false" contradict each other`);
      }
      for (const [i, r] of (a.regions ?? []).entries())
        region(r, `${where} regions[${i}]`);
      if (a.regions !== undefined && !Array.isArray(a.regions))
        err(`${where}: regions must be a list of compass region names`);
      if (
        a.maxCells !== undefined &&
        (!Number.isInteger(a.maxCells) || a.maxCells < 1)
      )
        err(`${where}: maxCells must be an integer >= 1`);
      // The ROOM CARVE. A district with no walls between its cells cannot be cut
      // into rooms — that is one room with lines drawn on the floor — and a room
      // too narrow to take its own doorway plus the margins either side seals
      // itself (see `carveChambers`).
      if (a.roomSize !== undefined) {
        if (!isPosNum(a.roomSize)) err(`${where}: roomSize must be positive`);
        else if (a.enclosure === "none")
          err(
            `${where}: enclosure "none" builds no walls, so it has no rooms to ` +
              `cut — roomSize would do nothing`,
          );
        const opening = a.doorWidth ?? layout?.doorWidth;
        if (
          isPosNum(a.roomSize) &&
          isPosNum(opening) &&
          opening * 2 > a.roomSize
        )
          err(
            `${where}: roomSize ${a.roomSize} cannot take a ${opening}px doorway ` +
              `plus its end margins — the rooms would seal themselves`,
          );
      }
      if (a.doorWidth !== undefined) {
        if (!isPosNum(a.doorWidth)) err(`${where}: doorWidth must be positive`);
        else if (a.enclosure === "none")
          err(
            `${where}: enclosure "none" builds no walls, so a doorWidth does nothing`,
          );
      }
      // A DOOR hung in every doorway of this district (`MapArea.doors`).
      if (a.doors !== undefined) {
        if (typeof a.doors !== "string")
          err(`${where}: doors must name a door object`);
        else if (a.enclosure !== "hard")
          // `none` is not a wall at all and `soft` is an archway too wide to
          // hang a door in — the same rule a keyed room follows.
          err(
            `${where}: only a "hard" district has doorways to hang doors in — ` +
              `"${a.enclosure}" leaves the way open`,
          );
        else areaDoors.push([a.doors, where]);
      }
      if (a.once !== undefined && typeof a.once !== "boolean")
        err(`${where}: once must be a boolean`);
      if (a.driveOut !== undefined) {
        if (typeof a.driveOut !== "boolean")
          err(`${where}: driveOut must be a boolean`);
        // A road out is where a DRIVEN car leaves, and the only car in the game
        // is the one a hub's `car` travel door stands on. Marking a district on
        // a map with no such door compiles a departure strip nothing can ever
        // reach — silent, and exactly the kind of thing this gate is for.
        else if (a.driveOut === true && bp.plan === undefined)
          err(
            `${where}: driveOut belongs to an AUTHORED plan — a rolled carve ` +
              `puts the strip wherever the seed likes, which is not a road`,
          );
      }
      if (a.beat !== undefined) {
        if (typeof a.beat !== "boolean")
          err(`${where}: beat must be a boolean`);
        // A beat is a STRIP a trader paces end to end, and a rolled carve puts
        // its districts wherever the seed likes — which is a trader pacing
        // whatever shape the dice made. Same reasoning as the road above.
        else if (a.beat === true && bp.plan === undefined)
          err(
            `${where}: beat belongs to an AUTHORED plan — a rolled carve has ` +
              `no idea which of its cells is a street`,
          );
      }
      if (a.arrivals !== undefined) {
        if (typeof a.arrivals !== "boolean")
          err(`${where}: arrivals must be a boolean`);
        // THE LOT IS WHERE THE HERO LANDS, and that is not a taste call: the
        // whole beat is "you are standing outside a building you cannot see the
        // way into", so a lot the hero never lands on is a car park with cars
        // arriving on it that nobody watches.
        else if (a.arrivals === true && a.landing !== true)
          err(
            `${where}: an \`arrivals\` district is where the hero lands — ` +
              `set \`landing: true\` on it`,
          );
        // …and it is OUTSIDE, because the cars come in off the road.
        else if (
          a.arrivals === true &&
          (a.space ?? DEFAULT_SPACE) !== "outside"
        )
          err(
            `${where}: an \`arrivals\` district is outside — cars drive onto it`,
          );
        // …and NOTHING AMBIENT stands on it. The lot's cast is the level's own
        // (`LevelDef.arrivals` — the guards and the staff arriving), all of it
        // neutral; a knot of the building's horde on the same tarmac is the
        // fight the beat exists to hold back until the hero is through the door.
        else if (a.arrivals === true && (a.horde ?? 1) > 0)
          err(
            `${where}: an \`arrivals\` district carries no ambient horde — ` +
              `set \`horde: 0\` (its people are the level's \`arrivals\` cast)`,
          );
      }
      if (a.lit !== undefined) {
        if (!isNum(a.lit) || a.lit < 0 || a.lit > 1)
          err(`${where}: lit must be a fraction in [0, 1]`);
        // A lit district is a ROOM with its lights on, and the shape of it is
        // its walls. On open ground the carve emits a rectangle of daylight
        // sitting in the middle of a night, and nothing about it reads as
        // anything but a bug.
        else if (a.lit > 0 && a.enclosure !== "hard")
          err(
            `${where}: only a "hard" district may be lit — an open district's ` +
              `rect has no walls to stop the light at`,
          );
      }
      if (a.lock !== undefined) {
        if (typeof a.lock !== "boolean")
          err(`${where}: lock must be a boolean`);
        // A door needs a doorway to hang in, and only a `hard` district has one:
        // `none` is not a wall at all and `soft` is a gateway too wide to shut.
        else if (a.lock === true && a.enclosure !== "hard")
          err(
            `${where}: only a "hard" district can be locked — an open or gated ` +
              `border is a door with a way round it`,
          );
        // The room is sealed until a key turns up, so anything the run REQUIRES
        // being rolled into it is an unfinishable run. The carve already refuses
        // to put the boss or the landing in a vault; saying so here means an
        // author reads it instead of wondering why their boss area never seals.
        else if (a.lock === true && (a.boss !== false || a.spawn !== false))
          err(
            `${where}: a locked district must set "boss: false" and ` +
              `"spawn: false" — nothing the run needs may be behind its own key`,
          );
      }
      if (a.ragged !== undefined) {
        if (typeof a.ragged !== "boolean")
          err(`${where}: ragged must be a boolean`);
        // The default already says so, and a `true` on a walled district would
        // put a torn floor under a straight wall.
        else if (a.ragged === true && a.enclosure !== "none")
          err(
            `${where}: only open ground is laid ragged — a wall over a torn ` +
              `floor edge reads as a mistake`,
          );
      }
      if (a.blocks !== undefined && !isPosNum(a.blocks))
        err(`${where}: blocks must be a positive street width`);
      if (a.wall !== undefined) {
        if (typeof a.wall !== "string")
          err(`${where}: wall must name a wall object`);
        else if (a.enclosure === "none")
          // An open district never raises a barrier of its own, so a material on
          // one reads as an intent the generator will silently ignore.
          err(
            `${where}: enclosure "none" builds no walls, so a wall material does nothing`,
          );
        else areaWalls.push([a.wall, where]);
      }
      // A shell owns no cells, so it can hold neither the boss nor the hero.
      if (a.boss !== false && !a.shellOf) bossable++;
      if (a.spawn !== false && !a.shellOf) spawnable++;
      const allowed = new Set([
        "id",
        "enclosure",
        "space",
        "weight",
        "horde",
        "boss",
        "spawn",
        "landing",
        "regions",
        "maxCells",
        "roomSize",
        "doorWidth",
        "doors",
        "driveOut",
        "beat",
        "arrivals",
        "label",
        "ground",
        "patch",
        "ragged",
        "wall",
        "shellOf",
        "shellWidth",
        "apron",
        "once",
        "blocks",
        "lock",
        "lit",
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
          err(
            `${where}: a shell area must have weight 0 — it is never seeded on its own`,
          );
      } else if (a.shellWidth !== undefined) {
        err(`${where}: shellWidth means nothing without shellOf`);
      }
      if (a.apron !== undefined) {
        if (!a.apron.ground) err(`${where}: apron needs a ground pair`);
        else {
          sprite(a.apron.ground.common, `${where} apron.common`);
          sprite(a.apron.ground.rare, `${where} apron.rare`);
          if (
            !Number.isInteger(a.apron.ground.rareEvery) ||
            a.apron.ground.rareEvery < 1
          )
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
      err(
        'every area has enclosure "none" — the map would have no walls at all',
      );
    // A bossless blueprint (the hub: `boss: null`) needs no room to hold one.
    if (bossable === 0 && bp.boss !== null)
      err("no area may hold the boss — set `boss: true`");
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
      if (o.type === "chest" || o.type === "light") {
        // Neither names a `sprite`: a chest is drawn from the engine's own art,
        // and a lamp's art — if it has any on the ground plane at all — is its
        // `fixture`, checked with the rest of its own fields below.
      } else if (o.type === "critter" && o.animated) {
        // the two walk frames are checked below, not the base name
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
      // A scattered purpose is priced by density — except when it is not
      // scattered at all: a prop that exists only to stand at an authored offset
      // inside a PREFAB has no count to give, and demanding one would sprinkle
      // mop buckets across the whole floor to satisfy the schema.
      if (
        NEEDS_DENSITY.has(o.type) &&
        !isPosNum(o.density) &&
        !prefabProps.has(o.id)
      )
        err(
          `${where}: a "${o.type}" needs a positive density (or a prefab that ` +
            `stands it somewhere)`,
        );
      if (isPosNum(o.density) && o.density > 200)
        warnings.push(
          `${tag}: ${where} density ${o.density} is very thick (>200 per 1M px²)`,
        );
      if (o.type === "row") {
        for (const key of ["spacing", "gap", "aisle"])
          if (o[key] !== undefined && !isPosNum(o[key]))
            err(`${where}: ${key} must be positive`);
        if (o.bank !== undefined && (!Number.isInteger(o.bank) || o.bank < 1))
          err(`${where}: bank must be an integer >= 1`);
        if (
          o.coverage !== undefined &&
          (!isNum(o.coverage) || o.coverage <= 0 || o.coverage > 0.9)
        )
          // Above 0.9 the ranks reach the walls and start crowding doorways.
          err(`${where}: coverage must be a fraction in (0, 0.9]`);
        if (
          o.chance !== undefined &&
          (!isNum(o.chance) || o.chance <= 0 || o.chance > 1)
        )
          err(`${where}: chance must be a fraction in (0, 1]`);
        if (o.collide && !o.half && o.radius === undefined)
          err(`${where}: a colliding row needs a half extent or a radius`);
      }
      if (o.type === "building" && (!isPosNum(o.w) || !isPosNum(o.h)))
        err(`${where}: a building needs a positive w/h footprint`);
      if (o.type === "critter") {
        for (const key of ["range", "speed", "scale"]) {
          const v = o[key];
          if (v === undefined) continue;
          if (
            !Array.isArray(v) ||
            v.length !== 2 ||
            !v.every((n) => isNum(n) && n >= 0) ||
            v[0] > v[1]
          )
            err(`${where}: ${key} must be [min, max] non-negative numbers`);
        }
        if (o.animated !== undefined && typeof o.animated !== "boolean")
          err(`${where}: animated must be a boolean`);
        // An animated critter blits `<sprite>_0`/`_1`, so THOSE are the frames
        // the atlas has to carry — the base name alone draws nothing.
        if (o.animated) {
          const stem = o.sprite ?? o.kind ?? o.id;
          sprite(`${stem}_0`, where);
          sprite(`${stem}_1`, where);
        }
      }
      if (o.type === "lair") {
        if (!isPosNum(o.w) || !isPosNum(o.h))
          err(`${where}: a lair needs a positive w/h footprint`);
        // Both door frames are mandatory: the whole beat is the swap, and a
        // missing open frame leaves a door that stays shut with the elite
        // standing in front of it.
        if (typeof o.door !== "string") err(`${where}: a lair needs a door`);
        else sprite(o.door, `${where} door`);
        if (typeof o.doorOpen !== "string")
          err(`${where}: a lair needs a doorOpen`);
        else sprite(o.doorOpen, `${where} doorOpen`);
        if (o.trigger !== undefined && !isPosNum(o.trigger))
          err(`${where}: trigger must be positive`);
      }
      if (o.type === "door") {
        // A door has to be told WHERE to hang, and there are exactly three ways
        // to say it. An entry that says none of them compiles to a palette entry
        // nothing ever reads — a door nobody hung, which looks from the YAML
        // like a door that is simply never reached.
        const byArea = (bp.areas ?? []).some((a) => a?.doors === o.id);
        if (o.at !== undefined && o.at !== "spawn" && o.at !== "entrance")
          err(
            `${where}: a door only understands "at: spawn" (the hero's own ` +
              `chamber) or "at: entrance" (every opening off an ` +
              `\`arrivals\` district); a district's doors are named by the district`,
          );
        // …and `at: entrance` needs a lot to be the entrance TO. Without one the
        // door hangs nowhere and the level's `arrivals` beat has no way in to
        // walk to, which is a mission that cannot be started.
        if (
          o.at === "entrance" &&
          !(bp.areas ?? []).some((a) => a?.arrivals === true)
        )
          err(
            `${where}: "at: entrance" hangs a door between the staff lot and ` +
              `the building, and no area is flagged \`arrivals: true\``,
          );
        if (o.at === undefined && !byArea)
          err(
            `${where}: nothing hangs this door — give it "at: spawn", ` +
              `"at: entrance", or name it in an area's \`doors\``,
          );
        if (o.openSprite !== undefined) {
          if (typeof o.openSprite !== "string")
            err(`${where}: openSprite must name a sprite`);
          else sprite(o.openSprite, `${where} openSprite`);
        }
        if (o.rollUp !== undefined && typeof o.rollUp !== "boolean")
          err(`${where}: rollUp must be a boolean`);
        // A roll-up goes UP: there is nothing left standing in the opening, so
        // an open frame on one is art that is never drawn.
        if (o.rollUp === true && o.openSprite !== undefined)
          err(`${where}: a rollUp door rolls away — it has no open frame`);
        // …and a door that slides ASIDE leaves its leaves in the jambs. Without
        // a frame for them the doorway reverts to a hole in the wall the moment
        // it is used, which is what an interior looked like before doors existed.
        if (!o.rollUp && o.openSprite === undefined)
          warnings.push(
            `${tag}: ${where} has no openSprite — the doorway will be empty once opened`,
          );
      }
      if (o.type === "landmark") {
        if (!ANCHORS.has(o.at))
          err(
            `${where}: landmark "at" must be one of ${[...ANCHORS].join(", ")}`,
          );
        if (
          o.anchor !== undefined &&
          o.anchor !== "base" &&
          o.anchor !== "center"
        )
          err(`${where}: anchor must be "base" or "center"`);
        // A NUDGE OFF THE ANCHOR, exactly as a lamp takes one — how a fixture
        // is stood against a wall rather than in the middle of the room the
        // anchor names.
        if (
          o.offset !== undefined &&
          (!isNum(o.offset.x) || !isNum(o.offset.y))
        )
          err(`${where}: offset needs numeric x/y`);
      }
      // THE LAMP'S OWN NUMBERS — on a `light` (where a light block is
      // mandatory: a lamp with no light compiles to nothing at all) and inside
      // a door's `lamps`.
      if (o.type === "door" && o.lamps !== undefined) {
        const where2 = `${where} lamps`;
        if (typeof o.lamps.sprite !== "string")
          err(`${where2}: needs a fixture sprite`);
        else sprite(o.lamps.sprite, where2);
        if (o.lamps.inset !== undefined && !isPosNum(o.lamps.inset))
          err(`${where2}: inset must be positive`);
        // How high up the wall the pair is bolted — the FIXTURE only, which is
        // the one thing `inset` (which spreads them along the wall) cannot say.
        if (o.lamps.lift !== undefined && !isPosNum(o.lamps.lift))
          err(`${where2}: lift must be positive`);
        if (o.lamps.light === undefined) err(`${where2}: needs a light block`);
        else checkLight(o.lamps.light, where2);
        for (const key of Object.keys(o.lamps))
          if (!["sprite", "inset", "lift", "light"].includes(key))
            err(`${where2}: has no field "${key}"`);
      }
      if (o.type === "light") {
        if (!ANCHORS.has(o.at))
          err(`${where}: light "at" must be one of ${[...ANCHORS].join(", ")}`);
        if (
          o.offset !== undefined &&
          (!isNum(o.offset.x) || !isNum(o.offset.y))
        )
          err(`${where}: offset needs numeric x/y`);
        if (o.light === undefined) err(`${where}: a light needs a light block`);
        if (o.fixture !== undefined) {
          if (typeof o.fixture !== "string")
            err(`${where}: fixture must be a sprite name`);
          else sprite(o.fixture, `${where} fixture`);
        } else if (o.at !== "counter") {
          // Not an error — a gantry light hangs off the ground plane and has
          // nothing to draw — but it is the mistake worth naming, because a
          // pool on open ground with nothing above it reads as a bug rather
          // than as a lamp. `counter` is exempt: the trader's own machine is
          // standing in that spot, drawn, and is obviously the source.
          warnings.push(
            `${tag}: ${where} has no fixture — nothing on the ground will be ` +
              `throwing this light`,
          );
        }
      }
      if (o.light !== undefined) checkLight(o.light, where);
      if (o.areas !== undefined) {
        if (!DISTRICTABLE.has(o.type))
          err(
            `${where}: a "${o.type}" is placed by rule, so an areas list does nothing`,
          );
        else if (!Array.isArray(o.areas) || o.areas.length === 0)
          err(`${where}: areas must be a non-empty list of area ids`);
        else
          for (const id of o.areas)
            if (!areaIds.has(id)) err(`${where}: unknown area "${id}"`);
      }
      if (o.space !== undefined && !SPACES.has(o.space))
        err(`${where}: space must be one of ${[...SPACES].join(", ")}`);
      // THE PROP IS ON THE WRONG SIDE OF THE WALL. The sprite says where the
      // art belongs (`content/sprites/**`, `space:`), which is a fact about the
      // object rather than about this map; the palette entry says which
      // districts it may be scattered over. If the second could reach a district
      // the first refuses, this map is one seed away from a cactus in a
      // cleanroom — and nothing downstream would ever say so.
      if (DISTRICTABLE.has(o.type)) {
        const wants = refs.spriteSpace?.get(o.sprite ?? o.kind ?? o.id);
        // The districts this entry can actually reach: the ones it names, cut
        // by its own `space` if it has one, or every district when it names
        // neither.
        const reach = (o.areas ?? [...areaIds]).filter(
          (id) => !o.space || areaSpace.get(id) === o.space,
        );
        const wrong = wants
          ? reach.filter((id) => areaSpace.get(id) !== wants)
          : [];
        if (wrong.length > 0)
          err(
            `${where}: sprite "${o.sprite ?? o.kind ?? o.id}" is ${wants} art, but ` +
              `this entry can be placed in ${wrong.map((id) => `"${id}"`).join(", ")} ` +
              `— restrict it with \`space: ${wants}\` or an areas list`,
          );
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
          err(
            `${where}: rockSizes must be a non-empty list of [wCells, hCells]`,
          );
      }
    }
  } else if (bp.objects !== undefined) {
    err("objects must be a list");
  }
  if (walls === 0)
    err("no `wall` object — the chambers would have no partitions");
  if (layout?.wall !== undefined && !ids.has(layout.wall))
    err(`layout.wall "${layout.wall}" is not in the object palette`);
  for (const [id, where] of areaWalls)
    if (!ids.has(id))
      err(`${where}: wall "${id}" is not in the object palette`);
  for (const [id, where] of areaNests)
    if (!areaIds.has(id)) err(`${where}: shellOf names unknown area "${id}"`);
  for (const [id, where] of areaDoors) {
    const door = bp.objects?.find((o) => o?.id === id);
    if (!door) err(`${where}: doors "${id}" is not in the object palette`);
    else if (door.type !== "door")
      err(`${where}: doors "${id}" is a "${door.type}", not a door`);
  }
  // A PINNED blueprint (`carveSeed` — the static hub) pays nothing on purpose:
  // a hub with loot in its dead ends would be a farm in the one place the
  // player is meant to idle, so the missing chest is the design, not a gap.
  if (
    !bp.objects?.some((o) => o.type === "chest") &&
    bp.carveSeed === undefined
  )
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
          err(
            `horde member "${m?.enemy}" needs a window [from, to] within [0, 1]`,
          );
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
  const setPiece = (piece, where, options = {}) => {
    enemy(piece?.enemy, where);
    ramp(piece?.ramp, where);
    if (piece?.patrol !== undefined) {
      if (typeof piece.patrol !== "boolean")
        err(`${where}: patrol must be a boolean`);
      // A BOSS guards its post and a KEEPER guards its cache: a walker that
      // wanders off the thing it is standing over is not a sentry, it is a mob
      // that left. Only the elites strung along the search may walk a beat.
      else if (piece.patrol === true && options.patrol !== true)
        err(
          `${where}: only an elite may patrol — a boss guards its post and a ` +
            `guardian guards its cache`,
        );
    }
    if (piece?.lair !== undefined) {
      const house = bp.objects?.find((o) => o.id === piece.lair);
      if (!house) err(`${where}: lair "${piece.lair}" is not in the palette`);
      else if (house.type !== "lair")
        err(`${where}: lair "${piece.lair}" is a "${house.type}", not a lair`);
    }
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
    setPiece(piece, `elites[${i}]`, { patrol: true });
  for (const [i, piece] of (bp.guardians ?? []).entries())
    setPiece(piece, `guardians[${i}]`);
  if (bp.guardians !== undefined && bp.guardians.length === 0)
    err("guardians must not be empty — the chest rooms need a keeper");

  // ---- the non-combatants ---------------------------------------------------
  // The errand cast: named one by one, because they are cast rather than horde.
  // A hostile id here is the failure worth catching at build time — the mob
  // would be cleaved in half mid-swing and the chain it carries would dead-end
  // with nothing on screen to explain it.
  for (const [i, who] of (bp.bystanders ?? []).entries()) {
    const where = `bystanders[${i}]`;
    enemy(who?.enemy, where);
    if (
      who?.enemy !== undefined &&
      refs.neutrals !== undefined &&
      refs.enemies.has(who.enemy) &&
      !refs.neutrals.has(who.enemy)
    )
      err(
        `${where}: "${who.enemy}" is not neutral — a bystander must carry \`disposition: neutral\``,
      );
  }

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

  // ---- the annex -----------------------------------------------------------
  // The elevator's room. Every check here is an error rather than a warning: it
  // is where the boss stands, and the ONLY way in is the lift, so a broken annex
  // is a mission that cannot be finished rather than one that looks wrong.
  if (bp.annex !== undefined) {
    const where = "annex";
    if (typeof bp.annex.area !== "string")
      err(`${where}: needs an area from the palette`);
    else if (!areaIds.has(bp.annex.area))
      err(`${where}: unknown area "${bp.annex.area}"`);
    else {
      const area = bp.areas.find((a) => a.id === bp.annex.area);
      // The annex is placed by rule, never seeded, so it must not also be a
      // district the carve can grow — a second control room out on the street
      // would give the search two answers.
      if (area?.weight !== 0)
        err(`${where}: area "${bp.annex.area}" must have weight 0`);
      if (area?.enclosure !== "hard")
        err(`${where}: area "${bp.annex.area}" must be enclosure "hard"`);
    }
    if (!isPosNum(bp.annex.width) || !isPosNum(bp.annex.height))
      err(`${where}: needs a positive width/height`);
    if (bp.annex.margin !== undefined && !isPosNum(bp.annex.margin))
      err(`${where}: margin must be positive`);
    if (bp.annex.ground !== undefined) {
      sprite(bp.annex.ground.common, `${where} ground.common`);
      sprite(bp.annex.ground.rare, `${where} ground.rare`);
      if (
        !Number.isInteger(bp.annex.ground.rareEvery) ||
        bp.annex.ground.rareEvery < 1
      )
        err(`${where}: ground.rareEvery must be an integer >= 1`);
    }
    sprite(bp.annex.padSprite ?? "elevator_pad", `${where} padSprite`);
    // The room has to fit the band it is cut into, or the carve puts the
    // control room half off the map.
    const margin = bp.annex.margin ?? 200;
    const size = bp.size;
    if (
      size &&
      isPosNum(bp.annex.width) &&
      size.width < bp.annex.width + margin * 2
    )
      err(
        `${where}: ${bp.annex.width}px wide does not fit size ` +
          `(${size.width}px) with a ${margin}px margin`,
      );
    if (
      bp.annex.widthFrac !== undefined &&
      (!isNum(bp.annex.widthFrac) ||
        bp.annex.widthFrac <= 0 ||
        bp.annex.widthFrac > 0.95)
    )
      err(`${where}: widthFrac must be a fraction in (0, 0.95]`);
    const allowed = new Set([
      "area",
      "width",
      "widthFrac",
      "height",
      "margin",
      "ground",
      "padSprite",
      "downLabel",
      "upLabel",
      "lock",
    ]);
    // A keyed car needs a real key, exactly as a keyed room does — and it must
    // not be a key the annex itself is holding, which is a door locked from the
    // inside with the only key behind it.
    if (bp.annex.lock !== undefined) {
      if (typeof bp.annex.lock !== "string" || bp.annex.lock.length === 0)
        err(`${where}: lock must be a door id`);
      else if (refs.doorKeys !== undefined && !refs.doorKeys.has(bp.annex.lock))
        err(
          `${where}: lock names "${bp.annex.lock}", which no story item ` +
            `unlocks (content/story-items.yaml)`,
        );
    }
    for (const key of Object.keys(bp.annex))
      if (!allowed.has(key)) err(`${where}: unknown field "${key}"`);
  }

  for (const tier of ["rare", "unique"]) {
    for (const id of bp.rareSpawns?.[tier] ?? [])
      enemy(id, `rareSpawns.${tier}`);
  }

  // ---- the keys ------------------------------------------------------------
  // A door id has to be a REAL key: the `unlocks` value of a story item some
  // monster on this map actually drops. A typo here is a room that can never be
  // opened, on a map where the room was rolled somewhere different every run —
  // the least reproducible bug this format could ship.
  if (bp.locks !== undefined) {
    if (!Array.isArray(bp.locks) || bp.locks.length === 0)
      err("locks must be a non-empty list of door ids");
    else {
      const seen = new Set();
      for (const id of bp.locks) {
        if (typeof id !== "string" || id.length === 0) {
          err("locks entries must be door ids");
          continue;
        }
        if (seen.has(id))
          err(`locks names "${id}" twice — one key opens one room`);
        seen.add(id);
        if (refs.doorKeys !== undefined && !refs.doorKeys.has(id))
          err(
            `locks names "${id}", which no story item unlocks — a locked room ` +
              `needs a key somebody carries (content/story-items.yaml)`,
          );
      }
      // …and somewhere to put them. A list of keys with no lockable district is
      // a map whose doors were never carved.
      if (!(bp.areas ?? []).some((a) => a?.lock === true))
        err(
          "locks names keys but no area is `lock: true` — nothing would be sealed",
        );
    }
  }

  return { errors, warnings };
}
