// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN'S OWN WINDOWS ARE CONTENT, and this is what keeps that honest.
//
// The vocabulary lives in TWO places on purpose: the schema
// (`scripts/asset-tools/ingame-menu-schema.mjs`) decides what a YAML file may
// SAY, and the app decides what those words DO. Neither can be derived from the
// other — the schema runs in a build script with no engine and no DOM, the app
// runs in a browser with no filesystem — so the pairing is asserted here:
//
//   a SCREEN the schema accepts and the engine cannot raise is a window nobody
//   will ever see; a WIDGET it accepts and nothing supplies is an empty box; a
//   BINDING a window reads and the app does not publish is `undefined` printed
//   into a button; and a SCREEN with no window at all is a hero parked behind
//   nothing with the world frozen in front of him.
//
// Then the shipped catalog held to its own rules, and the two behaviours the
// whole modal seam rests on: a trigger fails CLOSED, and a mod's row merges by
// id.

import { describe, expect, it } from "vitest";

import {
  HUD_ACTIONS,
  HUD_BINDINGS,
} from "../../scripts/asset-tools/hud-schema.mjs";
import {
  MENU_SCREENS,
  MENU_WIDGETS,
  validateMenu,
  validateMenuCatalog,
  validateMenuElement,
} from "../../scripts/asset-tools/ingame-menu-schema.mjs";
import { loadMenus } from "../../scripts/menu-data/load-ingame-yaml.mjs";
import { moduleExports } from "../../scripts/asset-tools/script-schema.mjs";

import { MENUS, MENU_MODALS } from "../../pwa/src/generated/ingame-menus.ts";
import { menuBindings } from "../../pwa/src/game/menus/bindings.ts";
import {
  menuForScreen,
  mergeMenus,
  SHIPPED_MENUS,
  windowRows,
} from "../../pwa/src/game/menus/layout.ts";
import { MENU_WIDGET_NAMES } from "../../pwa/src/game/menus/widgets.ts";
import type {
  MenuDef,
  MenuElementDef,
} from "../../pwa/src/game/menus/types.ts";
import { resolveContext } from "../../pwa/src/game/hud/resolve.ts";
import {
  closeAllModals,
  modalStack,
  openModal,
  resetModals,
  syncModalTriggers,
} from "../../pwa/src/game/menus/modals.ts";

/** Walk a window's rows and everything under them. */
function walk(
  node: { children?: unknown[] } & Record<string, unknown>,
  visit: (node: Record<string, unknown>) => void,
): void {
  visit(node);
  for (const child of (node.children ?? []) as Record<string, unknown>[]) {
    walk(child as never, visit);
  }
}

describe("the in-game menus' vocabulary", () => {
  it("names a screen the engine can actually raise", () => {
    // `PlayerScreen` (src/game/types/core.ts) is the list, and it is the
    // ENGINE's — a window naming a screen nothing parks a hero behind is a file
    // nobody will ever see the inside of. Asserted against the shipped catalog
    // rather than against the type, because a type cannot be read at runtime:
    // every window answers a screen, and every screen has a window (below).
    for (const menu of MENUS) {
      expect(MENU_SCREENS.has(menu.screen ?? ""), menu.id).toBe(true);
    }
  });

  it("answers every screen the run has", () => {
    // THE GAP THIS PINS: the engine can park a hero behind any of its screens,
    // and it does not ask whether the app has anything to draw. A screen with no
    // window is a frozen world with an empty picture in front of it — and,
    // solo, a run that cannot be resumed.
    const answered = new Set(MENUS.map((menu) => menu.screen));
    for (const screen of MENU_SCREENS) {
      expect(answered.has(screen), `no window answers "${screen}"`).toBe(true);
    }
  });

  it("supplies every widget the schema accepts", () => {
    expect([...MENU_WIDGETS].sort()).toEqual([...MENU_WIDGET_NAMES].sort());
  });

  it("answers every `menu.` binding the schema accepts", () => {
    const published = menuBindings(
      {
        screen: "paused",
        charTab: "bag",
        cleanSlates: 2,
        autopilotOffered: true,
        autopilotActive: false,
        demo: false,
        hardcore: false,
        session: true,
      },
      [{ id: "some_modal", arg: "x", key: 1 }],
    );
    const authorable = Object.keys(HUD_BINDINGS).filter((id) =>
      id.startsWith("menu."),
    );
    expect(Object.keys(published).sort()).toEqual(authorable.sort());
    // …and each one answers with the type the schema promised, since that is
    // what decides whether a bar, a `visible:` or a line may read it.
    for (const [id, value] of Object.entries(published)) {
      const kind = (HUD_BINDINGS as Record<string, string>)[id];
      if (kind === "flag") expect(typeof value, id).toBe("boolean");
      if (kind === "number") expect(typeof value, id).toBe("number");
      if (kind === "text") expect(typeof value, id).toBe("string");
    }
  });

  it("names an action the app supplies on every press", () => {
    for (const window of [...MENUS, ...MENU_MODALS]) {
      for (const row of window.body) {
        walk(row as never, (node) => {
          const press = node.press as { action?: string } | undefined;
          if (!press) return;
          expect(HUD_ACTIONS.has(press.action ?? ""), press.action).toBe(true);
        });
      }
      if (window.dismiss) {
        expect(HUD_ACTIONS.has(window.dismiss.action), window.id).toBe(true);
      }
    }
  });
});

