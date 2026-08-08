// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The IN-GAME MENU schema — what `content/menus/**` may say.
//
// THE WINDOWS A RUN PUTS IN FRONT OF THE PLAYER ARE CONTENT. The pause menu,
// the bag, the map, the stall, the chooser, the confirm that asks before it
// bins your vault — every one of them is a file under `content/menus/`, and a
// mod ships the same files in the same format. So "restyle the pause menu",
// "put a row on the bag", "give my conversion its own confirm box" and "add a
// monster" are the same act.
//
// TWO KINDS OF WINDOW, and the difference is who raises it:
//
//   A MENU is bound to one of the run's own per-player SCREENS
//          (`PlayerScreen` — `paused`, `inventory`, `map`, …). The engine
//          decides the hero is standing behind it; the file decides what it
//          looks like. Two menus may answer the same screen, each gated on its
//          own `visible:` — which is how HOW TO PLAY's exit confirm and the
//          ordinary pause menu share `paused`.
//   A MODAL is raised on demand: by a press (`action: openModal`, `arg:` its
//          id), or by its own `when:` — a flag, a list of them, or a Lua
//          judgement, which raises it the moment the answer turns yes. That is
//          the whole of "draw a modal from a script": a mod ships a `.lua` that
//          says WHEN, and a `.yaml` that says WHAT.
//
// A window's rows are the HUD's own nodes (`validateHudNode`) — the same kinds,
// bindings, presses, judgements and bounded style block. One grammar, so
// authoring a menu row and authoring a HUD element are the same skill, and
// neither can drift.
//
// EVERY TOP-LEVEL ROW HAS A NAME, and that refusal is the mod story: an element
// under `content/menus/elements/` merges into a window's body BY ID, later
// wins, so a mod adds a row by shipping a new id and replaces the shipped
// RESUME button by shipping its id. A row with no name could be neither.

import {
  HUD_NODE_FIELDS,
  validateHudNode,
  validateHudPress,
} from "./hud-schema.mjs";

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * The run's per-player screens — `PlayerScreen` in `engine/game/types/core.ts`.
 *
 * A menu names the one it answers. The list is the ENGINE's and a mod may not
 * add to it: a screen nothing raises is a window nobody would ever see.
 * `tests/content/ingame_menu_catalog_test.ts` pins this to the engine's own
 * type through the runtime.
 */
export const MENU_SCREENS = new Set([
  "paused",
  "levelup",
  "respec",
  "inventory",
  "map",
  "questLog",
  "shop",
  "cache",
  "quest",
  "talk",
  "companion",
  "trade",
]);

/**
 * The code-backed insides.
 *
 * The same escape hatch the HUD's widgets are, and for the same reason: a bag
 * grid with drag-and-drop, a fog-of-war map, a talk box that types itself out
 * are not expressible as boxes and words. Content places, gates, orders,
 * frames and sounds them; their guts stay TypeScript.
 *
 * `pwa/src/game/menus/widgets.tsx` answers these names, and
 * `tests/content/ingame_menu_catalog_test.ts` pins the two together — a widget
 * the schema accepts and the app does not draw is an empty window.
 */
export const MENU_WIDGETS = new Set([
  "inventoryPanel",
  "characterSheet",
  "mapPanel",
  "questLogPanel",
  "shopPanel",
  "cachePanel",
  "companionPanel",
  "levelupChooser",
  "respecPanel",
  "talkBox",
  "questBox",
  "tradeTable",
  // The pause menu's two: the live session roster, and the AUTO PILOT pickers
  // that stack over it (the speed rungs, the coin store, the last-call confirm).
  "sessionPanel",
  "autopilotPickers",
]);

/** How a window draws itself. `window` builds the backdrop and the box from
 * this file; `none` draws neither and lets the body stand on its own — which is
 * what a widget that already paints its own full-screen furniture needs. */
const WRAPS = new Set(["window", "none"]);

const MENU_FIELDS = new Set([
  "id",
  "screen",
  "order",
  "wrap",
  "backdrop",
  "class",
  "frame",
  "style",
  "dismiss",
  "sound",
  "visible",
  "body",
]);

/** A modal is a menu with no screen behind it, plus the two fields that decide
 * when it rises on its own. */
const MODAL_FIELDS = new Set(
  [...MENU_FIELDS, "when", "once"].filter((f) => f !== "screen"),
);

/** A row placed into somebody else's window: a node, plus where it goes. */
const ELEMENT_EXTRA = new Set(["menu", "into", "order"]);

const ID_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const CLASS_RE = /^[a-zA-Z][\w-]*(\s+[a-zA-Z][\w-]*)*$/;

