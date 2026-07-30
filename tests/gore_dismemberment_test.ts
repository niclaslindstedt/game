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
import { GORE_FAMILIES } from "../pwa/src/game/game-screen/gore.ts";
import {
  cleaveCut,
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

  it("takes EVERY kind of body apart, each into its own pieces", () => {
    // A wisp has no intestines and a rover has no ribcage — but a wisp has goo
    // and a cold light in it, and a rover has plate and a loom of wire, so both
    // come apart as themselves. What each is made of is the family catalog's;
    // that every one of them CAN come apart is this module's.
    for (const family of GORE_FAMILIES) {
      const burst = death({
        edged: false,
        damage: 900,
        family: family.id,
      }).gore;
      expect(burst?.kind).toBe("gib");
      expect(burst?.family).toBe(family.id);
      // Every piece it threw is one this family actually has.
      const owned = new Set([
        ...family.signature.map((e) => e.sprite),
        ...family.filler.map((e) => e.sprite),
      ]);
      for (const piece of burst!.pieces) {
        expect(owned.has(piece.sprite!)).toBe(true);
      }
    }
  });

  it("gives every family its own cut, spilling only what is inside it", () => {
    for (const family of GORE_FAMILIES) {
      const burst = death({ edged: true, damage: 900, family: family.id }).gore;
      expect(burst?.kind).toBe("cleave");
      const inside = new Set(family.bands.flatMap((b) => b.spills));
      for (const piece of burst!.pieces) {
        expect(inside.has(piece.sprite!)).toBe(true);
      }
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

  it("throws only what was on the INSIDE", () => {
    // No head, no hand, no foot, no arm, in any pool: the victim's own sprite
    // is already supplying those, in its own colours and its own gear
    // (`shredSprite`). An authored generic head thrown beside them is a second,
    // worse answer to a question already answered.
    const outer = ["gib_head", "gib_hand", "gib_foot", "gib_arm", "gib_shin"];
    for (const force of [0.5, 2, 5, 12]) {
      for (const sprite of sprites(force)) {
        for (const part of outer) expect(sprite?.startsWith(part)).toBe(false);
      }
    }
  });

  it("only gives a person's skull to a person", () => {
    expect(sprites(5)).toContain("gib_skull");
    expect(sprites(5, "beast")).not.toContain("gib_skull");
  });

  it("keeps a beast's meat, gut and bone", () => {
    // It loses the one piece it never had, not the burst itself.
    const beast = sprites(5, "beast");
    expect(beast.length).toBeGreaterThan(4);
    expect(beast).toContain("gib_ribs");
    expect(beast.some((s) => s === "gib_gut_0" || s === "gib_gut_1")).toBe(
      true,
    );
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

describe("the cut a blade makes", () => {
  it("is ROLLED rather than picked off a list", () => {
    // The variety IS the feature: a spectacle you have already seen is scenery,
    // so a player a hundred kills in should still be shown something new. A
    // hand-authored catalog gives however many rows somebody typed; a rolled
    // cut line gives an unbounded number, and the pieces can never disagree with
    // it because they are read off the bands the blade passed through.
    const cuts = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      cuts.add(cleaveCut(0, 4, seed).id);
      cuts.add(cleaveCut(Math.PI / 2, 4, seed).id);
    }
    expect(cuts.size).toBeGreaterThan(20);
    // …and the OFFSET is continuous, not a handful of authored positions.
    const offsets = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      offsets.add(cleaveCut(0, 4, seed).offset);
    }
    expect(offsets.size).toBeGreaterThan(50);
  });

  it("is the same cut every time the same blow is asked", () => {
    // Every draw of a frame re-derives it; two answers in one frame is a body
    // that came apart differently on each redraw.
    expect(cleaveCut(0.3, 3, 42)).toEqual(cleaveCut(0.3, 3, 42));
    expect(cleaveCut(0.3, 3, 43)).not.toEqual(cleaveCut(0.3, 3, 42));
  });

  it("only cuts at the angles the pixel art survives", () => {
    // A cut at an arbitrary bearing is mush at 16 px — these four are the ones
    // `splitSprite`'s buckets land on exactly.
    const allowed = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
    for (let seed = 0; seed < 120; seed++) {
      for (const heading of [0, Math.PI / 2, 1, -2]) {
        expect(allowed).toContain(cleaveCut(heading, 3, seed).angle);
      }
    }
  });

  it("agrees with where the hero was standing", () => {
    // The blade swept down the screen or across it; a cut from the wrong family
    // is a body opening one way while the blade went the other.
    for (const heading of [0, Math.PI, 0.2, -0.2]) {
      expect(cleaveCut(heading, 3, 5).lengthwise).toBe(true);
    }
    for (const heading of [Math.PI / 2, -Math.PI / 2, 1.4]) {
      expect(cleaveCut(heading, 3, 5).lengthwise).toBe(false);
    }
  });

  it("keeps a weak blow out at the extremities and lets a huge one through the middle", () => {
    // The whole force ladder, in one number: a blade that just barely went
    // through takes a head or a pair of legs, and only a monstrous blow takes a
    // man through the middle.
    for (let seed = 0; seed < 120; seed++) {
      expect(Math.abs(cleaveCut(0, 0.2, seed).offset)).toBeGreaterThan(0.3);
    }
    const deep = [];
    for (let seed = 0; seed < 120; seed++) {
      deep.push(Math.abs(cleaveCut(0, 4, seed).offset));
    }
    expect(Math.min(...deep)).toBeLessThan(0.1);
  });

  it("throws a piece off the top and leaves one on the bottom standing", () => {
    // The game's two most memorable cuts, and neither is written down anywhere:
    // a head has nowhere to stand, a pair of legs is already on the floor.
    let tossed = 0;
    let pinned = 0;
    for (let seed = 0; seed < 200; seed++) {
      const cut = cleaveCut(Math.PI / 2, 4, seed);
      if (cut.toss !== null) {
        tossed++;
        expect(cut.toss).toBe(-1);
        expect(cut.offset).toBeLessThan(0);
      }
      if (cut.pinned !== null) {
        pinned++;
        expect(cut.pinned).toBe(1);
        expect(cut.offset).toBeGreaterThan(0);
      }
    }
    expect(tossed).toBeGreaterThan(0);
    expect(pinned).toBeGreaterThan(0);
  });
});

describe("the depth a blade goes in at", () => {
  it("mostly cuts FLAT, and sometimes goes in obliquely", () => {
    // A body opening across the screen is the legible picture and has to stay
    // the common one; the oblique slice is the surprise that says the blade went
    // through something solid rather than across a picture of one.
    let oblique = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (cleaveCut(0, 3, seed).depth > 0) oblique++;
    }
    expect(oblique).toBeGreaterThan(20);
    expect(oblique).toBeLessThan(200);
  });

  it("never slices so deep that a piece disappears", () => {
    // At a full slab the far piece starts at the body's own edge and there is
    // nothing left of it to draw — the cut loses a half instead of gaining a
    // dimension.
    for (let seed = 0; seed < 400; seed++) {
      const cut = cleaveCut(0, 3, seed);
      expect(cut.depth).toBeLessThan(1);
      if (cut.depth > 0) expect(cut.depth).toBeGreaterThan(0.3);
    }
  });

  it("never slices a limb off obliquely", () => {
    // The illusion needs a piece big enough to show a cut face; a severed head
    // is not one.
    for (let seed = 0; seed < 400; seed++) {
      const cut = cleaveCut(seed % 2 ? 0 : Math.PI / 2, 3, seed);
      if (cut.toss !== null || cut.pinned !== null) expect(cut.depth).toBe(0);
    }
  });

  it("empties a body it went through the depth of", () => {
    // An oblique slice goes through the whole thickness, so it opens everything
    // behind the line as well as everything on it — which is to say all of it.
    let deep: readonly string[] = [];
    let flat: readonly string[] = [];
    for (let seed = 0; seed < 800 && (!deep.length || !flat.length); seed++) {
      const cut = cleaveCut(Math.PI / 2, 3, seed);
      if (cut.depth > 0 && !deep.length) deep = cut.spills;
      if (cut.depth === 0 && cut.angle === 0 && !flat.length) flat = cut.spills;
    }
    expect(deep.length).toBeGreaterThan(flat.length);
  });
});

describe("what falls out of a cut", () => {
  /** The spills of the first cut STRAIGHT ACROSS the body that landed near
   * `offset` — the one angle that crosses a single band, which is where the
   * derivation is exactly checkable. (Negative is toward the head.) */
  const spillsAt = (offset: number) => {
    for (let seed = 0; seed < 2000; seed++) {
      const cut = cleaveCut(Math.PI / 2, 4, seed);
      if (
        cut.angle === 0 &&
        !cut.depth &&
        Math.abs(cut.offset - offset) < 0.05
      ) {
        return cut.spills;
      }
    }
    throw new Error(`no straight cut rolled near ${offset}`);
  };

  it("spills something out of every cut, and only what was INSIDE", () => {
    // No head, no hand, no foot, no arm: the victim's own sprite is already
    // supplying those, in its own colours and its own gear. The authored gore is
    // exactly what a sprite cannot show.
    const outer = ["gib_head", "gib_hand", "gib_foot", "gib_arm", "gib_shin"];
    for (let seed = 0; seed < 200; seed++) {
      const cut = cleaveCut(seed % 2 ? 0 : Math.PI / 2, 3, seed);
      expect(cut.spills.length).toBeGreaterThan(0);
      for (const sprite of cut.spills) {
        expect(sprite.startsWith("gib_")).toBe(true);
        for (const part of outer) expect(sprite.startsWith(part)).toBe(false);
      }
    }
  });

  it("spills what the blade actually went through", () => {
    // The half of the variety that NAMES the wound, and it is DERIVED: a cut
    // high on the body crosses the skull band and can only spill what is in a
    // head; one low across the belly can only spill what is in a belly.
    // (Negative offsets are toward the head.)
    expect(spillsAt(-0.35)).toContain("gib_brain");
    expect(spillsAt(-0.35)).not.toContain("gib_liver");
    expect(spillsAt(0.1).some((s) => s.startsWith("gib_gut"))).toBe(true);
    expect(spillsAt(0.1)).not.toContain("gib_brain");
  });

  it("empties a body that was cut end to end", () => {
    // Nobody wrote the bisection down: a line straight DOWN a body crosses every
    // band on its way through, so it spills the lot for free — while a line
    // straight ACROSS it crosses one and spills what is at that height. That
    // contrast is the whole derivation working.
    let down: readonly string[] = [];
    let across: readonly string[] = [];
    for (
      let seed = 0;
      seed < 2000 && (!down.length || !across.length);
      seed++
    ) {
      // FLAT cuts on both sides — an OBLIQUE one goes through the body's whole
      // thickness and spills everything whatever its angle, which is the depth
      // suite's business rather than this one's.
      const lengthwise = cleaveCut(0, 4, seed);
      if (
        !down.length &&
        lengthwise.angle === Math.PI / 2 &&
        !lengthwise.depth
      ) {
        down = lengthwise.spills;
      }
      const crosswise = cleaveCut(Math.PI / 2, 4, seed);
      if (!across.length && crosswise.angle === 0 && !crosswise.depth) {
        across = crosswise.spills;
      }
    }
    expect(down.length).toBeGreaterThan(across.length);
    expect(down.length).toBeGreaterThanOrEqual(4);
  });

  it("never gives a beast a human skull", () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(cleaveCut(0, 4, seed, "beast").spills).not.toContain("gib_skull");
    }
  });

  it("rides the pieces out on the burst, from the CUT rather than the navel", () => {
    const cut = goreBurst("cleave", 0, 4, 1, "humanoid", 9);
    expect(cut.cut).not.toBeNull();
    // The spilled pieces are ORDINARY pieces, so they ride the same flight and
    // the floor is wetted under them by the same `landingSpots`.
    expect(cut.pieces.map((p) => p.sprite)).toEqual([...cut.cut!.spills]);
    expect(landingSpots(cut)).toHaveLength(cut.cut!.spills.length);
    for (const gib of cut.pieces) {
      expect(piecePose(gib, 1).landed).toBe(true);
    }
    // A skull that fell out of the middle of a body whose head was taken off is
    // this whole feature failing quietly.
    if (cut.cut!.offset !== 0) {
      expect(cut.origin.x !== 0 || cut.origin.y !== 0).toBe(true);
    }
    // A burst has no cut to make: it throws the whole body from its middle.
    const burst = goreBurst("gib", 0, 4, 1, "humanoid", 9);
    expect(burst.cut).toBeNull();
    expect(burst.origin).toEqual({ x: 0, y: 0 });
  });
});
