// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Achievement unlocks during a run: batched unlocks queue and toast ONE at a
// time (each replays the banner + chime). Badges are earned in-run but only
// browsed from the main menu's ACHIEVEMENTS shelf — the run just celebrates
// them.

import { useCallback, useEffect, useRef, useState } from "react";

import { ACHIEVEMENTS_BY_ID } from "../achievement-defs.ts";
import {
  ACHIEVEMENT_TOAST_TTL_MS,
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
  // The queue lives in a ref and is only ever shifted inside effects — state
  // updaters must stay pure (StrictMode double-invokes them), which is why
  // the stage never advances the queue from inside setAchievementToast.
  const [tick, setTick] = useState(0);

  // The toast stage, two halves: a showing toast chimes once and clears
  // itself after its TTL; an idle stage pulls the next queued badge.
  useEffect(() => {
    if (!achievementToast) return;
    playAchievementJingle(synth);
    playAchievementHaptic();
    const timer = setTimeout(
      () => setAchievementToast(null),
      ACHIEVEMENT_TOAST_TTL_MS,
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
      });
    }
    // Wake the stage (the idle-stage effect pulls the queue).
    setTick((t) => t + 1);
  }, []);

  return { achievementToast, celebrateAchievements };
}
