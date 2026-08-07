// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RESOLVING THE HUD — the authored layout plus this instant's values, folded
// into a tree the renderer can draw without asking another question.
//
// It happens ONCE per HUD publish (the snapshot's change key gates that — see
// `buildHud`), not per frame and not per element per frame: every condition,
// every script call and every formatted number in the whole HUD is decided
// here, in one pass, and React then renders a plain tree. That is what makes a
// content-driven HUD cost what the hand-written one cost.
//
// THE FALLBACK IS ALWAYS "AS IF NOTHING WAS SAID". A condition whose script is
// broken shows the element; a colour whose script is broken leaves the class's
// own colour standing; a binding a mod named and this build does not answer
// prints nothing rather than the word `undefined`. A HUD is the thing the
// player reads a fight through, so every failure here has to be the quiet kind.

import { formatCompact } from "@ui/lib/format-number.ts";

import { formatTime } from "../game-screen/hud-model.ts";
import { callHudScript, hudScriptColor, hudScriptFlag } from "./script.ts";
import { scriptState, type HudValue, type HudValues } from "./bindings.ts";
import type {
  HudCondition,
  HudColor,
  HudElementDef,
  HudNodeDef,
  HudRegionDef,
  HudStyle,
} from "./types.ts";

/** One resolved node — what the renderer draws, with nothing left to decide. */
export type HudNodeView = {
  def: HudNodeDef;
  visible: boolean;
  className: string | undefined;
  style: Record<string, string | number> | undefined;
  /** A bar's fill fraction, 0..1. */
  value: number;
  /** The word a text or a button draws, already formatted. */
  text: string | undefined;
  /** The sprite an icon draws (a fixed one, or whichever one the run holds). */
  sprite: string | undefined;
  color: string | undefined;
  /** A gauge's unfilled remainder — the faint ring behind the sweep. */
  trackColor: string | undefined;
  children: HudNodeView[];
};

/** A resolved region: its own box, and the regions and elements inside it in
 * one shared order. */
export type HudRegionView = {
  def: HudRegionDef;
  visible: boolean;
  className: string | undefined;
  style: Record<string, string | number> | undefined;
  /** The children, regions and elements interleaved, in `order`. */
  children: ({ region: HudRegionView } | { element: HudElementView })[];
};

export type HudElementView = HudNodeView & { def: HudElementDef };

/** Everything a resolve needs: the values, and the table the scripts get. */
export type HudResolveContext = {
  values: HudValues;
  /** The same values, grouped for Lua — built once per resolve rather than per
   * script call, because a HUD with a dozen judgements on it would otherwise
   * rebuild the same table a dozen times. */
  state: Record<string, Record<string, HudValue>>;
};

export function resolveContext(values: HudValues): HudResolveContext {
  return { values, state: scriptState(values) };
}

/**
 * Resolve the whole layout into the TOP-LEVEL regions, in order.
 *
 * An element whose region does not exist is dropped rather than orphaned —
 * which only a mod can cause (the compiler refuses it for the shipped tree),
 * and dropping is the honest answer: it was authored into a box that is not
 * there.
 */
export function resolveLayout(
  regions: Record<string, HudRegionDef>,
  elements: HudElementDef[],
  ctx: HudResolveContext,
): HudRegionView[] {
  const byParent = new Map<string | undefined, HudRegionDef[]>();
  for (const region of Object.values(regions)) {
    const list = byParent.get(region.parent) ?? [];
    list.push(region);
    byParent.set(region.parent, list);
  }
  const inRegion = new Map<string, HudElementDef[]>();
  for (const element of elements) {
    if (!regions[element.region]) continue;
    const list = inRegion.get(element.region) ?? [];
    list.push(element);
    inRegion.set(element.region, list);
  }

  const build = (region: HudRegionDef, depth: number): HudRegionView => {
    // A parent chain the compiler proved acyclic can still arrive cyclic from a
    // MOD, whose file was compiled against its own copy of the frame. A depth
    // stop is the difference between a bad mod and a locked page.
    const children: HudRegionView["children"] = [];
    if (depth < 16) {
      const kids: {
        order: number;
        id: string;
        make: () => { region: HudRegionView } | { element: HudElementView };
      }[] = [];
      for (const child of byParent.get(region.id) ?? []) {
        kids.push({
          order: child.order,
          id: child.id,
          make: () => ({ region: build(child, depth + 1) }),
        });
      }
      for (const element of inRegion.get(region.id) ?? []) {
        kids.push({
          order: element.order,
          id: element.id,
          make: () => ({
            element: resolveNode(element, ctx) as HudElementView,
          }),
        });
      }
      kids.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
      for (const kid of kids) children.push(kid.make());
    }
    return {
      def: region,
      visible: resolveCondition(region.visible, ctx),
      className: region.class,
      style: resolveStyle(region.style),
      children,
    };
  };

  return (byParent.get(undefined) ?? [])
    .slice()
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
    .map((region) => build(region, 0));
}

