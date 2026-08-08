// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Achievement unlocks during a run: batched unlocks queue and toast ONE at a
// time (each replays the banner + chime). Badges are earned in-run but only
// browsed from the main menu's ACHIEVEMENTS shelf — the run just celebrates
// them.

import { useCallback, useEffect, useRef, useState } from "react";

import { ACHIEVEMENTS_BY_ID } from "../achievement-defs.ts";
import {
  achievementToastTtlMs,
  type AchievementToastData,
} from "../AchievementToast.tsx";
import { synth } from "../audio.ts";
import { playAchievementHaptic } from "../haptics.ts";
import { playAchievementJingle } from "../sfx/jingles.ts";

export function useAchievementToasts(): {
  /** The toast currently on stage (or null) — rendered by GameScreen. */
  achievementToast: AchievementToastData | null;
  /** Queue freshly-unlocked badge ids for the toast stage. Called from the
   * sim loop (event ingestion) and the run-start hook. Only refs and setters
   * are touched (the toast resolves its own icon sprite), so the run effect
   * can call it without listing it as a dependency — the same footing as
   * `bumpUi`. */
  celebrateAchievements: (ids: string[]) => void;
} {
  const queueRef = useRef<AchievementToastData[]>([]);
  const seqRef = useRef(0);
  const [achievementToast, setAchievementToast] =
    useState<AchievementToastData | null>(null);

  // Bumped whenever badges join the queue, waking the stage effect below.
  // The queue lives in a ref and is only ever shifted inside effects — a state
  // updater must stay pure, which is why the stage never advances the queue
  // from inside setAchievementToast. (Nothing checks this any more: React's
  // StrictMode caught an impure updater by double-invoking it, and Preact has
  // no equivalent — see main.tsx. It is a rule now, not a guardrail.)
  const [tick, setTick] = useState(0);

  // The toast stage, two halves: a showing toast chimes once and clears
  // itself after its TTL; an idle stage pulls the next queued badge.
  useEffect(() => {
    if (!achievementToast) return;
    // Chime, buzz and dwell are all the TIER's — a legend rings a fanfare and
    // holds the screen where a beginner ticks and slips away.
    playAchievementJingle(synth, achievementToast.tier);
    playAchievementHaptic(achievementToast.tier);
    const timer = setTimeout(
      () => setAchievementToast(null),
      achievementToastTtlMs(achievementToast.tier),
    );
    return () => clearTimeout(timer);
  }, [achievementToast]);
  useEffect(() => {
    if (achievementToast) return;
    const next = queueRef.current.shift();
    if (next) setAchievementToast(next);
  }, [achievementToast, tick]);

  // Stable (memoized) so the run effect can list it as a dependency.
  const celebrateAchievements = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const queued = queueRef.current;
    for (const id of ids) {
      const def = ACHIEVEMENTS_BY_ID.get(id);
      if (!def) continue;
      queued.push({
        id: ++seqRef.current,
        name: def.name,
        icon: def.icon,
        tier: def.tier,
      });
    }
    // Wake the stage (the idle-stage effect pulls the queue).
    setTick((t) => t + 1);
  }, []);

  return { achievementToast, celebrateAchievements };
}
