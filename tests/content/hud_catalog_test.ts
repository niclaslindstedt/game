// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HUD IS CONTENT, and this is what keeps that honest.
//
// The HUD's vocabulary lives in TWO places on purpose: the schema
// (`scripts/asset-tools/hud-schema.mjs`) decides what a YAML file may SAY, and
// the app decides what those words DO. Neither can be derived from the other —
// the schema runs in a build script with no engine and no DOM, the app runs in
// a browser with no filesystem — so the pairing is asserted here instead:
//
//   a BINDING the schema accepts and the app does not answer is `undefined`
//   printed into a bar; a WIDGET it accepts and nothing renders is an element
//   that compiles and draws nothing; an EVENT the app raises and the schema
//   refuses is a moment nobody can ever give a sound to.
//
// Everything after that is the SHIPPED layout held to its own rules, and the
// resolver held to the fail-open promise every one of its fallbacks makes: a
// broken judgement must leave the HUD readable, because the HUD is what the
// player reads a fight through.

import { describe, expect, it } from "vitest";

import {
  HUD_ACTIONS,
  HUD_BINDINGS,
  HUD_EVENTS,
  HUD_REFS,
  HUD_SURFACES,
  HUD_WIDGETS,
  validateHudCatalog,
  validateHudElement,
  validateHudEvents,
  validateHudRegions,
} from "../../scripts/asset-tools/hud-schema.mjs";
import { loadHud } from "../../scripts/hud-data/load-yaml.mjs";
import { moduleExports } from "../../scripts/asset-tools/script-schema.mjs";

import {
  HUD_ELEMENTS,
  HUD_EVENT_SOUNDS,
  HUD_REGIONS,
  HUD_SCRIPTS,
} from "../../pwa/src/generated/hud.ts";
import { driveBindings, scriptState } from "../../pwa/src/game/hud/bindings.ts";
import { HUD_WIDGET_NAMES } from "../../pwa/src/game/hud/widgets/names.ts";
import { mergeHud, SHIPPED_HUD } from "../../pwa/src/game/hud/layout.ts";
import {
  resolveCondition,
  resolveContext,
  resolveLayout,
  resolveNode,
} from "../../pwa/src/game/hud/resolve.ts";
import type {
  HudElementDef,
  HudNodeDef,
} from "../../pwa/src/game/hud/types.ts";

/** Every value the shipped HUD could ask for, with plausible answers — a stand
 * -in for a live run, so the resolver can be exercised without one. */
const VALUES = Object.fromEntries(
  Object.entries(HUD_BINDINGS as Record<string, string>).map(([id, type]) => [
    id,
    type === "flag"
      ? true
      : type === "frac"
        ? 0.5
        : type === "sprite"
          ? "icon_bag"
          : type === "text"
            ? "pistol"
            : 3,
  ]),
);

const walk = (node: HudNodeDef, visit: (n: HudNodeDef) => void): void => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
};

describe("the HUD's vocabulary", () => {
  it("answers every binding the schema accepts", () => {
    // The field's half comes from `hudBindings`, which needs a live run — so it
    // is read off the SHAPE the module publishes rather than by staging one:
    // the two together must cover the schema, and neither may carry a name the
    // schema has never heard of.
    const drive = driveBindings({
      mph: 30,
      topSpeedMph: 70,
      speedFrac: 0.4,
      gear: 2,
      gearCount: 5,
      rev: 0.5,
      reversing: false,
      bodies: 4,
      wear: 0.3,
      failing: false,
      paused: false,
    });
    for (const id of Object.keys(drive)) {
      expect(
        HUD_BINDINGS,
        `${id} is answered but not authorable`,
      ).toHaveProperty(id);
    }
    const driveBindingIds = Object.keys(HUD_BINDINGS).filter((id) =>
      id.startsWith("drive."),
    );
    expect(Object.keys(drive).sort()).toEqual(driveBindingIds.sort());
  });

  it("renders every widget the schema accepts", () => {
    expect([...HUD_WIDGET_NAMES].sort()).toEqual([...HUD_WIDGETS].sort());
  });

  it("keeps the shipped event sounds inside the moments the app raises", () => {
    for (const event of Object.keys(HUD_EVENT_SOUNDS)) {
      expect(
        HUD_EVENTS.has(event),
        `${event} is authored but never raised`,
      ).toBe(true);
    }
  });

  it("names a surface the renderer knows for every top-level region", () => {
    for (const region of Object.values(HUD_REGIONS)) {
      if (region.parent !== undefined) continue;
      expect(HUD_SURFACES.has(region.surface ?? "field")).toBe(true);
    }
  });
});