/** Resolve one node and everything under it. */
export function resolveNode(
  def: HudNodeDef,
  ctx: HudResolveContext,
): HudNodeView {
  const visible = resolveCondition(def.visible, ctx);
  const classes: string[] = [];
  if (def.class) classes.push(def.class);
  for (const [name, condition] of Object.entries(def.classes ?? {})) {
    if (resolveCondition(condition, ctx)) classes.push(name);
  }
  const raw = resolveBound(def.bind, ctx);
  return {
    def,
    visible,
    className: classes.length > 0 ? classes.join(" ") : undefined,
    style: resolveStyle(def.style),
    // Both the straight one and the round one fill to a fraction — a gauge is
    // a bar that has been bent, and nothing else about them differs here.
    value: def.kind === "bar" || def.kind === "gauge" ? clampFrac(raw) : 0,
    text: resolveText(def, raw, ctx),
    sprite: resolveSprite(def, ctx),
    color: resolveColor(def.color, ctx),
    // The default is the faint ring the weapon slot has always drawn behind its
    // gauge; an authored `track:` replaces it, and a fully transparent one is
    // how an element asks for a bare sweep with nothing behind it.
    trackColor:
      def.kind === "gauge"
        ? (resolveColor(def.track, ctx) ?? "rgba(255,255,255,0.2)")
        : undefined,
    // A resolve is not a render: an invisible node's children are not walked,
    // which is what keeps a hidden panel's scripts from being called at all.
    children: visible
      ? (def.children ?? []).map((child) => resolveNode(child, ctx))
      : [],
  };
}

/**
 * What a `bind:` reads: a binding by name, or a judgement that works the value
 * out. The second is what lets a gauge measure something no single binding
 * answers — how close to the redline, how far past safe.
 */
function resolveBound(
  bind: HudNodeDef["bind"],
  ctx: HudResolveContext,
): HudValue | undefined {
  if (bind === undefined) return undefined;
  if (typeof bind === "string") return ctx.values[bind];
  const answered = callHudScript(bind.script, ctx.state);
  return typeof answered === "string" ||
    typeof answered === "number" ||
    typeof answered === "boolean"
    ? answered
    : undefined;
}

/** A colour, wherever one is authored — a literal, or a judgement. */
export function resolveColor(
  color: HudColor | undefined,
  ctx: HudResolveContext,
): string | undefined {
  if (color === undefined) return undefined;
  if (typeof color === "string") return color;
  return hudScriptColor(color.script, ctx.state);
}

/**
 * A condition: a flag binding, a negated one, a list of either (which holds
 * when EVERY entry does), or a judgement. Absent means "always", and a script
 * that cannot answer means "always" too.
 */
export function resolveCondition(
  condition: HudCondition | undefined,
  ctx: HudResolveContext,
): boolean {
  if (condition === undefined) return true;
  if (typeof condition === "string") {
    const negated = condition.startsWith("!");
    const value = ctx.values[negated ? condition.slice(1) : condition];
    // A binding this build does not answer shows the element: a mod authored
    // against a newer game must not be able to make the HUD disappear.
    if (value === undefined) return true;
    return negated ? !value : Boolean(value);
  }
  if (Array.isArray(condition)) {
    return condition.every((entry) => resolveCondition(entry, ctx));
  }
  return hudScriptFlag(condition.script, ctx.state) ?? true;
}

