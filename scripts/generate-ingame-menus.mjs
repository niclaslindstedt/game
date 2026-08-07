#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The IN-GAME MENU pipeline. Compiles `content/menus/**` — every window the run
// puts in front of the player, the modals stacked over them, the rows hung off
// both and the Lua judgements behind all of it — into
// `pwa/src/generated/ingame-menus.ts`, which `pwa/src/game/menus/` draws.
//
// It emits into `pwa/src/generated/` for the reason the HUD, the sound bank and
// the title menu do: a window is an APP concern. The engine knows a hero is
// standing behind a screen; it has no idea what that screen looks like.
//
// The SCRIPTS are compiled the way the HUD's and the engine's rules are: the
// OUTPUT is the source text (the VM parses at load, once per run), but the
// CHECK is a real compile with the game's own VM — so a syntax error, a missing
// `return M`, or a function a window asks for and the file does not export
// fails `npm run levels` with a file and a line instead of failing silently on
// a phone.
//
//   node scripts/generate-ingame-menus.mjs
//
// It runs LATE, beside the HUD: it cross-references the sprite tree (a window's
// frame), the sound tree (a row's press) and its own scripts, and nothing
// downstream reads it.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  validateMenu,
  validateMenuCatalog,
  validateMenuElement,
} from "./asset-tools/ingame-menu-schema.mjs";
import { moduleExports } from "./asset-tools/script-schema.mjs";
import { loadMenus } from "./menu-data/load-ingame-yaml.mjs";

const repo = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// ---- The trees a window may point at ---------------------------------------
// Sprite stems and sound ids, read off the content tree exactly as the HUD's
// generator reads them — no engine import, so this stays a leaf.
const sprites = new Set();
const spritesDir = repo("content/sprites");
for (const family of readdirSync(spritesDir, { withFileTypes: true })) {
  if (!family.isDirectory()) continue;
  for (const file of readdirSync(`${spritesDir}/${family.name}`)) {
    if (!file.endsWith(".yaml") || file.startsWith("_")) continue;
    sprites.add(file.slice(0, -".yaml".length));
  }
}
const sounds = new Set();
for (const file of readdirSync(repo("content/sounds"))) {
  if (!file.endsWith(".yaml") || file.startsWith("_")) continue;
  sounds.add(file.slice(0, -".yaml".length));
}

// ---- Load ------------------------------------------------------------------
const { menus, modals, elements, scripts } = loadMenus();

// ---- Validate --------------------------------------------------------------
const errors = [];
const warnings = [];

// The scripts first: what they export is what the windows are checked against.
const exported = new Map();
for (const { id, source, file } of scripts) {
  const res = moduleExports(source, file);
  errors.push(...res.errors);
  exported.set(id, res.functions);
}

const refs = {
  sprites,
  sounds,
  scripts: exported,
  menus: new Set([...menus, ...modals].map((window) => window.id)),
};

for (const menu of menus) {
  const res = validateMenu(menu, refs);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
for (const modal of modals) {
  const res = validateMenu(modal, refs, { modal: true });
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
for (const element of elements) {
  const res = validateMenuElement(element, refs);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
{
  const res = validateMenuCatalog(menus, modals, elements);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}

// A shipped script nothing points at is dead weight in the bundle and, worse, a
// reader's false lead — the menus look like they consult a rule they never call.
const referenced = new Set();
for (const window of [...menus, ...modals, ...elements]) {
  collectScripts(window, referenced);
}
for (const { id } of scripts) {
  if (![...referenced].some((ref) => ref.split(".")[0] === id)) {
    warnings.push(`menus/scripts/${id}.lua: no window points at it`);
  }
}

for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} in-game menu schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

/** Walk a window for every `{ script: "file.fn" }` it carries. */
function collectScripts(node, into) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const entry of node) collectScripts(entry, into);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "script" && typeof value === "string") into.add(value);
    else collectScripts(value, into);
  }
}

// ---- Compile ---------------------------------------------------------------
// The compiled shape is the AUTHORED shape with the defaults filled in, so the
// renderer never asks "and what does an absent wrap mean".
//
// A ROW'S ORDER IS TEN TIMES ITS PLACE unless it says otherwise, and that is
// the whole reason a mod can INSERT: the shipped pause menu's rows are 0, 10,
// 20, 30, so a mod's own row at 15 lands between the second and the third
// without either file knowing about the other.
const compiledMenus = menus
  .map((menu) => compileWindow(menu))
  .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
