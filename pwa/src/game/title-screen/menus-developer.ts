// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hidden DEVELOPER tree (unlocked by seven quick taps on the title sun):
// the DEVELOPER index (warp, BOT VIEW, arsenal, the effects gallery, flags), the
// VISUALS subpage (the knockback + blood sliders), the BALANCE knob subpage (runtime
// multipliers over the shipped tuning), and the SEED CHARACTERS minting
// screen.

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
  KNOCKBACK_MAX,
  updateSettings,
  type GeneratedMapSize,
} from "../settings.ts";
import { playUiSound } from "../sfx/ui.ts";
import {
  backTo,
  onOffRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";

/** The size choices in cycle order, and what each one reads as. `random` last:
 * it is the "surprise me" end of the list, not a size. */
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

// Each line says what THIS size does, in the present tense — never a table of
// all four (see the settings-help rule in AGENTS.md).
const MAP_SIZE_BLURB: Record<GeneratedMapSize, string> = {
  small: "A TIGHT MAP - THE BOSS IS A FEW ROOMS AWAY",
  medium: "A FULL MAP - A REAL SEARCH FOR THE BOSS",
  large: "A SPRAWLING MAP - THE BOSS IS A LONG WAY OFF",
  random: "THE MAP ROLLS ITS OWN SIZE EACH RUN",
};

export function buildDeveloperMenu(ctx: MenuContext): MenuEntry[] {
  return [
    {
      label: "SELECT LEVEL",
      aria: "developer-select-level",
      blurb: "WARP TO ANY DIFFICULTY & MISSION - SKIPS THE INTRO",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setWarp(true);
        ctx.setScreen("difficulty");
        ctx.setCursor(0);
      },
    },
    {
      label: "BOT VIEW",
      aria: "developer-bot-view",
      blurb: "WATCH THE AUTOPILOT PLAY ANY LEVEL WITH A REAL HERO",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setWarp(true);
        ctx.setBotView(true);
        ctx.setScreen("difficulty");
        ctx.setCursor(0);
      },
    },
    {
      label: "VIEW ARSENAL",
      aria: "developer-arsenal",
      blurb: "EVERY UNIQUE & LEGENDARY ITEM, BY ITEM LEVEL",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("arsenal");
        ctx.setCursor(0);
      },
    },
    {
      label: "VIEW EFFECTS",
      aria: "developer-effects",
      blurb: "EVERY VISUAL EFFECT, STAGED FULLSCREEN - BROWSE AND REPLAY",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("effects");
        ctx.setCursor(0);
      },
    },
    {
      label: "BALANCE",
      aria: "developer-balance",
      blurb: "TUNE XP, MOB STRENGTH AND LOOT MULTIPLIERS",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("balance");
        ctx.setCursor(0);
      },
    },
    {
      label: "SEED CHARACTERS",
      aria: "developer-seed",
      blurb: "MINT MELEE / RANGED / MAGIC HEROES AT THE HIGH TIERS",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setNotice(null);
        ctx.setScreen("seed");
        ctx.setCursor(0);
      },
    },
    // A war chest for probing the AUTO PILOT economy: pours 10B coins
    // into every character's banked purse (a fresh hero has no bank yet —
    // the purse rides the loadout banked on a level clear).
    {
      label: "GRANT 10B COINS",
      aria: "developer-grant-coins",
      blurb: "POUR 10 BILLION COINS INTO EVERY BANKED HERO",
      action: () => {
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
      },
    },
    onOffRow(ctx, "debug", "DEBUG MODE", "developer-debug", {
      on: "THE FPS METER SHOWS DURING RUNS",
      off: "NO FPS METER DURING RUNS",
    }),
    onOffRow(
      ctx,
      "autoLevelStats",
      "AUTO LEVEL STATS",
      "developer-auto-level-stats",
      {
        on: "FREE BASE STATS EACH LEVEL - MOBS SCALE TO MATCH",
        off: "BASE STATS ONLY FROM POINTS YOU SPEND",
      },
    ),
    onOffRow(ctx, "storeForce", "FORCE STORE", "developer-force-store", {
      on: "THE COIN STORE SHOWS IN THIS BUILD - PACKS ARE FREE",
      off: "THE COIN STORE SHOWS IN NATIVE BUILDS ONLY",
    }),
    onOffRow(
      ctx,
      "generatedMaps",
      "GENERATED MAPS",
      "developer-generated-maps",
      {
        on: "EVERY MISSION IS CARVED FRESH - HUNT THE BOSS DOWN",
        off: "EVERY MISSION PLAYS ITS HAND-DRAWN MAP",
      },
    ),
    // The size only means anything while the generator is on, so it appears with
    // it rather than sitting greyed out under a switch that is off. A label-cycling
    // row, not a switch: four choices are not an on/off (see the widget rules in
    // AGENTS.md).
    ...(getSettings().generatedMaps === "on"
      ? [
          {
            label: "MAP SIZE",
            value: MAP_SIZE_LABEL[getSettings().generatedMapSize],
            aria: "developer-generated-map-size",
            blurb: MAP_SIZE_BLURB[getSettings().generatedMapSize],
            action: () => {
              playUiSound(synth, "confirm");
              const order = MAP_SIZE_ORDER;
              const at = order.indexOf(getSettings().generatedMapSize);
              updateSettings({
                generatedMapSize: order[
                  (at + 1) % order.length
                ] as GeneratedMapSize,
              });
              ctx.bumpSettings();
            },
          },
        ]
      : []),
    {
      label: "VISUALS",
      aria: "developer-visuals",
      blurb: "TUNE THE GAME'S FEEL - KNOCKBACK, BLOOD AND OTHER EFFECTS",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("visuals");
        ctx.setCursor(0);
      },
    },
    // Land back on the DEVELOPER row in SETTINGS. It sits just above BACK,
    // after CONTROLS / DISPLAY / SOUND / DATA.
    backTo(ctx, "settings", 4),
  ];
}