/**
 * Validate ONE window — a menu or a modal.
 *
 * @param {object} menu the authored window, `id` stamped from its filename.
 * @param {{ sprites: Set<string>, sounds: Set<string>, scripts: Map<string, Set<string>> }} refs
 * @param {{ modal?: boolean }} opts
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateMenu(menu, refs, opts = {}) {
  const errors = [];
  const warnings = [];
  const modal = opts.modal === true;
  const id = String(menu?.id ?? "");
  const where = `${modal ? "modal" : "menu"} "${id}"`;
  if (!menu || typeof menu !== "object" || Array.isArray(menu)) {
    return { errors: [`${where}: expected a mapping`], warnings };
  }
  if (!ID_RE.test(id)) errors.push(`${where}: id must be lower_snake_case`);

  const fields = modal ? MODAL_FIELDS : MENU_FIELDS;
  for (const key of Object.keys(menu)) {
    if (!fields.has(key)) {
      errors.push(
        `${where}: unknown field "${key}" — a ${modal ? "modal" : "menu"} ` +
          `says ${[...fields].sort().join(", ")}`,
      );
    }
  }

  if (!modal) {
    if (typeof menu.screen !== "string") {
      errors.push(
        `${where}: needs a screen — which of the run's own windows it draws ` +
          `(${[...MENU_SCREENS].sort().join(", ")}). A window nothing raises ` +
          "is a modal: author it under modals/ instead",
      );
    } else if (!MENU_SCREENS.has(menu.screen)) {
      errors.push(
        `${where}: screen "${menu.screen}" is not one the run has — ` +
          `${[...MENU_SCREENS].sort().join(", ")}`,
      );
    }
  }

  if (menu.order !== undefined && typeof menu.order !== "number") {
    errors.push(`${where}: order must be a number`);
  }
  if (menu.wrap !== undefined && !WRAPS.has(menu.wrap)) {
    errors.push(
      `${where}: wrap "${menu.wrap}" — expected ${[...WRAPS].join(" or ")}`,
    );
  }
  for (const key of ["class", "backdrop"]) {
    if (menu[key] === undefined) continue;
    if (typeof menu[key] !== "string" || !CLASS_RE.test(menu[key])) {
      errors.push(
        `${where}: ${key} must be a CSS class name (or a list of them)`,
      );
    }
  }
  if (menu.wrap === "none") {
    for (const key of ["class", "backdrop", "frame", "style", "dismiss"]) {
      if (menu[key] !== undefined) {
        errors.push(
          `${where}: wrap: none draws no box, so it cannot carry ${key} — ` +
            "the body paints its own furniture",
        );
      }
    }
  }
  if (menu.frame !== undefined) {
    if (typeof menu.frame !== "string") {
      errors.push(`${where}: frame must be a sprite id (a 9-slice border)`);
    } else if (!refs.sprites.has(menu.frame)) {
      errors.push(`${where}: frame sprite "${menu.frame}" is not in the atlas`);
    }
  }
  if (menu.sound !== undefined) {
    if (typeof menu.sound !== "string") {
      errors.push(`${where}: sound must be a sound id`);
    } else if (menu.sound !== "none" && !refs.sounds.has(menu.sound)) {
      errors.push(
        `${where}: sound "${menu.sound}" is not a sound this build ships — ` +
          "author it under sounds/ first",
      );
    }
  }

  // `dismiss:` is a PRESS on the backdrop, authored as a press so it can carry
  // its own sound and argument — a backdrop that resumes the run and one that
  // lowers a modal are the same gesture with two different verbs behind it.
  if (menu.dismiss !== undefined) {
    const res = validateHudPress(
      menu.dismiss,
      `${where} dismiss`,
      nodeRefs(refs),
    );
    errors.push(...res.errors);
  }

  if (menu.when !== undefined) {
    // The trigger is an ordinary condition, checked as one — which is what
    // makes `when: { script: "alerts.hero_is_bleeding" }` legal and
    // `when: hud.downed` legal too.
    const res = validateHudNode(
      { kind: "panel", visible: menu.when },
      `${where} when`,
      nodeRefs(refs),
    );
    errors.push(...res.errors.map((e) => e.replace(" visible:", " when:")));
  }
  if (menu.once !== undefined && typeof menu.once !== "boolean") {
    errors.push(`${where}: once must be true or false`);
  }

  errors.push(...checkStyleBlock(menu.style, where, refs));

  // ---- the body ----------------------------------------------------------
  if (menu.body === undefined) {
    errors.push(`${where}: needs a body (the rows the window draws)`);
  } else if (!Array.isArray(menu.body)) {
    errors.push(`${where}: body must be a list of rows`);
  } else {
    const seen = new Set();
    for (const [index, row] of menu.body.entries()) {
      const rowId = String(row?.id ?? "");
      if (!ID_RE.test(rowId)) {
        errors.push(
          `${where}: body row ${index} needs an id — every row of a window ` +
            "has a name so a mod can replace it by shipping that name",
        );
      } else if (seen.has(rowId)) {
        errors.push(`${where}: two body rows called "${rowId}"`);
      } else {
        seen.add(rowId);
      }
      if (row?.order !== undefined && typeof row.order !== "number") {
        errors.push(`${where}: row "${rowId}": order must be a number`);
      }
      for (const key of Object.keys(row ?? {})) {
        if (key === "menu") {
          errors.push(
            `${where}: row "${rowId}": a row authored INSIDE a window is ` +
              "already in one — `menu:` is for a row shipped under elements/",
          );
        }
      }
      const res = validateHudNode(
        row,
        `${where} row "${rowId}"`,
        nodeRefs(refs),
        true,
      );
      errors.push(...res.errors);
      warnings.push(...res.warnings);
      errors.push(...checkRowFields(row, `${where} row "${rowId}"`));
    }
  }

  return { errors, warnings };
}

/**
 * Validate one free-standing ELEMENT — a row shipped under
 * `content/menus/elements/`, which merges into the window it names.
 *
 * This is the addon seam: a mod that wants one more button on the pause menu
 * ships one small file and restates nothing.
 */
