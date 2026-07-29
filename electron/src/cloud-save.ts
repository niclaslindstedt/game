// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Identical in shape to native/src/cloud-save.ts, and deliberately so: the
// bridge is the part of the seam that has no platform in it at all.
// CLOUD SAVE's SHELL half (desktop) — the bridge between the game's sync engine
// (pwa/src/game/cloud-save.ts) and the platform cloud (cloud-provider.ts). The
// protocol is documented on the web side (pwa/src/app/cloud-bridge.ts); keep
// the two in step.
//
// This module is deliberately dumb: it moves ONE opaque string in and out of
// the cloud and reports whether that worked. It does not parse the save, does
// not merge, and does not know what a character or a coin is — the game owns
// all of that, so the same bridge serves any provider (and the merge rules can
// change without touching native code).
//
// The one thing it does own is the CHANGE NOTIFICATION: when the provider says
// another device wrote, it tells the page, which pulls and merges.

import { cloudProvider, type CloudProvider } from "./cloud-provider";

/** The iCloud / Saved Games key the blob lives under. Versioned so a future
 * format that can't be merged by old builds can move to its own key rather
 * than being mis-read by them. */
const SAVE_KEY = "gis-save-v1";

/** A message from the web side (already parsed; `__gisCloud` checked). */
export type CloudRequest = {
  action?: "init" | "status" | "load" | "save";
  requestId?: number;
  data?: string;
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type CloudEvent =
  | {
      event: "status";
      requestId: number;
      ok: boolean;
      available: boolean;
      provider?: string;
      player?: { id: string; name: string };
    }
  | { event: "load"; requestId: number; ok: boolean; data?: string | null }
  | {
      event: "save";
      requestId: number;
      ok: boolean;
      reason?: "unavailable" | "too-large" | "error";
    }
  | { event: "changed" };

export type CloudBridge = {
  handle: (request: CloudRequest) => void;
  /** Drop the provider's change subscription (App unmount). */
  stop: () => void;
};

/**
 * Build the native cloud bridge. `emit` injects one event into the WebView
 * (main.ts wraps `executeJavaScript`); `handle` takes each parsed cloud message
 * from `onMessage`.
 */
export function createCloudBridge(
  emit: (event: CloudEvent) => void,
): CloudBridge {
  const provider: CloudProvider | null = cloudProvider();
  let unsubscribe: (() => void) | null = null;

  // Watch for another device's write, once, on the first message from the page
  // (which is the "init" hello — the page can't receive events before that).
  const watch = (): void => {
    if (unsubscribe || !provider) return;
    unsubscribe = provider.subscribe(() => emit({ event: "changed" }));
  };

  const status = async (requestId: number): Promise<void> => {
    if (!provider) {
      emit({ event: "status", requestId, ok: true, available: false });
      return;
    }
    const available = await provider.isAvailable();
    // Identity is a nice-to-have: a player who declines Game Center still
    // saves to iCloud, so a null here never blocks the sync.
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

  const load = async (requestId: number): Promise<void> => {
    if (!provider) {
      emit({ event: "load", requestId, ok: false });
      return;
    }
    const data = await provider.load(SAVE_KEY);
    // `undefined` is a FAILED read; `null` is a cloud that holds nothing yet.
    // The difference matters: the game must not treat an unreachable cloud as
    // an empty one and push over a save it never saw.
    if (data === undefined) {
      emit({ event: "load", requestId, ok: false });
      return;
    }
    emit({ event: "load", requestId, ok: true, data });
  };

  const save = async (requestId: number, data?: string): Promise<void> => {
    if (!provider) {
      emit({ event: "save", requestId, ok: false, reason: "unavailable" });
      return;
    }
    if (typeof data !== "string") {
      emit({ event: "save", requestId, ok: false, reason: "error" });
      return;
    }
    // Byte length, not character count — a hero named in kanji costs more than
    // its length suggests, and the provider's ceiling is in bytes.
    const bytes = byteLength(data);
    if (bytes > provider.maxBytes) {
      emit({ event: "save", requestId, ok: false, reason: "too-large" });
      return;
    }
    const ok = await provider.save(SAVE_KEY, data);
    emit({
      event: "save",
      requestId,
      ok,
      ...(ok ? {} : { reason: "error" as const }),
    });
  };

  const handle = (request: CloudRequest): void => {
    watch();
    const requestId = request.requestId ?? 0;
    switch (request.action) {
      case "init":
        break; // the hello; watching is enough
      case "status":
        void status(requestId);
        break;
      case "load":
        void load(requestId);
        break;
      case "save":
        void save(requestId, request.data);
        break;
    }
  };

  return {
    handle,
    stop: () => {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

/** UTF-8 byte length of a string. */
function byteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // surrogate pair — count it once, skip its low half
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}
