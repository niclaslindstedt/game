// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import type { Difficulty } from "@game/core";

import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";

import { cacheIdForBase } from "./app/pwa.ts";
import { GameScreen } from "./game/GameScreen.tsx";
import { TitleScreen } from "./game/TitleScreen.tsx";

// The app shell: splash main menu ↔ the playable game. The menu screen also
// owns the PWA update lifecycle so a new deploy can never silently reload
// mid-run.
export function App() {
  // The run's difficulty, chosen on the menu; null = still on the menu.
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  // Register the deploy slot's service worker (§11.4.3) and track its update
  // lifecycle. The framework hook performs the actual
  // `navigator.serviceWorker.register(...)` via workbox-window, registering
  // `${base}sw.js` on every page load. In dev (`enabled: false`) it stays
  // idle and registers nothing. The cache id is derived from the deploy-slot
  // base so each of `/game/`, `/game/preview/`, and `/game/branch/` owns a
  // distinct precache on the shared origin (see ./app/pwa.ts).
  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV,
  });

  if (difficulty) {
    return (
      <GameScreen difficulty={difficulty} onQuit={() => setDifficulty(null)} />
    );
  }

  return (
    <>
      <TitleScreen onStart={setDifficulty} />

      {/* The framework's "a new version is ready" prompt (§11.4.4), fed from
          the service worker reaching `waiting`. Applying reloads onto the new
          build; dismissing leaves it parked. */}
      <UpdateToast
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        onReload={() => pwa.reload()}
        onDismiss={() => pwa.dismiss()}
      />
    </>
  );
}
