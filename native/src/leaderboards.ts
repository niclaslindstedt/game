// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEADERBOARDS' NATIVE half — the bridge between the game's board catalog
// (pwa/src/game/leaderboards.ts) and the platform's score service
// (./leaderboards-provider.ts). The protocol is documented on the web side
// (pwa/src/app/scores-bridge.ts); keep the two in step.
//
// Deliberately dumb, exactly like the achievements and cloud-save bridges: it
// forwards a list of {board key, whole number} and reports whether the platform
// took it. It does not know what a score MEANS, which boards exist, or when one
// is worth sending — the game owns all of that, so the same bridge serves any
// provider and the catalog can grow without a native change.
//
// The one thing it owns is the id mapping, because only the platform knows its
// own ids (Play Games generates them; Game Center lets us choose ours). An
// entry the provider can't name is dropped here rather than sent as a guess —
// see `platformId`.

import {
  leaderboardsProvider,
  type LeaderboardsProvider,
} from "./leaderboards-provider";

/** A message from the web side (already parsed; `__gisScores` checked). */
export type ScoresRequest = {
  action?: "init" | "status" | "submit" | "show";
  requestId?: number;
  entries?: { key?: unknown; value?: unknown }[];
  /** `show`: which board to open; absent opens the whole list. */
  key?: string;
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type ScoresEvent =
  | {
      event: "status";
      requestId: number;
      ok: boolean;
      available: boolean;
      provider?: string;
    }
  | { event: "submit"; requestId: number; ok: boolean }
  | { event: "show"; requestId: number; ok: boolean };

export type ScoresBridge = {
  handle: (request: ScoresRequest) => void;
};

/**
 * Build the native leaderboards bridge. `emit` injects one event into the
 * WebView (App.tsx wraps `injectJavaScript`); `handle` takes each parsed
 * scores message from `onMessage`.
 */
export function createScoresBridge(
  emit: (event: ScoresEvent) => void,
): ScoresBridge {
  const provider: LeaderboardsProvider | null = leaderboardsProvider();

  const status = async (requestId: number): Promise<void> => {
    if (!provider) {
      emit({ event: "status", requestId, ok: true, available: false });
      return;
    }
    emit({
      event: "status",
      requestId,
      ok: true,
      available: await provider.isAvailable(),
      provider: provider.id,
    });
  };

  const submit = async (
    requestId: number,
    entries: ScoresRequest["entries"],
  ): Promise<void> => {
    if (!provider || !Array.isArray(entries)) {
      emit({ event: "submit", requestId, ok: false });
      return;
    }
    // Validate here rather than trusting the page: a platform score is an
    // Int64, so a NaN or a fraction would go straight into GameKit, and an
    // unmapped key would be submitted to a board the portal has never heard of.
    const mapped = entries.flatMap((entry) => {
      if (typeof entry?.key !== "string") return [];
      const key = provider.platformId(entry.key);
      if (!key) return [];
      const value = Number(entry.value);
      if (!Number.isFinite(value)) return [];
      return [{ key, value: Math.round(value) }];
    });
    if (mapped.length === 0) {
      // Nothing this platform can carry — a success, not a failure: the
      // alternative is a batch the game retries forever.
      emit({ event: "submit", requestId, ok: true });
      return;
    }
    emit({ event: "submit", requestId, ok: await provider.submit(mapped) });
  };

  const show = async (requestId: number, key?: string): Promise<void> => {
    if (!provider) {
      emit({ event: "show", requestId, ok: false });
      return;
    }
    // A key the portal doesn't know would present an empty board; fall back to
    // the whole list, which is never wrong.
    const target = key ? (provider.platformId(key) ?? undefined) : undefined;
    emit({ event: "show", requestId, ok: await provider.show(target) });
  };

  const handle = (request: ScoresRequest): void => {
    const requestId = request.requestId ?? 0;
    switch (request.action) {
      case "init":
        break; // the hello — nothing to arm; there is no change push
      case "status":
        void status(requestId);
        break;
      case "submit":
        void submit(requestId, request.entries);
        break;
      case "show":
        void show(requestId, request.key);
        break;
    }
  };

  return { handle };
}
