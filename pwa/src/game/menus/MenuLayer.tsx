// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE IN-GAME MENUS, MOUNTED — the whole of what a screen does to put the run's
// own windows up.
//
//   <MenuLayer ctx={hudContext} screen={hud.screen} panels={panels} />
//
// It reads the LIVE catalog (shipped, or shipped with a mod's merged on top),
// picks the window that answers the screen the hero is parked behind, resolves
// its rows against this instant's values and draws them — and then draws
// whatever modals are standing over it. The screen that mounts it does not know
// what is on the pause menu, which is the point: a mod that adds a row does not
// touch this file.
//
// IT IS THE HUD'S RENDERER, NOT A SECOND ONE. `resolveNode` decides every
// condition, colour and formatted number; `HudNode` turns the result into DOM.
// The only thing this file adds is the FURNITURE a window has and a HUD does
// not: a backdrop you can press, a box to stop the press at, and a stack.
//
// THE RESOLVE IS MEMOISED ON THE VALUES, exactly as the HUD's is: React
// re-renders the game screen for plenty of reasons that are not a menu change,
// and the resolve is where every Lua judgement in the window is called.

import { useEffect, useMemo, type CSSProperties } from "react";

import { spriteDataUrl } from "../assets.ts";
import { runHudPress } from "../hud/actions.ts";
import type { HudContext, HudFieldContext } from "../hud/context.ts";
import { HudNode } from "../hud/nodes.tsx";
import { playHudSound } from "../hud/sounds.ts";
import {
  resolveCondition,
  resolveContext,
  resolveNode,
  resolveStyle,
  type HudResolveContext,
} from "../hud/resolve.ts";
import { menuForScreen, menuLayout, windowRows } from "./layout.ts";
import {
  resetModals,
  syncModalTriggers,
  useModalStack,
  type OpenModal,
} from "./modals.ts";
import { renderMenuWidget, type MenuPanels } from "./widgets.ts";
import type { MenuDef, MenuElementDef } from "./types.ts";

export function MenuLayer({
  ctx,
  screen,
  panels,
}: {
  /** The very object the HUD is drawn through — same values, same verbs, same
   * fonts. A window is not a different world. */
  ctx: HudFieldContext;
  /** The run's own screen the local hero is parked behind, if any. */
  screen: string | undefined;
  panels: MenuPanels;
}) {
  const { menus, modals, elements } = menuLayout();
  const resolve = useMemo(() => resolveContext(ctx.values), [ctx.values]);
  // The menus' own context: the HUD's, told that it is drawing a window (so a
  // press is not refused for being off the live field) and handed the menus'
  // widget registry (so `kind: widget` means the bag grid rather than the
  // minimap).
  const menuCtx = useMemo<HudContext>(
    () => ({
      ...ctx,
      inMenu: true,
      widgets: (view) => renderMenuWidget(view, panels),
    }),
    [ctx, panels],
  );

  // A `when:` is answered once per resolve — once per HUD publish, not per
  // frame. See `modals.ts` for why the raise is on the EDGE.
  useEffect(() => {
    syncModalTriggers(modals, resolve);
  }, [modals, resolve]);
  // `once:` means once per RUN, and this layer's lifetime is the run's.
  useEffect(() => resetModals, []);

  const open = useModalStack();
  const window =
    screen === undefined
      ? undefined
      : menuForScreen(menus, screen, (menu) =>
          resolveCondition(menu.visible, resolve),
        );

  return (
    <>
      {window && (
        <MenuWindow
          key={window.id}
          def={window}
          ctx={menuCtx}
          resolve={resolve}
          elements={elements}
        />
      )}
      {open.map((standing) => (
        <Modal
          key={standing.key}
          standing={standing}
          modals={modals}
          ctx={menuCtx}
          resolve={resolve}
          elements={elements}
        />
      ))}
    </>
  );
}

/** One modal off the stack — nothing but a window whose def is looked up by id.
 * A stack entry whose window a mod took away draws nothing rather than an empty
 * backdrop the player cannot press through. */
function Modal({
  standing,
  modals,
  ctx,
  resolve,
  elements,
}: {
  standing: OpenModal;
  modals: MenuDef[];
  ctx: HudContext;
  resolve: HudResolveContext;
  elements: MenuElementDef[];
}) {
  const def = modals.find((modal) => modal.id === standing.id);
  if (!def) return null;
  if (!resolveCondition(def.visible, resolve)) return null;
  return (
    <MenuWindow def={def} ctx={ctx} resolve={resolve} elements={elements} />
  );
}

/**
 * ONE WINDOW: the backdrop, the box, and the rows.
 *
 * `wrap: none` draws neither backdrop nor box and renders the rows in place —
 * which is what a widget that already paints its own full-screen furniture
 * needs, and is how every shipped window but the pause menu is authored today.
 *
 * THE BACKDROP'S PRESS AND THE BOX'S ARE ONE GESTURE WITH TWO ANSWERS: the
 * backdrop runs the window's `dismiss:` and the box stops the press dead, which
 * is the "click outside to close, click inside to use" every window in this
 * game has always had. A window with no `dismiss:` cannot be waved away — the
 * respec is the shipped example, and it is a rule content states rather than
 * one code enforces.
 */
function MenuWindow({
  def,
  ctx,
  resolve,
  elements,
}: {
  def: MenuDef;
  ctx: HudContext;
  resolve: HudResolveContext;
  elements: MenuElementDef[];
}) {
  const rows = useMemo(() => windowRows(def, elements), [def, elements]);
  const views = useMemo(
    () => rows.map((row) => resolveNode(row, resolve)),
    [rows, resolve],
  );
  // WHAT IT SOUNDS LIKE WHEN IT OPENS. On the window's identity rather than on
  // every render, so a bar ticking behind the pause menu does not chirp.
  useEffect(() => {
    playHudSound(def.sound);
  }, [def.id, def.sound]);

  const body = views.map((view) => (
    <HudNode key={view.def.id} view={view} ctx={ctx} />
  ));
  if (def.wrap === "none") return <>{body}</>;

  return (
    <div
      className={def.backdrop}
      role="presentation"
      onPointerDown={() => {
        if (def.dismiss) runHudPress(def.dismiss, ctx);
      }}
    >
      <div
        className={def.class}
        style={boxStyle(def, ctx)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}

/** The box's own 9-slice plate, folded into its inline style — the same sprite
 * seam a HUD region's `frame:` uses, so the plate behind a mod's window is
 * replaced exactly as the plate behind the portrait is. */
function boxStyle(def: MenuDef, ctx: HudContext): CSSProperties | undefined {
  const style = resolveStyle(def.style) as CSSProperties | undefined;
  if (!def.frame) return style;
  const src = spriteDataUrl(ctx.assets.sprites, def.frame);
  if (!src) return style;
  return { ...style, borderImageSource: `url(${src})` };
}
