// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The enemy schema validator (see the `enemy-design` skill). Mirrors
// `level-schema.mjs` / `sprite-schema.mjs`: `validateEnemy(def, refs)` returns
// `{ errors, warnings }` — hard errors (a missing required field, a bad role,
// an unknown cross-referenced id) FAIL the build; soft issues only warn. `refs`
// is the set of live def ids the generator harvests from the engine catalogs
// PLUS the enemy set itself, so a typo in an enemy YAML surfaces at
// `npm run levels`, not at runtime. The `EnemyDef` contract this checks against
// is src/game/defs/enemies/types.ts.

/** Scalar fields every enemy must declare (a missing one is a hard error). */
export const REQUIRED_FIELDS = [
  "id",
  "name",
  "lore",
  "role",
  "sprite",
  "hp",
  "speed",
  "radius",
  "contactDamage",
  "critChance",
  "contactCooldownMs",
];

const ROLES = new Set(["minion", "elite", "boss"]);
/** The difficulty rungs an ability's `minDifficulty` gate may name. */
const DIFFICULTIES = new Set(["easy", "medium", "hard", "nightmare", "jesus"]);
/**
 * The BOSS ABILITY CATALOG, mirrored from `BossAbility` in
 * src/game/defs/enemies/abilities.ts: ability id → the fields it requires
 * BEYOND the universal `windupMs` / `cooldownMs`. Keep the two in step — a new
 * ability adds its row here, and the build then refuses a boss that authors it
 * half-written.
 */
const ABILITY_FIELDS = {
  laser_eyes: [
    "range",
    "sweepDeg",
    "sweepMs",
    "beamWidth",
    "damageFrac",
    "hitIntervalMs",
    "scorchMs",
    "scorchDamageFrac",
    "scorchTickMs",
    "scorchRadius",
  ],
  flag_plant: ["defId", "distance", "lifeMs"],
  coin_cannon: [
    "count",
    "spreadDeg",
    "range",
    "speed",
    "lifetimeMs",
    "damageFrac",
    "bounces",
  ],
  bait_drop: [
    "count",
    "spread",
    "armMs",
    "lifeMs",
    "triggerRadius",
    "blastRadius",
    "damageFrac",
  ],
  airstrike: ["count", "spread", "fallMs", "blastRadius", "damageFrac"],
  call_horde: ["waves", "waveGapMs"],
  recompile: ["defId", "distance", "lifeMs", "healFracPerSec"],
  lockdown: [
    "radius",
    "segments",
    "gapDeg",
    "durationMs",
    "sprite",
    "segmentRadius",
  ],
  // ── THE ELITE TIER — personal moves, the hero's own kit turned around ──
  orbit_guard: [
    "count",
    "radius",
    "angularSpeed",
    "orbRadius",
    "damageFrac",
    "hitIntervalMs",
    "durationMs",
    "sprite",
  ],
  seeker_volley: [
    "count",
    "spreadDeg",
    "range",
    "speed",
    "lifetimeMs",
    "homing",
    "damageFrac",
    "sprite",
  ],
  ember_trail: [
    "durationMs",
    "dropMs",
    "radius",
    "patchMs",
    "damageFrac",
    "tickMs",
  ],
  shock_pulse: ["radius", "damageFrac", "push"],
  blink_strike: ["range", "arriveDistance", "damageFrac", "strikeRadius"],
  rally_cry: ["radius", "durationMs", "speedMult", "damageMult"],
  snare_field: ["radius", "durationMs", "slowFactor", "range"],
  siphon_tether: ["range", "durationMs", "damageFrac", "tickMs", "healFrac"],
  ward_shield: ["poolFrac", "durationMs"],
  quake_line: ["count", "spacing", "radius", "damageFrac", "stepMs"],
};

/**
 * The OPTIONAL numbers an ability may carry beyond its required set — every one
 * of them a knob the shipping code would otherwise have had to pick for every
 * mob at once. They are checked here so a typo is caught rather than silently
 * ignored (an unknown key would simply never be read, and the mob would keep
 * quietly using the default the author was trying to override).
 */
const OPTIONAL_ABILITY_FIELDS = {
  orbit_guard: ["range"],
  seeker_volley: ["boltRadius"],
  ember_trail: ["range"],
  shock_pulse: ["pushCoastMs"],
  ward_shield: ["raiseBelowHpFrac", "range"],
};

