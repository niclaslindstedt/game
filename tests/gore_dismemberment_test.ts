// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A BODY COMING APART — which blows do it, what it comes apart into, and what
// the MATURE CONTENT switch does to all of it.
//
// Four rules are load-bearing here and every one of them is invisible from the
// screen until it is wrong:
//
//   1. THE WEAPON DECIDES THE SHAPE. An edge cuts a body in two; a mass bursts
//      it. The engine says which on the kill event (`edged`, from
//      `items/edge.ts`) and this is where that answer turns into a picture.
//   2. IT IS EARNED. Below the ladder a kill is the ordinary punt-and-topple —
//      if every death came apart, none of them would mean anything.
//   3. IT FALLS BACK TO THE ORDINARY DEATH, exactly as a censored nuke does. A
//      refused cleave must not delete the body; that is the whole shape of the
//      nuke gate next door (`nuke_incineration_test.ts`) and the reason both
//      rules live in one leaf.
//   4. THE PIECES AND THE BLOOD AGREE. `landingSpots` is what the floor is
//      wetted from and what the renderer flies each piece to — one list, read
//      twice — so a gib always lands on its own spatter.
//
// Tested through the leaves for the same reason the nuke suite is: the fx pass
// reaches the sprite atlas and React components, and this project is typechecked
// on CI before the atlas has even been generated.

import { beforeEach, describe, expect, it } from "vitest";

import { setDevicePolicyForTest } from "../pwa/src/app/device-policy.ts";
import {
  goreBurst,
  landingSpots,
  piecePose,
} from "../pwa/src/game/game-screen/gore-burst.ts";
import {
  killPresentation,
  type KillBlow,
} from "../pwa/src/game/game-screen/kill-presentation.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";

const HERO = { x: 500, y: 500 };
const VICTIM = { x: 900, y: 500 };
const MAX_HP = 100;

/** One kill, as the fx pass resolves it. `damage` is in the victim's own
 * healthbars by construction (`MAX_HP` is 100), so the numbers below read as
 * "this many times its whole health". */
function death(over: Partial<KillBlow> = {}) {
  return killPresentation({
    damage: MAX_HP,
    maxHp: MAX_HP,
    heroPos: HERO,
    pos: VICTIM,
    role: "minion",
    bleeds: true,
    anatomy: "humanoid",
    force: 2,
    body: 1,
    seed: 11,
    ...over,
  });
}

beforeEach(() => {
  setDevicePolicyForTest(null); // unmanaged: everything allowed
  updateSettings({ knockback: 1, extraGore: "on", blood: 1 });
});

describe("what a killing blow leaves of the body", () => {
  it("cuts it in two when the weapon has an edge", () => {
    const cut = death({ edged: true, damage: 200 });
    expect(cut.gore?.kind).toBe("cleave");
  });

  it("bursts it when the weapon has none", () => {
    const burst = death({ edged: false, damage: 400 });
    expect(burst.gore?.kind).toBe("gib");
  });

  it("keeps the punt on a cleave and drops it on a burst", () => {
    // The two halves ride the killing blow's own throw, which is what stops a
    // cleaved body from daintily falling apart on the spot. A burst body has
    // nothing left to throw — every piece of it is somewhere else already.
    expect(death({ edged: true, damage: 200 }).launch).not.toBeNull();
    expect(death({ edged: false, damage: 400 }).launch).toBeNull();
  });

  it("leaves an ordinary kill alone", () => {
    // A chip finish on an already-wounded mob, and a blow that merely killed
    // it: both topple. The spectacle has to be earned or it stops being one.
    for (const damage of [20, 100]) {
      for (const edged of [true, false]) {
        expect(death({ edged, damage }).gore).toBeNull();
      }
    }
  });

  it("asks more of an elite than of the fodder around it", () => {
    // The same blow that bursts a minion only kills a lieutenant.
    const blow = { edged: false, damage: 400 };
    expect(death({ ...blow, role: "minion" }).gore?.kind).toBe("gib");
    expect(death({ ...blow, role: "elite" }).gore).toBeNull();
    // Hit it hard enough and it comes apart like anything else.
    expect(death({ ...blow, damage: 900, role: "elite" }).gore?.kind).toBe(
      "gib",
    );
  });

  it("never takes a boss apart, however hard it is hit", () => {
    // A boss speaks its last words over its own body, and that body stays on
    // the field for the rest of the level as a landmark of the fight. Bursting
    // one deletes both.
    for (const edged of [true, false]) {
      expect(death({ edged, damage: 10_000, role: "boss" }).gore).toBeNull();
      expect(
        death({ edged, damage: 10_000, role: "boss" }).launch,
      ).not.toBeNull();
    }
  });

  it("never takes apart a body with no blood in it", () => {
    // A wisp has no halves and a rover has no intestines.
    for (const edged of [true, false]) {
      expect(death({ edged, damage: 900, bleeds: false }).gore).toBeNull();
    }
  });
});

