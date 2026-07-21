#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Art-audit tooling (see the `art-improvement` skill): numbered contact
// sheets for auditing the game's art level by level (or the item catalog),
// funneling a shortlist down to the worst offenders, sketching replacement
// concepts, and building the final before/after sheet for user review.
//
// Sheets render from the sprite-data source grids (same source as `make
// assets`), so they never disagree with the atlas. Every cell is numbered
// and listed in a legend, so a shortlist round is "look at the sheet, pick
// numbers". Output lands in website/assets-preview/audit/ (gitignored).
//
//   node scripts/art-audit.mjs levels
//   node scripts/art-audit.mjs level moon
//   node scripts/art-audit.mjs items
//   node scripts/art-audit.mjs equipped
//   node scripts/art-audit.mjs equipped icon_medieval_sword icon_tshirt
//   node scripts/art-audit.mjs sheet wraith optimusk icon_stick
//   node scripts/art-audit.mjs variants wraith boulder
//   node scripts/art-audit.mjs snapshot wraith optimusk
//   node scripts/art-audit.mjs concepts /path/to/concepts.mjs
//   node scripts/art-audit.mjs before-after wraith optimusk
//   node scripts/art-audit.mjs names "^icon_"
//   node scripts/art-audit.mjs palette spacez
//
// Flags: --out <png>  --scale <n>  --cols <n>  --chunk <n>

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { measureText, renderText } from "./asset-tools/font.mjs";
import { gridToSurface, validateGrid } from "./asset-tools/grid.mjs";
import { writePng } from "./asset-tools/preview.mjs";
import {
  blit,
  createSurface,
  fill,
  mirrorX,
  tileSurface,
  upscale,
} from "./asset-tools/surface.mjs";
import {
  FAMILIES,
  SPRITE_FAMILY,
  SPRITE_PALETTES,
  SPRITES,
} from "./sprite-data/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const auditDir = path.join(here, "../website/assets-preview/audit");
const beforeDir = path.join(auditDir, "before");

const { LEVELS, LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { ENEMY_DEFS } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);
const { WEAPON_DEFS } = await import(
  path.join(root, "src/game/defs/equipment.ts")
);
const { GEAR_DEFS } = await import(path.join(root, "src/game/defs/gear.ts"));
const { ABILITY_DEFS } = await import(
  path.join(root, "src/game/defs/abilities.ts")
);
const { STORY_ITEM_DEFS } = await import(
  path.join(root, "src/game/defs/story.ts")
);

const BG = [24, 24, 28, 255];
const INK = [244, 244, 244, 255];
const DIM = [150, 150, 160, 255];

// ---- Sprite resolution ------------------------------------------------------

/** Resolve a base name to an atlas sprite key (`name` or `name_0`). */
function resolveSprite(name) {
  if (SPRITES[name]) return name;
  if (SPRITES[`${name}_0`]) return `${name}_0`;
  return null;
}

/** The ground tile surface for an entry: its own `groundKey`, else the
 * sprite's family ground (moon_0 fallback). */
function groundFor(entry) {
  const family = FAMILIES.find((f) => f.name === SPRITE_FAMILY[entry.key]);
  const ground = entry.groundKey ?? family?.ground ?? "moon_0";
  return gridToSurface(SPRITES[ground], SPRITE_PALETTES[ground]);
}

function surfaceFor(key) {
  return gridToSurface(SPRITES[key], SPRITE_PALETTES[key]);
}

