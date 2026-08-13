// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hidden DEVELOPER tree (unlocked by the two-movement sun gesture — sixteen
// quick taps to arm the star, the first ten of them silent, then the click
// race; see use-sun-charge.ts).
//
// The index is five doors and a BACK row; each door's page holds ONE
// KIND of row (see the tree's own comment for why):
//
//   PLAYGROUND  the next run — the two warps, plus the terms it is carved on
//   CHEATS      what a run would otherwise have to earn (heroes, coins, a shop)
//   BALANCE     the runtime multipliers over the shipped tuning
//   VISUALS     game feel, the camera, and the washes over the finished frame
//   GALLERIES   the arsenal and the effects gallery, which only LOOK
//
// The whole tree is `dev: true` in `content/mainmenu.yaml`, and the compiler
// refuses a plain screen hanging under a developer one — so a page added here
// cannot accidentally survive into a store build with its parent gone.

import { BALANCE_TUNING_DEFAULTS } from "@game/menu";

import { synth } from "../audio.ts";
import {
  BALANCE_KNOBS,
  balanceFromSlider,
  balanceToSlider,
  formatBalanceMult,
  nudgeBalance,
} from "../balance-knobs.ts";
import { grantCoins } from "../characters.ts";
import { FX_RANGES, type FxName } from "../render/postfx.ts";
import { PITCH_RANGE, YAW_RANGE } from "../render/tilt.ts";
import { SEED_TIERS } from "../seed-tiers.ts";
import {
  getSettings,
  BLOOD_MAX,
  GORE_LINGER_MAX,
  KNOCKBACK_MAX,
  updateSettings,
} from "../settings.ts";
import { playUiSound } from "../sfx/ui.ts";
import {
  actionRow,
  assembleRows,
  backRow,
  navRow,
  onOffRow,
  sliderRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";

/** The DEVELOPER index: five doors, and nothing else. Every row goes somewhere
 * — which is what keeps the page short enough to read at a glance. */
export function buildDeveloperMenu(ctx: MenuContext): MenuEntry[] {
  return [
    ...assembleRows("developer", {
      playground: navRow(ctx, "developer", "playground"),
      cheats: navRow(ctx, "developer", "cheats", {
        before: () => ctx.setNotice(null),
      }),
      balance: navRow(ctx, "developer", "balance"),
      visuals: navRow(ctx, "developer", "visuals"),
      galleries: navRow(ctx, "developer", "galleries"),
    }),
    backRow(ctx, "developer"),
  ];
}

/** DEVELOPER → PLAYGROUND: the two doors into a run of your own choosing, the
 * term the run is carved on (read when a level is BUILT, so it lands on the
 * run these doors are about to start) and the meter drawn over it. */
export function buildPlaygroundMenu(ctx: MenuContext): MenuEntry[] {
  return [
    ...assembleRows("playground", {
      "select-level": actionRow("playground", "select-level", () => {
        playUiSound(synth, "confirm");
        ctx.setWarp(true);
        ctx.setScreen("difficulty");
        ctx.setCursor(0);
      }),
      "bot-view": actionRow("playground", "bot-view", () => {
        playUiSound(synth, "confirm");
        ctx.setWarp(true);
        ctx.setBotView(true);
        ctx.setScreen("difficulty");
        ctx.setCursor(0);
      }),
      // The arcade shelf with its lock off. A door among the switches, which is
      // where the two above it already sit: the page is "a run", and a lap of a
      // minigame is the shortest run this menu can start.
      minigames: navRow(ctx, "playground", "minigames"),
      "auto-level-stats": onOffRow(
        ctx,
        "playground",
        "auto-level-stats",
        "autoLevelStats",
      ),
      // The old BSP carve, held over the STATIC PARTS generator while the two
      // are judged side by side (read when a level is BUILT — see
      // engine/game/flags.ts `setLegacyMapgenEnabled`).
      "legacy-mapgen": onOffRow(
        ctx,
        "playground",
        "legacy-mapgen",
        "legacyMapgen",
      ),
      // The in-run FPS meter (`GameScreen`'s `showFps`) — and the hook further
      // developer diagnostics read through `getSettings().debug`.
      debug: onOffRow(ctx, "playground", "debug", "debug"),
    }),
    backRow(ctx, "playground"),
  ];
}

/** DEVELOPER → CHEATS: everything that hands the save what a run would have to
 * earn. FORCE STORE belongs here rather than among the build flags because the
 * packs it surfaces are granted FREE — it is the shop that sells the purse. */
export function buildCheatsMenu(ctx: MenuContext): MenuEntry[] {
  return [
    ...assembleRows("cheats", {
      seed: navRow(ctx, "cheats", "seed", {
        before: () => ctx.setNotice(null),
      }),
      // A war chest for probing the AUTO PILOT economy: pours 10B coins into
      // every character's banked purse (a fresh hero has no bank yet — the
      // purse rides the loadout banked on a level clear).
      "grant-coins": actionRow("cheats", "grant-coins", () => {
        playUiSound(synth, "confirm");
        const funded = grantCoins(10_000_000_000);
        ctx.setNotice(
          funded > 0
            ? {
                tone: "info",
                text: `FUNDED ${funded} HERO${funded === 1 ? "" : "ES"}`,
              }
            : {
                tone: "error",
                text: "NO BANKED HEROES - FINISH A LEVEL FIRST",
              },
        );
      }),
      "force-store": onOffRow(ctx, "cheats", "force-store", "storeForce"),
    }),
    backRow(ctx, "cheats"),
  ];
}

/** DEVELOPER → GALLERIES: the two full-screen shelves that only look. Both own
 * their own surface and their own keyboard steering, so the rows here are pure
 * navigation — see `TitleScreen`, which mounts them and hands the cursor back
 * to the row it left from. */
export function buildGalleriesMenu(ctx: MenuContext): MenuEntry[] {
  return [
    ...assembleRows("galleries", {
      arsenal: navRow(ctx, "galleries", "arsenal"),
      effects: navRow(ctx, "galleries", "effects"),
    }),
    backRow(ctx, "galleries"),
  ];
}

/** Which post-fx wash each VISUALS row drives. The row ids are the tree's
 * (kebab-case); the settings keys are the renderer's. */
const FX_ROWS: Record<string, FxName> = {
  "color-grade": "colorGrade",
  vignette: "vignette",
  "depth-haze": "depthHaze",
};

/** One post-fx row: a 0→max drag track over one presentation wash, showing its
 * amount as a percentage of the SHIPPED look rather than as a raw multiplier —
 * "COLOR GRADE 100%" says "as the game is made" where "1.00×" says nothing. */
function fxRow(ctx: MenuContext, id: string): MenuEntry {
  const name = FX_ROWS[id]!;
  const range = FX_RANGES[name];
  const value = getSettings()[name];
  const set = (v: number) => {
    updateSettings({ [name]: v });
    ctx.bumpSettings();
  };
  // Shown against the SHIPPED default, not against the slider's top end: the
  // default is the number a developer is deciding to move away from.
  const pct = Math.round((value / range.default) * 100);
  return sliderRow(
    "visuals",
    id,
    {
      readout: value <= 0 ? "OFF" : `${pct}%`,
      pos: (value - range.min) / (range.max - range.min),
      set: (pos: number) => set(range.min + pos * (range.max - range.min)),
      nudge: (dir: number) =>
        set(getSettings()[name] + dir * (range.max - range.min) * 0.05),
    },
    { state: value <= 0 ? "off" : "on" },
  );
}

/** DEVELOPER → VISUALS: the game-feel sliders — how far a kill throws the body,
 * how much blood a blow spills, how long the pieces lie there — plus the two
 * knobs of the world projection and the three washes laid over the finished
 * frame. */
export function buildVisualsMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  return [
    ...assembleRows("visuals", {
      // The overkill fling strength: 0× drops bodies where they stand, 1× is
      // the shipped feel, KNOCKBACK_MAX× rockets mobs clear off the screen.
      knockback: sliderRow("visuals", "knockback", {
        readout: formatBalanceMult(s.knockback),
        pos: s.knockback / KNOCKBACK_MAX,
        set: (pos: number) => setNumber(ctx, "knockback", pos * KNOCKBACK_MAX),
        nudge: (dir: number) =>
          setNumber(ctx, "knockback", getSettings().knockback + dir * 0.1),
      }),
      // How much blood a landed blow throws and leaves on the floor: 0× is a
      // bloodless field (the clean look for a screenshot), BLOOD_MAX× a
      // slaughterhouse. Read live by `bloodBlow`.
      blood: sliderRow("visuals", "blood", {
        readout: formatBalanceMult(s.blood),
        pos: s.blood / BLOOD_MAX,
        set: (pos: number) => setNumber(ctx, "blood", pos * BLOOD_MAX),
        nudge: (dir: number) =>
          setNumber(ctx, "blood", getSettings().blood + dir * 0.1),
      }),
      // HOW LONG THE MESS STAYS: the one number in the gore system that is a
      // matter of taste rather than legibility — a few seconds is punctuation,
      // ten is a battlefield you walk back through.
      "gore-linger": sliderRow("visuals", "gore-linger", {
        readout: `${s.goreLinger}S`,
        pos: s.goreLinger / GORE_LINGER_MAX,
        set: (pos: number) =>
          setNumber(ctx, "goreLinger", pos * GORE_LINGER_MAX),
        nudge: (dir: number) =>
          setNumber(ctx, "goreLinger", getSettings().goreLinger + dir),
      }),
      // THE CAMERA — the two knobs of the world projection (render/tilt.ts).
      // The one pair of developer sliders that change how the whole game LOOKS
      // rather than how one effect behaves, which is exactly why they are
      // knobs: the Diablo question ("how far down, how far round") is settled
      // by dialling them on a real field and looking, not by rebuilding.
      //
      // PITCH is how far the camera leans over the floor. At 1 it looks
      // straight down and the game is the top-down scroller it always was;
      // lower and the ground rakes away, bodies keep their height, and the
      // world gains depth.
      "camera-pitch": sliderRow("visuals", "camera-pitch", {
        readout: `${Math.round(s.cameraPitch * 100)}%`,
        pos: (s.cameraPitch - PITCH_RANGE.min) / span(PITCH_RANGE),
        set: (pos: number) =>
          setNumber(
            ctx,
            "cameraPitch",
            PITCH_RANGE.min + pos * span(PITCH_RANGE),
          ),
        nudge: (dir: number) =>
          setNumber(ctx, "cameraPitch", getSettings().cameraPitch + dir * 0.05),
      }),
      // YAW is the OTHER half, and the half people mean by "isometric": how far
      // the camera stands round from square-on. At 0 the floor tiles stay
      // rectangles; at 45 they are diamonds and the map reads as Diablo's.
      "camera-yaw": sliderRow("visuals", "camera-yaw", {
        readout: `${Math.round(s.cameraYaw)}°`,
        pos: (s.cameraYaw - YAW_RANGE.min) / span(YAW_RANGE),
        set: (pos: number) =>
          setNumber(ctx, "cameraYaw", YAW_RANGE.min + pos * span(YAW_RANGE)),
        nudge: (dir: number) =>
          setNumber(ctx, "cameraYaw", getSettings().cameraYaw + dir * 5),
      }),
      // …and the switch that decides what the YAW's turned art comes out as:
      // averaged edges, or the nearest-neighbour staircase (render/tilt.ts).
      // It rides beside them rather than on a player page because it is only ever
      // about the developer camera above it — a square-on floor has no
      // staircase, so the row says so rather than pretending to do something.
      "anti-aliasing": onOffRow(
        ctx,
        "visuals",
        "anti-aliasing",
        "cameraAntialias",
        {
          onState: s.cameraYaw > 0 ? "on" : "idle",
        },
      ),
      // …and the switch that decides whether a `plane: wall` piece STANDS on its
      // footprint or lies down with the floor (render/tilt.ts `standingWalls`).
      // It sits with the camera because it is a question ABOUT the camera: the
      // extrusion earns itself under a yaw, where a flat panel stops reading as
      // a wall at all, and square-on — where the shipped camera stands, which is
      // why the row ships OFF — it is a look to have an opinion about. NOT
      // folded together with the yaw the way ANTI-ALIASING is: the knob means
      // "I DO want the faces", so sweeping the camera back to square-on to
      // compare the two looks must not switch the answer out from under it.
      "sky-camera": onOffRow(ctx, "visuals", "sky-camera", "skyCamera"),
      "standing-walls": onOffRow(
        ctx,
        "visuals",
        "standing-walls",
        "standingWalls",
      ),
      // THE THREE WASHES OVER THE FINISHED PICTURE (render/postfx.ts). They come
      // last because everything above decides what is DRAWN and these three
      // decide what the drawn frame is seen THROUGH — and they are developer
      // knobs rather than player ones because all three are CSS (a `filter` on
      // the canvas, two gradients on one overlay), so there is no per-frame cost
      // for a player to win back by turning one off. BLOOM used to sit beside
      // them and did cost a full-frame pass; it was removed rather than moved.
      "color-grade": fxRow(ctx, "color-grade"),
      vignette: fxRow(ctx, "vignette"),
      "depth-haze": fxRow(ctx, "depth-haze"),
    }),
    backRow(ctx, "visuals"),
  ];
}