describe("the mature-content gate on it", () => {
  it("refuses both the cut and the burst when the device says no", () => {
    setDevicePolicyForTest({ nsfw: false, store: true });
    expect(death({ edged: true, damage: 400 }).gore).toBeNull();
    expect(death({ edged: false, damage: 400 }).gore).toBeNull();
  });

  it("falls back to the ORDINARY death rather than to nothing", () => {
    // The failure this exists to catch: a censored burst that merely dropped
    // the effect would kill things whose bodies cease to exist on the spot,
    // which reads as a bug rather than as a gentler game. The body has to be
    // thrown and toppled exactly as an ordinary kill's is.
    setDevicePolicyForTest({ nsfw: false, store: true });
    const censored = death({ edged: false, damage: 400 });
    expect(censored.gore).toBeNull();
    expect(censored.launch).not.toBeNull();
    expect(censored.launch!.dist).toBeGreaterThan(0);
  });

  it("obeys the player's own EXTRA GORE row under the device switch", () => {
    updateSettings({ extraGore: "off" });
    expect(death({ edged: true, damage: 400 }).gore).toBeNull();
    updateSettings({ extraGore: "on" });
    expect(death({ edged: true, damage: 400 }).gore).not.toBeNull();
  });

  it("obeys the developer BLOOD amount at zero", () => {
    updateSettings({ blood: 0 });
    expect(death({ edged: false, damage: 400 }).gore).toBeNull();
  });
});

describe("what a burst body throws", () => {
  const burst = (force: number, anatomy: "humanoid" | "beast" = "humanoid") =>
    goreBurst("gib", 0, force, 1, anatomy, 3);
  const sprites = (force: number, anatomy: "humanoid" | "beast" = "humanoid") =>
    burst(force, anatomy).pieces.map((p) => p.sprite);

  it("only gives up a face if it had one", () => {
    expect(sprites(5).some((s) => s?.startsWith("gib_head"))).toBe(true);
    expect(sprites(5, "beast").some((s) => s?.startsWith("gib_head"))).toBe(
      false,
    );
  });

  it("keeps a beast's meat, gut and bone", () => {
    // It loses the parts it never had, not the burst itself.
    const beast = sprites(5, "beast");
    expect(beast.length).toBeGreaterThan(4);
    expect(beast).toContain("gib_ribs");
    expect(beast.some((s) => s === "gib_gut_0" || s === "gib_gut_1")).toBe(
      true,
    );
    // …and none of the human pieces.
    for (const human of ["gib_hand", "gib_foot", "gib_arm", "gib_shin"]) {
      expect(beast).not.toContain(human);
    }
  });

  it("throws more, and more recognisable, pieces the harder the blow", () => {
    expect(burst(5).pieces.length).toBeGreaterThan(burst(1).pieces.length);
    // A bare burst is meat and gut; an obscene one is a person coming apart
    // into their own inventory.
    expect(sprites(0.5)).not.toContain("gib_ribs");
    expect(sprites(5)).toContain("gib_ribs");
  });

  it("bounces what is dense and sticks what is wet", () => {
    const pieces = burst(5).pieces;
    const bounces = (sprite: string) =>
      pieces.filter((p) => p.sprite === sprite).map((p) => p.bounces);
    // A skull, a ribcage and a kidney kick back up off the floor…
    for (const hard of ["gib_ribs", "gib_heart", "gib_kidney"]) {
      for (const n of bounces(hard)) expect(n).toBeGreaterThan(0);
    }
    // …a liver and a length of gut land once and stay in the puddle they made.
    // (A bouncing liver is a beach ball.)
    for (const soft of ["gib_liver", "gib_gut_0", "gib_gut_1", "gib_meat_0"]) {
      for (const n of bounces(soft)) expect(n).toBe(0);
    }
  });

  it("carries every piece further the harder the blow", () => {
    const near = burst(1).pieces.reduce((sum, p) => sum + p.dist, 0);
    const far = burst(5).pieces.reduce((sum, p) => sum + p.dist, 0);
    expect(far / burst(5).pieces.length).toBeGreaterThan(
      near / burst(1).pieces.length,
    );
  });
});

