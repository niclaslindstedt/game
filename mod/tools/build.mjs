// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// THE MOD COMPILER — a mod folder of YAML in, one validated JSON bundle out.
//
// This is the whole of what makes a mod safe to load: the game NEVER interprets
// a mod's YAML at runtime. The compiler reads it once — in the desktop shell's
// main process, or on a modder's machine via the CLI — validates every def
// against the SAME schema the shipped campaign goes through, and emits a
// `mod.json` bundle of plain data. The page then only ever sees JSON that has
// already been checked, which is what lets the renderer stay sandboxed with no
// filesystem and no YAML parser in it.
//
// Three rules hold the format together:
//
//  1. **A mod's content is authored exactly like the game's.** A mod's level is
//     a `content/levels/<id>.yaml` file, its enemy a
//     `content/enemies/<biome>/<id>.yaml` file, its sprite a
//     `content/sprites/<family>/<name>.yaml` file — same keys, same schema,
//     same validator. That is why the loaders take a directory (see
//     `scripts/*-data/load-yaml.mjs`): "it works in my mod" and "it works in
//     the game" have to mean the same thing, and they only do if there is one
//     schema rather than a second, friendlier one that drifts.
//  2. **Cross-references resolve against BASE ∪ MOD.** A mod's level may name a
//     shipped enemy, its own new enemy, or both, and an unknown id is an error
//     at COMPILE time with a file and a line — never a blank sprite or a
//     missing monster at play time.
//  3. **Nothing executes.** A bundle is data: defs, and sprites as raw pixels.
//     There is no scripting hook, and adding one would turn "subscribe to a
//     mod" into "run a stranger's code".
//
// See mod/README.md for the authoring guide and mod/FORMAT.md for the
// reference.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { validateEnemy } from "../../scripts/asset-tools/enemy-schema.mjs";
import { validateItem } from "../../scripts/asset-tools/item-schema.mjs";
import { validateLevel } from "../../scripts/asset-tools/level-schema.mjs";
import { validateSound } from "../../scripts/asset-tools/sound-schema.mjs";
import { validateSprite } from "../../scripts/asset-tools/sprite-schema.mjs";
import { hexToRgba } from "../../scripts/asset-tools/sprite-yaml.mjs";
import { loadEnemies } from "../../scripts/enemy-data/load-yaml.mjs";
import {
  baseDef,
  splitItems,
  toRecord,
  uniqueDef,
} from "../../scripts/item-data/compile.mjs";
import { loadItems } from "../../scripts/item-data/load-yaml.mjs";
import { loadLevels } from "../../scripts/level-data/load-yaml.mjs";
import { loadSounds } from "../../scripts/sound-data/load-yaml.mjs";

/** The bundle format the game loads. Bumped on a breaking change so an old
 * build refuses a new bundle loudly instead of half-reading it. */
export const BUNDLE_FORMAT = 1;

/** A mod id: lowercase, url-safe, and long enough to not collide by accident.
 * It namespaces nothing by itself — see `checkIds` — but it IS the folder name
 * a Workshop item unpacks into and the key the game remembers a mod by. */
const MOD_ID = /^[a-z][a-z0-9-]{2,31}$/;

const KINDS = new Set(["addon", "conversion"]);

/**
 * Compile a mod directory.
 *
 * @param modDir  the folder holding `mod.yaml`
 * @param catalog the parsed `mod/catalog.json` — every id the base game ships
 * @returns `{ bundle, errors, warnings }`. `bundle` is null when `errors` is
 *          non-empty: a mod that does not compile is never half-loaded.
 */
