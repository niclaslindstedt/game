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
  // THE SCOREBOARD IS BEING HELD UP — the SHOW SCORES key is down, or a touch
  // player has raised the board off the pause screen. `ui.` rather than `hud.`
  // because it is a fact about what this viewer is looking at rather than about
  // the run: two people in one session hold it up independently.
  "ui.scoreboard": "flag",
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
  // THE CRANK, three ways. `rev` is how far up the CURRENT GEAR the wagon is;
  // `rpm` is what the engine is actually turning at and `rpmFrac` the same
  // measured against the redline, which is the arc a tachometer sweeps. A dial
  // that only knew road speed would sit still through a whole upshift — and the
  // note coming out of the speaker is read off the same rpm (`sfx/drive.ts`),
  // so the needle and the noise cannot drift apart.
  "drive.rev": "frac",
  "drive.rpm": "number",
  "drive.rpmFrac": "frac",
  "drive.redlineRpm": "number",
  "drive.reversing": "flag",
  "drive.bodies": "number",
  "drive.speedFrac": "frac",
  "drive.wear": "frac",
  // …and what it was before the last second's hits. The damage dial draws its
  // arc TWICE — once to `wear` in a hot colour and once to this in the calm one
  // over the top — which is what makes a single collision's cost visible on a
  // readout that otherwise only ever creeps. It is the XP strip's kill heat,
  // and it is a READ: how long the slice stays lit is the app's (`WEAR_HOT_MS`)
  // and what colour it is, the Lua's.
  "drive.wearSettled": "frac",
  "drive.wearPercent": "number",
  "drive.failing": "flag",
  "drive.paused": "flag",
  // VOICE CHAT. A session fact rather than a run fact — the engine's state
  // knows nothing about who is talking — but the HUD is where a player reads
  // it, so it is a binding group like any other. Empty on every run without
  // voice: a build with no `voice` capability, a local game, a browser.
  "voice.live": "flag",
  "voice.transmitting": "flag",
  "voice.level": "frac",
  "voice.speakerCount": "number",
  "voice.faulted": "flag",
  "voice.fault": "text",
};

/**
 * THE ROW BINDINGS — the ones that only mean anything INSIDE one row of a list.
 *
 * A voice card is drawn once per speaker, and "how loud is this one" is a
 * question about that card rather than about the run. So a widget that draws a
 * list resolves its authored PARTS once per row with the row's own values
 * merged over the run's, and these are the names it merges in. Everything else
 * about them is ordinary: a row binding types like any other, a script reads it
 * out of `state.speaker`, and a mod may author against it.
 *
 * They are separated from `HUD_BINDINGS` because they are only ANSWERABLE in a
 * row: an element that reads `speaker.peak` from the gear row would print
 * nothing for ever, so the schema refuses it there and names the widgets that
 * do supply rows.
 */
export const HUD_ROW_BINDINGS = {
  "speaker.seat": "number",
  "speaker.name": "text",
  "speaker.level": "frac",
  "speaker.peak": "frac",
  "speaker.muted": "flag",
  "speaker.unheard": "flag",
  "speaker.talking": "flag",
  /** The player's own card, which has no portrait and cannot be muted. */
  "speaker.self": "flag",
};

/**
 * Which widgets draw a LIST, and what one of its rows is called.
 *
 * The name is the binding group a row publishes, so this table is also what
 * decides where a `speaker.*` reference is legal. One entry today; the shape is
 * the general one because a unit frame, a threat list and a raid grid are all
 * the same thing with a different row.
 */
export const HUD_ROW_WIDGETS = { voiceCards: "speaker" };

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
  // The road's own three, which only the drive surface supplies. An action the
  // mounting screen does not provide is a press that does nothing rather than a
  // build error: the set is one vocabulary across every surface, so a mod may
  // put PULL OVER on a button of its own without the compiler having to know
  // which screen that button will end up on. `driveMenu` leaves the GAME rather
  // than the road — the host banks the hero and drops to the title — and is
  // absent on a road with no game behind it (the `?drive` workbench).
  "driveResume",
  "driveSkip",
  "driveMenu",
  // Silence one speaker, locally and unsent. The SEAT comes from the row the
  // press was drawn in, not from the YAML — which is what makes one authored
  // press work for every card on the rail.
  "muteSpeaker",
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
  "scoreboard",
  "tradeAsks",
  "minimap",
  "autopilot",
  "consumableDock",
  "powerupDock",
  "swipeDock",
  "questTracker",
  "pickupFeed",
  "voiceCards",
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
  // Somebody silenced, and somebody let back in. Two moments rather than one
  // because they are opposite answers and a player wants to hear which one they
  // just gave.
  "voice.mute",
  "voice.unmute",
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
  "canvas",
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

/** A canvas is sized in RASTER pixels, not CSS ones — it is painted by code,
 * and a size that did not divide its own data evenly would alias. */
const MAX_CANVAS_SIDE = 4096;

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
  "width",
  "height",
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
  checkNode(element, where, refs, errors, warnings, true, null);
  return { errors, warnings };
}

/** A child node — the same grammar minus the id/region/order a top-level
 * element needs to be placed and replaced. */