// ---- Equipped-on-hero (paper-doll) composition -----------------------------
// A weapon or gear icon reads very differently as a loose inventory square than
// it does WORN/WIELDED on the hero — so the audit can dress the hero in a
// candidate and judge the equipped look, the way the field renderer draws it.
// This mirrors website/src/game/paper-doll.ts (which can't be imported here:
// it pulls in DOM-only canvas code via @ui/lib). Keep these constants in
// lockstep with that module — HELD_DX/HELD_DY and LEFT_POINTING_ICONS.
const HELD_DX = 9; // held weapon icon's anchor on the 16×16 hero body
const HELD_DY = 2;
const DOLL_WIDTH = HELD_DX + 12; // body plus the held icon's overhang
const DOLL_HEIGHT = 16;
const ARMOR_SLOTS = new Set(["head", "chest", "legs", "feet"]);
// Icons drawn pointing LEFT (the pistol family and kin) — mirrored in place so
// the business end leads in the facing direction like every other icon.
const LEFT_POINTING_ICONS = new Set([
  "icon_flare_gun",
  "icon_longbow",
  "icon_nine_mm",
  "icon_overclocked_laser",
  "icon_prototype_laser",
  "icon_retro_raygun",
  "icon_service_revolver",
  "icon_smart_pistol",
]);

/** Compose an ordered [{ sprite, dx, dy, flip }] layer stack onto a doll-sized
 * surface (a missing sprite degrades to "not drawn", as in the real doll). */
function composeDoll(layers) {
  const surface = createSurface(DOLL_WIDTH, DOLL_HEIGHT);
  for (const layer of layers) {
    if (!SPRITES[layer.sprite]) {
      console.warn(`! no sprite "${layer.sprite}" — doll layer skipped`);
      continue;
    }
    const s = surfaceFor(layer.sprite);
    blit(surface, layer.flip ? mirrorX(s) : s, layer.dx, layer.dy);
  }
  return surface;
}

/** The hero holding one weapon icon — its inventory sprite gripped at the
 * hand, exactly where the field renderer draws the held weapon. */
function weaponDoll(icon) {
  return composeDoll([
    { sprite: "player_0", dx: 0, dy: 0 },
    {
      sprite: icon,
      dx: HELD_DX,
      dy: HELD_DY,
      flip: LEFT_POINTING_ICONS.has(icon),
    },
  ]);
}

/** The hero wearing one armor piece — the generated `worn_<id>` overlay on the
 * body (legs/feet use the `_0` stride frame; grades share their base's look). */
function gearDoll(def) {
  const base = def.gradeBase ?? def.id;
  const suffix = def.slot === "legs" || def.slot === "feet" ? "_0" : "";
  return composeDoll([
    { sprite: "player_0", dx: 0, dy: 0 },
    { sprite: `worn_${base}${suffix}`, dx: 0, dy: 0 },
  ]);
}

/**
 * Every atlas key derived from a base name: the base itself, animation
 * frames (`_0`, `_1`, …), wound stages (`_hurt_0`, …), rock footprints
 * (`_2x1`, …) — plus, for a gear icon, the worn overlay frames.
 */
function variantKeys(name) {
  const patterns = [
    new RegExp(`^${name}(_\\d+)?$`),
    new RegExp(`^${name}_(hurt|wrecked|dying)_\\d+$`),
    new RegExp(`^${name}_\\d+x\\d+$`),
  ];
  const gear = Object.values(GEAR_DEFS).find((d) => d.icon === name);
  if (gear) patterns.push(new RegExp(`^worn_${gear.id}(_\\d+)?$`));
  return Object.keys(SPRITES).filter((key) =>
    patterns.some((re) => re.test(key)),
  );
}

// ---- Sheet builder ----------------------------------------------------------

/**
 * A numbered audit sheet: each entry `{ key, context, label?, surface?,
 * before? }` gets a cell (sprite centered over its family's ground, index at
 * top-left; `before` surfaces render as a BEFORE|AFTER cell pair) and a
 * legend line `NN label: context` below the grid. `key` picks the ground
 * (and the sprite, when no explicit `surface` is given); `label` overrides
 * what the legend calls the entry.
 */
