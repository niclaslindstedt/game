// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD schema — what `content/hud/**` may say, and the vocabulary a HUD
// element is built out of.
//
// THE HUD IS CONTENT NOW. Where it sits, what it draws, what a press does, what
// a press SOUNDS like and whether an element is on screen at all are authored
// under `content/hud/` and compiled into `pwa/src/generated/hud.ts`. A mod
// ships the same files in the same format, so "improve the HUD" and "replace
// the HUD" are the same act as "add a monster".
//
// FOUR VOCABULARIES ARE THE SEAM between this file and the app, and each is
// exported so the runtime can be pinned to it by a test rather than by
// somebody remembering:
//
//   BINDINGS  the live values an element may read (`hud.hpFrac`, `ui.keyHints`).
//             A binding is a READ of the HUD snapshot — never a computation.
//   ACTIONS   what a press may DO (`openBag`, `pauseGame`). An action is a verb
//             the app already had; YAML chooses which button carries it.
//   WIDGETS   the code-backed pieces whose insides are irreducible — the
//             minimap canvas, the weapon switcher, the paper-doll party frames.
//             YAML places, gates and orders them; their guts stay TypeScript.
//   REFS      the handful of DOM handles the render loop writes to every frame
//             (the stamina fill, the XP heat, the minimap canvas). An element
//             that carries one is the element the loop finds.
//
// WHAT A SCRIPT IS FOR. Anything that is a JUDGEMENT rather than a read — "what
// colour is the ammunition ring at this fraction", "is this row worth showing" —
// is a Lua function in `content/hud/scripts/<file>.lua`, referenced as
// `{ script: "<file>.<fn>" }`. The rule is the engine's own (docs/scripting.md):
// a script is a FORMULA, never a frame. HUD scripts are called when the HUD
// snapshot publishes — on a real change, not sixty times a second.
//
// The refusals here are the ones that would otherwise be discovered on a phone:
// a sprite the atlas cannot answer for draws nothing, a sound id nothing ships
// is silence, a binding nobody implements is `undefined` printed into a bar, and
// a glyph outside the pixel font is a `?` in the middle of the HUD.

import { GLYPHS } from "./font.mjs";

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * Every live value an element may read, and what it is.
 *
 * `hud.*` is the HUD snapshot (`pwa/src/game/game-screen/hud-model.ts`);
 * `ui.*` is the app's own view state (which docks are up, whether key caps
 * show). The TYPE is what the compiler checks a use against: a `bar` wants a
 * `frac`, an `icon` wants a `sprite`, a `visible:` wants a `flag`.
 */
export const HUD_BINDINGS = {
  "hud.hp": "number",
  "hud.maxHp": "number",
  "hud.hpFrac": "frac",
  "hud.stamina": "number",
  "hud.maxStamina": "number",
  "hud.staminaFrac": "frac",
  "hud.xp": "number",
  "hud.xpToNext": "number",
  "hud.xpFrac": "frac",
  "hud.level": "number",
  "hud.kills": "number",
  "hud.combatMs": "number",
  "hud.enemiesLeft": "number",
  "hud.menaceStage": "number",
  "hud.coins": "number",
  "hud.bagFree": "number",
  "hud.bagIcon": "sprite",
  "hud.bagFullHint": "flag",
  "hud.questAlert": "flag",
  "hud.pointsWaiting": "flag",
  "hud.fieldLive": "flag",
  "hud.downed": "flag",
  "hud.weaponDefId": "text",
  "hud.weaponIcon": "sprite",
  "hud.weaponGauge": "frac",
  "hud.hasWeaponGauge": "flag",
  "hud.ammoCount": "number",
  "hud.ammoCap": "number",
  "hud.hasAmmo": "flag",
  "hud.companionCount": "number",
  "hud.partyCount": "number",
  "hud.tradeAskCount": "number",
  "hud.medkitTier": "number",
  "hud.medkitCount": "number",
  "hud.staminaPotions": "number",
  "hud.repairKits": "number",
  "hud.abilityCount": "number",
  "ui.keyHints": "flag",
  "ui.weaponMenuOpen": "flag",
  "ui.swipeBars": "flag",
  "ui.wide": "flag",
  "ui.autopilot": "flag",
  // THE ROAD. The drive minigame is its own surface with its own dials, and it
  // is content for exactly the reason the fight's HUD is: an interlude that
  // looked like a different program is precisely what an interlude must not do,
  // and a mod that re-skins the game should be able to re-skin the wagon's
  // dashboard along with everything else.
  "drive.mph": "number",
  "drive.topSpeedMph": "number",
  "drive.gear": "number",
  "drive.gearLabel": "number",
  "drive.gearCount": "number",
  // How far up THIS gear the wagon is — the revs. Published because a
  // TACHOMETER is the obvious next dial and a needle that only knew road speed
  // would sit still through a whole upshift.
  "drive.rev": "frac",
  "drive.reversing": "flag",
  "drive.bodies": "number",
  "drive.speedFrac": "frac",
  "drive.wear": "frac",
  "drive.wearPercent": "number",
  "drive.failing": "flag",
  "drive.paused": "flag",
};

