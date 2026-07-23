// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hidden DEVELOPER tree (unlocked by the title moon's long-press): the
// DEVELOPER index (warp, BOT VIEW, arsenal, flags), the VISUALS subpage (the
// knockback slider), the BALANCE knob subpage (runtime multipliers over the
// shipped tuning), and the SEED CHARACTERS minting screen.

import { BALANCE_TUNING_DEFAULTS } from "@game/core";

import { synth } from "../audio.ts";
import {
  BALANCE_KNOBS,
  balanceFromSlider,
  balanceToSlider,
  formatBalanceMult,
  nudgeBalance,
} from "../balance-knobs.ts";
import { grantCoins } from "../characters.ts";
import { SEED_TIERS } from "../seed-characters.ts";
import { getSettings, KNOCKBACK_MAX, updateSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import {
  backTo,
  onOffRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";

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
    onOffRow(
      ctx,
      "debug",
      "DEBUG MODE",
      "developer-debug",
      "SHOW THE FPS METER DURING RUNS",
    ),
    onOffRow(
      ctx,
      "autoLevelStats",
      "AUTO LEVEL STATS",
      "developer-auto-level-stats",
      "FREE BASE STAT GROWTH EACH LEVEL (MOBS SCALE TO MATCH)",
    ),
    onOffRow(
      ctx,
      "storeForce",
      "FORCE STORE",
      "developer-force-store",
      "SHOW THE COIN STORE IN THIS BUILD - PACKS ARE FREE",
    ),
    {
      label: "VISUALS",
      aria: "developer-visuals",
      blurb: "TUNE THE GAME'S FEEL - KNOCKBACK AND OTHER EFFECTS",
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
  // The DEVELOPER → VISUALS subpage: game-feel effect sliders. Today just the
  // overkill fling strength; the page exists so more effect knobs can join it.
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
    // Land back on the VISUALS row in DEVELOPER (just above FORCE STORE's
    // sibling BACK, after the flag toggles).
    backTo(ctx, "developer", 9),
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
    // Land back on the BALANCE row in DEVELOPER (after SELECT LEVEL, BOT VIEW
    // and VIEW ARSENAL).
    backTo(ctx, "developer", 3),
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
    // BOT VIEW, VIEW ARSENAL and BALANCE).
    backTo(ctx, "developer", 4),
  ];
}
