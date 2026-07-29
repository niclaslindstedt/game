// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
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
import { validateLevel } from "../../scripts/asset-tools/level-schema.mjs";
import { validateSprite } from "../../scripts/asset-tools/sprite-schema.mjs";
import { hexToRgba } from "../../scripts/asset-tools/sprite-yaml.mjs";
import { loadEnemies } from "../../scripts/enemy-data/load-yaml.mjs";
import { loadLevels } from "../../scripts/level-data/load-yaml.mjs";

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

  if (errors.length > 0) return { bundle: null, errors, warnings };

  const modEnemies = enemies?.enemies ?? {};
  const modLevels = (levels?.entries ?? []).map((e) => e.def);

  if (modLevels.length === 0 && Object.keys(modEnemies).length === 0) {
    fail(
      "a mod must add at least one level or one enemy — a bundle of nothing " +
        "would install and do nothing at all",
    );
  }

  checkIds(manifest, catalog, kind, modEnemies, modLevels, sprites, errors);

  // Cross-references resolve against the base game PLUS this mod's own
  // additions, which is what lets a mod's level name a mod's monster.
  const refs = {
    enemies: union(catalog.enemies, Object.keys(modEnemies)),
    enemyRoles: new Map([
      ...Object.entries(catalog.enemyRoles),
      ...Object.entries(modEnemies).map(([id, d]) => [id, d.role]),
    ]),
    weapons: new Set(catalog.weapons),
    gear: new Set(catalog.gear),
    abilities: new Set(catalog.abilities),
    thoughts: new Set(catalog.thoughts),
    storyItems: new Set(catalog.storyItems),
    uniques: new Set(catalog.uniques),
    worldUniques: new Set(catalog.worldUniques),
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
function checkIds(manifest, catalog, kind, enemies, levels, sprites, errors) {
  const shipped = {
    enemy: new Set(catalog.enemies),
    sprite: new Set(catalog.sprites),
  };
  const clashes = [];
  for (const id of Object.keys(enemies)) {
    if (shipped.enemy.has(id)) clashes.push(`enemy "${id}"`);
  }
  for (const s of sprites) {
    if (shipped.sprite.has(s.name)) clashes.push(`sprite "${s.name}"`);
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
