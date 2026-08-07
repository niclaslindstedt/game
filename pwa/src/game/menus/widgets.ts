// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MENU WIDGET REGISTRY — the code-backed insides an authored window can
// place.
//
// A widget is the honest limit of "the in-game menus are content": a bag grid
// with drag-and-drop, a fog-of-war map painted onto a canvas, a talk box that
// types itself out. None of them is expressible as boxes and words, so content
// places, gates, orders, frames and sounds them, and their insides stay
// TypeScript.
//
// THE PANELS ARE HANDED IN, not imported here. The screen that mounts the menus
// (`GameScreen`) already builds each of these with the run, the assets and the
// verbs they need, so the registry is a NAME → THUNK map rather than a switch
// full of components — which also means a panel this screen does not supply
// (the session roster on an offline run) is a row that draws nothing rather
// than one that has to be gated twice.
//
// THE NAMES ARE THE SCHEMA'S. `MENU_WIDGETS` in
// `scripts/asset-tools/ingame-menu-schema.mjs` is what a YAML file may say, and
// `tests/content/ingame_menu_catalog_test.ts` pins the two together — a widget
// the schema accepts and nothing answers is an empty window.

import type { ReactNode } from "react";

import type { HudNodeView } from "../hud/resolve.ts";

/** Every code-backed inside a window may place. Kept as a literal so the panel
 * map below is typed by it — a panel named nowhere in the schema cannot be
 * supplied, and a schema name nothing supplies is caught by the test. */
export const MENU_WIDGET_NAMES = [
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
  "sessionPanel",
  "autopilotPickers",
] as const;

export type MenuWidgetName = (typeof MENU_WIDGET_NAMES)[number];

/**
 * What the mounting screen supplies, by name.
 *
 * PARTIAL on purpose: a run with no session supplies no `sessionPanel`, and a
 * run that cannot be flown supplies no `autopilotPickers`. Those are facts the
 * screen already knows, and making them absence rather than a second `visible:`
 * is what keeps the same window file working on a solo run and a hosted one.
 */
export type MenuPanels = Partial<Record<MenuWidgetName, () => ReactNode>>;

/** Draw the widget a row names. An unknown name — or one this screen does not
 * supply — draws nothing, which is the right answer from a mod compiled against
 * a different build of the game. */
export function renderMenuWidget(
  view: HudNodeView,
  panels: MenuPanels,
): ReactNode {
  const name = view.def.widget as MenuWidgetName | undefined;
  const make = name === undefined ? undefined : panels[name];
  return make ? make() : null;
}