const compiledModals = modals
  .map((modal) => compileWindow(modal))
  .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
// AN ELEMENT'S ORDER IS LEFT ALONE when it authored none, and that absence is
// load-bearing: at merge time a row with no order of its own takes the place of
// the row it replaces, or goes to the end if it replaces nothing (see
// `windowRows`). Defaulting it here would put every addon row at the top.
const compiledElements = elements
  .map((element) => ({
    ...compileNode(element),
    id: element.id,
    menu: element.menu,
    into: element.into,
    order: element.order,
  }))
  .map(prune)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : 1));

function compileWindow(window) {
  return prune({
    id: window.id,
    screen: window.screen,
    order: window.order ?? 0,
    wrap: window.wrap ?? "window",
    backdrop: window.backdrop,
    class: window.class,
    frame: window.frame,
    style: window.style,
    dismiss: window.dismiss,
    sound: window.sound,
    visible: window.visible,
    when: window.when,
    once: window.once,
    body: (window.body ?? []).map((row, index) => compileRow(row, index)),
  });
}

function compileRow(row, index) {
  return { ...compileNode(row), id: row.id, order: row.order ?? index * 10 };
}

function compileNode(node) {
  return prune({
    id: node.id,
    kind: node.kind,
    widget: node.widget,
    class: node.class,
    classes: node.classes,
    style: node.style,
    frame: node.frame,
    sprite: node.sprite,
    spriteBind: node.spriteBind,
    text: node.text,
    bind: node.bind,
    format: node.format,
    scale: node.scale,
    color: node.color,
    visible: node.visible,
    ref: node.ref,
    aria: node.aria,
    press: node.press,
    fill: node.fill,
    overlay: node.overlay,
    thickness: node.thickness,
    sweep: node.sweep,
    start: node.start,
    track: node.track,
    zone: node.zone,
    width: node.width,
    height: node.height,
    // A CHILD IS ORDERED TOO, ten times its place — the pause menu's rows are
    // 0, 10, 20, 30, 40, so a mod's row at 15 lands in the middle of the stack.
    // The HUD's own nodes have no such thing: there is nothing inside a HUD
    // element to insert into, and its schema refuses a nested order for exactly
    // that reason.
    children: node.children?.map((child, index) => ({
      ...compileNode(child),
      order: child.order ?? index * 10,
    })),
  });
}

function prune(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  );
}

// ---- Emit ------------------------------------------------------------------
const banner = `// @generated by scripts/generate-ingame-menus.mjs — DO NOT EDIT.
// Source of truth: content/menus/. Regenerate with
// \`npm run levels\` (also runs inside \`npm run assets\` / \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`;

const out = `${banner}
import type {
  MenuDef,
  MenuElementDef,
} from "../game/menus/types.ts";
import type { HudScriptSource } from "../game/hud/types.ts";

/** Every shipped MENU — one of the run's own screens, drawn. A mod's own merge
 * in by id, later wins. */
export const MENUS = ${JSON.stringify(compiledMenus, null, 2)} as unknown as MenuDef[];

/** Every shipped MODAL — a window raised by a press or by its own \`when:\`. */
export const MENU_MODALS = ${JSON.stringify(compiledModals, null, 2)} as unknown as MenuDef[];

/** Rows shipped on their own, each naming the window it merges into. */
export const MENU_ELEMENTS = ${JSON.stringify(compiledElements, null, 2)} as unknown as MenuElementDef[];

/** The menus' Lua judgements, by file stem. The SOURCE travels, not a compiled
 * form: the VM parses at load, once. */
export const MENU_SCRIPTS: Record<string, HudScriptSource> = ${JSON.stringify(
  Object.fromEntries(
    scripts.map((s) => [s.id, { id: s.id, source: s.source }]),
  ),
  null,
  2,
)};
`;

const destDir = repo("pwa/src/generated");
mkdirSync(destDir, { recursive: true });
writeFileSync(`${destDir}/ingame-menus.ts`, out);
console.log(
  `wrote pwa/src/generated/ingame-menus.ts — ${compiledMenus.length} menus, ` +
    `${compiledModals.length} modals, ${compiledElements.length} elements, ` +
    `${scripts.length} scripts`,
);