export function validateMenuElement(element, refs) {
  const errors = [];
  const warnings = [];
  const id = String(element?.id ?? "");
  const where = `menu element "${id}"`;
  if (!element || typeof element !== "object" || Array.isArray(element)) {
    return { errors: [`${where}: expected a mapping`], warnings };
  }
  if (!ID_RE.test(id)) errors.push(`${where}: id must be lower_snake_case`);
  if (typeof element.menu !== "string") {
    errors.push(
      `${where}: needs a menu — the window this row is placed in (its id, or ` +
        "a modal's)",
    );
  } else if (refs.menus !== undefined && !refs.menus.has(element.menu)) {
    errors.push(
      `${where}: menu "${element.menu}" is not a window this build has — ` +
        `${[...refs.menus].sort().join(", ")}`,
    );
  }
  // `into:` names a CONTAINER row inside that window — the pause menu's action
  // stack is the case, and it is the difference between "a mod may add a button
  // to the pause menu" and "a mod may add a button next to the pause menu". The
  // row it names is checked at merge time rather than here: each mod was
  // compiled alone, and a container the game renamed must leave the row
  // somewhere rather than failing the build.
  if (element.into !== undefined && typeof element.into !== "string") {
    errors.push(`${where}: into must be the id of a row in that window`);
  }
  if (element.order !== undefined && typeof element.order !== "number") {
    errors.push(`${where}: order must be a number`);
  }
  const res = validateHudNode(element, where, nodeRefs(refs), true);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
  errors.push(...checkRowFields(element, where, ELEMENT_EXTRA));
  return { errors, warnings };
}

/**
 * The whole catalog's own refusals — the ones no single file can see.
 *
 * A SCREEN WITH NO WINDOW is the one that matters: the engine can park a hero
 * behind any of its screens, so a screen no menu answers is a hero stuck
 * looking at the field with the world frozen and nothing on top of it.
 */
export function validateMenuCatalog(menus, modals, elements) {
  const errors = [];
  const warnings = [];
  const answered = new Set(menus.map((menu) => menu.screen));
  for (const screen of MENU_SCREENS) {
    if (!answered.has(screen)) {
      errors.push(
        `no menu answers the run's "${screen}" screen — a hero parked behind ` +
          "it would look at nothing. Author content/menus/<id>.yaml with " +
          `screen: ${screen}`,
      );
    }
  }
  const ids = new Set();
  for (const window of [...menus, ...modals]) {
    if (ids.has(window.id)) {
      errors.push(`two windows called "${window.id}" — a menu and a modal`);
    }
    ids.add(window.id);
  }
  // A row aimed at a window that is not there draws nowhere. Only a mod can
  // cause it (each was compiled alone), so it is a warning there and an error
  // here — `refs.menus` is what the shipped build passes.
  for (const element of elements) {
    if (!ids.has(element.menu)) {
      errors.push(
        `menu element "${element.id}": no window called "${element.menu}"`,
      );
    }
  }
  return { errors, warnings };
}

/** The HUD node checker's refs, narrowed to a menu's vocabulary. */
function nodeRefs(refs) {
  return {
    sprites: refs.sprites,
    sounds: refs.sounds,
    scripts: refs.scripts,
    widgets: MENU_WIDGETS,
    scriptDir: "menus/scripts",
    // A window HAS containers (the pause menu's action stack), so the rows
    // inside one carry an order and a mod can insert between them.
    nestedOrder: true,
  };
}

/**
 * A top-level row's own field list.
 *
 * The HUD's checker skips it for a top-level node on purpose — the catalog that
 * PLACES the node owns how it is placed — so this is where a menu row's
 * placement fields are settled. `region:` gets its own sentence because it is
 * the mistake somebody porting a HUD element will make.
 */
function checkRowFields(row, where, extra = new Set(["order"])) {
  const errors = [];
  const allowed = new Set([...HUD_NODE_FIELDS, ...extra]);
  allowed.delete("region");
  for (const key of Object.keys(row ?? {})) {
    if (key === "region") {
      errors.push(
        `${where}: a menu row sits in a WINDOW, not a HUD region — drop "region"`,
      );
    } else if (!allowed.has(key)) {
      errors.push(`${where}: unknown field "${key}"`);
    }
  }
  return errors;
}

/** A window's own style block — the same bounded set an element's is, checked
 * through the same node checker so the two can never disagree. */
function checkStyleBlock(style, where, refs) {
  if (style === undefined) return [];
  const res = validateHudNode(
    { kind: "panel", style },
    `${where}`,
    nodeRefs(refs),
  );
  return res.errors;
}