export function buildMod(modDir, catalog) {
  const errors = [];
  const warnings = [];
  const fail = (msg) => errors.push(msg);

  // ---------------------------------------------------------------------
  // 1. The manifest.
  // ---------------------------------------------------------------------
  const manifestPath = path.join(modDir, "mod.yaml");
  if (!existsSync(manifestPath)) {
    return {
      bundle: null,
      errors: [`${rel(modDir)}: no mod.yaml — every mod needs a manifest`],
      warnings,
    };
  }

  let manifest;
  try {
    manifest = parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    return {
      bundle: null,
      errors: [`mod.yaml: not valid YAML — ${e.message}`],
      warnings,
    };
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      bundle: null,
      errors: ["mod.yaml: expected a mapping"],
      warnings,
    };
  }

  if (!MOD_ID.test(String(manifest.id ?? ""))) {
    fail(
      `mod.yaml: id "${manifest.id}" must be 3–32 chars, lowercase letters, ` +
        "digits and dashes, starting with a letter",
    );
  }
  for (const key of ["name", "version", "author"]) {
    if (!String(manifest[key] ?? "").trim()) {
      fail(`mod.yaml: ${key} is required`);
    }
  }
  const kind = manifest.kind ?? "addon";
  if (!KINDS.has(kind)) {
    fail(
      `mod.yaml: kind "${kind}" — expected "addon" (adds to the game) or ` +
        '"conversion" (replaces the campaign)',
    );
  }

  // ---------------------------------------------------------------------
  // 2. The content, through the game's own loaders and schemas.
  // ---------------------------------------------------------------------
  const enemies = loadTree(
    () => loadEnemies(path.join(modDir, "enemies")),
    "enemies",
    fail,
  );
  // A mod's own ladder rows — where ITS venues sit on the campaign's depth
  // ladder. Optional only because a mod may ship enemies and no levels.
  const ladderPath = path.join(modDir, "ladder.yaml");
  let extraLadder = {};
  if (existsSync(ladderPath)) {
    try {
      extraLadder = parse(readFileSync(ladderPath, "utf8")) ?? {};
    } catch (e) {
      fail(`ladder.yaml: not valid YAML — ${e.message}`);
    }
  }
  const levels = loadTree(
    () => loadLevels(path.join(modDir, "levels"), { extraLadder }),
    "levels",
    fail,
  );
  const sprites = loadSprites(path.join(modDir, "sprites"), errors, warnings);
  const items = loadTree(() => loadItems(modDir), "items", fail);
  const sounds = loadTree(
    () => loadSounds(path.join(modDir, "sounds")),
    "sounds",
    fail,
  );

  if (errors.length > 0) return { bundle: null, errors, warnings };

  const modEnemies = enemies?.enemies ?? {};
  const modLevels = (levels?.entries ?? []).map((e) => e.def);
  const modItems = splitItems(items?.entries ?? []);

  const modSounds = sounds?.entries ?? [];
  const adds =
    modLevels.length +
    Object.keys(modEnemies).length +
    (items?.entries?.length ?? 0) +
    modSounds.length;
  if (adds === 0) {
    fail(
      "a mod must add at least one level, enemy, item or sound — a bundle " +
        "of nothing would install and do nothing at all",
    );
  }

  checkIds(
    manifest,
    catalog,
    kind,
    modEnemies,
    modLevels,
    modItems,
    sprites,
    modSounds,
    errors,
  );

  // Cross-references resolve against the base game PLUS this mod's own
  // additions, which is what lets a mod's level name a mod's monster.
  const modWeaponIds = modItems.weapons.map((e) => e.id);
  const modGearIds = modItems.gear.map((e) => e.id);
  const modUniqueIds = modItems.uniques.map((e) => e.id);
  const refs = {
    enemies: union(catalog.enemies, Object.keys(modEnemies)),
    enemyRoles: new Map([
      ...Object.entries(catalog.enemyRoles),
      ...Object.entries(modEnemies).map(([id, d]) => [id, d.role]),
    ]),
    events: new Set(catalog.events ?? []),
    weapons: union(catalog.weapons, modWeaponIds),
    gear: union(catalog.gear, modGearIds),
    abilities: new Set(catalog.abilities),
    thoughts: new Set(catalog.thoughts),
    storyItems: new Set(catalog.storyItems),
    uniques: union(catalog.uniques, modUniqueIds),
    // A mod's unique is `world: true` or it is not — the same flag the shipped
    // ones carry, and the reason a level may name it in a world pool.
    worldUniques: union(
      catalog.worldUniques,
      modItems.uniques.filter((e) => e.doc.world).map((e) => e.id),
    ),
    doorKeys: new Set(catalog.doorKeys),
  };
  // The enemy schema wants a different slice: `items` is weapons ∪ gear (the
  // pool a `loot.items` line may name), and it has no notion of sprites.
  const enemyRefs = {
    enemies: refs.enemies,
    companions: new Set(catalog.companions),
    uniques: refs.uniques,
    storyItems: refs.storyItems,
    items: union(catalog.weapons, catalog.gear),
  };
  for (const { id, def } of enemies?.entries ?? []) {
    const res = validateEnemy(def, enemyRefs);
    errors.push(...prefix(res.errors, `enemies/${id}`));
    warnings.push(...prefix(res.warnings, `enemies/${id}`));
  }
  // Items validate against the base catalogs PLUS this mod's own, so a mod's
  // unique may sit on a mod's base weapon. Sprites are the base atlas plus the
  // mod's — an item names ONE sprite (its icon), unlike a mob's two frames.
  const soundIds = union(
    catalog.sounds ?? [],
    modSounds.map((e) => e.id),
  );
  const claimed = new Map();
  for (const entry of modSounds) {
    const res = validateSound(entry.doc, { events: refs.events });
    errors.push(...prefix(res.errors, `sounds/${entry.id}`));
    warnings.push(...prefix(res.warnings, `sounds/${entry.id}`));
    // Two of a mod's OWN sounds answering one event shape is the same error the
    // shipped pipeline reports: which of them plays would be decided by file
    // order, which is not a decision anybody made. (Two MODS colliding is a
    // different thing entirely, and the load order settles that one.)
    if (!entry.doc.on) continue;
    const key = soundMatchKey(entry.doc.on);
    if (claimed.has(key)) {
      errors.push(
        `sounds "${claimed.get(key)}" and "${entry.id}" both answer ` +
          `${key} — one event shape, one sound`,
      );
    }
    claimed.set(key, entry.id);
  }
  // A weapon may name its own sound; an id that resolves to nothing would fall
  // back to the class sound at play time, which is a silent "my sound never
  // plays" rather than an error anybody can act on.
  for (const entry of items?.entries ?? []) {
    const sfx = entry.doc.sfx;
    if (sfx && !soundIds.has(sfx)) {
      errors.push(
        `items/${entry.rarity}/${entry.id}: sfx "${sfx}" is not a sound this ` +
          "mod ships or the game has",
      );
    }
  }

  const itemRefs = {
    weapons: refs.weapons,
    gear: refs.gear,
    sprites: union(
      catalog.sprites,
      sprites.map((s) => s.name),
    ),
  };
  for (const entry of items?.entries ?? []) {
    // `grades:` mints extra ids at ENGINE LOAD, out of a catalog that ships
    // compiled into the build — there is no runtime seam to add to, so a mod
    // that authored one would silently get nothing. Refuse it with the reason
    // rather than dropping it.
    if (entry.doc.grades) {
      errors.push(
        `items/${entry.rarity}/${entry.id}: \`grades:\` is not available to ` +
          "mods — the grade catalog is compiled into the game. Author the " +
          "exceptional/elite versions as their own items instead.",
      );
    }
    const res = validateItem(entry.doc, itemRefs);
    errors.push(...prefix(res.errors, `items/${entry.rarity}/${entry.id}`));
    warnings.push(...prefix(res.warnings, `items/${entry.rarity}/${entry.id}`));
  }
  for (const entry of levels?.entries ?? []) {
    const res = validateLevel(entry.def, refs, entry.description);
    errors.push(...prefix(res.errors, `levels/${entry.id}`));
    warnings.push(...prefix(res.warnings, `levels/${entry.id}`));
  }

  // The one cross-reference no shipped schema makes, because the shipped
  // pipeline cannot get it wrong: the atlas is GENERATED from the sprite tree,
  // so a name that resolves at build time always resolves at draw time. A mod's
  // sprites are merged into the atlas at load instead, so a typo here draws an
  // enemy as nothing at all — silently, because `spriteByName` answers
  // undefined and the renderer simply skips it. Catch it while there is still
  // a filename to blame.
  const spriteNames = union(
    catalog.sprites,
    sprites.map((s) => s.name),
  );
  for (const { id, def } of enemies?.entries ?? []) {
    // A mob's `sprite` names a FAMILY — the renderer draws `<sprite>_0`/`_1`.
    if (def.sprite && !spriteNames.has(`${def.sprite}_0`)) {
      errors.push(
        `enemies/${id}: sprite "${def.sprite}" has no frames — expected at ` +
          `least "${def.sprite}_0" in this mod's sprites/ or in the base game`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // 3. The campaign order. A CONVERSION replaces the game's; an ADDON's
  //    levels hang off the campaign they were authored into.
  // ---------------------------------------------------------------------
  const campaign = campaignOrder(manifest, kind, levels?.entries ?? [], errors);

  if (errors.length > 0) return { bundle: null, errors, warnings };

  return {
    bundle: {
      formatVersion: BUNDLE_FORMAT,
      id: manifest.id,
      name: manifest.name,
      version: String(manifest.version),
      author: manifest.author,
      description: manifest.description ?? "",
      kind,
      campaign,
      levels: modLevels,
      enemies: modEnemies,
      weapons: toRecord(modItems.weapons, baseDef),
      gear: toRecord(modItems.gear, baseDef),
      uniques: toRecord(modItems.uniques, uniqueDef),
      sounds: Object.fromEntries(
        modSounds.map((e) => [e.id, { id: e.id, voices: e.doc.voices }]),
      ),
      // Event shape → sound id, keyed exactly as the game's own catalog is, so
      // a mod can replace a shipped sound by answering the same event.
      soundKeys: Object.fromEntries(
        modSounds
          .filter((e) => e.doc.on)
          .map((e) => [soundMatchKey(e.doc.on), e.id]),
      ),
      sprites,
    },
    errors,
    warnings,
  };
}

/** Run one loader, turning its loud throw into a finding. The loaders throw
 * because a broken SHIPPED tree must stop the build; a broken MOD must only
 * stop that mod. */
function loadTree(load, what, fail) {
  try {
    return load();
  } catch (e) {
    fail(`${what}: ${e.message}`);
    return null;
  }
}

/**
 * Sprites, decoded to raw pixels here rather than in the game.
 *
 * The page gets `width × height × RGBA` bytes, base64'd — no palette, no grid,
 * no YAML. That keeps the whole pixel format on this side of the wall, so the
 * renderer's job stays "make an ImageBitmap out of these bytes" and a mod
 * cannot reach the atlas pipeline at all.
 */
function loadSprites(spritesDir, errors, warnings) {
  const out = [];
  if (!existsSync(spritesDir)) return out;

  const families = readdirSync(spritesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const seen = new Set();
  for (const family of families) {
    const dir = path.join(spritesDir, family);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
      .sort();
    for (const file of files) {
      const label = `sprites/${family}/${file}`;
      let sprite;
      try {
        sprite = parse(readFileSync(path.join(dir, file), "utf8"));
      } catch (e) {
        errors.push(`${label}: not valid YAML — ${e.message}`);
        continue;
      }
      const stem = file.slice(0, -".yaml".length);
      if (sprite?.name !== stem) {
        errors.push(`${label}: name is "${sprite?.name}", expected "${stem}"`);
        continue;
      }
      const res = validateSprite(sprite);
      errors.push(...prefix(res.errors, label));
      warnings.push(...prefix(res.warnings, label));
      if (res.errors.length > 0) continue;

      if (seen.has(sprite.name)) {
        errors.push(`${label}: duplicate sprite name "${sprite.name}"`);
        continue;
      }
      seen.add(sprite.name);
      out.push(rasterize(sprite));
    }
  }
  return out;
}

/** One validated sprite → `{ name, width, height, rgba }`, the pixels base64'd
 * row-major RGBA. `.` is the reserved transparent key. */
function rasterize(sprite) {
  const [width, height] = sprite.size;
  const palette = {};
  for (const [char, hex] of Object.entries(sprite.palette ?? {})) {
    palette[char] = hexToRgba(hex);
  }
  const rows = String(sprite.grid).replace(/\n$/, "").split("\n");
  const bytes = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const char = rows[y][x];
      if (char === ".") continue; // transparent, already zeroed
      const [r, g, b, a] = palette[char];
      const i = (y * width + x) * 4;
      bytes[i] = r;
      bytes[i + 1] = g;
      bytes[i + 2] = b;
      bytes[i + 3] = a;
    }
  }
  return {
    name: sprite.name,
    width,
    height,
    rgba: bytes.toString("base64"),
  };
}

/**
 * Id collisions, which mean different things per kind.
 *
 * An ADDON is playing alongside the shipped game, so a clash is a bug: the
 * player subscribed to something that adds a level and it silently ate one of
 * theirs. A CONVERSION is replacing the game, so a clash is the point — it is
 * how a mod re-skins THE MOON rather than adding a seventh venue — and is
 * allowed, loudly, in the report.
 */
/** An `on:` block as the runtime looks a sound up by. Mirrors `soundKey` in
 * pwa/src/game/sfx/index.ts and the generator's own copy — three places, one
 * shape, and the sound tests pin all of them. */
function soundMatchKey(on) {
  return [
    on.type,
    on.weaponClass ?? "",
    on.crit ?? "",
    on.kind ?? "",
    on.tier ?? "",
  ].join("|");
}

function checkIds(
  manifest,
  catalog,
  kind,
  enemies,
  levels,
  items,
  sprites,
  sounds,
  errors,
) {
  const shipped = {
    enemy: new Set(catalog.enemies),
    sprite: new Set(catalog.sprites),
    sound: new Set(catalog.sounds ?? []),
    weapon: new Set(catalog.weapons),
    gear: new Set(catalog.gear),
    unique: new Set(catalog.uniques),
  };
  const clashes = [];
  for (const id of Object.keys(enemies)) {
    if (shipped.enemy.has(id)) clashes.push(`enemy "${id}"`);
  }
  for (const s of sprites) {
    if (shipped.sprite.has(s.name)) clashes.push(`sprite "${s.name}"`);
  }
  for (const s of sounds) {
    if (shipped.sound.has(s.id)) clashes.push(`sound "${s.id}"`);
  }
  for (const [list, what] of [
    [items.weapons, "weapon"],
    [items.gear, "gear piece"],
    [items.uniques, "unique"],
  ]) {
    const known = shipped[what === "gear piece" ? "gear" : what];
    for (const entry of list) {
      if (known.has(entry.id)) clashes.push(`${what} "${entry.id}"`);
    }
  }
  // A level id is checked against the shipped campaign by name; the game's own
  // registry throws on a duplicate, so this must never reach it.
  for (const def of levels) {
    if (catalog.levels?.includes(def.id)) clashes.push(`level "${def.id}"`);
  }

  if (clashes.length === 0 || kind === "conversion") return;
  errors.push(
    `${clashes.length} id(s) already exist in the base game: ` +
      `${clashes.slice(0, 8).join(", ")}${clashes.length > 8 ? ", …" : ""}. ` +
      `Prefix them with "${manifest.id}_", or set kind: conversion if this ` +
      "mod is meant to REPLACE that content rather than add to it.",
  );
}

/** The campaign a conversion declares, checked against the levels it ships. */
function campaignOrder(manifest, kind, entries, errors) {
  const ids = entries.map((e) => e.id);
  if (kind !== "conversion") {
    // An addon's levels join the game's own order at their authored index.
    return null;
  }
  const declared = manifest.campaign;
  if (!Array.isArray(declared) || declared.length === 0) {
    errors.push(
      "mod.yaml: a conversion must list its campaign — `campaign: [level-id, …]` " +
        "in play order. It REPLACES the game's, so there is nothing to fall " +
        "back to.",
    );
    return null;
  }
  for (const id of declared) {
    if (!ids.includes(id)) {
      errors.push(
        `mod.yaml: campaign names "${id}", which this mod does not ship ` +
          `(it has ${ids.length ? ids.join(", ") : "no levels"})`,
      );
    }
  }
  return declared;
}

const union = (...lists) => new Set(lists.flat());
const prefix = (msgs, label) => msgs.map((m) => `${label}: ${m}`);
const rel = (p) => path.basename(p);