describe("the shipped HUD", () => {
  const tree = loadHud();
  const sprites = new Set<string>();

  it("validates against its own schema, straight off the tree", () => {
    // Not a re-run of the generator's check for its own sake: this is what
    // proves the COMMITTED content still passes after a schema change, since
    // the generated module is gitignored and could have been built before it.
    const exported = new Map<string, Set<string>>();
    for (const script of tree.scripts) {
      const res = moduleExports(script.source, script.file);
      expect(res.errors, script.file).toEqual([]);
      exported.set(script.id, res.functions);
    }
    for (const element of tree.elements) {
      for (const node of [element] as HudNodeDef[]) {
        walk(node, (n) => {
          if (n.sprite && typeof n.sprite === "string") sprites.add(n.sprite);
          if (n.frame) sprites.add(n.frame);
        });
      }
    }
    for (const region of Object.values(tree.regions)) {
      if (typeof region.frame === "string") sprites.add(region.frame);
    }
    const sounds = new Set<string>();
    for (const element of tree.elements) {
      walk(element as HudNodeDef, (n) => {
        if (n.press?.sound) sounds.add(n.press.sound);
      });
    }
    for (const sound of Object.values(tree.events)) sounds.add(sound as string);

    const regions = validateHudRegions(tree.regions, {
      sprites,
      scripts: exported,
    });
    expect(regions.errors).toEqual([]);
    const refs = {
      sprites,
      sounds,
      scripts: exported,
      regions: new Set(Object.keys(tree.regions)),
    };
    for (const element of tree.elements) {
      const res = validateHudElement(element, refs);
      expect(res.errors, element.id).toEqual([]);
    }
    expect(validateHudEvents(tree.events, { sounds }).errors).toEqual([]);
    expect(validateHudCatalog(tree.elements).errors).toEqual([]);
  });

  it("puts every element in a region that exists", () => {
    for (const element of HUD_ELEMENTS) {
      expect(HUD_REGIONS, element.id).toHaveProperty(element.region);
    }
  });

  it("claims each render-loop handle exactly once", () => {
    const claims = new Map<string, string>();
    for (const element of HUD_ELEMENTS) {
      walk(element, (node) => {
        for (const ref of [node.ref, node.fill?.ref, node.overlay?.ref]) {
          if (!ref) continue;
          expect(HUD_REFS.has(ref), ref).toBe(true);
          expect(claims.has(ref), `${ref} claimed twice`).toBe(false);
          claims.set(ref, element.id);
        }
      });
    }
    // The stamina fill and the XP heat are written by the render loop every
    // frame; an element that stopped carrying one is a bar that stops moving.
    expect(claims.get("staminaFill")).toBe("vitals_stamina");
    expect(claims.get("xpHeat")).toBe("xp_bar");
  });

  it("names an action the app supplies on every press", () => {
    for (const element of HUD_ELEMENTS) {
      walk(element, (node) => {
        if (!node.press) return;
        expect(HUD_ACTIONS.has(node.press.action), node.press.action).toBe(
          true,
        );
      });
    }
  });

  it("draws both surfaces — the fight and the road", () => {
    const ctx = resolveContext(VALUES);
    const tops = resolveLayout(HUD_REGIONS, HUD_ELEMENTS, ctx);
    const surfaces = new Set(tops.map((r) => r.def.surface ?? "field"));
    expect(surfaces.has("field")).toBe(true);
    expect(surfaces.has("drive")).toBe(true);
  });
});