/**
 * The SURFACES a HUD is drawn on. A top-level region declares which one it
 * belongs to and every region under it inherits that — so the fight's chrome
 * and the road's dials are one catalog, authored the same way, mounted by two
 * different screens.
 */
export const HUD_SURFACES = new Set(["field", "drive"]);

/** What a press may do. Each is a verb the app owns; YAML decides which
 * element carries it, and `mod` elements may carry any of them. */
export const HUD_ACTIONS = new Set([
  "openBag",
  "openQuestLog",
  "openPoints",
  "openMap",
  "openCharacter",
  "pauseGame",
  "toggleWeaponMenu",
  // The road's own two, which only the drive surface supplies. An action the
  // mounting screen does not provide is a press that does nothing rather than a
  // build error: the set is one vocabulary across every surface, so a mod may
  // put PULL OVER on a button of its own without the compiler having to know
  // which screen that button will end up on.
  "driveResume",
  "driveSkip",
  "none",
]);

/**
 * The code-backed pieces. An element of `kind: widget` names one, and the app
 * renders that component in its place — so a mod can move the minimap, hide the
 * party frames or drop the powerup dock without any of them being re-authorable
 * as boxes and text.
 */
export const HUD_WIDGETS = new Set([
  "heroPortrait",
  "weaponSlot",
  "companionRail",
  "partyFrames",
  "tradeAsks",
  "minimap",
  "autopilot",
  "consumableDock",
  "powerupDock",
  "swipeDock",
  "questTracker",
  "pickupFeed",
]);

/** The DOM handles the render loop writes to every frame. An element carrying
 * one IS that handle — two elements claiming the same ref is a build error,
 * because only one of them would be found. */
export const HUD_REFS = new Set([
  "xpHeat",
  "staminaFill",
  "minimapCanvas",
  "powerupDock",
]);

/** HUD moments the APP raises rather than a press — each answered by a sound in
 * `content/hud/events.yaml`. A mod may re-point one; it may not invent one,
 * because nothing would ever raise it. */
export const HUD_EVENTS = new Set([
  "trade.ask",
  "trade.accept",
  "trade.decline",
  "weapon.switch",
  "companion.heal",
  "companion.open",
  "powerup.discard",
  "hud.press",
  "hud.back",
]);

/**
 * The element kinds. `widget` is the escape hatch above; the rest are the boxes,
 * bars, pictures and words a HUD is otherwise made of.
 *
 * `gauge` is the ROUND one — a fraction drawn as an arc, which is the shape a
 * ring around a slot, a cooldown wheel and a SPEEDOMETER all are. It is the one
 * primitive that cannot be built out of the others (a box cannot be bent), and
 * having it means the road's dials can grow a needle without the app growing a
 * widget for it.
 */
const KINDS = new Set([
  "panel",
  "bar",
  "gauge",
  "icon",
  "text",
  "button",
  "widget",
]);

/** How a number is written out. */
const FORMATS = new Set(["number", "compact", "time", "percent"]);

/** The style properties an element may set. Deliberately a SHORT list: a mod
 * cannot ship CSS, so this is the whole of what an authored element can do to
 * its own box — and every entry has to survive the nine reference viewports,
 * which is why there is no absolute positioning in it. */
const STYLE_FIELDS = new Set([
  "width",
  "height",
  "minWidth",
  "minHeight",
  "gap",
  "padding",
  "margin",
  "background",
  "border",
  "borderRadius",
  "color",
  "opacity",
  "direction",
  "align",
  "justify",
]);

const DIRECTIONS = new Set(["row", "column"]);
const ALIGNS = new Set(["start", "center", "end", "stretch"]);
const JUSTIFIES = new Set(["start", "center", "end", "between"]);

const ELEMENT_FIELDS = new Set([
  "id",
  "region",
  "order",
  "kind",
  "widget",
  "class",
  "classes",
  "style",
  "frame",
  "sprite",
  "spriteBind",
  "text",
  "bind",
  "format",
  "scale",
  "color",
  "visible",
  "ref",
  "aria",
  "press",
  "fill",
  "overlay",
  "thickness",
  "sweep",
  "start",
  "track",
  "children",
]);