function buildAuditSheet(entries, opts = {}) {
  const scale = opts.scale ?? 4;
  const cols = opts.cols ?? Math.min(10, entries.length);
  const pad = 2;
  const paired = entries.some((e) => e.before);

  const surfaces = entries.map((e) => e.surface ?? surfaceFor(e.key));
  const spriteMax = Math.max(
    16,
    ...surfaces.map((s) => Math.max(s.width, s.height)),
    ...entries.filter((e) => e.before).map((e) => e.before.width),
  );
  const cell = spriteMax + 8;
  const cellW = paired ? cell * 2 + pad : cell;
  const rows = Math.ceil(entries.length / cols);
  const gridW = cols * (cellW + pad) + pad;
  const gridH = rows * (cell + pad) + pad;

  // The pixel font has no "_" glyph — swap it for "-" in rendered text.
  const txt = (s) => s.toUpperCase().replace(/_/g, "-");
  const lineH = 7;
  const legend = entries.map(
    (e, i) =>
      `${String(i + 1).padStart(2)} ${txt(e.label ?? e.key)}${e.context ? `: ${txt(e.context)}` : ""}`,
  );
  const header = paired ? ["   LEFT: BEFORE / RIGHT: AFTER"] : [];
  const legendW =
    Math.max(0, ...legend.map(measureText), ...header.map(measureText)) +
    2 * pad;
  const width = Math.max(gridW, legendW);
  const height = gridH + (header.length + legend.length) * lineH + pad;

  const sheet = fill(createSurface(width, height), BG);

  entries.forEach((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + pad);
    const y = pad + row * (cell + pad);
    const ground = tileSurface(groundFor(entry), cell, cell);

    const drawCell = (surface, cx) => {
      blit(sheet, ground, cx, y);
      blit(
        sheet,
        surface,
        cx + Math.floor((cell - surface.width) / 2),
        y + Math.floor((cell - surface.height) / 2),
      );
    };
    if (entry.before) {
      drawCell(entry.before, x);
      drawCell(surfaces[i], x + cell + pad);
    } else {
      drawCell(surfaces[i], x);
    }

    // Index label over a dark backing so it reads on any ground.
    const label = renderText(String(i + 1), INK);
    blit(sheet, fill(createSurface(label.width + 2, lineH), BG), x, y);
    blit(sheet, label, x + 1, y + 1);
  });

  [...header, ...legend].forEach((line, i) => {
    blit(
      sheet,
      renderText(line, i < header.length ? DIM : INK),
      pad,
      gridH + i * lineH,
    );
  });

  return upscale(sheet, scale);
}

/** Write one sheet, chunking into `_pN` pages past `chunk` entries. */
async function writeSheets(entries, outPath, opts) {
  const chunk = opts.chunk ?? 64;
  mkdirSync(path.dirname(outPath), { recursive: true });
  const pages =
    entries.length > chunk
      ? Array.from({ length: Math.ceil(entries.length / chunk) }, (_, p) =>
          entries.slice(p * chunk, (p + 1) * chunk),
        )
      : [entries];
  for (const [p, page] of pages.entries()) {
    const file =
      pages.length === 1
        ? outPath
        : outPath.replace(/\.png$/, `_p${p + 1}.png`);
    await writePng(buildAuditSheet(page, opts), file);
    console.log(`${file}  (${page.length} entries)`);
  }
}

// ---- Entry collection -------------------------------------------------------

function pushUnique(entries, seen, name, context) {
  if (!name) return null;
  const key = resolveSprite(name);
  if (!key) {
    console.warn(`! no sprite for "${name}" (${context}) — skipped`);
    return null;
  }
  if (seen.has(key)) return null;
  seen.add(key);
  const entry = { key, context };
  entries.push(entry);
  return entry;
}

/** All MAIN art a level puts on screen (no wound/frame variants), each
 * rendered over THIS level's ground so contrast is judged in situ. */
