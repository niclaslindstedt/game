// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The campaign pickers: the difficulty ladder, the level (mission) list, and
// BOT VIEW's trailing GAME SPEED step. The same two pickers serve normal play
// and the developer warp (ctx.warp ignores the unlock gates; ctx.botView adds
// the botspeed step and hands the run to the autopilot).

import {
  DIFFICULTY_ORDER,
  difficultyDef,
  LEVEL_ORDER,
  SECRET_LEVEL_ORDER,
  STARTING_DIFFICULTIES,
  levelDef,
  type Difficulty,
} from "@game/core";

import { synth } from "../audio.ts";
import { BOT_VIEW_SPECS, botViewSpec } from "../bot-view-specs.ts";
import {
  firstUnclearedLevel,
  hasClearedLevel,
  isDifficultyBeaten,
  isDifficultyTierBeaten,
  isDifficultyUnlocked,
  isLevelUnlocked,
  type Character,
} from "../characters.ts";
import { GAME_SPEEDS, getSettings, updateSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import { backTo, type MenuContext, type MenuEntry } from "./menu-model.ts";

/** Where the difficulty ladder's cursor opens for this hero: on the furthest
 * GATED rung they've unlocked (the progression frontier — nightmare, then
 * jesus), or, before any is open, on MEDIUM — the middle of the three parallel
 * starting lanes, a neutral default (the three are all open from the start, so
 * "furthest unlocked" would otherwise land arbitrarily on hard). */
export function furthestUnlockedDifficulty(character: Character): number {
  for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i--) {
    const id = DIFFICULTY_ORDER[i] as Difficulty;
    if (
      !STARTING_DIFFICULTIES.includes(id) &&
      isDifficultyUnlocked(character, id)
    ) {
      return i;
    }
  }
  return DIFFICULTY_ORDER.indexOf("medium");
}

export function buildDifficultyMenu(
  ctx: MenuContext,
  character: Character,
): MenuEntry[] {
  // Warp mode (opened from the developer menu's SELECT LEVEL) ignores the
  // unlock ladder: every difficulty is selectable so you can warp into any
  // mission at any difficulty. Picking one hands off to the level picker
  // (still in warp mode); backing out returns to the developer menu.
  const warpBack: MenuEntry = {
    label: "BACK",
    aria: "menu-back",
    action: () => {
      playUiSound(synth, "back");
      ctx.setWarp(false);
      ctx.setBotView(false);
      ctx.setBotLevel(null);
      ctx.setScreen("developer");
      ctx.setCursor(0);
    },
  };
  return [
    ...DIFFICULTY_ORDER.map((id) => {
      const def = difficultyDef(id);
      // The three starting lanes (easy/medium/hard) are parallel and always
      // open — a player picks one. The gated rungs open on a prereq beaten:
      // NIGHTMARE on any starting lane, JESUS on NIGHTMARE (see
      // `DIFFICULTY_UNLOCK_PREREQS`). Locked rungs show greyed out. Warp mode
      // opens every rung.
      const unlocked = ctx.warp || isDifficultyUnlocked(character, id);
      // The direct clear (this exact rung) vs the shared-TIER clear: beating any
      // one starting lane clears the easy/medium/hard tier, so a sibling lane
      // opens the picker too — its own bookmark just isn't stamped CLEARED yet.
      const beaten = isDifficultyBeaten(character, id);
      const tierBeaten = isDifficultyTierBeaten(character, id);
      const lockedBlurb =
        id === "jesus"
          ? "LOCKED - BEAT NIGHTMARE"
          : "LOCKED - BEAT A STARTING DIFFICULTY";
      return {
        label: def.name,
        aria: `difficulty-${id}`,
        color: unlocked ? def.color : "#5a6068",
        locked: !unlocked,
        // Warp repeats one line on every rung (the heading already says
        // WARP), so it carries no subtitle; normal play keeps the tagline
        // and lock/clear status that differ per difficulty.
        blurb: ctx.warp
          ? undefined
          : !unlocked
            ? lockedBlurb
            : beaten
              ? "CLEARED - CHOOSE ANY MISSION"
              : tierBeaten
                ? "CHOOSE ANY MISSION"
                : def.tagline,
        action: () => {
          if (!unlocked) {
            playUiSound(synth, "back");
            return;
          }
          ctx.setDifficulty(id);
          // Warp: pick the difficulty, then hand off to the level picker
          // (still in warp mode) — never auto-start the campaign.
          if (ctx.warp) {
            playUiSound(synth, "confirm");
            ctx.setScreen("levels");
            ctx.setCursor(0);
            return;
          }
          // Until this difficulty's TIER is beaten the level picker stays
          // locked: the hero is walked straight through the campaign from the
          // next unbeaten level. Once the tier is clear (any starting lane, or
          // this gated rung itself), the picker opens — grinding the last levels
          // before nightmare on a sibling lane goes through the picker, not a
          // fresh linear run from level one.
          if (!tierBeaten) {
            playUiSound(synth, "start");
            ctx.onStart(id, firstUnclearedLevel(character, id));
            return;
          }
          playUiSound(synth, "confirm");
          ctx.setScreen("levels");
          // Open on the furthest level still reachable at this difficulty.
          const furthest = LEVEL_ORDER.reduce(
            (best, levelId, i) =>
              isLevelUnlocked(character, levelId, id) ? i : best,
            0,
          );
          ctx.setCursor(furthest);
        },
      };
    }),
    // Re-home on NEW GAME — one lower when CONTINUE tops the menu.
    ctx.warp ? warpBack : backTo(ctx, "main", ctx.hasResume ? 1 : 0),
  ];
}

