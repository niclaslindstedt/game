#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD pipeline. Compiles `content/hud/**` — the frame, every element, the
// event sounds and the Lua judgements behind them — into
// `pwa/src/generated/hud.ts`, which `pwa/src/game/hud/` renders.
//
// It emits into `pwa/src/generated/` rather than `src/generated/`, for the same
// reason the sound bank and the title menu do: a HUD is an APP concern. The
// engine has no idea the game has a screen, and parking the layout in its tree
// would hand every consumer of `@game/core` a pile of chrome it never reads.
//
// The SCRIPTS are compiled the way the engine's rules are: the OUTPUT is the
// source text (the VM parses at load, once per run), but the CHECK is a real
// compile with the game's own VM — so a syntax error, a missing `return M` or a
// function the YAML asks for and the file does not export fails `npm run levels`
// with a file and a line, instead of failing silently on a phone.
//
//   node scripts/generate-hud.mjs
//
// It runs LATE in the chain: it cross-references the sprite tree (an element's
// icon), the sound tree (a press's click) and its own scripts, so all three have
// to be readable — but nothing downstream reads the HUD.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  validateHudCatalog,
  validateHudElement,
  validateHudEvents,
  validateHudRegions,
} from "./asset-tools/hud-schema.mjs";
import { moduleExports } from "./asset-tools/script-schema.mjs";
import { loadHud } from "./hud-data/load-yaml.mjs";

const repo = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// ---- The trees an element may point at -------------------------------------
// Sprite stems (content/sprites/<family>/<name>.yaml, stem == sprite id;
// underscore-prefixed files are family preambles, not sprites) and sound ids
// (content/sounds/<id>.yaml), read off the content tree exactly as the menu
// pipeline reads the sprites — no engine import, so this stays a leaf.
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
const { regions, elements, events, scripts } = loadHud();

// ---- Validate --------------------------------------------------------------
const errors = [];
const warnings = [];

// The scripts first: what they export is what the elements are checked against.
const exported = new Map();
for (const { id, source, file } of scripts) {
  const res = moduleExports(source, file);
  errors.push(...res.errors);
  exported.set(id, res.functions);
}

{
  const res = validateHudRegions(regions, { sprites, scripts: exported });
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
const refs = {
  sprites,
  sounds,
  scripts: exported,
  regions: new Set(Object.keys(regions)),
};
for (const element of elements) {
  const res = validateHudElement(element, refs);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
{
  const res = validateHudEvents(events, { sounds });
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
{
  const res = validateHudCatalog(elements);
  errors.push(...res.errors);
}
// A shipped script nothing points at is dead weight in the bundle and, worse, a
// reader's false lead — the HUD looks like it consults a rule it never calls.
const referenced = new Set();
for (const element of elements) collectScripts(element, referenced);
for (const region of Object.values(regions)) collectScripts(region, referenced);
for (const { id } of scripts) {
  if (![...referenced].some((ref) => ref.split(".")[0] === id)) {
    warnings.push(`hud/scripts/${id}.lua: nothing in the HUD points at it`);
  }
}

for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} hud schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

/** Walk a node (or a region) for every `{ script: "file.fn" }` it carries. */
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
// renderer never asks "and what does an absent order mean". Elements are sorted
// here rather than at mount: the order is a fact about the catalog, and two
// readers deriving it separately is two readers that can disagree.
const compiledRegions = Object.fromEntries(
  Object.entries(regions)
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
    .map(([id, region]) => [
      id,
      prune({
        id,
        parent: region.parent,
        // WHICH SCREEN DRAWS IT, filled in here so no reader has to walk the
        // parent chain to find out: a child inherits its top-level region's
        // surface, and the fight's HUD is the default.
        surface:
          region.parent === undefined ? (region.surface ?? "field") : undefined,
        order: region.order ?? 0,
        class: region.class,
        wrap: region.wrap ?? "div",
        frame: region.frame,
        style: region.style,
        visible: region.visible,
      }),
    ]),
);

const compiledElements = elements
  .map((element) => compileNode(element, true))
  .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));

function compileNode(node, top) {
  return prune({
    id: node.id,
    region: top ? node.region : undefined,
    order: top ? (node.order ?? 0) : undefined,
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
    width: node.width,
    height: node.height,
    children: node.children?.map((child) => compileNode(child, false)),
  });
}

function prune(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  );
}

// ---- Emit ------------------------------------------------------------------
const banner = `// @generated by scripts/generate-hud.mjs — DO NOT EDIT.
// Source of truth: content/hud/. Regenerate with
// \`npm run levels\` (also runs inside \`npm run assets\` / \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`;

const out = `${banner}
import type {
  HudElementDef,
  HudEvent,
  HudRegionDef,
  HudScriptSource,
} from "../game/hud/types.ts";

/** The HUD's frame — every region, keyed by id, in draw order. */
export const HUD_REGIONS = ${JSON.stringify(compiledRegions, null, 2)} as unknown as Record<
  string,
  HudRegionDef
>;

/** Every shipped HUD element, in draw order — the compiled
 * \`content/hud/elements/\`. A mod's own merge in by id, later wins. */
export const HUD_ELEMENTS = ${JSON.stringify(compiledElements, null, 2)} as unknown as HudElementDef[];

/** The app-raised HUD moments and the sound each one makes. */
export const HUD_EVENT_SOUNDS = ${JSON.stringify(events, null, 2)} as unknown as Partial<
  Record<HudEvent, string>
>;

/** The HUD's Lua judgements, by file stem. The SOURCE travels, not a compiled
 * form: the VM parses at load, once, and shipping an AST would freeze the
 * interpreter's internal shape into a build artifact. */
export const HUD_SCRIPTS: Record<string, HudScriptSource> = ${JSON.stringify(
  Object.fromEntries(
    scripts.map((s) => [s.id, { id: s.id, source: s.source }]),
  ),
  null,
  2,
)};
`;

const destDir = repo("pwa/src/generated");
mkdirSync(destDir, { recursive: true });
writeFileSync(`${destDir}/hud.ts`, out);
console.log(
  `wrote pwa/src/generated/hud.ts — ${Object.keys(compiledRegions).length} regions, ` +
    `${compiledElements.length} elements, ${Object.keys(events).length} event sounds, ` +
    `${scripts.length} scripts`,
);