function checkNode(node, where, refs, errors, warnings, top, row) {
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

  /**
   * THE ROW SCOPE STARTS AT THE ROW WIDGET ITSELF, not at its children.
   *
   * A list's widget node IS the row template: it is drawn once per row, so its
   * `class`, its `classes` and its `color` are that row's — a voice card wears
   * `muted` because THAT speaker is muted. Its `visible:` is the exception and
   * the only one, because it gates the whole list before there are any rows to
   * ask about, so it stays on the outer scope.
   */
  const rowScope =
    kind === "widget" ? (HUD_ROW_WIDGETS[node.widget] ?? row) : row;

  if (node.class !== undefined && typeof node.class !== "string") {
    errors.push(`${where}: class must be a string`);
  }
  checkClasses(node.classes, where, refs, errors, rowScope);
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
  checkVisible(node.visible, where, refs, errors, row);
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
    const type = bindingType(node.bind, row);
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
    } else if (bindingType(node.bind, row) !== "frac") {
      errors.push(
        `${where}: bind "${node.bind}" is a ${bindingType(node.bind, row)} — a ` +
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

  // A CANVAS is a rectangle a widget PAINTS — the voice card's waveform is the
  // first, and a dial's needle will be the next. Content owns where it is, how
  // big it is and what class it wears; the pixels are code's, because a strip
  // redrawn thirty times a second is not a row of divs.
  if (kind === "canvas") {
    for (const field of ["width", "height"]) {
      const value = node[field];
      if (value === undefined) {
        errors.push(`${where}: a canvas needs a ${field} (in raster pixels)`);
      } else if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > MAX_CANVAS_SIDE
      ) {
        errors.push(
          `${where}: ${field} must be a whole number of pixels, 1 to ${MAX_CANVAS_SIDE}`,
        );
      }
    }
    if (node.children) {
      errors.push(`${where}: a canvas is painted, so it takes no children`);
    }
  } else {
    for (const key of ["width", "height"]) {
      if (node[key] !== undefined) {
        errors.push(
          `${where}: only a canvas has a ${key} — a box is sized with style:`,
        );
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
      const type = bindingType(node.spriteBind, row);
      if (type === undefined)
        errors.push(unknownBinding(where, node.spriteBind, row));
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
          if (bindingType(binding, row) === undefined) {
            errors.push(unknownBinding(where, binding, row));
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
    const type = bindingType(node.bind, row);
    if (typeof node.bind !== "string") {
      checkScriptRef(node.bind, `${where} bind`, refs, errors);
    } else if (type === undefined)
      errors.push(unknownBinding(where, node.bind, row));
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
      // A row widget's children are drawn ONCE PER ROW, so from here down the
      // row's own bindings (`speaker.*`) are answerable — and only from here
      // down. Nesting cannot stack two rows: a widget inside a widget's parts
      // is not a thing the renderer draws.
      node.children.forEach((child, i) => {
        const label = child?.id ? `${where} › ${child.id}` : `${where} › #${i}`;
        checkNode(child, label, refs, errors, warnings, false, rowScope);
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
function checkCondition(condition, where, refs, errors, row) {
  if (typeof condition === "string") {
    const binding = condition.startsWith("!") ? condition.slice(1) : condition;
    const type = bindingType(binding, row);
    if (type === undefined) errors.push(unknownBinding(where, binding, row));
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
      checkCondition(entry, where, refs, errors, row);
    }
    return;
  }
  checkScriptRef(condition, where, refs, errors);
}

/** `visible:` — the condition that decides whether the element is on screen. */
function checkVisible(visible, where, refs, errors, row) {
  if (visible === undefined) return;
  checkCondition(visible, `${where} visible`, refs, errors, row);
}

/**
 * `classes:` — extra CSS classes, each worn while its condition holds. This is
 * how an authored element keeps the states the shipped stylesheet already draws
 * (`bag-full`, `hud-slot-yielded`) without a line of code deciding them.
 */
function checkClasses(classes, where, refs, errors, row) {
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
    checkCondition(condition, `${where} class "${name}"`, refs, errors, row);
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

/**
 * What kind of value a binding answers with — or `undefined` when nothing here
 * answers it at all.
 *
 * `row` is the row group in scope (`"speaker"` inside a voice card's parts, null
 * everywhere else), and it is what makes `speaker.peak` legal on a card and
 * meaningless on the gear row.
 */
function bindingType(binding, row) {
  if (typeof binding !== "string") return undefined;
  const own = HUD_BINDINGS[binding];
  if (own !== undefined) return own;
  const group = binding.slice(0, binding.indexOf("."));
  return row !== null && group === row ? HUD_ROW_BINDINGS[binding] : undefined;
}

function unknownBinding(where, binding, row = null) {
  const group = String(binding).split(".")[0];
  // The most useful thing to say about a ROW binding used outside a row is
  // not "no such name" — the name is right and the PLACE is wrong, and an
  // author reading "not a HUD binding" would go looking for a typo.
  if (HUD_ROW_BINDINGS[binding] !== undefined && group !== row) {
    const widgets = Object.entries(HUD_ROW_WIDGETS)
      .filter(([, name]) => name === group)
      .map(([widget]) => widget);
    return (
      `${where}: "${binding}" only means something inside one ROW of a list — ` +
      `author it under ${widgets.join(" or ")}, whose parts are drawn once per ` +
      `${group}`
    );
  }
  const near = Object.keys(HUD_BINDINGS)
    .filter((id) => id.split(".")[0] === group)
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
      // A region is never inside a row — a list's rows are a WIDGET's parts,
      // and a widget draws no regions.
      null,
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