describe("resolving", () => {
  const ctx = resolveContext({
    ...VALUES,
    "hud.bagFree": 0,
    "hud.ammoCount": 0,
    "hud.hasWeaponGauge": true,
    "hud.weaponGauge": 0.1,
    "ui.swipeBars": false,
  });

  it("reads a flag, a negated flag and a list of both", () => {
    expect(resolveCondition("hud.pointsWaiting", ctx)).toBe(true);
    expect(resolveCondition("!ui.swipeBars", ctx)).toBe(true);
    expect(resolveCondition(["hud.fieldLive", "!ui.swipeBars"], ctx)).toBe(
      true,
    );
    expect(resolveCondition(["hud.fieldLive", "ui.swipeBars"], ctx)).toBe(
      false,
    );
  });

  it("shows an element whose binding this build does not answer", () => {
    // A mod authored against a newer game must not be able to make the HUD
    // disappear — the unknown reads as "no opinion", not as "hide".
    expect(resolveCondition("hud.somethingFromTheFuture", ctx)).toBe(true);
  });

  it("lets a Lua judgement pick a colour", () => {
    // The shipped ladder: an empty bag prints its count red.
    const node: HudNodeDef = {
      kind: "text",
      bind: "hud.bagFree",
      color: { script: "vitals.bag_color" },
    };
    expect(resolveNode(node, ctx).color).toBe("#d83a3a");
  });

  it("lets a Lua judgement write the whole line", () => {
    const node: HudNodeDef = {
      kind: "text",
      text: { script: "drive.damage_label" },
    };
    const drive = resolveContext({
      ...VALUES,
      ...driveBindings({
        mph: 42,
        topSpeedMph: 70,
        speedFrac: 0.6,
        gear: 2,
        gearCount: 5,
        rev: 0.25,
        reversing: false,
        bodies: 0,
        wear: 0.31,
        failing: false,
        paused: false,
      }),
    });
    expect(resolveNode(node, drive).text).toBe("DAMAGE 31%");
    expect(
      resolveNode(
        { kind: "text", text: { script: "drive.speed_label" } },
        drive,
      ).text,
    ).toBe("42 MPH  GEAR 3");
  });

  it("weaves bindings into a line, and leaves an unknown one alone", () => {
    const node: HudNodeDef = {
      kind: "text",
      text: "{hud.bagFree} FREE {hud.nothing}",
    };
    expect(resolveNode(node, ctx).text).toBe("0 FREE {hud.nothing}");
  });

  it("falls open when a judgement is broken", () => {
    // Every one of these is a mod's file being wrong, and every one of them has
    // to leave the element readable rather than take the HUD down with it.
    const missing = resolveNode(
      { kind: "text", text: "X", color: { script: "nosuch.file" } },
      ctx,
    );
    expect(missing.color).toBeUndefined();
    expect(missing.visible).toBe(true);
    expect(resolveCondition({ script: "vitals.no_such_function" }, ctx)).toBe(
      true,
    );
  });

  it("sweeps a gauge from a fraction — the shape a dial is", () => {
    // Nothing shipped draws one yet: the ROUND primitive exists for the dials
    // the road is going to grow (a speedometer, a tachometer, a gearbox) and
    // for a mod's own cooldown wheels, so it is proved here rather than by the
    // catalog. It is validated like any other element and resolves like a bar.
    const gauge: HudNodeDef = {
      kind: "gauge",
      bind: "drive.rev",
      sweep: 240,
      start: -120,
      thickness: 4,
      color: "#7ef0c8",
    };
    const res = validateHudElement(
      { ...gauge, id: "tacho", region: "drive_bar", order: 0 },
      {
        sprites: new Set(),
        sounds: new Set(),
        scripts: new Map(),
        regions: new Set(["drive_bar"]),
      },
    );
    expect(res.errors).toEqual([]);
    const view = resolveNode(
      gauge,
      resolveContext({ ...VALUES, "drive.rev": 0.75 }),
    );
    expect(view.value).toBe(0.75);
    // …and it has a track behind it unless the author says otherwise.
    expect(view.trackColor).toBeDefined();
  });

  it("clamps a bar's fill to its track", () => {
    const over = resolveContext({ ...VALUES, "hud.hpFrac": 4 });
    expect(resolveNode({ kind: "bar", bind: "hud.hpFrac" }, over).value).toBe(
      1,
    );
    const nan = resolveContext({ ...VALUES, "hud.hpFrac": Number.NaN });
    expect(resolveNode({ kind: "bar", bind: "hud.hpFrac" }, nan).value).toBe(0);
  });

  it("does not walk a hidden element's children", () => {
    const node: HudNodeDef = {
      kind: "panel",
      visible: "!hud.fieldLive",
      children: [{ kind: "text", text: "GONE" }],
    };
    const view = resolveNode(node, ctx);
    expect(view.visible).toBe(false);
    expect(view.children).toEqual([]);
  });

  it("groups the bindings for Lua by their prefix", () => {
    const groups = scriptState(VALUES);
    expect(groups.hud).toHaveProperty("bagFree");
    expect(groups.ui).toHaveProperty("keyHints");
    expect(groups.drive).toHaveProperty("wear");
  });
});