function resolveText(
  def: HudNodeDef,
  raw: string | number | boolean | undefined,
  ctx: HudResolveContext,
): string | undefined {
  // A WORD A SCRIPT CHOOSES. The line itself can be the judgement, not only its
  // colour — which is what lets a dial read one way at a crawl and another at
  // the redline, and lets a mod change what it says without changing the app.
  if (def.text !== undefined && typeof def.text !== "string") {
    const answered = callHudScript(def.text.script, ctx.state);
    return answered === undefined ? undefined : String(answered);
  }
  // A line may WEAVE bindings into itself — `{drive.mph} MPH GEAR
  // {drive.gearLabel}` — which is how one node says a whole sentence instead of
  // three butted together. A placeholder this build cannot answer is left as it
  // was written, so a mod's line against a newer game reads oddly rather than
  // printing the word `undefined` across the dashboard.
  const woven =
    def.text === undefined || !def.text.includes("{")
      ? def.text
      : def.text.replace(/\{([^}]*)\}/g, (whole, binding: string) => {
          const value = ctx.values[binding];
          return value === undefined ? whole : String(value);
        });
  if (def.bind === undefined) return woven;
  if (raw === undefined) return woven;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return String(raw);
  switch (def.format) {
    case "compact":
      return formatCompact(value);
    case "time":
      return formatTime(value);
    case "percent":
      return `${Math.round(value * 100)}%`;
    default:
      return String(Math.round(value));
  }
}

function resolveSprite(
  def: HudNodeDef,
  ctx: HudResolveContext,
): string | undefined {
  if (def.sprite !== undefined) {
    if (typeof def.sprite === "string") return def.sprite;
    const answered = callHudScript(def.sprite.script, ctx.state);
    return typeof answered === "string" && answered.length > 0
      ? answered
      : undefined;
  }
  if (def.spriteBind === undefined) return undefined;
  const named = ctx.values[def.spriteBind];
  return typeof named === "string" && named.length > 0 ? named : undefined;
}

function clampFrac(raw: string | number | boolean | undefined): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * The authored style block, turned into the inline style its box wears.
 *
 * A mod cannot ship CSS, so this is the whole of what an authored element can
 * do to its own box — and the mapping is deliberately dull: three of the
 * properties are flex words spelled the way a person would say them
 * (`direction: row`), the rest are passed through with a bare number read as
 * pixels. The schema has already refused anything that is not a plain length,
 * colour or border, so nothing arriving here can carry a `url()` or a `calc()`.
 */
function resolveStyle(
  style: HudStyle | undefined,
): Record<string, string | number> | undefined {
  if (!style) return undefined;
  const out: Record<string, string | number> = {};
  const px = (value: string | number) =>
    typeof value === "number" ? `${value}px` : value;
  if (style.width !== undefined) out.width = px(style.width);
  if (style.height !== undefined) out.height = px(style.height);
  if (style.minWidth !== undefined) out.minWidth = px(style.minWidth);
  if (style.minHeight !== undefined) out.minHeight = px(style.minHeight);
  if (style.gap !== undefined) out.gap = px(style.gap);
  if (style.padding !== undefined) out.padding = px(style.padding);
  if (style.margin !== undefined) out.margin = px(style.margin);
  if (style.background !== undefined) out.background = style.background;
  if (style.border !== undefined) out.border = style.border;
  if (style.borderRadius !== undefined) {
    out.borderRadius = px(style.borderRadius);
  }
  if (style.color !== undefined) out.color = style.color;
  if (style.opacity !== undefined) out.opacity = style.opacity;
  if (style.direction !== undefined) {
    out.display = "flex";
    out.flexDirection = style.direction;
  }
  if (style.align !== undefined) {
    out.display = "flex";
    out.alignItems =
      style.align === "start" || style.align === "end"
        ? `flex-${style.align}`
        : style.align;
  }
  if (style.justify !== undefined) {
    out.display = "flex";
    out.justifyContent =
      style.justify === "between"
        ? "space-between"
        : style.justify === "start" || style.justify === "end"
          ? `flex-${style.justify}`
          : style.justify;
  }
  return out;
}