describe("a piece's flight", () => {
  const piece = () => goreBurst("gib", 0, 4, 1, "humanoid", 5).pieces[0]!;

  it("leaves the body, arcs, and comes to rest exactly where the blood is", () => {
    const gib = piece();
    const start = piecePose(gib, gib.delay);
    expect(start.dist).toBe(0);
    // Somewhere in the middle it is off the ground…
    const mid = piecePose(gib, gib.delay + gib.flight * 0.25);
    expect(mid.lift).toBeGreaterThan(0);
    // …and at the end it is down, and it is at its full distance — which is
    // the number the floor's blood was placed at.
    const end = piecePose(gib, 1);
    expect(end.landed).toBe(true);
    expect(end.lift).toBeCloseTo(0, 5);
    expect(end.dist).toBeCloseTo(gib.dist, 5);
  });

  it("never overshoots the spot the blood was laid at", () => {
    // The bounce is a geometric split of the piece's OWN distance rather than
    // extra travel bolted on the end — otherwise a bouncing head skitters past
    // its puddle and lands on clean ground.
    for (const gib of goreBurst("gib", 0, 6, 1, "humanoid", 9).pieces) {
      for (let t = 0; t <= 1; t += 0.05) {
        expect(piecePose(gib, t).dist).toBeLessThanOrEqual(gib.dist + 1e-6);
      }
    }
  });

  it("puts a landing spot under every piece", () => {
    const thrown = goreBurst("gib", 1.2, 4, 1, "humanoid", 13);
    const spots = landingSpots(thrown);
    expect(spots).toHaveLength(thrown.pieces.length);
    // The scatter is squashed onto the ground plane, so it lands wider than it
    // is deep — the same flattening the spray, the dust and every ground ring
    // use, applied HERE so the blood agrees with it.
    const widest = Math.max(...spots.map((s) => Math.abs(s.x)));
    const deepest = Math.max(...spots.map((s) => Math.abs(s.y)));
    expect(widest).toBeGreaterThan(deepest);
  });

  it("is the same burst every time it is asked", () => {
    // Every draw of a frame re-derives the pieces; two different answers in one
    // frame would be a body that came apart differently on each redraw.
    expect(goreBurst("gib", 0.4, 3, 1, "humanoid", 21)).toEqual(
      goreBurst("gib", 0.4, 3, 1, "humanoid", 21),
    );
    expect(goreBurst("gib", 0.4, 3, 1, "humanoid", 22)).not.toEqual(
      goreBurst("gib", 0.4, 3, 1, "humanoid", 21),
    );
  });
});