function levelEntries(def) {
  const entries = [];
  const seen = new Set();
  const groundKey = resolveSprite(def.tiles.ground.common);
  const add = (name, context) => {
    const entry = pushUnique(entries, seen, name, context);
    if (entry) entry.groundKey = groundKey;
  };

  add("hero", "the hero");
  for (const spec of [
    ...def.spawns,
    ...(def.waves?.budget ?? []),
    ...(def.openingStrike ? [def.openingStrike] : []),
  ]) {
    const enemy = ENEMY_DEFS[spec.enemy];
    if (!enemy) continue;
    // hp rides in the legend so scale/hierarchy lies (a tanky mob drawn
    // smaller than a squishy one) are visible on the survey sheet itself,
    // not only after hand-reading the enemy defs.
    add(enemy.sprite, `${enemy.name} (${enemy.role}, ${enemy.hp}hp)`);
  }
  add(def.merchant?.sprite ?? "merchant", "the merchant");

  const { ground, patch } = def.tiles;
  add(ground.common, "ground tile");
  add(ground.rare, "ground tile (rare)");
  if (patch) {
    add(patch.a, "patch tile");
    add(patch.b, "patch tile");
  }

  for (const mark of def.landmarks) add(mark.sprite ?? mark.kind, "landmark");
  for (const ob of def.obstacles) {
    const base = ob.sprite ?? ob.kind;
    if (ob.rockSizes) {
      for (const [w, h] of ob.rockSizes) add(`${base}_${w}x${h}`, "obstacle");
    } else {
      add(base, "obstacle");
    }
  }
  for (const wall of def.walls ?? []) add(wall.sprite ?? wall.kind, "wall");
  if (def.doors?.length) add("door_locked", "locked door");
  for (const d of def.decor) add(d.sprite ?? d.kind, "decor");
  return entries;
}

/** The item catalog: every inventory/ground icon (grade dupes collapse). */
function itemEntries() {
  const entries = [];
  const seen = new Set();
  const add = (name, context) => pushUnique(entries, seen, name, context);

  for (const def of Object.values(WEAPON_DEFS)) {
    add(def.icon, `weapon: ${def.name}`);
  }
  for (const def of Object.values(GEAR_DEFS)) {
    if (def.grade) continue; // grade variants share the base icon
    add(def.icon, `gear: ${def.name} (${def.slot})`);
  }
  for (const def of Object.values(ABILITY_DEFS)) {
    add(def.icon, `ability: ${def.name}`);
  }
  for (const def of Object.values(STORY_ITEM_DEFS)) {
    add(def.icon, `story: ${def.name}`);
  }
  for (const name of ["medkit", "repair", "xp", "icon_coin", "icon_coins"]) {
    if (resolveSprite(name)) add(name, "pickup");
  }
  return entries;
}

/** The equipped catalog: every weapon held and every armor piece worn ON the
 * hero — the companion to `items`, judging each icon as it looks equipped.
 * The doll-surface entries key off `player_0` for the hero's family ground. */
function equippedEntries() {
  const entries = [];
  for (const def of Object.values(WEAPON_DEFS)) {
    entries.push({
      key: "player_0",
      label: def.icon,
      context: `weapon: ${def.name}`,
      surface: weaponDoll(def.icon),
    });
  }
  for (const def of Object.values(GEAR_DEFS)) {
    if (def.grade || !ARMOR_SLOTS.has(def.slot)) continue; // no worn overlay
    entries.push({
      key: "player_0",
      label: def.icon,
      context: `gear: ${def.name} (${def.slot})`,
      surface: gearDoll(def),
    });
  }
  return entries;
}

/** Named equippables (a weapon/armor def id OR its icon sprite) dressed on the
 * hero — the funnel's companion to `sheet`, for a shortlist of weapons/gear. */