/**
 * The four colours every `look` kit owes (`AbilityLook`, mirrored from
 * src/game/defs/abilities.ts). An ability's kit is what makes two mobs casting
 * the SAME primitive read as nothing alike, so a half-written one is a
 * signature that silently falls back to the neutral default — visible only to
 * somebody who already knew what it was supposed to look like.
 */
const LOOK_FIELDS = ["core", "hot", "deep", "spark"];
/** The shortest `lore` that can plausibly say what a monster is. */
const LORE_MIN_CHARS = 80;
/** Past this a bestiary entry has stopped being an entry (a warning, not a
 * refusal — the odd elite genuinely needs the room). */
const LORE_WARN_CHARS = 420;

/** The longest a floated BARK may be. Measured against the reference phone's
 * ~422 world-unit view in the pixel font — past this the line runs off the
 * side, and unlike a dialogue page nothing is going to wrap it. */
const BARK_MAX_CHARS = 62;

const GORES = new Set(["blood", "ecto", "sparks", "cosmic"]);
/** What a body is built of, for the one moment a blunt blow bursts it — a
 * `humanoid` loses a head among the meat, a `beast` does not. Omitted reads
 * as humanoid (see EnemyDef.anatomy). */
const ANATOMIES = new Set(["humanoid", "beast"]);
const RARITIES = new Set(["rare", "unique"]);
const LOCOMOTIONS = new Set(["legs", "float", "wheels"]);

/**
 * Validate one EnemyDef against the engine's live id catalogs.
 *
 * @param {object} def   the parsed enemy YAML (a full EnemyDef).
 * @param {object} refs  `{ enemies, companions, uniques, storyItems, items }` —
 *                        each a Set<string> of live ids (`items` = weapons ∪
 *                        gear, the pool `loot.items` may name; `enemies` = every
 *                        enemy id, for `summon.defId` / `shieldedBy`).
 */
