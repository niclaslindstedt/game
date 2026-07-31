// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hidden DEVELOPER tree (unlocked by the two-movement sun gesture — seven
// quick taps to arm the star, then the click race):
// the DEVELOPER index (the warp, BOT VIEW, the arsenal, the effects gallery,
// the minting rows and the flags), the VISUALS subpage (game feel + the camera),
// the BALANCE knob subpage (runtime multipliers over the shipped tuning), and
// the SEED CHARACTERS minting screen.
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
import { PITCH_RANGE, YAW_RANGE } from "../render/tilt.ts";
import { SEED_TIERS } from "../seed-tiers.ts";
import {
  getSettings,
  BLOOD_MAX,
  GORE_LINGER_MAX,
  KNOCKBACK_MAX,
  updateSettings,
  type GeneratedMapSize,
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

/** The size choices in cycle order. `random` last: it is the "surprise me" end
 * of the list, not a size. */
const MAP_SIZE_ORDER: GeneratedMapSize[] = [
  "small",
  "medium",
  "large",
  "random",
];

const MAP_SIZE_LABEL: Record<GeneratedMapSize, string> = {
  small: "SMALL",
  medium: "MEDIUM",
  large: "LARGE",
  random: "RANDOM",
};

export function buildDeveloperMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  return [
    ...assembleRows("developer", {
      "select-level": actionRow("developer", "select-level", () => {
        playUiSound(synth, "confirm");
        ctx.setWarp(true);
        ctx.setScreen("difficulty");
        ctx.setCursor(0);
      }),
      "bot-view": actionRow("developer", "bot-view", () => {
        playUiSound(synth, "confirm");
        ctx.setWarp(true);
        ctx.setBotView(true);
        ctx.setScreen("difficulty");
        ctx.setCursor(0);
      }),
      arsenal: navRow(ctx, "developer", "arsenal"),
      effects: navRow(ctx, "developer", "effects"),
      seed: navRow(ctx, "developer", "seed", {
        before: () => ctx.setNotice(null),
      }),
      // A war chest for probing the AUTO PILOT economy: pours 10B coins into
      // every character's banked purse (a fresh hero has no bank yet — the
      // purse rides the loadout banked on a level clear).
      "grant-coins": actionRow("developer", "grant-coins", () => {
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
      balance: navRow(ctx, "developer", "balance"),
      visuals: navRow(ctx, "developer", "visuals"),
      debug: onOffRow(ctx, "developer", "debug", "debug"),
      "auto-level-stats": onOffRow(
        ctx,
        "developer",
        "auto-level-stats",
        "autoLevelStats",
      ),
      "force-store": onOffRow(ctx, "developer", "force-store", "storeForce"),
      // Every map is carved, so the size is the one knob left over the
      // generator. A label-cycling row, not a switch: four choices are not an
      // on/off.
      "map-size": actionRow(
        "developer",
        "map-size",
        () => {
          playUiSound(synth, "confirm");
          const at = MAP_SIZE_ORDER.indexOf(getSettings().generatedMapSize);
          updateSettings({
            generatedMapSize: MAP_SIZE_ORDER[
              (at + 1) % MAP_SIZE_ORDER.length
            ] as GeneratedMapSize,
          });
          ctx.bumpSettings();
        },
        {
          value: MAP_SIZE_LABEL[s.generatedMapSize],
          state: s.generatedMapSize,
        },
      ),
    }),
    backRow(ctx, "developer"),
  ];
}

/** DEVELOPER → VISUALS: the game-feel sliders — how far a kill throws the body,
 * how much blood a blow spills, how long the pieces lie there — plus the two
 * knobs of the world projection. */
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
