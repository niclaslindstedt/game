// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The achievements STORE: the persisted account-wide slice — lifetime totals
// (achievement-totals.ts) plus the oss-framework unlock ledger (earned ids →
// timestamps, and the unseen queue that lights the HUD star). GameScreen feeds
// it the engine's per-tick events and a run-start hook; whatever unlocks comes
// back as fresh ids to celebrate. One localStorage blob, shared by every hero
// (achievements are the ACCOUNT's trophy shelf, not a character's), persisted
// with the same private-mode-safe guards as settings.ts.
//
// The ledger transitions come from the framework (`applyUnlocks` is idempotent
// and dedupes the unseen queue; `clearUnseen` acknowledges) — only the catalog
// evaluation is ours, since our conditions read counter totals rather than the
// framework watcher's prev/next state deltas.
//
// Every write also nudges the PLATFORM MIRROR (achievement-sync.ts): in the
// native shell the same badges show up in Game Center. That is a one-way copy
// of what this file decides — the ledger here stays the source of truth — and
// it is debounced and no-ops in a browser, so this stays the cheap call it
// looks like.

import type { GameEvent } from "@game/core";

import {
  applyUnlocks,
  clearUnseen,
  type UnlockLedger,
} from "@niclaslindstedt/oss-framework/achievements";

import { storageKey } from "../identity.ts";

import { ACHIEVEMENTS } from "./achievement-defs.ts";
import { scheduleAchievementSync } from "./achievement-sync.ts";
import { getActiveCharacter } from "./characters.ts";
import {
  applyEventsToTotals,
  applyKillRate,
  applyRunStart,
  applyWornEquipment,
  emptyTotals,
  type LifetimeTotals,
  type RunContext,
  type WornPiece,
} from "./achievement-totals.ts";

/** Per-badge context captured the moment it was earned — WHO was playing when
 * the trophy dropped. The timestamp lives in the framework ledger
 * (`unlocked[id]`); this is the game-specific companion to it. `character` is
 * null for badges earned before this was tracked (or with no active hero). */
export type AchievementUnlockMeta = { character: string | null };

/** The persisted blob: the framework ledger, our counter totals, and the
 * per-badge unlock context (`meta`, keyed by achievement id). */
export type AchievementsSave = UnlockLedger & {
  totals: LifetimeTotals;
  meta: Record<string, AchievementUnlockMeta>;
};

const STORAGE_KEY = storageKey("achievements");

function emptySave(): AchievementsSave {
  return { unlocked: {}, unseen: [], totals: emptyTotals(), meta: {} };
}

function load(): AchievementsSave {
  const base = emptySave();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<AchievementsSave>;
    return {
      unlocked:
        stored.unlocked && typeof stored.unlocked === "object"
          ? stored.unlocked
          : base.unlocked,
      unseen: Array.isArray(stored.unseen) ? stored.unseen : base.unseen,
      // Field-wise merge so a save from before a new counter shipped starts
      // that counter at zero instead of undefined.
      totals: { ...base.totals, ...(stored.totals ?? {}) },
      meta:
        stored.meta && typeof stored.meta === "object"
          ? stored.meta
          : base.meta,
    };
  } catch {
    return base; // private mode / corrupt JSON — track in memory only
  }
}

let save: AchievementsSave = load();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable — the ledger lives on in memory for this session.
  }
  // Mirror to the platform (Game Center) in the native shell; a no-op in a
  // browser, and debounced everywhere, so a busy tick pays nothing for it.
  scheduleAchievementSync();
}

/** The live save — read by the browser screen and the HUD badge. */
export function getAchievements(): AchievementsSave {
  return save;
}

/** Earned but not yet acknowledged — drives the HUD star's visibility. */
export function unseenAchievements(): string[] {
  return save.unseen;
}

/** Conditions newly satisfied by the current totals, unrecorded so far. */
function satisfiedNow(): string[] {
  const fresh: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (save.unlocked[def.id] === undefined && def.done(save.totals)) {
      fresh.push(def.id);
    }
  }
  return fresh;
}

/** Record any newly satisfied conditions; returns the genuinely-new ids (the
 * caller's cue to celebrate). Idempotent via the framework ledger. */
function unlockSatisfied(): string[] {
  const ids = satisfiedNow();
  if (ids.length === 0) return [];
  const { next, fresh } = applyUnlocks(save, ids, Date.now());
  save = next;
  // Stamp each freshly-earned badge with the hero who was playing, so the
  // browser can later say "earned by NAME" alongside the unlock date.
  if (fresh.length > 0) {
    const character = getActiveCharacter()?.name ?? null;
    const meta = { ...save.meta };
    for (const id of fresh) meta[id] = { character };
    save = { ...save, meta };
  }
  return fresh;
}

/**
 * Book one tick's engine events against the ledger. Cheap on quiet ticks
 * (returns early when nothing counted moved); on movement it re-evaluates the
 * catalog, persists, and returns the freshly-unlocked ids.
 */
export function recordAchievementEvents(
  events: readonly GameEvent[],
  ctx: RunContext,
): string[] {
  if (events.length === 0) return [];
  if (!applyEventsToTotals(save.totals, events, ctx)) return [];
  const fresh = unlockSatisfied();
  persist();
  return fresh;
}

/** Book a run starting (fresh starts and retries — not menu resumes) and
 * return any run-count unlocks it tipped over. */
export function recordRunStarted(levelId: string): string[] {
  applyRunStart(save.totals, levelId);
  const fresh = unlockSatisfied();
  persist();
  return fresh;
}

// The last-seen worn-gear signature: GameScreen reports the hero's outfit
// every frame, so a cheap string compare keeps quiet frames free.
let lastWornSig = "";

/** Book the hero's currently-worn gear (the wardrobe feats) and return any
 * unlocks it tipped over. Cheap to call per frame — it no-ops until the
 * outfit actually changes. */
export function recordWornEquipment(worn: readonly WornPiece[]): string[] {
  const sig = worn.map((p) => `${p.slot}:${p.tier}:${p.defId}`).join("|");
  if (sig === lastWornSig) return [];
  lastWornSig = sig;
  if (!applyWornEquipment(save.totals, worn)) return [];
  const fresh = unlockSatisfied();
  persist();
  return fresh;
}

/**
 * Book a sustained KILL RATE (kill-rate.ts) on the lifetime ledger. Called
 * every tick with the rate the hero is currently holding, so it no-ops until
 * that beats the standing best — which is rare, unlike the per-tick event
 * booking, so the persist here costs nothing on a normal frame.
 *
 * The rate is banked even though no achievement reads it yet: it is the
 * KILL RATE leaderboard's value, and the lifetime ledger is where the app's
 * account-wide records already live (and already survive a reload).
 */
export function recordKillRate(rate: number): void {
  if (!applyKillRate(save.totals, rate)) return;
  unlockSatisfied();
  persist();
}

/** The player has seen their new badges (opened the browser) — dim the star. */
export function acknowledgeAchievements(): void {
  if (save.unseen.length === 0) return;
  save = clearUnseen(save);
  persist();
}

/** Test hook: reset the module ledger (and storage) to a blank slate. */
export function resetAchievementsForTest(): void {
  save = emptySave();
  lastWornSig = "";
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No storage — the in-memory reset is the whole job.
  }
}
