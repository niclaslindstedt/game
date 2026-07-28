// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ACHIEVEMENTS' NATIVE half — the bridge between the game's badge ledger
// (pwa/src/game/achievement-sync.ts) and the platform's achievement service
// (./achievements-provider.ts). The protocol is documented on the web side
// (pwa/src/app/achievements-bridge.ts); keep the two in step.
//
// Deliberately dumb, exactly like the cloud-save bridge: it forwards a list of
// {badge id, percent} and reports whether the platform took it. It does not
// know what a badge MEANS, which badges exist, or when one is earned — the game
// owns all of that, so the same bridge serves any provider and the catalog can
// grow without a native change.
//
// The one thing it owns is the id mapping, because only the platform knows its
// own ids (Play Games generates them; Game Center lets us choose ours). An
// entry the provider can't name is dropped here rather than sent as a
// guess — see `platformId`.

import {
  achievementsProvider,
  type AchievementsProvider,
} from "./achievements-provider";

/** A message from the web side (already parsed; `__gisAchievements` checked). */
export type AchievementsRequest = {
  action?: "init" | "status" | "report" | "show";
  requestId?: number;
  entries?: { id?: unknown; percent?: unknown }[];
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type AchievementsEvent =
  | {
      event: "status";
      requestId: number;
      ok: boolean;
      available: boolean;
      provider?: string;
      player?: { id: string; name: string };
    }
  | { event: "report"; requestId: number; ok: boolean }
  | { event: "show"; requestId: number; ok: boolean };

export type AchievementsBridge = {
  handle: (request: AchievementsRequest) => void;
};

/**
 * Build the native achievements bridge. `emit` injects one event into the
 * WebView (App.tsx wraps `injectJavaScript`); `handle` takes each parsed
 * achievements message from `onMessage`.
 */
export function createAchievementsBridge(
  emit: (event: AchievementsEvent) => void,
): AchievementsBridge {
  const provider: AchievementsProvider | null = achievementsProvider();

  const status = async (requestId: number): Promise<void> => {
    if (!provider) {
      emit({ event: "status", requestId, ok: true, available: false });
      return;
    }
    const available = await provider.isAvailable();
    const player = available ? await provider.identify() : null;
    emit({
      event: "status",
      requestId,
      ok: true,
      available,
      provider: provider.id,
      ...(player ? { player } : {}),
    });
  };

  const report = async (
    requestId: number,
    entries: AchievementsRequest["entries"],
  ): Promise<void> => {
    if (!provider || !Array.isArray(entries)) {
      emit({ event: "report", requestId, ok: false });
      return;
    }
    // Validate here rather than trusting the page: a NaN percent would be sent
    // straight into GameKit, and an unmapped id would be reported as a badge
    // the portal has never heard of.
    const mapped = entries.flatMap((entry) => {
      if (typeof entry?.id !== "string") return [];
      const id = provider.platformId(entry.id);
      if (!id) return [];
      const percent = Number(entry.percent);
      if (!Number.isFinite(percent)) return [];
      return [{ id, percent: Math.min(100, Math.max(0, percent)) }];
    });
    if (mapped.length === 0) {
      // Nothing this platform can carry — a success, not a failure: retrying
      // it forever would be the alternative.
      emit({ event: "report", requestId, ok: true });
      return;
    }
    const ok = await provider.report(mapped);
    emit({ event: "report", requestId, ok });
  };

  const show = async (requestId: number): Promise<void> => {
    if (!provider) {
      emit({ event: "show", requestId, ok: false });
      return;
    }
    emit({ event: "show", requestId, ok: await provider.show() });
  };

  const handle = (request: AchievementsRequest): void => {
    const requestId = request.requestId ?? 0;
    switch (request.action) {
      case "init":
        break; // the hello — nothing to arm; there is no change push
      case "status":
        void status(requestId);
        break;
      case "report":
        void report(requestId, request.entries);
        break;
      case "show":
        void show(requestId);
        break;
    }
  };

  return { handle };
}
