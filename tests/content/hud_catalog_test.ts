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
  HUD_ROW_BINDINGS,
  HUD_ROW_WIDGETS,
  HUD_SURFACES,
  HUD_WIDGETS,
  validateHudCatalog,
  validateHudElement,
  validateHudEvents,
  validateHudRegions,
} from "../../scripts/asset-tools/hud-schema.mjs";
import { DRIVE, DRIVETRAIN, engineRpm } from "../../engine/game/drive/index.ts";
import { loadHud } from "../../scripts/hud-data/load-yaml.mjs";
import { moduleExports } from "../../scripts/asset-tools/script-schema.mjs";

import {
  HUD_ELEMENTS,
  HUD_EVENT_SOUNDS,
  HUD_REGIONS,
  HUD_SCRIPTS,
} from "../../pwa/src/generated/hud.ts";
import {
  scriptState,
  speakerBindings,
  voiceBindings,
} from "../../pwa/src/game/hud/bindings.ts";
import { driveBindings } from "../../pwa/src/game/drive-screen/dials.ts";
import {
  HUD_ROW_WIDGET_NAMES,
  HUD_WIDGET_NAMES,
} from "../../pwa/src/game/hud/widgets/names.ts";
import { mergeHud, SHIPPED_HUD } from "../../pwa/src/game/hud/layout.ts";
import {
  resolveCondition,
  resolveContext,
  resolveLayout,
  resolveNode,
  resolveRow,
} from "../../pwa/src/game/hud/resolve.ts";
import type {
  HudElementDef,
  HudNodeDef,
} from "../../pwa/src/game/hud/types.ts";
import type {
  HudNodeView,
  HudRegionView,
} from "../../pwa/src/game/hud/resolve.ts";

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
      rpm: 3400,
      shiftUpRpm: 3300,
      redlineRpm: 4600,
      reversing: false,
      clockMs: 12_300,
      clockRunning: true,
      clockStarted: true,
      dashLive: true,
      bodies: 4,
      wear: 0.3,
      wearSettled: 0.24,
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

  it("answers every VOICE binding the schema accepts", () => {
    const voice = voiceBindings({
      live: true,
      transmitting: true,
      level: 0.4,
      speakerCount: 2,
      fault: "",
    });
    const authored = Object.keys(HUD_BINDINGS).filter((id) =>
      id.startsWith("voice."),
    );
    expect(Object.keys(voice).sort()).toEqual(authored.sort());
    // …and OFF is a real answer rather than an absent one: an element that
    // reads one of these on a solo run must get "no voice", not `undefined`.
    const silent = voiceBindings(null);
    expect(silent["voice.live"]).toBe(false);
    expect(silent["voice.speakerCount"]).toBe(0);
    expect(silent["voice.fault"]).toBe("");
  });

  it("answers every ROW binding the schema accepts", () => {
    const row = speakerBindings({
      seat: 2,
      name: "ADA",
      level: 0.3,
      peak: 0.5,
      muted: false,
      unheard: false,
      talking: true,
      self: false,
    });
    expect(Object.keys(row).sort()).toEqual(
      Object.keys(HUD_ROW_BINDINGS).sort(),
    );
    // Every row group the schema knows about is one some widget actually
    // supplies — a group nothing publishes is a binding that would compile and
    // then read empty for ever.
    const supplied = new Set(Object.values(HUD_ROW_WIDGETS));
    for (const id of Object.keys(HUD_ROW_BINDINGS)) {
      expect(supplied.has(id.split(".")[0]!), id).toBe(true);
    }
    for (const widget of Object.keys(HUD_ROW_WIDGETS)) {
      expect(HUD_WIDGETS.has(widget), widget).toBe(true);
    }
    // The RESOLVER's copy of that list is what stops the layout walking a row's
    // template without a row. A widget the schema calls a list and the resolver
    // does not is the drive-surface bug again: judgements called with an empty
    // row, thrown, and disowned for the rest of the run.
    expect([...HUD_ROW_WIDGET_NAMES].sort()).toEqual(
      Object.keys(HUD_ROW_WIDGETS).sort(),
    );
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

  it("places every member of the left party rail", () => {
    // These widgets render dynamic lists, but the HUD is content: registering
    // one in TS does not put it on screen. Keep the party controls and voice
    // cards authored beneath the hero in the order the rail promises.
    expect(
      HUD_ELEMENTS.filter((element) => element.region === "left")
        .filter((element) => element.widget !== undefined)
        .sort((a, b) => a.order - b.order)
        .map((element) => element.widget),
    ).toEqual(["companionRail", "partyFrames", "tradeAsks", "voiceCards"]);
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

  it("paints the tachometer's red where the engine cannot reach it", () => {
    // THE DASHBOARD'S ONE CROSS-CATALOG FACT: the red band is authored in the
    // HUD (`drive_speedo.yaml`), the needle's range is decided by the gearbox
    // (`drive/drivetrain.ts`), and nothing but this holds the two together.
    //
    // A tachometer's red is PAINT. It is on the instrument with the engine off,
    // and a working car never puts the needle in it — which is exactly what the
    // dial used to get wrong, because the box changed up AT the redline and the
    // arc therefore arrived in the red eight times a minute. So: the band must
    // exist, and it must open above anything the wagon can do to itself.
    let zone: { from: number } | undefined;
    for (const element of HUD_ELEMENTS) {
      walk(element, (node) => {
        if (node.bind === "drive.rpmFrac" && node.zone) zone = node.zone;
      });
    }
    expect(zone, "the rev counter has no redline painted on it").toBeDefined();
    // The arc sweeps rpm over the REDLINE, so the band's opening fraction is a
    // rev figure — and the box lets go a good way below it.
    const opensAt = (zone?.from ?? 0) * DRIVETRAIN.redlineRpm;
    expect(opensAt).toBeGreaterThan(DRIVETRAIN.shiftUpRpm);
    let peak = 0;
    for (let px = 0; px <= DRIVE.topSpeedPx; px += 1) {
      peak = Math.max(peak, engineRpm(px));
    }
    expect(peak).toBeLessThan(opensAt);
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

  it("keeps a way to take a picture on a device with no keyboard", () => {
    // THE GAP THIS PINS: the whole screenshot feature — the capture, the roll,
    // the receipt, the gallery, the share sheet — was reachable only through a
    // KEY, so on a phone none of it could be asked for and EXTRAS hid its own
    // SCREENSHOTS row rather than open a gallery nothing could fill. The
    // shutter is the missing half, so it is gated on `ui.touch` and on nothing
    // else: not on the field being live (a picture of a death splash is as
    // wanted as one of a fight), and not on a setting a player has to find.
    const shutter = HUD_ELEMENTS.find(
      (el) => el.press?.action === "takeScreenshot",
    );
    expect(shutter, "no element carries takeScreenshot").toBeDefined();
    expect(shutter?.visible).toBe("ui.touch");
    // It makes no noise of its own — the picture already plays the camera, and
    // a click in front of it is that sound arriving twice.
    expect(shutter?.press?.sound).toBe("none");
  });

  it("keeps a way into the road's pause card on a device with no keyboard", () => {
    // THE GAP THIS PINS is the screenshot one above in the minigame's shape:
    // the drive's PAUSE — and with it SKIP THE DRIVE and MAIN MENU, the only
    // two ways out of a leg somebody is not enjoying — was reachable through
    // ESCAPE and through nothing else, so on a phone the road could only be
    // finished. The stopwatch is the missing half, and it is the fight's own
    // gesture: the survival timer over the minimap pauses the run on a tap.
    const clock = HUD_ELEMENTS.find((el) => el.id === "drive_clock");
    expect(clock, "the road ships no stopwatch").toBeDefined();
    expect(clock?.press?.action).toBe("pauseGame");
    // A BUTTON AND NOT A PANEL CARRYING A PRESS, which is the half that would
    // fail silently: the HUD renderer draws a press on a `button` and on a
    // `widget`, and a panel's press is the in-game menus' backdrop `dismiss:`
    // and nothing else — so this element authored as a panel compiles, draws
    // exactly the same clock, and answers no tap at all.
    expect(clock?.kind).toBe("button");
    expect(clock?.aria, "a screen reader has no name for it").toBeDefined();
  });

  it("prints the damage the wagon has NOW, not the damage the arc has reached", () => {
    // THE DAMAGEOMETER IS TWO READOUTS OF ONE CAR AND THEY ANSWER DIFFERENT
    // QUESTIONS. The calm ARC lags behind a fresh hit on purpose, so the slice
    // the last second cost can be lit in its own colour before folding in
    // (`WearTrail`, drive-screen/dials.ts). The FIGURE must not lag with it:
    // it is the part of the dial a player actually checks, and bound to the
    // settling value a collision he had just felt through the wheel reached the
    // dashboard a beat and a half after he had stopped looking.
    const face = HUD_ELEMENTS.find(
      (el) => el.id === "drive_damage",
    )?.children?.find((child) => child.id === "damage_face");
    const figure = face?.children?.find((c) => c.id === "damage_number");
    expect(figure, "the damage dial ships no figure").toBeDefined();
    expect(figure?.bind).toBe("drive.wear");
    // …and the arc it sits inside still lags, or the fresh slice has nothing to
    // be measured against and the highlight silently stops existing.
    const arc = HUD_ELEMENTS.find(
      (el) => el.id === "drive_damage",
    )?.children?.find((child) => child.id === "damage_arc");
    expect(arc?.bind).toBe("drive.wearSettled");
  });

  it("leaves a list's template alone until it has a row", () => {
    // THE BUG THIS PINS, and it is the drive surface's again in another shape:
    // a resolve CALLS every judgement it walks past, and a voice card's are
    // written against a speaker. Walking the card at RAIL level calls them with
    // an empty row — which throws, and a thrown judgement is disowned for the
    // rest of the run, so every card on the rail loses its colours for good.
    const ctx = resolveContext(VALUES);
    const tops = resolveLayout(HUD_REGIONS, HUD_ELEMENTS, ctx, "field");
    const found: HudNodeView[] = [];
    const visit = (children: HudRegionView["children"]) => {
      for (const child of children) {
        if ("region" in child) visit(child.region.children);
        else if (child.element.def.widget === "voiceCards") {
          found.push(child.element);
        }
      }
    };
    for (const top of tops) visit(top.children);
    expect(found).toHaveLength(1);
    expect(found[0]!.children).toEqual([]);

    // …and the judgements it did not call still answer, per row.
    const card = resolveNode(
      found[0]!.def,
      resolveRow(
        VALUES,
        speakerBindings({
          seat: 0,
          name: "ADA",
          level: 0.9,
          peak: 0.9,
          muted: false,
          unheard: false,
          talking: true,
          self: false,
        }),
      ),
      true,
    );
    expect(card.children.length).toBeGreaterThan(0);
    expect(card.className).toContain("voice-card");
    expect(card.className).toContain("shouting");

    // EVERY part the widget asks for by name is on that resolved card — the
    // rail's own copy is empty by design, so a widget that reached for a part
    // there (the fault notice did) would draw nothing at all.
    const parts = card.children.map((child) => child.def.id);
    for (const part of [
      "name",
      "wave",
      "status",
      "self_name",
      "fault_title",
      "fault_reason",
    ]) {
      expect(parts, part).toContain(part);
    }
  });

  it("draws both surfaces — the fight and the road", () => {
    const ctx = resolveContext(VALUES);
    for (const surface of HUD_SURFACES) {
      const tops = resolveLayout(
        HUD_REGIONS,
        HUD_ELEMENTS,
        ctx,
        surface as "field" | "drive",
      );
      expect(tops.length, surface).toBeGreaterThan(0);
      // …and nothing from the OTHER one came with it. A resolve CALLS the
      // judgements it walks past, so a surface that resolved its neighbour's
      // elements would be running them on values that surface never publishes.
      for (const top of tops) {
        expect(top.def.surface ?? "field", top.def.id).toBe(surface);
      }
    }
  });
});

/** A wagon mid-trip: what the road publishes for its own dials. */
const DIALS = {
  mph: 42,
  topSpeedMph: 70,
  speedFrac: 0.6,
  gear: 2,
  gearCount: 5,
  rev: 0.25,
  rpm: 2900,
  shiftUpRpm: 3300,
  redlineRpm: 4600,
  reversing: false,
  clockMs: 12_300,
  clockRunning: true,
  clockStarted: true,
  dashLive: true,
  bodies: 0,
  wear: 0.31,
  wearSettled: 0.31,
  failing: false,
  paused: false,
};

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
    const drive = resolveContext({ ...VALUES, ...driveBindings(DIALS) });
    expect(resolveNode(node, drive).text).toBe("DAMAGE");
    // …and the FRESH slice's colour, which is the one judgement on the
    // dashboard that answers differently for the same wear depending on whether
    // any of it just happened.
    const hot = resolveContext({
      ...VALUES,
      ...driveBindings({ ...DIALS, wearSettled: 0.2 }),
    });
    expect(
      resolveNode(
        {
          kind: "gauge",
          bind: "drive.wear",
          color: { script: "drive.fresh_color" },
        },
        hot,
      ).color,
    ).not.toBe(
      resolveNode(
        {
          kind: "gauge",
          bind: "drive.wear",
          color: { script: "drive.fresh_color" },
        },
        drive,
      ).color,
    );
    expect(
      resolveNode({ kind: "text", text: { script: "drive.rpm_label" } }, drive)
        .text,
    ).toBe("2900 RPM");
    // …AND EVERY DIGIT OF IT. The figure printed whole hundreds while the
    // publisher quantised the crank to fifty, so the tacho's last two digits
    // could only ever read 00 or 50: a needle sweeping the whole face was
    // printed as a number stepping in hundreds, which reads as an instrument
    // that has frozen rather than one that is alive. A round fixture cannot
    // catch that, which is why this one is not.
    expect(
      resolveNode(
        { kind: "text", text: { script: "drive.rpm_label" } },
        resolveContext({
          ...VALUES,
          ...driveBindings({ ...DIALS, rpm: 2873 }),
        }),
      ).text,
    ).toBe("2873 RPM");
    // …and the gearbox, which is the judgement with the most to say: it picks a
    // PICTURE, one shift-gate sprite per position, and the two answers that are
    // not gears at all (reverse, and standing still in neutral).
    const gate = (dials: typeof DIALS): string | undefined =>
      resolveNode(
        { kind: "icon", sprite: { script: "drive.gear_sprite" } },
        resolveContext({ ...VALUES, ...driveBindings(dials) }),
      ).sprite;
    expect(gate(DIALS)).toBe("gear_gate_3");
    expect(gate({ ...DIALS, reversing: true })).toBe("gear_gate_r");
    expect(gate({ ...DIALS, mph: 0 })).toBe("gear_gate_n");
  });

  it("leaves the road's judgements alive after a fight has been resolved", () => {
    // THE ONE THAT SHIPPED BROKEN. A resolve CALLS every judgement it walks
    // past, and `disown` is for the rest of the run — so resolving the WHOLE
    // tree on the fight's snapshot ran the road's judgements against an empty
    // `state.drive`, they threw on the first `..`, and the dials were dead
    // before the player ever reached a road. The plates still drew: two empty
    // frames in the corners of the windscreen.
    //
    // The surface is a parameter of the resolve now, so this cannot happen —
    // and the assertion is written with FIELD-ONLY values on purpose, because
    // `VALUES` answers every binding the schema knows (the road's included),
    // which is exactly why the old whole-tree resolve looked fine here.
    resolveLayout(
      HUD_REGIONS,
      HUD_ELEMENTS,
      resolveContext({ "hud.fieldLive": true }),
      "field",
    );
    const drive = resolveContext(driveBindings(DIALS));
    expect(
      resolveNode({ kind: "text", text: { script: "drive.rpm_label" } }, drive)
        .text,
    ).toBe("2900 RPM");
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

  it("resolves a row's parts against that row's own values", () => {
    // The whole of what makes a LIST authorable: the same node, walked twice
    // with a different speaker in scope, says two different things.
    const card: HudNodeDef = {
      kind: "text",
      bind: "speaker.name",
      color: { script: "voice.name_color" },
    };
    const quiet = resolveNode(
      card,
      resolveRow(
        VALUES,
        speakerBindings({
          seat: 0,
          name: "ADA",
          level: 0.02,
          peak: 0.02,
          muted: false,
          unheard: false,
          talking: true,
          self: false,
        }),
      ),
    );
    const loud = resolveNode(
      card,
      resolveRow(
        VALUES,
        speakerBindings({
          seat: 1,
          name: "RUTH",
          level: 0.8,
          peak: 0.8,
          muted: false,
          unheard: false,
          talking: true,
          self: false,
        }),
      ),
    );
    expect(quiet.text).toBe("ADA");
    expect(loud.text).toBe("RUTH");
    // …and the shipped ladder turns the shouting one's name hot.
    expect(quiet.color).toBe("#e8ecf1");
    expect(loud.color).toBe("#ffd75e");
  });

  it("gives the voice card's status line its shipped precedence", () => {
    const status: HudNodeDef = {
      kind: "text",
      text: { script: "voice.status_text" },
    };
    const say = (row: Partial<Parameters<typeof speakerBindings>[0]>) =>
      resolveNode(
        status,
        resolveRow(
          VALUES,
          speakerBindings({
            seat: 0,
            name: "ADA",
            level: 0.2,
            peak: 0.2,
            muted: false,
            unheard: false,
            talking: true,
            self: false,
            ...row,
          }),
        ),
      ).text;
    // UNHEARD wins over everything: somebody IS talking and this machine cannot
    // decode them, and silence would be indistinguishable from a mute.
    expect(say({ unheard: true, muted: true })).toBe("CANNOT PLAY THIS VOICE");
    expect(say({ muted: true })).toBe("MUTED");
    expect(say({ peak: 0.01 })).toBe("WHISPERING");
    expect(say({ peak: 0.9 })).toBe("SHOUTING");
    // Ordinary speech says nothing — a card that is always captioned is a card
    // nobody reads.
    expect(say({})).toBe("");
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

  it("refuses a row binding outside the list that supplies it", () => {
    // A mod's `speaker.peak` on the gear row would print nothing for ever, so
    // the compiler names the widget whose rows DO answer it rather than
    // reporting a typo that is not there.
    const refs = {
      sprites: new Set<string>(),
      sounds: new Set<string>(),
      scripts: new Map<string, Set<string>>(),
      regions: new Set(["gear"]),
    };
    const stray = validateHudElement(
      {
        id: "my_meter",
        region: "gear",
        order: 0,
        kind: "text",
        bind: "speaker.peak",
      },
      refs,
    );
    expect(stray.errors).toHaveLength(1);
    expect(stray.errors[0]).toContain("only means something inside one ROW");
    expect(stray.errors[0]).toContain("voiceCards");

    // …and the same binding inside the row widget's own parts is fine, as is
    // one on the widget node itself, which IS the row template.
    const inRow = validateHudElement(
      {
        id: "my_cards",
        region: "gear",
        order: 0,
        kind: "widget",
        widget: "voiceCards",
        classes: { hot: "speaker.talking" },
        children: [{ id: "name", kind: "text", bind: "speaker.name" }],
      },
      refs,
    );
    expect(inRow.errors).toEqual([]);
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
      resolveLayout(
        layout.regions,
        layout.elements,
        resolveContext(VALUES),
        "field",
      ),
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
      "field",
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