describe("the shipped windows", () => {
  const tree = loadMenus();
  const scripts = new Map(
    tree.scripts.map((script: { id: string; source: string; file: string }) => [
      script.id,
      moduleExports(script.source, script.file).functions,
    ]),
  );

  it("validates against its own schema, straight off the tree", () => {
    // Straight off `content/menus/`, not off the generated module: the
    // generator is what runs this check, so reading its OUTPUT back would only
    // prove it wrote down what it read.
    const refs = {
      sprites: new Set<string>(["hud_frame"]),
      sounds: new Set<string>(["ui_back", "ui_confirm", "ui_start", "ui_move"]),
      scripts,
      menus: new Set<string>(
        [...tree.menus, ...tree.modals].map((w: { id: string }) => w.id),
      ),
    };
    const errors: string[] = [];
    for (const menu of tree.menus) {
      errors.push(...validateMenu(menu, refs).errors);
    }
    for (const modal of tree.modals) {
      errors.push(...validateMenu(modal, refs, { modal: true }).errors);
    }
    for (const element of tree.elements) {
      errors.push(...validateMenuElement(element, refs).errors);
    }
    errors.push(
      ...validateMenuCatalog(tree.menus, tree.modals, tree.elements).errors,
    );
    expect(errors).toEqual([]);
  });

  it("gives every top-level row a name a mod can replace it by", () => {
    // The whole addon story rests on this: a row with no id can be neither
    // replaced nor inserted next to.
    for (const window of [...MENUS, ...MENU_MODALS]) {
      const ids = window.body.map((row) => row.id);
      expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
        true,
      );
      expect(new Set(ids).size, `${window.id} has two rows with one name`).toBe(
        ids.length,
      );
    }
  });

  it("gives the pause menu's rows room to insert between", () => {
    // The shipped rows are numbered in tens so a mod's own row can land in the
    // middle of the stack — which is what `menus/elements/*.yaml` with an
    // `order:` between two of them does. A stack numbered 0,1,2 could not be
    // inserted into at all.
    const pause = MENUS.find((menu) => menu.id === "pause");
    const actions = pause?.body.find((row) => row.id === "actions");
    const orders = (actions?.children ?? []).map((child) => child.order ?? 0);
    expect(orders.length).toBeGreaterThan(2);
    for (const [index, order] of orders.entries()) {
      if (index === 0) continue;
      expect(order - (orders[index - 1] ?? 0)).toBeGreaterThanOrEqual(5);
    }
  });

  it("picks the demo's own confirm over the pause menu on a demo run", () => {
    // TWO WINDOWS, ONE SCREEN — checked in order, first one that holds wins.
    const values = (demo: boolean) =>
      resolveContext(
        menuBindings(
          {
            screen: "paused",
            charTab: "bag",
            cleanSlates: 0,
            autopilotOffered: !demo,
            autopilotActive: false,
            demo,
            hardcore: false,
            session: false,
          },
          [],
        ),
      );
    const pick = (demo: boolean) =>
      menuForScreen(MENUS, "paused", (menu) => {
        const ctx = values(demo);
        return (
          menu.visible === undefined ||
          (typeof menu.visible === "string" &&
            (menu.visible.startsWith("!")
              ? !ctx.values[menu.visible.slice(1)]
              : Boolean(ctx.values[menu.visible])))
        );
      })?.id;
    expect(pick(true)).toBe("demo_exit");
    expect(pick(false)).toBe("pause");
  });

  it("leaves a way out of every window that can be left", () => {
    // A window drawing its own box needs either a dismissable backdrop or a row
    // that closes it — a box with neither is a run the player cannot get back
    // to. (`wrap: none` windows draw no backdrop of their own; their panel
    // owns the way out.)
    for (const window of MENUS) {
      if (window.wrap === "none") continue;
      const rows = window.body.flatMap((row) => {
        const out: Record<string, unknown>[] = [];
        walk(row as never, (node) => out.push(node));
        return out;
      });
      const closes = rows.some((node) => {
        const press = node.press as { action?: string } | undefined;
        return (
          press !== undefined &&
          ["resumeRun", "exitToMenu", "quitRun", "closeMenu"].includes(
            press.action ?? "",
          )
        );
      });
      expect(
        window.dismiss !== undefined || closes,
        `${window.id} cannot be left`,
      ).toBe(true);
    }
  });
});

