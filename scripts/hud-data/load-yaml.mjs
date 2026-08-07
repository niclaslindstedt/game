// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD loader — the frame, its elements, its event sounds and its scripts.
//
// It takes a BASE DIRECTORY for the reason every other content loader here does
// (and the reason the title menu's deliberately does not): a MOD's `hud/`
// folder goes through this exact loader and this exact schema, so "it works in
// my mod" and "it works in the game" mean the same thing. The HUD is content —
// unlike the title menu, it hands out no screens, so there is nothing a mod
// could give itself by re-authoring one.
//
// The tree, under `<base>/hud/`:
//
//   hud.yaml            the FRAME — the regions elements sit in, nested.
//   events.yaml         the app-raised moments, and what each one SOUNDS like.
//   elements/<id>.yaml  one element per file, the stem being its id — so a mod
//                       replaces the bag pouch by shipping `elements/bag.yaml`
//                       and nothing else.
//   scripts/<f>.lua     the judgements (a ring's colour, a row's worth) the
//                       elements reference as `{ script: "f.fn" }`.
//
// ONE FILE PER ELEMENT is the mod story in a directory layout. A single
// `hud.yaml` holding every element would mean a mod that wants the ammunition
// counter one pixel larger has to restate the whole HUD, and the next version
// of the game could never move anything.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load a HUD tree.
 *
 * @param baseDir  the tree holding a `hud/` folder (the game's `content/`, or a
 *                 mod's root).
 * @returns `{ regions, elements, events, scripts }`:
 *          `regions` the `{ id → region }` frame (empty when the tree ships
 *          none — a mod that only replaces an element does not restate it);
 *          `elements` an array in file order, each with its `id` stamped from
 *          its filename; `events` the `{ moment → sound id }` map; `scripts`
 *          `[{ id, source, file }]`.
 * @throws  on a structural error — a file that is not a mapping, an `id:` that
 *          disagrees with its filename. A broken SHIPPED tree must stop the
 *          build; the mod compiler catches the throw and blames the mod.
 */
export function loadHud(baseDir = SHIPPED_ROOT) {
  const dir = path.join(baseDir, "hud");
  const empty = { regions: {}, elements: [], events: {}, scripts: [] };
  if (!existsSync(dir)) return empty;

  const errors = [];

  // ---- the frame ---------------------------------------------------------
  let regions = {};
  const framePath = path.join(dir, "hud.yaml");
  if (existsSync(framePath)) {
    const doc = readYaml(framePath, "hud/hud.yaml", errors);
    if (doc) {
      const raw = doc.regions;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push("hud/hud.yaml: expected a `regions:` mapping");
      } else {
        for (const [id, region] of Object.entries(raw)) {
          if (!region || typeof region !== "object" || Array.isArray(region)) {
            errors.push(`hud/hud.yaml: region "${id}": expected a mapping`);
            continue;
          }
          if (region.id !== undefined && region.id !== id) {
            errors.push(
              `hud/hud.yaml: region "${id}": id is "${region.id}", expected "${id}"`,
            );
            continue;
          }
          regions[id] = { ...region, id };
        }
      }
    }
  }

  // ---- the elements ------------------------------------------------------
  const elements = [];
  const elementsDir = path.join(dir, "elements");
  if (existsSync(elementsDir)) {
    const files = readdirSync(elementsDir)
      .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
      .sort();
    for (const file of files) {
      const id = file.slice(0, -".yaml".length);
      const where = `hud/elements/${file}`;
      const doc = readYaml(path.join(elementsDir, file), where, errors);
      if (!doc) continue;
      if (doc.id !== undefined && doc.id !== id) {
        errors.push(
          `${where}: id is "${doc.id}", expected "${id}" (its filename)`,
        );
        continue;
      }
      elements.push({ ...doc, id });
    }
  }

  // ---- the event sounds --------------------------------------------------
  let events = {};
  const eventsPath = path.join(dir, "events.yaml");
  if (existsSync(eventsPath)) {
    const doc = readYaml(eventsPath, "hud/events.yaml", errors);
    if (doc) {
      const raw = doc.sounds;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push("hud/events.yaml: expected a `sounds:` mapping");
      } else {
        events = { ...raw };
      }
    }
  }

  // ---- the scripts -------------------------------------------------------
  const scripts = [];
  const scriptsDir = path.join(dir, "scripts");
  if (existsSync(scriptsDir)) {
    const files = readdirSync(scriptsDir)
      .filter((f) => f.endsWith(".lua") && !f.startsWith("_"))
      .sort();
    for (const file of files) {
      const id = file.slice(0, -".lua".length);
      scripts.push({
        id,
        source: readFileSync(path.join(scriptsDir, file), "utf8"),
        file: `hud/scripts/${file}`,
      });
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n  "));
  return { regions, elements, events, scripts };
}

function readYaml(file, where, errors) {
  let doc;
  try {
    doc = parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${where}: not valid YAML — ${e.message}`);
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${where}: expected a mapping`);
    return null;
  }
  return doc;
}
