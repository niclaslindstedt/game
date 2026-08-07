// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The IN-GAME MENU loader — NOT the title menu's, which is `load-yaml.mjs`
// beside it and is deliberately the one loader in the repo that takes no
// directory (a mod that could re-author the title tree could hand itself the
// DEVELOPER screen). The two are opposites on purpose: the title menu decides
// which screens EXIST, and these draw screens the ENGINE already raises, so
// there is nothing here a mod could give itself.
//
// The IN-GAME MENU loader — the windows a run puts in front of the player, the
// modals stacked over them, the rows other files hang off both, and the Lua
// judgements behind all of it.
//
// It takes a BASE DIRECTORY for the reason the HUD's loader does: a MOD's
// `menus/` folder goes through this exact loader and this exact schema, so "it
// works in my mod" and "it works in the game" mean the same thing. A menu hands
// out no screens the engine does not already raise, so there is nothing a mod
// could give itself by re-authoring one.
//
// The tree, under `<base>/menus/`:
//
//   <id>.yaml           a MENU — one of the run's own screens, drawn.
//   modals/<id>.yaml    a MODAL — a window raised by a press or by its `when:`.
//   elements/<id>.yaml  a ROW placed into a window by id, merged later-wins —
//                       so a mod adds a button to the pause menu by shipping
//                       one small file and restating nothing.
//   scripts/<f>.lua     the judgements (a row's worth, a modal's moment) the
//                       windows reference as `{ script: "f.fn" }`.
//
// ONE FILE PER WINDOW, for the same reason there is one file per HUD element: a
// single menus.yaml holding all twelve would mean a mod that wants a different
// pause menu has to restate the bag, the map and the stall to get it.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load an in-game menu tree.
 *
 * @param baseDir the tree holding a `menus/` folder (the game's `content/`, or
 *                a mod's root).
 * @returns `{ menus, modals, elements, scripts }` — `menus`/`modals`/`elements`
 *          arrays in file order with each `id` stamped from its filename, and
 *          `scripts` `[{ id, source, file }]`.
 * @throws  on a structural error — a file that is not a mapping, an `id:` that
 *          disagrees with its filename. A broken SHIPPED tree must stop the
 *          build; the mod compiler catches the throw and blames the mod.
 */
export function loadMenus(baseDir = SHIPPED_ROOT) {
  const dir = path.join(baseDir, "menus");
  const empty = { menus: [], modals: [], elements: [], scripts: [] };
  if (!existsSync(dir)) return empty;

  const errors = [];
  const menus = readDocs(dir, "menus", errors);
  const modals = readDocs(path.join(dir, "modals"), "menus/modals", errors);
  const elements = readDocs(
    path.join(dir, "elements"),
    "menus/elements",
    errors,
  );

  const scripts = [];
  const scriptsDir = path.join(dir, "scripts");
  if (existsSync(scriptsDir)) {
    for (const file of readdirSync(scriptsDir)
      .filter((f) => f.endsWith(".lua") && !f.startsWith("_"))
      .sort()) {
      scripts.push({
        id: file.slice(0, -".lua".length),
        source: readFileSync(path.join(scriptsDir, file), "utf8"),
        file: `menus/scripts/${file}`,
      });
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n  "));
  return { menus, modals, elements, scripts };
}

/** Every `<id>.yaml` directly inside one folder, id stamped from the stem. */
function readDocs(dir, where, errors) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".yaml") &&
        !entry.name.startsWith("_"),
    )
    .map((entry) => entry.name)
    .sort()) {
    const id = file.slice(0, -".yaml".length);
    const at = `${where}/${file}`;
    let doc;
    try {
      doc = parse(readFileSync(path.join(dir, file), "utf8"));
    } catch (e) {
      errors.push(`${at}: not valid YAML — ${e.message}`);
      continue;
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push(`${at}: expected a mapping`);
      continue;
    }
    if (doc.id !== undefined && doc.id !== id) {
      errors.push(`${at}: id is "${doc.id}", expected "${id}" (its filename)`);
      continue;
    }
    out.push({ ...doc, id });
  }
  return out;
}
