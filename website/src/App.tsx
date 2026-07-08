// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { CUTSCENE_DEFS, type Difficulty } from "@game/core";

import { usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";

import { cacheIdForBase } from "./app/pwa.ts";
import { CutscenePreview } from "./game/CutscenePreview.tsx";
import { GameScreen } from "./game/GameScreen.tsx";
import { TitleScreen } from "./game/TitleScreen.tsx";
import { UpdateModal } from "./game/UpdateModal.tsx";

// The app shell: splash main menu ↔ the playable game. The menu screen also
// owns the PWA update lifecycle so a new deploy can never silently reload
// mid-run.
export function App() {
  // The pending run: the difficulty and starting level chosen on the menu.
  // null = still on the menu.
  const [run, setRun] = useState<{
    difficulty: Difficulty;
    levelId: string;
    // Warp-in from the title moon's long-press: skip the prelude and intro
    // monologue and drop straight into the level.
    skipIntro?: boolean;
  } | null>(null);

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

  // The framework surfaces the update prompt from the service worker's
  // `waiting` event, which only fires for a worker that becomes waiting while
  // this page is open. A worker already parked in `waiting` when we load
  // (installed on a previous visit or in another tab) is missed, so the toast
  // never appears. checkForUpdate() reads `registration.waiting` directly and
  // flips needRefresh — poll it as the async registration settles after load,
  // and again whenever the tab regains focus.
  // `pwa.checkForUpdate` is a fresh closure each render; hold it in a ref so
  // the wiring below runs once instead of re-subscribing on every render.
  const checkForUpdateRef = useRef(pwa.checkForUpdate);
  useEffect(() => {
    checkForUpdateRef.current = pwa.checkForUpdate;
  });
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!cancelled) void checkForUpdateRef.current();
    };
    // Registration resolves asynchronously; retry a few times on load so an
    // already-waiting worker is caught once `registration` is available.
    const timers = [0, 1500, 4000].map((ms) => window.setTimeout(check, ms));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // The cutscene workbench (`?cutscene=<id>`): loop one scene from the
  // catalog with no run around it — the authoring iteration loop.
  const sceneId = new URLSearchParams(window.location.search).get("cutscene");
  if (sceneId && sceneId in CUTSCENE_DEFS) {
    return <CutscenePreview id={sceneId} />;
  }

  if (run) {
    return (
      <GameScreen
        difficulty={run.difficulty}
        levelId={run.levelId}
        skipIntro={run.skipIntro}
        onQuit={() => setRun(null)}
      />
    );
  }

  return (
    <>
      <TitleScreen
        onStart={(difficulty, levelId, opts) =>
          setRun({ difficulty, levelId, skipIntro: opts?.skipIntro })
        }
      />

      {/* The "a new version is ready" prompt (§11.4.4), fed from the service
          worker reaching `waiting`. A sprite-based panel (pixel font, upgrade
          sprite, chunky buttons) in place of the framework's plain toast so
          it fits the game. Applying reloads onto the new build; dismissing
          leaves it parked. `incomingVersion` is already the full label
          (`v0.1.0 · abc1234`, see website/vite.config.ts). */}
      <UpdateModal
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        onReload={() => pwa.reload()}
        onDismiss={() => pwa.dismiss()}
      />
    </>
  );
}