const REGION_FIELDS = new Set([
  "id",
  "parent",
  "surface",
  "order",
  "class",
  "wrap",
  "frame",
  "style",
  "visible",
]);

const WRAPS = new Set(["div", "none"]);

const PRESS_FIELDS = new Set(["action", "arg", "sound", "close"]);

const ID_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const SCRIPT_REF_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
/** A CSS length the compiler is willing to pass through: a plain number of
 * pixels, a percentage, or an `em`/`rem`/`vh`/`vw` figure. No `calc()`, no
 * `var()`, no `url()` — a mod's style block is data, not a stylesheet. */
const LENGTH_RE = /^-?\d+(\.\d+)?(px|%|em|rem|vh|vw)?$/;

/** Characters the pixel font cannot draw render as `?` (see pixel-font.ts). */
function unrenderable(text) {
  return [...String(text).toUpperCase()].filter((ch) => !(ch in GLYPHS));
}

/**
 * Validate ONE HUD element (and, recursively, its children).
 *
 * @param {object} element the authored element, `id` stamped from its filename.
 * @param {{ sprites: Set<string>, sounds: Set<string>, scripts: Map<string, Set<string>>, regions: Set<string> }} refs
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateHudElement(element, refs) {
  const errors = [];
  const warnings = [];
  const id = String(element?.id ?? "");
  const where = `hud element "${id}"`;
  if (!element || typeof element !== "object" || Array.isArray(element)) {
    return { errors: [`${where}: expected a mapping`], warnings };
  }
  if (!ID_RE.test(id)) {
    errors.push(`${where}: id must be lower_snake_case`);
  }
  if (typeof element.region !== "string") {
    errors.push(`${where}: needs a region (where on the HUD it sits)`);
  } else if (refs.regions.size > 0 && !refs.regions.has(element.region)) {
    errors.push(
      `${where}: region "${element.region}" is not in hud.yaml — ` +
        `known regions: ${[...refs.regions].sort().join(", ")}`,
    );
  }
  if (element.order !== undefined && typeof element.order !== "number") {
    errors.push(`${where}: order must be a number`);
  }
  for (const key of Object.keys(element)) {
    if (!ELEMENT_FIELDS.has(key))
      errors.push(`${where}: unknown field "${key}"`);
  }
  checkNode(element, where, refs, errors, warnings, true);
  return { errors, warnings };
}

/** A child node — the same grammar minus the id/region/order a top-level
 * element needs to be placed and replaced. */