describe("a mod's HUD", () => {
  const element: HudElementDef = {
    id: "bag_slot",
    region: "gear",
    order: 1,
    kind: "button",
    aria: "open-bag",
    press: { action: "openBag" },
  };

  it("replaces an element by id and adds a new one beside it", () => {
    const { layout, claimed } = mergeHud(SHIPPED_HUD, {
      elements: [
        element,
        { ...element, id: "my_own_panel", order: 9, kind: "panel" },
      ],
    });
    expect(claimed).toContain("bag_slot");
    // Replaced, not doubled: one pouch, wearing the mod's shape.
    expect(layout.elements.filter((e) => e.id === "bag_slot")).toHaveLength(1);
    expect(layout.elements.find((e) => e.id === "bag_slot")?.aria).toBe(
      "open-bag",
    );
    expect(layout.elements.some((e) => e.id === "my_own_panel")).toBe(true);
    // …and everything it did not mention is still there.
    expect(layout.elements.some((e) => e.id === "xp_bar")).toBe(true);
    expect(SHIPPED_HUD.elements.some((e) => e.id === "my_own_panel")).toBe(
      false,
    );
  });

  it("keeps every sound it did not re-point", () => {
    const { layout } = mergeHud(SHIPPED_HUD, {
      events: { "trade.ask": "ui_boom" },
    });
    expect(layout.events["trade.ask"]).toBe("ui_boom");
    expect(layout.events["hud.press"]).toBe(HUD_EVENT_SOUNDS["hud.press"]);
  });

  it("takes over a judgement file without taking the others", () => {
    const { layout } = mergeHud(SHIPPED_HUD, {
      scripts: { vitals: { id: "vitals", source: "return {}" } },
    });
    expect(layout.scripts.vitals?.source).toBe("return {}");
    expect(layout.scripts.drive?.source).toBe(HUD_SCRIPTS.drive?.source);
  });

  it("survives a region whose parent chain loops", () => {
    // The compiler proved the SHIPPED frame acyclic; a mod's file was compiled
    // against its own copy of it, so the renderer needs its own stop.
    const { layout } = mergeHud(SHIPPED_HUD, {
      regions: {
        a: { id: "a", parent: "b", order: 0, wrap: "div" },
        b: { id: "b", parent: "a", order: 0, wrap: "div" },
      },
    });
    expect(() =>
      resolveLayout(layout.regions, layout.elements, resolveContext(VALUES)),
    ).not.toThrow();
  });

  it("drops an element authored into a region nobody ships", () => {
    const { layout } = mergeHud(SHIPPED_HUD, {
      elements: [{ ...element, id: "orphan", region: "nowhere" }],
    });
    const tops = resolveLayout(
      layout.regions,
      layout.elements,
      resolveContext(VALUES),
    );
    const ids: string[] = [];
    const visit = (
      children: ReturnType<typeof resolveLayout>[number]["children"],
    ) => {
      for (const child of children) {
        if ("region" in child) visit(child.region.children);
        else ids.push(child.element.def.id);
      }
    };
    for (const top of tops) visit(top.children);
    expect(ids).not.toContain("orphan");
  });
});
