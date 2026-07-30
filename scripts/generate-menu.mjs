#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The TITLE MENU pipeline. Compiles `content/mainmenu.yaml` — the whole menu
// tree, its row order, labels, icons and help lines — into the catalog the
// title screen builds its rows from.
//
// It emits into `pwa/src/generated/` rather than `src/generated/`, for the same
// reason the sound bank does: a menu is an APP concern. The engine has no idea
// the game has a title screen, and parking the tree in its tree would hand
// every consumer of `@game/core` a pile of chrome it never reads.
//
// TWO THINGS ARE DERIVED HERE so nothing has to derive them at runtime — and,
// more to the point, so nothing can derive them DIFFERENTLY:
//
//   THE TRAIL   a screen's breadcrumb is its ancestors' names, nearest last
//               ("SETTINGS » CONTROLS" over KEY BINDINGS). It used to be typed
//               out per screen in a `switch`, one string per heading, which is
//               two copies of the hierarchy that were free to disagree.
//   THE HOME    which row of the parent the cursor lands on coming BACK. Every
//               BACK row used to carry a hardcoded INDEX into the screen above
//               it (`backTo(ctx, "settings", 4)`), so inserting a settings row
//               silently re-pointed three other screens' back rows.
//
// The output is gitignored and regenerated on every build, so the YAML is the
// single source of truth.
//
//   node scripts/generate-menu.mjs
//
// It imports nothing from the engine or the app — the sprite names come off the
// content tree and the glyph set out of the font's own authored map — so it is
// a leaf in the generator chain with no dependents.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ROOT_SCREEN,
  resolveHome,
  validateMenuScreen,
  validateMenuTree,
  walkUp,
} from "./asset-tools/menu-schema.mjs";
import { loadMenu } from "./menu-data/load-yaml.mjs";

const repo = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// ---- Sprite stems (content/sprites/<family>/<name>.yaml, stem == sprite id;
// underscore-prefixed files are family/core preambles, not sprites). ----------
const spritesDir = repo("content/sprites");
const sprites = new Set();
for (const family of readdirSync(spritesDir, { withFileTypes: true })) {
  if (!family.isDirectory()) continue;
  for (const file of readdirSync(`${spritesDir}/${family.name}`)) {
    if (!file.endsWith(".yaml") || file.startsWith("_")) continue;
    sprites.add(file.slice(0, -".yaml".length));
  }
}

// ---- Load ------------------------------------------------------------------
const { screens, entries } = loadMenu();

// ---- Validate --------------------------------------------------------------
const errors = [];
const warnings = [];
for (const { id, screen } of entries) {
  const res = validateMenuScreen(id, screen, { sprites });
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
{
  const res = validateMenuTree(screens);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} menu schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

// ---- Compile ---------------------------------------------------------------
const compiled = {};
for (const { id, screen } of entries) {
  const dev = isDev(id);
  compiled[id] = prune({
    id,
    title: screen.title,
    trail: trailFor(id),
    tone: screen.tone ?? "player",
    form: screen.surface ? undefined : (screen.form ?? "menu"),
    surface: screen.surface,
    parent: screen.parent,
    home: id === ROOT_SCREEN ? undefined : resolveHome(screens, id).home,
    scroll: screen.scroll || undefined,
    notice: screen.notice || undefined,
    dev: dev || undefined,
    rows: screen.rows.map((row) =>
      prune({
        id: row.id,
        label: row.label,
        icon: row.icon,
        help: row.help,
        opens: row.opens,
      }),
    ),
  });
}

/** A screen is developer-only if it says so, or if anything above it does. */
function isDev(id) {
  if (screens[id].dev) return true;
  return (walkUp(screens, id) ?? []).some((screen) => screen.dev);
}

/**
 * A screen's breadcrumb: its ancestors' short names, root-first, joined with
 * the pixel font's own `»`. The root is never in it (its logo is the header),
 * and an authored `trail:` overrides — `""` drops it, which is what the
 * campaign pickers do with their long flavour titles.
 */
function trailFor(id) {
  const screen = screens[id];
  if (screen.trail !== undefined) return screen.trail || undefined;
  const names = (walkUp(screens, id) ?? [])
    .filter((up) => up.id !== ROOT_SCREEN)
    .map((up) => up.trailName ?? up.title)
    .filter((name) => typeof name === "string" && name.length > 0)
    .reverse();
  return names.length > 0 ? names.join(" » ") : undefined;
}

function prune(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  );
}

// ---- Emit ------------------------------------------------------------------
const banner = `// @generated by scripts/generate-menu.mjs — DO NOT EDIT.
// Source of truth: content/mainmenu.yaml. Regenerate with
// \`npm run levels\` (also runs inside \`npm run assets\` / \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`;

const out = `${banner}
import type { MenuScreenDef } from "../game/title-screen/menu-tree.ts";

/** Every title-menu screen, keyed by id — the compiled \`content/mainmenu.yaml\`.
 * \`trail\` and \`home\` are DERIVED from the tree at build time, so no reader
 * ever computes (or disagrees about) where BACK goes. */
export const MENU_TREE = ${JSON.stringify(compiled, null, 2)} as unknown as Record<
  string,
  MenuScreenDef
>;
`;

const destDir = repo("pwa/src/generated");
mkdirSync(destDir, { recursive: true });
writeFileSync(`${destDir}/menu.ts`, out);
const rows = Object.values(compiled).reduce((n, s) => n + s.rows.length, 0);
console.log(
  `wrote pwa/src/generated/menu.ts — ${Object.keys(compiled).length} screens, ${rows} authored rows`,
);