function checkNode(node, where, refs, errors, warnings, top) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    errors.push(`${where}: expected a mapping`);
    return;
  }
  if (!top) {
    for (const key of Object.keys(node)) {
      if (key === "region" || key === "order") {
        errors.push(`${where}: only a top-level element carries "${key}"`);
      } else if (!ELEMENT_FIELDS.has(key)) {
        errors.push(`${where}: unknown field "${key}"`);
      }
    }
    if (node.id !== undefined && !ID_RE.test(String(node.id))) {
      errors.push(`${where}: id must be lower_snake_case`);
    }
  }

  const kind = node.kind;
  if (!KINDS.has(kind)) {
    errors.push(
      `${where}: kind "${kind}" — expected one of ${[...KINDS].join(", ")}`,
    );
    return;
  }

  if (node.class !== undefined && typeof node.class !== "string") {
    errors.push(`${where}: class must be a string`);
  }
  checkClasses(node.classes, where, refs, errors);
  if (node.frame !== undefined) {
    if (typeof node.frame !== "string") {
      errors.push(`${where}: frame must be a sprite id (a 9-slice border)`);
    } else if (!refs.sprites.has(node.frame)) {
      errors.push(`${where}: frame sprite "${node.frame}" is not in the atlas`);
    }
  }
  if (node.aria !== undefined && typeof node.aria !== "string") {
    errors.push(`${where}: aria must be a string`);
  }
  checkStyle(node.style, where, errors);
  checkVisible(node.visible, where, refs, errors);
  checkColor(node.color, where, refs, errors);

  if (node.ref !== undefined && !HUD_REFS.has(node.ref)) {
    errors.push(
      `${where}: ref "${node.ref}" — expected one of ${[...HUD_REFS].join(", ")}`,
    );
  }

  // ---- per kind ----------------------------------------------------------
  if (kind === "widget") {
    if (!HUD_WIDGETS.has(node.widget)) {
      errors.push(
        `${where}: widget "${node.widget}" — expected one of ` +
          `${[...HUD_WIDGETS].sort().join(", ")}`,
      );
    }
    // A widget's children are its PARTS: named nodes the widget draws in the
    // place it keeps for them (the weapon slot's round count, say). It looks
    // each one up by id, so a part it does not know about is simply not drawn —
    // which is why they are warned about rather than refused: a mod authored
    // against a newer game must not fail to compile over one.
    for (const child of node.children ?? []) {
      if (!child?.id) {
        warnings.push(
          `${where}: a widget's children are named PARTS — one with no id ` +
            "can never be found, and will not be drawn",
        );
      }
    }
  } else if (node.widget !== undefined) {
    errors.push(`${where}: only kind: widget names a widget`);
  }

  if (kind === "bar") {
    const type = bindingType(node.bind);
    if (node.bind === undefined) {
      errors.push(`${where}: a bar needs a bind (the fraction it fills to)`);
    } else if (typeof node.bind !== "string") {
      // A FRACTION A SCRIPT WORKS OUT — a gauge of something no single binding
      // answers ("how close to the redline", "how far past safe"), which is the
      // point of a bar being authorable at all.
      checkScriptRef(node.bind, `${where} bind`, refs, errors);
    } else if (type === undefined) {
      errors.push(unknownBinding(where, node.bind));
    } else if (type !== "frac") {
      errors.push(
        `${where}: bind "${node.bind}" is a ${type} — a bar fills to a frac ` +
          `(${fracBindings().join(", ")})`,
      );
    }
    checkPart(node.fill, `${where} fill`, refs, errors, true);
    checkPart(node.overlay, `${where} overlay`, refs, errors, false);
  } else {
    for (const key of ["fill", "overlay"]) {
      if (node[key] !== undefined)
        errors.push(`${where}: only a bar has a ${key}`);
    }
  }

  if (kind === "gauge") {
    if (node.bind === undefined) {
      errors.push(`${where}: a gauge needs a bind (the fraction it sweeps to)`);
    } else if (typeof node.bind !== "string") {
      checkScriptRef(node.bind, `${where} bind`, refs, errors);
    } else if (bindingType(node.bind) !== "frac") {
      errors.push(
        `${where}: bind "${node.bind}" is a ${bindingType(node.bind)} — a ` +
          "gauge sweeps a frac",
      );
    }
    if (node.thickness !== undefined) {
      const t = node.thickness;
      if (typeof t !== "number" || t <= 0 || t > 20) {
        errors.push(`${where}: thickness must be a number from 0 to 20`);
      }
    }
    // A FULL RING is 360 and the default; a speedometer is the arc a needle
    // actually travels, which on a real dial is roughly two thirds of one.
    for (const [field, min, max] of [
      ["sweep", 1, 360],
      ["start", -360, 360],
    ]) {
      if (node[field] !== undefined) {
        const v = node[field];
        if (typeof v !== "number" || v < min || v > max) {
          errors.push(
            `${where}: ${field} must be a number from ${min} to ${max}`,
          );
        }
      }
    }
    checkColor(node.track, `${where} track`, refs, errors);
  } else {
    for (const key of ["thickness", "sweep", "start", "track"]) {
      if (node[key] !== undefined) {
        errors.push(`${where}: only a gauge has a ${key}`);
      }
    }
  }

  if (kind === "icon") {
    if ((node.sprite === undefined) === (node.spriteBind === undefined)) {
      errors.push(
        `${where}: an icon draws either a sprite: (a fixed one) or a ` +
          "spriteBind: (whichever one the run is holding) — exactly one",
      );
    }
    if (node.sprite !== undefined && typeof node.sprite !== "string") {
      // A PICTURE A SCRIPT CHOOSES — the same freedom the line above has, for
      // the same reason: a dial that swaps its own emblem is a judgement.
      checkScriptRef(node.sprite, `${where} sprite`, refs, errors);
    } else if (node.sprite !== undefined && !refs.sprites.has(node.sprite)) {
      errors.push(`${where}: sprite "${node.sprite}" is not in the atlas`);
    }
    if (node.spriteBind !== undefined) {
      const type = bindingType(node.spriteBind);
      if (type === undefined)
        errors.push(unknownBinding(where, node.spriteBind));
      else if (type !== "sprite") {
        errors.push(
          `${where}: spriteBind "${node.spriteBind}" is a ${type}, not a sprite`,
        );
      }
    }
  } else if (node.sprite !== undefined || node.spriteBind !== undefined) {
    errors.push(`${where}: only kind: icon draws a sprite`);
  }

  if (kind === "text" || kind === "button") {
    if (node.text !== undefined) {
      if (typeof node.text !== "string") {
        // A WORD A SCRIPT CHOOSES. The line itself is the judgement here, not
        // just its colour — which is what lets the road's dials read one way at
        // a crawl and another at the redline, and lets a mod change what they
        // say at all without changing the app.
        checkScriptRef(node.text, `${where} text`, refs, errors);
      } else {
        // A line may WEAVE bindings into itself — `{drive.mph} MPH GEAR
        // {drive.gearLabel}`. It is the one place a value and words share a
        // node, and it exists because the alternative (a row of three text
        // elements butted together) is a layout an author has to maintain to
        // say one sentence.
        for (const [, binding] of node.text.matchAll(/\{([^}]*)\}/g)) {
          if (bindingType(binding) === undefined) {
            errors.push(unknownBinding(where, binding));
          }
        }
        const bad = unrenderable(node.text.replace(/\{[^}]*\}/g, ""));
        if (bad.length > 0) {
          errors.push(
            `${where}: text "${node.text}" has ${bad.length} character(s) the ` +
              `pixel font cannot draw (${[...new Set(bad)].join(" ")}) — they ` +
              "would render as ?",
          );
        }
      }
    }
    // A script's line cannot be checked against the font here — it does not
    // exist until the run does. `PixelText` draws an unknown glyph as `?`, which
    // is the same fail-open every other unauthored string in the game gets.
    if (kind === "text" && node.text === undefined && node.bind === undefined) {
      errors.push(`${where}: a text needs either a text: or a bind:`);
    }
  } else if (node.text !== undefined) {
    errors.push(`${where}: only a text or a button carries text`);
  }

  // A bar and a gauge have had their `bind` checked above — both fill to a
  // fraction. What is left is the one a WORD reads.
  if (node.bind !== undefined && kind !== "bar" && kind !== "gauge") {
    const type = bindingType(node.bind);
    if (typeof node.bind !== "string") {
      checkScriptRef(node.bind, `${where} bind`, refs, errors);
    } else if (type === undefined)
      errors.push(unknownBinding(where, node.bind));
    else if (kind !== "text" && kind !== "button") {
      errors.push(
        `${where}: only a text, a button, a bar or a gauge reads a bind`,
      );
    }
  }
  if (node.format !== undefined) {
    if (!FORMATS.has(node.format)) {
      errors.push(
        `${where}: format "${node.format}" — expected one of ` +
          `${[...FORMATS].join(", ")}`,
      );
    }
    if (node.bind === undefined) {
      errors.push(`${where}: format needs a bind to format`);
    }
  }
  if (node.scale !== undefined) {
    if (typeof node.scale !== "number" || node.scale < 1 || node.scale > 8) {
      errors.push(`${where}: scale must be a number from 1 to 8`);
    }
  }

  if (node.press !== undefined) {
    if (kind !== "button" && kind !== "widget" && kind !== "panel") {
      errors.push(`${where}: only a button, panel or widget carries a press`);
    }
    checkPress(node.press, where, refs, errors);
  }
  if (kind === "button" && node.press === undefined) {
    errors.push(`${where}: a button needs a press (what it does)`);
  }
  if (kind === "button" && node.aria === undefined) {
    errors.push(
      `${where}: a button needs an aria: label — the test suite and the ` +
        "screen reader both find it by that name",
    );
  }

  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      errors.push(`${where}: children must be a list`);
    } else if (kind === "bar" || kind === "icon" || kind === "text") {
      errors.push(`${where}: a ${kind} draws itself — it takes no children`);
    } else {
      node.children.forEach((child, i) => {
        const label = child?.id ? `${where} › ${child.id}` : `${where} › #${i}`;
        checkNode(child, label, refs, errors, warnings, false);
      });
    }
  }
}