describe("a mod's own rows", () => {
  const pause = MENUS.find((menu) => menu.id === "pause")!;

  const row = (over: Partial<MenuElementDef>): MenuElementDef =>
    ({
      id: "mod_row",
      menu: "pause",
      kind: "text",
      text: "MOD",
      ...over,
    }) as MenuElementDef;

  it("adds to the end of a window when it says no order", () => {
    const rows = windowRows(pause, [row({})]);
    expect(rows[rows.length - 1]?.id).toBe("mod_row");
  });

  it("lands between two shipped rows when it says one", () => {
    const rows = windowRows(pause, [row({ into: "actions", order: 15 })]);
    const actions = rows.find((entry) => entry.id === "actions");
    const ids = (actions?.children ?? []).map((child) => child.id);
    expect(ids).toEqual([
      "resume",
      "autopilot_start",
      "mod_row",
      "autopilot_stop",
      "clean_slate",
      "exit",
    ]);
  });

  it("replaces a shipped row IN ITS PLACE when it reuses its id", () => {
    // The default that makes a re-worded RESUME still the top button rather
    // than a new one at the bottom.
    const rows = windowRows(pause, [
      row({ id: "resume", into: "actions", order: undefined }),
    ]);
    const actions = rows.find((entry) => entry.id === "actions");
    const children = actions?.children ?? [];
    expect(children[0]?.id).toBe("resume");
    expect(children[0]?.kind).toBe("text");
    expect(children.length).toBe(5);
  });

  it("keeps a row aimed at a container this build no longer has", () => {
    // A mod compiled against an older game should look wrong, not vanish.
    const rows = windowRows(pause, [row({ into: "a_stack_we_removed" })]);
    expect(rows.some((entry) => entry.id === "mod_row")).toBe(true);
  });

  it("merges a whole window by id, later wins", () => {
    const mine: MenuDef = {
      id: "pause",
      screen: "paused",
      order: 10,
      wrap: "window",
      body: [{ id: "only", order: 0, kind: "text", text: "MINE" }],
    };
    const { layout, claimed } = mergeMenus(SHIPPED_MENUS, { menus: [mine] });
    expect(claimed).toContain("menu:pause");
    expect(layout.menus.filter((menu) => menu.id === "pause")).toHaveLength(1);
    expect(layout.menus.find((menu) => menu.id === "pause")?.body).toHaveLength(
      1,
    );
    // …and nothing else moved.
    expect(layout.menus.length).toBe(SHIPPED_MENUS.menus.length);
  });
});

describe("a modal", () => {
  const modal = (over: Partial<MenuDef>): MenuDef =>
    ({
      id: "warn",
      order: 0,
      wrap: "window",
      body: [],
      ...over,
    }) as MenuDef;
  const ctx = (values: Record<string, boolean>) => resolveContext(values);

  it("rises on the EDGE and not again until the answer turns back", () => {
    resetModals();
    const modals = [modal({ when: "hud.downed" })];
    syncModalTriggers(modals, ctx({ "hud.downed": false }));
    expect(modalStack()).toHaveLength(0);
    syncModalTriggers(modals, ctx({ "hud.downed": true }));
    expect(modalStack().map((open) => open.id)).toEqual(["warn"]);
    // Dismissed while the condition still holds — it must NOT come straight
    // back, or the player is trapped behind their own mod.
    closeAllModals();
    syncModalTriggers(modals, ctx({ "hud.downed": true }));
    expect(modalStack()).toHaveLength(0);
    // …and it does rise again once the answer has been no in between.
    syncModalTriggers(modals, ctx({ "hud.downed": false }));
    syncModalTriggers(modals, ctx({ "hud.downed": true }));
    expect(modalStack()).toHaveLength(1);
    resetModals();
  });

  it("says a `once:` window one time per run", () => {
    resetModals();
    const modals = [modal({ when: "hud.downed", once: true })];
    syncModalTriggers(modals, ctx({ "hud.downed": true }));
    expect(modalStack()).toHaveLength(1);
    closeAllModals();
    syncModalTriggers(modals, ctx({ "hud.downed": false }));
    syncModalTriggers(modals, ctx({ "hud.downed": true }));
    expect(modalStack()).toHaveLength(0);
    // A new run forgets.
    resetModals();
    syncModalTriggers(modals, ctx({ "hud.downed": true }));
    expect(modalStack()).toHaveLength(1);
    resetModals();
  });

  it("FAILS CLOSED on a question nobody can answer", () => {
    // A `visible:` fails open, because a mod authored against a newer game must
    // not be able to make the HUD disappear. A TRIGGER is the opposite: a modal
    // raised on a binding this build has never heard of would stand in the
    // player's face for the rest of the run.
    resetModals();
    syncModalTriggers([modal({ when: "hud.somethingNewer" })], ctx({}));
    expect(modalStack()).toHaveLength(0);
    resetModals();
  });

  it("does not stack a second copy of itself", () => {
    resetModals();
    openModal("warn");
    openModal("warn");
    expect(modalStack()).toHaveLength(1);
    resetModals();
  });
});