function equippedNamed(names) {
  const weapons = Object.values(WEAPON_DEFS);
  const gear = Object.values(GEAR_DEFS);
  const entries = [];
  for (const name of names) {
    const w = weapons.find((d) => d.id === name || d.icon === name);
    if (w) {
      entries.push({
        key: "player_0",
        label: w.icon,
        context: `weapon: ${w.name}`,
        surface: weaponDoll(w.icon),
      });
      continue;
    }
    const g = gear.find(
      (d) =>
        !d.grade &&
        ARMOR_SLOTS.has(d.slot) &&
        (d.id === name || d.gradeBase === name || d.icon === name),
    );
    if (g) {
      entries.push({
        key: "player_0",
        label: g.icon,
        context: `gear: ${g.name} (${g.slot})`,
        surface: gearDoll(g),
      });
      continue;
    }
    console.warn(`! "${name}" is not an equippable weapon or armor — skipped`);
  }
  return entries;
}

// ---- Snapshots + before/after ----------------------------------------------

async function readSnapshot(key) {
  const file = path.join(beforeDir, `${key}.png`);
  try {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data };
  } catch {
    return null;
  }
}

// ---- CLI ---------------------------------------------------------------------

const USAGE = `usage:
  art-audit.mjs levels                      list level ids
  art-audit.mjs level <id>                  audit sheet of a level's main art
  art-audit.mjs items                       audit sheet(s) of the item catalog
  art-audit.mjs equipped [name...]          items ON the hero (all, or named)
  art-audit.mjs sheet <name...>             numbered shortlist sheet
  art-audit.mjs variants <name...>          sheet incl. frames/wounds/footprints
  art-audit.mjs snapshot <name...>          save current renders as "before"
  art-audit.mjs concepts <module.mjs>       render a concept scratch module
  art-audit.mjs before-after <name...>      before/after sheet from snapshots
  art-audit.mjs names <regex>               grep atlas sprite names
  art-audit.mjs palette [family|sprite]     list a family's char -> color map
flags: --out <png>  --scale <n>  --cols <n>  --chunk <n>`;

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const m = /^--(out|scale|cols|chunk)$/.exec(argv[i]);
  if (m) flags[m[1]] = argv[++i];
  else positional.push(argv[i]);
}
const [cmd, ...args] = positional;
const opts = {
  scale: flags.scale ? Number(flags.scale) : undefined,
  cols: flags.cols ? Number(flags.cols) : undefined,
  chunk: flags.chunk ? Number(flags.chunk) : undefined,
};
const out = (name) => flags.out ?? path.join(auditDir, `${name}.png`);

/** Resolve CLI names to entries, warning on unknowns. */
function namedEntries(names, expand = false) {
  const entries = [];
  const seen = new Set();
  for (const name of names) {
    if (expand) {
      const keys = variantKeys(name);
      if (keys.length === 0) console.warn(`! no sprite for "${name}"`);
      for (const key of keys) pushUnique(entries, seen, key, name);
    } else {
      pushUnique(entries, seen, name, "");
    }
  }
  return entries;
}