/** A bar's fill (required) or overlay (optional): a class, maybe a ref. */
function checkPart(part, where, refs, errors, required) {
  if (part === undefined) {
    if (required) errors.push(`${where}: a bar needs a fill`);
    return;
  }
  if (!part || typeof part !== "object" || Array.isArray(part)) {
    errors.push(`${where}: expected a mapping`);
    return;
  }
  for (const key of Object.keys(part)) {
    if (!["class", "ref", "color"].includes(key)) {
      errors.push(`${where}: unknown field "${key}"`);
    }
  }
  if (part.ref !== undefined && !HUD_REFS.has(part.ref)) {
    errors.push(`${where}: ref "${part.ref}" is not a render-loop handle`);
  }
  checkColor(part.color, where, refs, errors);
}

function checkPress(press, where, refs, errors) {
  if (!press || typeof press !== "object" || Array.isArray(press)) {
    errors.push(`${where}: press must be a mapping`);
    return;
  }
  for (const key of Object.keys(press)) {
    if (!PRESS_FIELDS.has(key))
      errors.push(`${where}: press: unknown field "${key}"`);
  }
  if (!HUD_ACTIONS.has(press.action)) {
    errors.push(
      `${where}: press action "${press.action}" — expected one of ` +
        `${[...HUD_ACTIONS].sort().join(", ")}`,
    );
  }
  if (press.sound !== undefined) {
    if (typeof press.sound !== "string") {
      errors.push(`${where}: press sound must be a sound id`);
    } else if (!refs.sounds.has(press.sound)) {
      errors.push(
        `${where}: press sound "${press.sound}" is not a sound this build ` +
          "ships — author it under sounds/ first",
      );
    }
  }
  if (press.close !== undefined && typeof press.close !== "boolean") {
    errors.push(`${where}: press close must be true or false`);
  }
}