export function buildLevelsMenu(
  ctx: MenuContext,
  character: Character,
): MenuEntry[] {
  // Warp mode (opened from the developer menu's SELECT LEVEL) ignores the
  // unlock gate: every level is reachable so you can try any of them, and
  // picking one drops straight into play with no intro. Backing out returns
  // to the warp difficulty picker it was launched from (still in warp mode).
  const warpBack: MenuEntry = {
    label: "BACK",
    aria: "menu-back",
    action: () => {
      playUiSound(synth, "back");
      ctx.setScreen("difficulty");
      ctx.setCursor(DIFFICULTY_ORDER.indexOf(ctx.difficulty));
    },
  };
  return [
    ...LEVEL_ORDER.map((id, i) => {
      const def = levelDef(id);
      const unlocked =
        ctx.warp || isLevelUnlocked(character, id, ctx.difficulty);
      const cleared = hasClearedLevel(character, id, ctx.difficulty);
      // Warp / BOT VIEW would repeat one identical line on every row (the
      // screen title already says which mode you're in), so those rows carry
      // no subtitle. Normal play keeps the informative per-level status.
      const blurb =
        ctx.warp || ctx.botView
          ? undefined
          : !unlocked
            ? "LOCKED - CLEAR THE PREVIOUS LEVEL"
            : cleared
              ? "CLEARED - REPLAY"
              : "NEW";
      return {
        label: `${i + 1}. ${def.name}`,
        aria: `level-${id}`,
        color: unlocked ? "#7ef0c8" : "#5a6068",
        locked: !unlocked,
        blurb,
        action: () => {
          if (!unlocked) {
            playUiSound(synth, "back");
            return;
          }
          // BOT VIEW picks the fast-forward speed next (the `botspeed`
          // step); a normal/warp pick drops straight in.
          if (ctx.botView) {
            playUiSound(synth, "confirm");
            ctx.setBotLevel(id);
            ctx.setScreen("botspeed");
            ctx.setCursor(0);
            return;
          }
          playUiSound(synth, "start");
          ctx.onStart(
            ctx.difficulty,
            id,
            ctx.warp ? { skipIntro: true, botView: ctx.botView } : undefined,
          );
        },
      };
    }),
    // The secret venues (the bunker): reachable in play only through
    // their travel gates, so the campaign picker never lists them — the
    // dev warp does, as extra unnumbered rows.
    ...(ctx.warp
      ? SECRET_LEVEL_ORDER.map((id) => ({
          // The "?." prefix + purple already mark it secret; no subtitle.
          label: `?. ${levelDef(id).name}`,
          aria: `level-${id}`,
          color: "#c9a2ff",
          action: () => {
            if (ctx.botView) {
              playUiSound(synth, "confirm");
              ctx.setBotLevel(id);
              ctx.setScreen("botspeed");
              ctx.setCursor(0);
              return;
            }
            playUiSound(synth, "start");
            ctx.onStart(ctx.difficulty, id, {
              skipIntro: true,
              botView: ctx.botView,
            });
          },
        }))
      : []),
    ctx.warp
      ? warpBack
      : backTo(ctx, "difficulty", DIFFICULTY_ORDER.indexOf(ctx.difficulty)),
  ];
}

export function buildBotspeedMenu(ctx: MenuContext): MenuEntry[] {
  // The GAME SPEED step of BOT VIEW, reached AFTER a difficulty and level
  // are chosen. A developer-only fast-forward: it runs more fixed game-loop
  // steps per frame, so the autopilot blitzes the level in a fraction of the
  // wall-clock time (deterministic — the step size never changes). The pick
  // persists in the settings and the game loop reads it (GameScreen
  // `simSpeed`); START launches the stashed level under the bot.
  const s = getSettings();
  const target = ctx.botLevel;
  const spec = botViewSpec(s.botViewSpec);
  return [
    {
      label: "GAME SPEED",
      value: `${s.gameSpeed}×`,
      aria: "botspeed-speed",
      blurb: "FAST-FORWARD THE BOT RUN - MORE STEPS PER FRAME",
      action: () => {
        playUiSound(synth, "confirm");
        const i = GAME_SPEEDS.indexOf(s.gameSpeed);
        const next = GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length];
        updateSettings({ gameSpeed: next });
        ctx.bumpSettings();
      },
    },
    {
      // Which generated hero the autopilot showcases: the BOT SPEC decides
      // the arrival loadout's weapon lane, the stat picks, and the posture
      // (how close it fights) together (see bot-view-specs.ts).
      label: "BOT SPEC",
      value: spec.label,
      aria: "botspeed-spec",
      blurb: spec.blurb,
      action: () => {
        playUiSound(synth, "confirm");
        const i = BOT_VIEW_SPECS.findIndex((sp) => sp.id === spec.id);
        const next = BOT_VIEW_SPECS[(i + 1) % BOT_VIEW_SPECS.length]!;
        updateSettings({ botViewSpec: next.id });
        ctx.bumpSettings();
      },
    },
    {
      label: "START",
      aria: "botspeed-start",
      color: "#7ef0c8",
      blurb: target
        ? `WATCH THE ${spec.label} BOT PLAY ${levelDef(target).name} AT ${s.gameSpeed}×`
        : "WATCH THE BOT PLAY",
      action: () => {
        if (!target) return;
        playUiSound(synth, "start");
        ctx.onStart(ctx.difficulty, target, { skipIntro: true, botView: true });
      },
    },
    {
      label: "BACK",
      aria: "menu-back",
      action: () => {
        playUiSound(synth, "back");
        ctx.setBotLevel(null);
        ctx.setScreen("levels");
        ctx.setCursor(0);
      },
    },
  ];
}