const span = (range: { min: number; max: number }) => range.max - range.min;

/** Commit one numeric setting and rebuild the rows around it. */
function setNumber(
  ctx: MenuContext,
  key: "knockback" | "blood" | "goreLinger" | "cameraPitch" | "cameraYaw",
  value: number,
) {
  updateSettings({ [key]: value });
  ctx.bumpSettings();
}

export function buildBalanceMenu(ctx: MenuContext): MenuEntry[] {
  // The BALANCE subpage: one row per runtime multiplier (see balance-knobs.ts).
  // Each row is an exponential slider — drag it, tap the track, or steer it with
  // ArrowLeft/ArrowRight — spanning 0× (system off) to 100× the shipped tuning,
  // where 1× is baseline. The engine applies the value via settings.ts. The
  // knobs come from that catalog, so the tree carries only the RESET they end
  // with.
  const s = getSettings();
  const setKnob = (key: keyof typeof s.balance, value: number) => {
    updateSettings({ balance: { ...getSettings().balance, [key]: value } });
    ctx.bumpSettings();
  };
  return [
    ...BALANCE_KNOBS.map(({ key, label, blurb }) => ({
      label: `${label} ${formatBalanceMult(s.balance[key])}`,
      aria: rowAria("balance", key),
      blurb,
      // The row itself does nothing on confirm; the slider owns the value.
      action: () => {},
      slider: {
        pos: balanceToSlider(s.balance[key]),
        set: (pos: number) => setKnob(key, balanceFromSlider(pos)),
        nudge: (dir: number) =>
          setKnob(key, nudgeBalance(getSettings().balance[key], dir)),
      },
    })),
    ...assembleRows("balance", {
      reset: actionRow("balance", "reset", () => {
        playUiSound(synth, "back");
        updateSettings({ balance: { ...BALANCE_TUNING_DEFAULTS } });
        ctx.bumpSettings();
      }),
    }),
    backRow(ctx, "balance"),
  ];
}

export function buildSeedMenu(ctx: MenuContext): MenuEntry[] {
  // Mint ready-to-play specimens into the roster (see seed-characters.ts):
  // SEED ALL drops the whole melee/ranged/magic × four-tier matrix; each tier
  // row drops just that tier's three lane builds. The heroes appear under LOAD
  // GAME.
  return [
    ...assembleRows("seed", {
      all: actionRow("seed", "all", () => ctx.runSeed(null)),
    }),
    ...SEED_TIERS.map((tier) => ({
      label: `${tier.label} (LV ${tier.level})`,
      aria: rowAria("seed", tier.id),
      blurb: "MELEE, RANGED AND MAGIC AT THIS TIER",
      action: () => ctx.runSeed(tier),
    })),
    backRow(ctx, "seed"),
  ];
}