function checkStyle(style, where, errors) {
  if (style === undefined) return;
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    errors.push(`${where}: style must be a mapping`);
    return;
  }
  for (const [key, value] of Object.entries(style)) {
    if (!STYLE_FIELDS.has(key)) {
      errors.push(
        `${where}: style "${key}" is not settable from content — the ` +
          `settable set is ${[...STYLE_FIELDS].sort().join(", ")}`,
      );
      continue;
    }
    if (key === "direction" && !DIRECTIONS.has(value)) {
      errors.push(`${where}: style direction must be row or column`);
    } else if (key === "align" && !ALIGNS.has(value)) {
      errors.push(
        `${where}: style align must be one of ${[...ALIGNS].join(", ")}`,
      );
    } else if (key === "justify" && !JUSTIFIES.has(value)) {
      errors.push(
        `${where}: style justify must be one of ${[...JUSTIFIES].join(", ")}`,
      );
    } else if (key === "opacity") {
      if (typeof value !== "number" || value < 0 || value > 1) {
        errors.push(`${where}: style opacity must be a number from 0 to 1`);
      }
    } else if (["color", "background", "border"].includes(key)) {
      if (
        typeof value !== "string" ||
        /url\s*\(|expression|javascript:/i.test(value)
      ) {
        errors.push(`${where}: style ${key} must be a plain colour or border`);
      }
    } else if (
      [
        "width",
        "height",
        "minWidth",
        "minHeight",
        "gap",
        "borderRadius",
      ].includes(key)
    ) {
      if (!LENGTH_RE.test(String(value))) {
        errors.push(
          `${where}: style ${key} "${value}" must be a length (12, 12px, 50%, 2rem)`,
        );
      }
    } else if (["padding", "margin"].includes(key)) {
      const parts = String(value).trim().split(/\s+/);
      if (parts.length > 4 || parts.some((p) => !LENGTH_RE.test(p))) {
        errors.push(
          `${where}: style ${key} "${value}" must be up to four lengths`,
        );
      }
    }
  }
}

/**
 * A CONDITION — what `visible:` and each entry of `classes:` is.
 *
 * Three shapes, in the order an author reaches for them: a flag binding
 * (`hud.pointsWaiting`), the same one negated (`!ui.swipeBars`), or a LIST of
 * either, which holds when every entry does. Anything past an `and` of flags is
 * a judgement, and a judgement is `{ script: "file.fn" }` — there is
 * deliberately no expression language here, because the game already ships a
 * sandboxed Lua and two ways to write a condition is one too many.
 */
function checkCondition(condition, where, refs, errors) {
  if (typeof condition === "string") {
    const binding = condition.startsWith("!") ? condition.slice(1) : condition;
    const type = bindingType(binding);
    if (type === undefined) errors.push(unknownBinding(where, binding));
    else if (type !== "flag") {
      errors.push(
        `${where}: "${condition}" is a ${type} — a condition is a flag, a ` +
          "negated flag (!flag), a list of either, or a { script: }",
      );
    }
    return;
  }
  if (Array.isArray(condition)) {
    if (condition.length === 0) {
      errors.push(`${where}: an empty list holds always — drop it instead`);
    }
    for (const entry of condition) {
      if (typeof entry !== "string") {
        errors.push(
          `${where}: a list condition holds flags, not ${typeof entry}`,
        );
        continue;
      }
      checkCondition(entry, where, refs, errors);
    }
    return;
  }
  checkScriptRef(condition, where, refs, errors);
}