export function buildVisualsMenu(ctx: MenuContext): MenuEntry[] {
  // The DEVELOPER → VISUALS subpage: game-feel effect sliders — how far a kill
  // throws the body, and how much blood a blow spills.
  return [
    // The overkill fling strength: a drag track from 0× (bodies drop where
    // they stand) through 1× (shipped feel) up to KNOCKBACK_MAX× (mobs
    // rocket clear off the screen). Read live by GameScreen's launch.
    ((): MenuEntry => {
      const kb = getSettings().knockback;
      const setKb = (mult: number) => {
        updateSettings({ knockback: mult });
        ctx.bumpSettings();
      };
      return {
        label: `KNOCKBACK ${formatBalanceMult(kb)}`,
        aria: "visuals-knockback",
        blurb: "HOW FAR AN OVERKILL FLINGS THE MOB FLYING",
        action: () => {},
        slider: {
          pos: kb / KNOCKBACK_MAX,
          set: (pos: number) => setKb(pos * KNOCKBACK_MAX),
          nudge: (dir: number) => setKb(getSettings().knockback + dir * 0.1),
        },
      };
    })(),
    // How much blood a landed blow throws and leaves on the floor: 0× is a
    // bloodless field (the clean look for a screenshot), 1× the shipped feel,
    // BLOOD_MAX× a slaughterhouse. Read live by `bloodBlow`.
    ((): MenuEntry => {
      const blood = getSettings().blood;
      const setBlood = (mult: number) => {
        updateSettings({ blood: mult });
        ctx.bumpSettings();
      };
      return {
        label: `BLOOD ${formatBalanceMult(blood)}`,
        aria: "visuals-blood",
        blurb: "HOW MUCH A WOUND SPRAYS AND HOW RED THE FLOOR GETS",
        action: () => {},
        slider: {
          pos: blood / BLOOD_MAX,
          set: (pos: number) => setBlood(pos * BLOOD_MAX),
          nudge: (dir: number) => setBlood(getSettings().blood + dir * 0.1),
        },
      };
    })(),
    // THE CAMERA — the two knobs of the world projection (render/tilt.ts).
    // These are the one pair of developer sliders that change how the whole
    // game LOOKS rather than how one effect behaves, which is exactly why they
    // are knobs: the Diablo question ("how far down, how far round") is settled
    // by dialling them on a real field and looking, not by rebuilding.
    //
    // PITCH is how far the camera leans over the floor. At 1 it looks straight
    // down and the game is the top-down scroller it always was; lower and the
    // ground rakes away, bodies keep their height, and the world gains depth.
    ((): MenuEntry => {
      const pitch = getSettings().cameraPitch;
      const span = PITCH_RANGE.max - PITCH_RANGE.min;
      const setPitch = (v: number) => {
        updateSettings({ cameraPitch: v });
        ctx.bumpSettings();
      };
      return {
        label: `CAMERA PITCH ${Math.round(pitch * 100)}%`,
        aria: "visuals-camera-pitch",
        blurb: "HOW FAR THE CAMERA LEANS OVER THE FLOOR - 100% IS TOP DOWN",
        action: () => {},
        slider: {
          pos: (pitch - PITCH_RANGE.min) / span,
          set: (pos: number) => setPitch(PITCH_RANGE.min + pos * span),
          nudge: (dir: number) =>
            setPitch(getSettings().cameraPitch + dir * 0.05),
        },
      };
    })(),
    // YAW is the OTHER half, and the half people mean by "isometric": how far
    // the camera stands round from square-on. At 0 the floor tiles stay
    // rectangles; at 45 they are diamonds and the map reads as Diablo's.
    ((): MenuEntry => {
      const yaw = getSettings().cameraYaw;
      const span = YAW_RANGE.max - YAW_RANGE.min;
      const setYaw = (v: number) => {
        updateSettings({ cameraYaw: v });
        ctx.bumpSettings();
      };
      return {
        label: `CAMERA YAW ${Math.round(yaw)}°`,
        aria: "visuals-camera-yaw",
        blurb: "HOW FAR THE CAMERA STANDS ROUND - 45° MAKES THE FLOOR DIAMONDS",
        action: () => {},
        slider: {
          pos: (yaw - YAW_RANGE.min) / span,
          set: (pos: number) => setYaw(YAW_RANGE.min + pos * span),
          nudge: (dir: number) => setYaw(getSettings().cameraYaw + dir * 5),
        },
      };
    })(),
    // Land back on the VISUALS row in DEVELOPER (just above its sibling BACK,
    // after the flag toggles).
    backTo(ctx, "developer", 10),
  ];
}

