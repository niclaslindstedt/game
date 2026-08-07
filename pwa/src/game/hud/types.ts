// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HUD AS DATA — the shape `content/hud/**` compiles to, and the shape a
// mod's own HUD arrives in.
//
// This file is deliberately types only: it is imported by the GENERATED catalog
// (`pwa/src/generated/hud.ts`), by the renderer, by the mod loader and by the
// tests, and any value in it would be a value all four carry.
//
// The vocabulary these types are validated against — every binding, action,
// widget, ref and event — lives in `scripts/asset-tools/hud-schema.mjs`, which
// is the last word on what a HUD file may say (a mod compiles through that same
// module). `tests/content/hud_catalog_test.ts` pins the runtime registries here
// to that vocabulary, because a binding the schema accepts and the app does not
// implement is `undefined` printed into a bar.

/** A live value an element may read. `hud.*` is the HUD snapshot, `ui.*` the
 * app's own view state. */
export type HudBinding = string;

/** A condition: a flag binding, a negated one (`!ui.swipeBars`), a list of
 * either (which holds when every entry does), or a Lua judgement. */
export type HudCondition = string | string[] | HudScriptRef;

/** `{ script: "file.fn" }` — a function in `content/hud/scripts/<file>.lua`. */
export type HudScriptRef = { script: string };

/** A colour: a literal `#hex`, or a script that answers one. */
export type HudColor = string | HudScriptRef;

/** The bounded style set an authored element may set on its own box. A mod
 * cannot ship CSS, so this is the whole of what it can do without one. */
export type HudStyle = {
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  minHeight?: string | number;
  gap?: string | number;
  padding?: string | number;
  margin?: string | number;
  background?: string;
  border?: string;
  borderRadius?: string | number;
  color?: string;
  opacity?: number;
  direction?: "row" | "column";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};

/** What a press does. The action names a verb the app owns; the sound is a
 * sound id (falling back to the `hud.press` moment when absent); `close` shuts
 * the weapon switcher first, which every slot the switcher unrolls across does. */
export type HudPress = {
  action: string;
  arg?: string | number;
  sound?: string;
  close?: boolean;
};

/** A bar's fill, or the overlay above it. `ref` hands the DOM node to the
 * render loop (see `HudRefs`). */
export type HudBarPart = {
  class?: string;
  ref?: string;
  color?: HudColor;
};

/** One node of the HUD: a box, a bar, a picture, a word, a button, or one of
 * the code-backed widgets. Children nest only under a panel, a button or a
 * widget-free box. */
export type HudNodeDef = {
  id?: string;
  kind:
    | "panel"
    | "bar"
    | "gauge"
    | "icon"
    | "text"
    | "button"
    | "canvas"
    | "widget";
  widget?: string;
  class?: string;
  /** Extra classes, each worn while its condition holds. */
  classes?: Record<string, HudCondition>;
  style?: HudStyle;
  /** A sprite drawn as this box's 9-slice border (the HUD plate). */
  frame?: string;
  /** A fixed sprite, or a judgement that picks one. */
  sprite?: string | HudScriptRef;
  /** A binding that names whichever sprite the run is holding. */
  spriteBind?: HudBinding;
  /** A line — which may weave bindings into itself (`{drive.mph} MPH`) — or a
   * judgement that writes the whole line. */
  text?: string | HudScriptRef;
  /** The value a bar fills to or a text prints: a binding, or a judgement that
   * works it out. */
  bind?: HudBinding | HudScriptRef;
  format?: "number" | "compact" | "time" | "percent";
  scale?: number;
  color?: HudColor;
  visible?: HudCondition;
  ref?: string;
  aria?: string;
  press?: HudPress;
  fill?: HudBarPart;
  overlay?: HudBarPart;
  /** A gauge's ring width, in the 44-unit box it is drawn in. */
  thickness?: number;
  /** How much of a circle the gauge sweeps — 360 is a full ring, and an arc is
   * what a speedometer's needle actually travels. */
  sweep?: number;
  /** Where the sweep begins, in degrees clockwise from twelve o'clock. */
  start?: number;
  /** The unfilled remainder's colour. */
  track?: HudColor;
  /**
   * PAINT ON THE FACE — a band from `from` (a fraction of the sweep) to the end
   * of the dial, drawn behind the needle's own arc.
   *
   * A tachometer's red is not a colour the needle turns: it is printed on the
   * instrument, it is there with the engine off, and it says where the trouble
   * would be rather than where it is. That is the whole difference between a
   * dial and a progress ring, and it is why the wagon's rev counter can sit at
   * two thirds all trip and still read as a rev counter.
   */
  zone?: { from: number; color: HudColor };
  /** A canvas's raster size, in pixels — it is painted by code, so it is sized
   * in the units the painting is done in rather than in CSS ones. */
  width?: number;
  height?: number;
  children?: HudNodeDef[];
};

/** A top-level element: a node that knows which region it sits in and where in
 * that region's order. Its `id` is its filename, and its id is how a mod
 * replaces it. */
export type HudElementDef = HudNodeDef & {
  id: string;
  region: string;
  order: number;
};

/** A box elements sit in, nested by `parent`. `wrap: "none"` draws nothing and
 * renders its children in place. */
export type HudRegionDef = {
  id: string;
  parent?: string;
  /** Which screen draws it. Set on a top-level region and inherited by
   * everything under it — filled in by the compiler, never walked at runtime. */
  surface?: HudSurface;
  order: number;
  class?: string;
  wrap: "div" | "none";
  /** A sprite drawn as the box's 9-slice border. */
  frame?: string;
  style?: HudStyle;
  visible?: HudCondition;
};

/** The screens a HUD is drawn on: the fight (`GameScreen`) and the road's
 * minigame (`DriveScreen`). One catalog, two mounts. */
export type HudSurface = "field" | "drive";

/** A HUD moment the app raises rather than a button — answered by a sound in
 * `content/hud/events.yaml`. The set is fixed: nothing would raise one the app
 * does not know about. */
export type HudEvent =
  | "hud.press"
  | "hud.back"
  | "voice.mute"
  | "voice.unmute"
  | "weapon.switch"
  | "trade.ask"
  | "trade.accept"
  | "trade.decline"
  | "companion.heal"
  | "companion.open"
  | "powerup.discard";

/** A HUD script as it travels: the Lua source, parsed at load. */
export type HudScriptSource = { id: string; source: string };

/** The whole HUD, as the renderer reads it — shipped, or shipped with a stack
 * of mods merged on top. */
export type HudLayout = {
  regions: Record<string, HudRegionDef>;
  elements: HudElementDef[];
  events: Partial<Record<HudEvent, string>>;
  scripts: Record<string, HudScriptSource>;
};