/** `visible:` — the condition that decides whether the element is on screen. */
function checkVisible(visible, where, refs, errors) {
  if (visible === undefined) return;
  checkCondition(visible, `${where} visible`, refs, errors);
}

/**
 * `classes:` — extra CSS classes, each worn while its condition holds. This is
 * how an authored element keeps the states the shipped stylesheet already draws
 * (`bag-full`, `hud-slot-yielded`) without a line of code deciding them.
 */
function checkClasses(classes, where, refs, errors) {
  if (classes === undefined) return;
  if (!classes || typeof classes !== "object" || Array.isArray(classes)) {
    errors.push(`${where}: classes must be a mapping of class → condition`);
    return;
  }
  for (const [name, condition] of Object.entries(classes)) {
    if (!/^[a-zA-Z][\w-]*$/.test(name)) {
      errors.push(`${where}: "${name}" is not a CSS class name`);
      continue;
    }
    checkCondition(condition, `${where} class "${name}"`, refs, errors);
  }
}

/** `color:` is either a literal `#rrggbb`, or a script that answers one. */
function checkColor(color, where, refs, errors) {
  if (color === undefined) return;
  if (typeof color === "string") {
    if (!COLOR_RE.test(color)) {
      errors.push(`${where}: color "${color}" must be a #hex colour`);
    }
    return;
  }
  checkScriptRef(color, `${where} color`, refs, errors);
}