export function validateEnemy(def, refs) {
  const errors = [];
  const warnings = [];
  const tag = def?.id ? `enemy "${def.id}"` : "enemy";
  const err = (m) => errors.push(`${tag}: ${m}`);
  const warn = (m) => warnings.push(`${tag}: ${m}`);

  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined) err(`missing required field "${field}"`);
  }

  // WHAT THIS THING IS, in prose (see `EnemyDef.lore`). Checked rather than
  // trusted for one reason: a monster whose lore is a placeholder reads on its
  // bestiary page exactly like one whose lore was written, and nobody proof-
  // reads 100 generated pages. A hard floor catches "TODO"; the ceiling is a
  // warning because a good line is occasionally a long one.
  if (def.lore !== undefined) {
    if (typeof def.lore !== "string" || def.lore.trim().length === 0) {
      err(`lore must be a non-empty string`);
    } else if (def.lore.trim().length < LORE_MIN_CHARS) {
      err(
        `lore is ${def.lore.trim().length} characters — a monster's lore is a ` +
          `sentence or two about what it IS (at least ${LORE_MIN_CHARS})`,
      );
    } else if (def.lore.trim().length > LORE_WARN_CHARS) {
      warn(
        `lore is ${def.lore.trim().length} characters — past ${LORE_WARN_CHARS} ` +
          `a bestiary entry starts reading as a chapter`,
      );
    }
  }

  if (def.role !== undefined && !ROLES.has(def.role))
    err(`unknown role "${def.role}" (valid: ${[...ROLES].join(", ")})`);
  if (def.gore !== undefined && !GORES.has(def.gore))
    err(`unknown gore "${def.gore}" (valid: ${[...GORES].join(", ")})`);
  if (def.anatomy !== undefined && !ANATOMIES.has(def.anatomy))
    err(
      `unknown anatomy "${def.anatomy}" (valid: ${[...ANATOMIES].join(", ")})`,
    );
  // A body that cannot bleed can never be burst, so it has no anatomy to
  // declare — authoring one is an author who believes they changed something.
  if (
    def.anatomy !== undefined &&
    def.gore !== undefined &&
    def.gore !== "blood"
  )
    err(
      `anatomy is meaningless on a "${def.gore}" body (it never comes apart)`,
    );
  // THE DEATH RITE — the scripted send-off a boss dies by. Checked against the
  // engine's own catalog (passed in `refs`), never against a copy kept here.
  if (def.death !== undefined) {
    if (def.role !== "boss")
      err(
        `death rite "${def.death}" on a ${def.role ?? "minion"} — only a boss ` +
          `gets one (everything else is on the ordinary gore ladder)`,
      );
    else if (refs?.deathRites && !refs.deathRites.has(def.death))
      err(
        `unknown death rite "${def.death}" (valid: ` +
          `${[...refs.deathRites].join(", ")})`,
      );
    // THE RITE HAS TO MATCH THE ENDING. A boss with `flees:` never dies — it
    // escapes at 0 hp (or at `belowHpFrac`) with a `bossFled` event in place of
    // the kill — so a DEATH rite on one would never play, and a FLIGHT rite on
    // a boss that actually dies has no exit to run to. Either way the line is
    // dead config wearing the look of a feature, which is exactly the shape the
    // `anatomy` check above refuses and for the same reason: an author who
    // believes they changed something.
    else if (refs?.flightRites) {
      const flight = refs.flightRites.has(def.death);
      if (def.flees && !flight)
        err(
          `death rite "${def.death}" on a boss that FLEES — it escapes instead ` +
            `of dying, so it needs a FLIGHT rite (${[...refs.flightRites].join(", ")})`,
        );
      if (!def.flees && flight)
        err(
          `flight rite "${def.death}" on a boss that DIES — a flight rite runs ` +
            `to the exit named by \`flees:\`, and this boss has none`,
        );
    }
  }
  // THE HERO'S FINISHER LINE. A BARK, so it is held to a bark's rules rather
  // than a page's: it floats over the field instead of flowing into a box, so
  // nothing wraps it and a long line runs off the side of a phone.
  if (def.deathBark !== undefined) {
    if (def.role !== "boss")
      err(`deathBark on a ${def.role ?? "minion"} — only a boss gets a rite`);
    if (!Array.isArray(def.deathBark) || def.deathBark.length === 0)
      err(`deathBark must be a non-empty list of lines`);
    else
      for (const line of def.deathBark) {
        if (typeof line !== "string" || line.trim().length === 0)
          err(`deathBark line must be a non-empty string`);
        else if (line.length > BARK_MAX_CHARS)
          err(
            `deathBark line is ${line.length} characters — a bark FLOATS over ` +
              `the field and nothing wraps it, so it must fit a phone ` +
              `(max ${BARK_MAX_CHARS})`,
          );
      }
  }
  if (def.rarity !== undefined && !RARITIES.has(def.rarity))
    err(`unknown rarity "${def.rarity}" (valid: ${[...RARITIES].join(", ")})`);
  if (def.locomotion !== undefined && !LOCOMOTIONS.has(def.locomotion))
    err(
      `unknown locomotion "${def.locomotion}" (valid: ${[...LOCOMOTIONS].join(", ")})`,
    );

  const num = (v, name) => {
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v)))
      err(`${name} must be a finite number`);
  };
  for (const f of [
    "hp",
    "speed",
    "radius",
    "contactDamage",
    "critChance",
    "contactCooldownMs",
    "levelBonus",
    "xp",
    "xpMobMult",
    "dodgeChance",
    "wealth",
  ]) {
    num(def[f], f);
  }
  // WEALTH multiplies the gold a corpse sheds and, at 0, closes its pockets
  // entirely — a negative one would mean a body that takes money off the floor,
  // which is not a thing the payout funnel can express.
  if (typeof def.wealth === "number" && def.wealth < 0)
    err(`wealth must be >= 0 (0 = carried nothing)`);

  if (def.ai === undefined || typeof def.ai !== "object") {
    err(`missing "ai" block (needs at least aggroRadius)`);
  } else {
    num(def.ai.aggroRadius, "ai.aggroRadius");
    if (def.ai.aggroRadius === undefined) err(`ai.aggroRadius is required`);
  }

  // ---- cross-references against the live catalogs ---------------------------
  const ref = (set, id, where) => {
    if (id !== undefined && !set.has(id)) err(`unknown ${where} "${id}"`);
  };

  ref(refs.enemies, def.mechanics?.summon?.defId, "summon enemy");
  for (const phase of def.phases ?? [])
    ref(refs.enemies, phase.mechanics?.summon?.defId, "phase summon enemy");

  // ---- the BOSS ABILITY CATALOG (defs/enemies/abilities.ts) -----------------
  // Every authored ability is checked here rather than trusted, because the
  // whole catalog is data: a typo in an id, a missing number, or a gate naming
  // a rung that does not exist would otherwise be a silent no-op at runtime —
  // a boss that simply never uses its signature move, with every test green.
  const checkAbilities = (list, where) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) {
      err(`${where} must be a list`);
      return;
    }
    for (const ability of list) {
      if (!ability || typeof ability !== "object") {
        err(`${where} entry must be a mapping`);
        continue;
      }
      const id = ability.id;
      if (!ABILITY_FIELDS[id]) {
        err(
          `${where}: unknown ability "${id}" ` +
            `(valid: ${Object.keys(ABILITY_FIELDS).join(", ")})`,
        );
        continue;
      }
      // Every ability telegraphs and every ability has a gap between casts —
      // there is no such thing as a catalog entry without these two.
      for (const field of ["windupMs", "cooldownMs", ...ABILITY_FIELDS[id]]) {
        if (ability[field] === undefined) {
          err(`${where} "${id}": missing required field "${field}"`);
        } else if (
          field !== "defId" &&
          field !== "sprite" &&
          (typeof ability[field] !== "number" ||
            !Number.isFinite(ability[field]))
        ) {
          err(`${where} "${id}": ${field} must be a finite number`);
        }
      }
      if (
        ability.minDifficulty !== undefined &&
        !DIFFICULTIES.has(ability.minDifficulty)
      ) {
        err(
          `${where} "${id}": unknown minDifficulty ` +
            `"${ability.minDifficulty}" (valid: ${[...DIFFICULTIES].join(", ")})`,
        );
      }
      // A tell shorter than a reaction is not a tell: the floor may only ever
      // SHORTEN the authored windup, never lengthen it into a lie.
      if (
        ability.windupFloorMs !== undefined &&
        ability.windupFloorMs > ability.windupMs
      ) {
        err(
          `${where} "${id}": windupFloorMs (${ability.windupFloorMs}) is above ` +
            `windupMs (${ability.windupMs}) — the floor may only shorten a windup`,
        );
      }
      // THE ABILITY'S OWN LOOK. Optional (an ability that says nothing draws in
      // a neutral kit), but a PARTIAL one is refused: the whole point of the
      // elite tier is that a shared primitive wears the caster's own colours,
      // and a kit missing a stop falls back silently.
      if (ability.look !== undefined) {
        if (typeof ability.look !== "object" || Array.isArray(ability.look)) {
          err(`${where} "${id}": look must be a mapping of colours`);
        } else {
          for (const stop of LOOK_FIELDS) {
            if (typeof ability.look[stop] !== "string") {
              err(`${where} "${id}": look.${stop} must be a colour string`);
            }
          }
          for (const stop of Object.keys(ability.look)) {
            if (!LOOK_FIELDS.includes(stop) && stop !== "wellLook") {
              err(
                `${where} "${id}": unknown look field "${stop}" ` +
                  `(valid: ${LOOK_FIELDS.join(", ")})`,
              );
            }
          }
        }
      }
      // ── THE ELITE TIER's own bounds. Each of these is a number that reads as
      // plausible and plays as broken, which is exactly what a build check is
      // for: nothing below crashes, they just quietly stop being mechanics.
      // A SNARE that stops the hero dead is not a slow, it is a stun with no
      // tell and no end — and one that does nothing is a wasted cast.
      if (id === "snare_field" && typeof ability.slowFactor === "number") {
        if (ability.slowFactor <= 0 || ability.slowFactor >= 1) {
          err(
            `${where} "snare_field": slowFactor (${ability.slowFactor}) must be ` +
              `between 0 and 1 — 1 holds nobody, 0 is a stun`,
          );
        }
      }
      // A DRAIN that returns more than it took is a heal wearing a costume: the
      // mob gains on a fight it is losing, and the player's damage stops
      // meaning anything.
      if (id === "siphon_tether" && typeof ability.healFrac === "number") {
        if (ability.healFrac < 0 || ability.healFrac > 1) {
          err(
            `${where} "siphon_tether": healFrac (${ability.healFrac}) must be ` +
              `within [0, 1] — it may only keep what it took`,
          );
        }
      }
      // A BOLT that turns on a coin cannot be outrun, and a projectile that
      // cannot be outrun is not a projectile, it is damage on a delay.
      if (id === "seeker_volley" && typeof ability.homing === "number") {
        if (ability.homing < 0 || ability.homing > 1) {
          err(`${where} "seeker_volley": homing must be within [0, 1]`);
        }
      }
      // A SHOUT that made the horde slower or gentler is a gift.
      if (id === "rally_cry") {
        for (const field of ["speedMult", "damageMult"]) {
          if (typeof ability[field] === "number" && ability[field] < 1) {
            err(
              `${where} "rally_cry": ${field} (${ability[field]}) is below 1 — ` +
                `a rally may only lift the horde`,
            );
          }
        }
      }
      // A SHELL with no budget never eats anything and never breaks, so the
      // player never learns it is there.
      if (id === "ward_shield" && typeof ability.poolFrac === "number") {
        if (ability.poolFrac <= 0) {
          err(`${where} "ward_shield": poolFrac must be above 0`);
        }
      }
      // A BLINK that arrives further out than it started is a retreat, and one
      // that arrives on top of the hero gets shoved back out by the collision
      // pass — what the player sees is a mob stuttering, not arriving.
      if (id === "blink_strike") {
        if (
          typeof ability.arriveDistance === "number" &&
          typeof ability.range === "number" &&
          ability.arriveDistance >= ability.range
        ) {
          err(
            `${where} "blink_strike": arriveDistance (${ability.arriveDistance}) ` +
              `must be well inside range (${ability.range})`,
          );
        }
        if (
          typeof ability.arriveDistance === "number" &&
          ability.arriveDistance <= 0
        ) {
          err(`${where} "blink_strike": arriveDistance must be above 0`);
        }
      }
      // The optional per-mob knobs: a number if present at all.
      for (const field of OPTIONAL_ABILITY_FIELDS[id] ?? []) {
        if (ability[field] === undefined) continue;
        if (
          typeof ability[field] !== "number" ||
          !Number.isFinite(ability[field])
        ) {
          err(`${where} "${id}": ${field} must be a finite number`);
        }
      }
      // A shell raised at FULL health is a mob with more health rather than a
      // move — the player has to see it go up in answer to something they did.
      if (
        id === "ward_shield" &&
        typeof ability.raiseBelowHpFrac === "number" &&
        (ability.raiseBelowHpFrac <= 0 || ability.raiseBelowHpFrac > 1)
      ) {
        err(
          `${where} "ward_shield": raiseBelowHpFrac (${ability.raiseBelowHpFrac}) ` +
            `must be within (0, 1] — above 1 raises the shell before it is hurt`,
        );
      }
      if (id === "flag_plant") ref(refs.enemies, ability.defId, "planted body");
      if (id === "recompile") ref(refs.enemies, ability.defId, "repair node");
      // A LOCKDOWN with no way out is a damage window, not a mechanic.
      if (id === "lockdown" && ability.gapDeg !== undefined) {
        if (ability.gapDeg <= 0) {
          err(`${where} "lockdown": gapDeg must leave a way out`);
        }
      }
      // What a pod delivers is optional, but a named breed must exist — a typo
      // here would land an empty crater with every check green.
      if (id === "airstrike" && ability.hatch !== undefined) {
        ref(refs.enemies, ability.hatch, "pod payload");
        if (
          ability.hatchCount === undefined ||
          typeof ability.hatchCount !== "number"
        ) {
          err(`${where} "airstrike": hatch needs a numeric hatchCount`);
        }
      }
    }
  };
  checkAbilities(def.mechanics?.abilities, "mechanics.abilities");
  for (const phase of def.phases ?? [])
    checkAbilities(phase.mechanics?.abilities, "phase mechanics.abilities");
  for (const id of def.shieldedBy ?? []) ref(refs.enemies, id, "shieldedBy");
  ref(refs.companions, def.spareable?.companion, "companion");

  for (const item of def.loot?.items ?? []) {
    const id = typeof item === "string" ? item : item?.defId;
    ref(refs.items, id, "loot item");
  }
  for (const id of def.loot?.storyItems ?? [])
    ref(refs.storyItems, id, "loot story item");
  for (const id of def.loot?.uniqueItems ?? [])
    ref(refs.uniques, id, "loot unique");
  for (const list of Object.values(def.uniquesByDifficulty ?? {}))
    for (const id of list ?? []) ref(refs.uniques, id, "difficulty unique");

  // AN XP SCROLL REFRESHES RATHER THAN STACKS, so two shed by one body is one
  // double-XP window and a wasted drop — the second is picked up inside the
  // first's thirty seconds and overwrites it. Authoring more than one is
  // therefore always a mistake about the item, not a generosity dial: make the
  // body richer with gear or a deeper `tierBonus` instead.
  if ((def.loot?.xpScrolls ?? 0) > 1)
    err(
      `loot.xpScrolls is ${def.loot.xpScrolls} — a scroll REFRESHES rather than stacks, so a pile off one body is one window; cap it at 1`,
    );

  // Soft: an apparition can't die, so death-only fields read as author error.
  if (def.apparition && (def.loot || def.lastWords))
    warn(`apparition carries loot/lastWords, which never fire`);

  return { errors, warnings };
}
