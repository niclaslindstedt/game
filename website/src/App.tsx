// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";

import { cacheIdForBase } from "./app/pwa.ts";

// The title screen. This is deliberately NOT the game yet — the repository is
// scaffolding-only until gameplay work starts. The screen's job today is to
// prove the whole pipeline end-to-end: the engine alias resolves, the
// framework renders, the service worker installs, and the update toast fires
// on the next deploy.
export function App() {
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

  return (
    <main className="prelaunch">
      <h1>Game</h1>
      <p>
        A top-down survival scroller shooter that runs entirely in your browser
        — no account, no server, fully playable offline once loaded.
      </p>
      <p>
        You steer by holding the pointer down (or touching the screen); your
        character fights on its own, acting according to the weapons and items
        you pick up along the way. Survive the scroll as long as you can.
      </p>
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