switch (cmd) {
  case "levels": {
    for (const id of LEVEL_ORDER) {
      const def = LEVELS[id];
      console.log(`${id}  (${def.index}. ${def.name}, biome ${def.biome})`);
    }
    break;
  }

  case "level": {
    const def = LEVELS[args[0]];
    if (!def) {
      console.error(
        `unknown level "${args[0]}" — try: ${LEVEL_ORDER.join(", ")}`,
      );
      process.exit(1);
    }
    await writeSheets(levelEntries(def), out(`level_${def.id}`), opts);
    break;
  }

  case "items": {
    await writeSheets(itemEntries(), out("items"), { cols: 12, ...opts });
    break;
  }

  case "equipped": {
    // Weapons/gear dressed on the hero — no args does the whole catalog
    // (companion to `items`), names do a shortlist (companion to `sheet`).
    const entries = args.length ? equippedNamed(args) : equippedEntries();
    if (entries.length === 0) {
      console.error(
        "no equippable items — name a weapon/armor def id or icon sprite",
      );
      process.exit(1);
    }
    await writeSheets(entries, out("equipped"), { cols: 10, ...opts });
    break;
  }

  case "sheet": {
    await writeSheets(namedEntries(args), out("sheet"), opts);
    break;
  }

  case "variants": {
    await writeSheets(namedEntries(args, true), out("variants"), opts);
    break;
  }

  case "snapshot": {
    mkdirSync(beforeDir, { recursive: true });
    for (const entry of namedEntries(args, true)) {
      await writePng(
        surfaceFor(entry.key),
        path.join(beforeDir, `${entry.key}.png`),
      );
      console.log(`${beforeDir}/${entry.key}.png`);
    }
    break;
  }

  case "concepts": {
    // A scratch module: `export default { base?, palette?, sprites }`.
    // Renders BASE (current sprite, if given) + every concept, numbered,
    // over the base family's ground — nothing touches the real families.
    const mod = (await import(path.resolve(args[0]))).default;
    const baseKey = mod.base ? resolveSprite(mod.base) : null;
    const family = baseKey
      ? FAMILIES.find((f) => f.name === SPRITE_FAMILY[baseKey])
      : null;
    const palette = { ...(family?.palette ?? {}), ...(mod.palette ?? {}) };
    for (const [char, color] of Object.entries(palette)) {
      palette[char] = [...color, 255].slice(0, 4);
    }
    const entries = [];
    if (baseKey) entries.push({ key: baseKey, context: "current" });
    for (const [name, grid] of Object.entries(mod.sprites)) {
      validateGrid(name, grid, palette);
      entries.push({
        key: baseKey ?? "moon_0", // ground lookup only
        label: name,
        context: "",
        surface: gridToSurface(grid, palette),
      });
    }
    await writeSheets(entries, out("concepts"), { scale: 6, ...opts });
    break;
  }

  case "before-after": {
    const entries = [];
    for (const name of args) {
      const key = resolveSprite(name);
      if (!key) {
        console.warn(`! no sprite for "${name}" — skipped`);
        continue;
      }
      const before = await readSnapshot(key);
      if (!before) {
        console.warn(`! no snapshot for "${key}" — run snapshot first`);
        continue;
      }
      entries.push({ key, context: "", before });
    }
    await writeSheets(entries, out("before_after"), {
      scale: 6,
      cols: 2,
      ...opts,
    });
    break;
  }

  case "names": {
    const re = new RegExp(args[0] ?? ".");
    for (const name of Object.keys(SPRITES).sort()) {
      if (re.test(name)) console.log(name);
    }
    break;
  }

  case "palette": {
    // The char -> color map a redraw draws with, so Phase 4 sketches don't
    // require hand-reading core.mjs + the family module. Accepts a family
    // name (`spacez`) or any sprite in it (`optimusk`); "*" marks a
    // family-local char, the rest come from the shared core.
    const arg = args[0];
    const names = FAMILIES.map((f) => f.name).join(", ");
    if (!arg) {
      console.log(`families: ${names}`);
      console.log("usage: art-audit.mjs palette <family|sprite>");
      break;
    }
    let family = FAMILIES.find((f) => f.name === arg);
    if (!family) {
      const key = resolveSprite(arg);
      if (key) family = FAMILIES.find((f) => f.name === SPRITE_FAMILY[key]);
    }
    if (!family) {
      console.error(`unknown family/sprite "${arg}" — families: ${names}`);
      process.exit(1);
    }
    const local = new Set(Object.keys(family.localPalette ?? {}));
    console.log(`palette "${family.name}"  (* = family-local, else core):`);
    for (const [char, color] of Object.entries(family.palette).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      const mark = local.has(char) ? "*" : " ";
      console.log(`  ${mark} ${char}  [${color.join(", ")}]`);
    }
    break;
  }

  default:
    console.log(USAGE);
    process.exit(cmd ? 1 : 0);
}
