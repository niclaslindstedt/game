// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";

import { cacheIdForBase } from "./app/pwa.ts";
import { GameScreen } from "./game/GameScreen.tsx";

// The app shell: title screen ↔ the playable game. The title screen also
// owns the PWA update lifecycle so a new deploy can never silently reload
// mid-run.
export function App() {
  const [playing, setPlaying] = useState(false);

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

  if (playing) {
    return <GameScreen onQuit={() => setPlaying(false)} />;
  }

  return (
    <main className="prelaunch">
      <h1>Game</h1>
      <p>
        A top-down survival shooter that runs entirely in your browser — no
        account, no server, fully playable offline once loaded.
      </p>
      <p>
        <strong>Hold</strong> the pointer (or touch) to steer; your character
        fires at the nearest slime on its own. Grab medkits to stay alive, and
        clear every slime from the level to win.
      </p>
      <button
        type="button"
        className="pixel-button start-button"
        onClick={() => setPlaying(true)}
      >
        Start game
      </button>
      <p>
        The game is an installable Progressive Web App: add it to your home
        screen from the browser menu and it launches fullscreen, works offline,
        and updates itself when a new build ships.
      </p>
      <p>
        Source code and development docs live in the{" "}
        <a href="https://github.com/niclaslindstedt/game">GitHub repository</a>.
      </p>
      <p className="build-label">
        v{__APP_VERSION__} · {__BUILD_COMMIT__}
      </p>

      {/* The framework's "a new version is ready" prompt (§11.4.4), fed from
          the service worker reaching `waiting`. Applying reloads onto the new
          build; dismissing leaves it parked. */}
      <UpdateToast
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        onReload={() => pwa.reload()}
        onDismiss={() => pwa.dismiss()}
      />
    </main>
  );
}