export function buildBalanceMenu(ctx: MenuContext): MenuEntry[] {
  // The BALANCE subpage: one row per runtime multiplier (see
  // balance-knobs.ts). Each row is an exponential slider — drag it, tap the
  // track, or steer it with ArrowLeft/ArrowRight — spanning 0× (system off)
  // to 100× the shipped tuning, where 1× is baseline. The engine applies
  // the value via settings.ts.
  const s = getSettings();
  const setKnob = (key: keyof typeof s.balance, value: number) => {
    updateSettings({ balance: { ...getSettings().balance, [key]: value } });
    ctx.bumpSettings();
  };
  return [
    ...BALANCE_KNOBS.map(({ key, label, blurb }) => ({
      label: `${label} ${formatBalanceMult(s.balance[key])}`,
      aria: `balance-${key}`,
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
    {
      label: "RESET ALL",
      aria: "balance-reset",
      blurb: "EVERY KNOB BACK TO 1× - THE SHIPPED TUNING",
      action: () => {
        playUiSound(synth, "back");
        updateSettings({ balance: { ...BALANCE_TUNING_DEFAULTS } });
        ctx.bumpSettings();
      },
    },
    // Land back on the BALANCE row in DEVELOPER (after SELECT LEVEL, BOT VIEW,
    // VIEW ARSENAL and VIEW EFFECTS).
    backTo(ctx, "developer", 4),
  ];
}

export function buildSeedMenu(ctx: MenuContext): MenuEntry[] {
  // Mint ready-to-play specimens into the roster (see seed-characters.ts):
  // SEED ALL drops the whole melee/ranged/magic × four-tier matrix; each
  // tier row drops just that tier's three lane builds. The heroes appear
  // under PLAY → LOAD GAME.
  return [
    {
      label: "SEED ALL",
      aria: "seed-all",
      blurb: "EVERY BUILD AT EVERY TIER - 12 HEROES",
      action: () => ctx.runSeed(null),
    },
    ...SEED_TIERS.map((tier) => ({
      label: `${tier.label} (LV ${tier.level})`,
      aria: `seed-${tier.id}`,
      blurb: "MELEE, RANGED AND MAGIC AT THIS TIER",
      action: () => ctx.runSeed(tier),
    })),
    // Land back on the SEED CHARACTERS row in DEVELOPER (after SELECT LEVEL,
    // BOT VIEW, VIEW ARSENAL, VIEW EFFECTS and BALANCE).
    backTo(ctx, "developer", 5),
  ];
}
