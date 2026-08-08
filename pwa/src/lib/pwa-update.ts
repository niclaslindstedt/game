// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useSyncExternalStore } from "react";

import type { Workbox } from "workbox-window";

export type PwaUpdateCheckResult =
  "update-found" | "up-to-date" | "unavailable";
type Config = { base: string; cacheId: string; enabled?: boolean };
type State = {
  progress: number | null;
  needRefresh: boolean;
  incomingVersion: string | null;
  checking: boolean;
};

let state: State = {
  progress: null,
  needRefresh: false,
  incomingVersion: null,
  checking: false,
};
const listeners = new Set<() => void>();
let workbox: Workbox | null = null;
let registration: ServiceWorkerRegistration | null = null;
let config: Config | null = null;
let started = false;
let applying = false;

function update(patch: Partial<State>): void {
  const next = { ...state, ...patch };
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  for (const listener of listeners) listener();
}

async function incomingVersion(base: string): Promise<string | null> {
  try {
    const response = await fetch(`${base}version.json`, { cache: "no-store" });
    const data: unknown = response.ok ? await response.json() : null;
    return data &&
      typeof data === "object" &&
      "version" in data &&
      typeof data.version === "string"
      ? data.version
      : null;
  } catch {
    return null;
  }
}

function start(): void {
  if (started) return;
  started = true;
  if (!config || config.enabled === false || !("serviceWorker" in navigator))
    return;
  const { base } = config;
  void import("workbox-window").then(({ Workbox }) => {
    const instance = new Workbox(`${base}sw.js`, {
      scope: base,
      type: "classic",
      updateViaCache: "none",
    });
    workbox = instance;
    instance.addEventListener("waiting", () => {
      update({ progress: 100, needRefresh: true });
      void incomingVersion(base).then((version) =>
        update({ incomingVersion: version }),
      );
    });
    instance.addEventListener("controlling", (event) => {
      if (applying || event.isUpdate) window.location.reload();
    });
    void instance.register().then((value) => {
      if (!value) return;
      registration = value;
      void value.update();
      window.setInterval(
        () => {
          if (document.visibilityState === "visible") void value.update();
        },
        60 * 60 * 1000,
      );
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void value.update();
      });
    });
  });
}

async function check(base: string): Promise<PwaUpdateCheckResult> {
  if (state.needRefresh) return "update-found";
  if (!registration) return "unavailable";
  update({ checking: true });
  try {
    await registration.update();
  } catch {
    return "unavailable";
  } finally {
    update({ checking: false });
  }
  if (registration.waiting) {
    update({ progress: 100, needRefresh: true });
    void incomingVersion(base).then((version) =>
      update({ incomingVersion: version }),
    );
    return "update-found";
  }
  return registration.installing ? "update-found" : "up-to-date";
}

export function usePwaUpdate(updateConfig: Config) {
  config ??= updateConfig;
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      start();
      return () => listeners.delete(listener);
    },
    // No third argument: that slot is `getServerSnapshot`, read only when a
    // server-rendered tree is HYDRATED, and this app never hydrates — the
    // prerendered boot shell is static HTML that `createRoot()` renders over
    // (main.tsx). It was unreachable under React too, and `preact/compat`
    // does not take it.
    () => state,
  );
  return {
    ...snapshot,
    reload: () => {
      applying = true;
      workbox?.messageSkipWaiting();
    },
    dismiss: () => update({ needRefresh: false, progress: null }),
    checkForUpdate: () => check(config?.base ?? updateConfig.base),
  };
}