function checkScriptRef(value, where, refs, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${where}: expected a value or a { script: "file.fn" }`);
    return;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "script") {
    errors.push(`${where}: expected exactly a { script: "file.fn" }`);
    return;
  }
  const ref = value.script;
  if (typeof ref !== "string" || !SCRIPT_REF_RE.test(ref)) {
    errors.push(`${where}: script "${ref}" must read "file.function"`);
    return;
  }
  const [file, fn] = ref.split(".");
  const exported = refs.scripts.get(file);
  if (!exported) {
    errors.push(
      `${where}: script "${ref}" — there is no hud/scripts/${file}.lua` +
        (refs.scripts.size > 0
          ? ` (this build has ${[...refs.scripts.keys()].sort().join(", ")})`
          : ""),
    );
    return;
  }
  if (!exported.has(fn)) {
    errors.push(
      `${where}: hud/scripts/${file}.lua exports no "${fn}" ` +
        `(it exports ${[...exported].sort().join(", ") || "nothing"})`,
    );
  }
}

function bindingType(binding) {
  return typeof binding === "string" ? HUD_BINDINGS[binding] : undefined;
}

function unknownBinding(where, binding) {
  const near = Object.keys(HUD_BINDINGS)
    .filter((id) => id.split(".")[0] === String(binding).split(".")[0])
    .slice(0, 8);
  return (
    `${where}: "${binding}" is not a HUD binding` +
    (near.length > 0 ? ` — its group has ${near.join(", ")}…` : "") +
    " (mod/catalog.json's hudBindings lists every one, with its type)"
  );
}

function fracBindings() {
  return Object.entries(HUD_BINDINGS)
    .filter(([, type]) => type === "frac")
    .map(([id]) => id);
}

/**
 * Validate the FRAME — `content/hud/hud.yaml`'s regions.
 *
 * A region is a box elements sit in, nested by `parent`, and the whole point of
 * its being content is that a mod can hang a new one off `hud` and put its own
 * elements in it. The two structural refusals are the ones a phone would
 * otherwise discover: a parent chain that loops (infinite render) and a parent
 * that does not exist (elements that render nowhere).
 */
export function validateHudRegions(regions, refs = {}) {
  const errors = [];
  const warnings = [];
  if (!regions || typeof regions !== "object" || Array.isArray(regions)) {
    return { errors: ["hud.yaml: expected a `regions:` mapping"], warnings };
  }
  const ids = new Set(Object.keys(regions));
  for (const [id, region] of Object.entries(regions)) {
    const where = `hud region "${id}"`;
    if (!ID_RE.test(id)) errors.push(`${where}: id must be lower_snake_case`);
    if (!region || typeof region !== "object" || Array.isArray(region)) {
      errors.push(`${where}: expected a mapping`);
      continue;
    }
    for (const key of Object.keys(region)) {
      if (!REGION_FIELDS.has(key))
        errors.push(`${where}: unknown field "${key}"`);
    }
    if (region.parent !== undefined) {
      if (typeof region.parent !== "string") {
        errors.push(`${where}: parent must be a region id`);
      } else if (!ids.has(region.parent)) {
        errors.push(`${where}: parent "${region.parent}" is not a region`);
      }
    }
    // WHICH SCREEN DRAWS IT. A top-level region says so; everything under it
    // inherits, because a box cannot be on a different screen from the box it
    // sits inside.
    if (region.surface !== undefined) {
      if (!HUD_SURFACES.has(region.surface)) {
        errors.push(
          `${where}: surface "${region.surface}" — expected one of ` +
            `${[...HUD_SURFACES].join(", ")}`,
        );
      } else if (region.parent !== undefined) {
        errors.push(
          `${where}: only a top-level region names a surface — this one is ` +
            `inside "${region.parent}" and is drawn wherever that is`,
        );
      }
    }
    if (region.wrap !== undefined && !WRAPS.has(region.wrap)) {
      errors.push(`${where}: wrap must be div (a box) or none (a bare group)`);
    }
    if (
      region.wrap === "none" &&
      (region.class || region.style || region.frame)
    ) {
      errors.push(
        `${where}: wrap: none draws no box, so it has no class/style/frame`,
      );
    }
    if (region.frame !== undefined) {
      if (typeof region.frame !== "string") {
        errors.push(`${where}: frame must be a sprite id (a 9-slice border)`);
      } else if (refs.sprites && !refs.sprites.has(region.frame)) {
        errors.push(
          `${where}: frame sprite "${region.frame}" is not in the atlas`,
        );
      }
    }
    if (region.order !== undefined && typeof region.order !== "number") {
      errors.push(`${where}: order must be a number`);
    }
    checkStyle(region.style, where, errors);
    checkVisible(
      region.visible,
      where,
      {
        sprites: refs.sprites ?? new Set(),
        sounds: refs.sounds ?? new Set(),
        scripts: refs.scripts ?? new Map(),
        regions: ids,
      },
      errors,
    );
  }
  // Loops. Walk each region to a root; a chain longer than the catalog is one.
  for (const id of ids) {
    let cursor = regions[id]?.parent;
    for (let hops = 0; cursor !== undefined; hops += 1) {
      if (hops > ids.size) {
        errors.push(`hud region "${id}": its parent chain loops`);
        break;
      }
      cursor = regions[cursor]?.parent;
    }
  }
  return { errors, warnings };
}

/**
 * Validate `content/hud/events.yaml` — the HUD moments the app raises and the
 * sound each one makes.
 */
export function validateHudEvents(events, refs) {
  const errors = [];
  const warnings = [];
  if (!events || typeof events !== "object" || Array.isArray(events)) {
    return { errors: ["events.yaml: expected a `sounds:` mapping"], warnings };
  }
  for (const [event, sound] of Object.entries(events)) {
    if (!HUD_EVENTS.has(event)) {
      errors.push(
        `events.yaml: "${event}" is not a HUD moment anything raises — ` +
          `the set is ${[...HUD_EVENTS].sort().join(", ")}`,
      );
      continue;
    }
    if (typeof sound !== "string" || !refs.sounds.has(sound)) {
      errors.push(
        `events.yaml: "${event}" names sound "${sound}", which nothing ships`,
      );
    }
  }
  for (const event of HUD_EVENTS) {
    if (!(event in events)) {
      warnings.push(
        `events.yaml: "${event}" has no sound — that moment is silent`,
      );
    }
  }
  return { errors, warnings };
}

/**
 * Whole-catalog checks, once every element has passed on its own: two elements
 * claiming one render-loop ref, and a duplicate id.
 */
export function validateHudCatalog(elements) {
  const errors = [];
  const claimed = new Map();
  const seen = new Set();
  const walk = (node, owner) => {
    if (node.ref) {
      const prior = claimed.get(node.ref);
      if (prior && prior !== owner) {
        errors.push(
          `hud: elements "${prior}" and "${owner}" both claim the render-loop ` +
            `handle "${node.ref}" — only one of them would ever be found`,
        );
      } else claimed.set(node.ref, owner);
    }
    for (const part of [node.fill, node.overlay]) {
      if (part?.ref) {
        const prior = claimed.get(part.ref);
        if (prior && prior !== owner) {
          errors.push(
            `hud: elements "${prior}" and "${owner}" both claim the ` +
              `render-loop handle "${part.ref}"`,
          );
        } else claimed.set(part.ref, owner);
      }
    }
    for (const child of node.children ?? []) walk(child, owner);
  };
  for (const element of elements) {
    if (seen.has(element.id)) {
      errors.push(`hud: two elements are called "${element.id}"`);
    }
    seen.add(element.id);
    walk(element, element.id);
  }
  return { errors, warnings: [] };
}
