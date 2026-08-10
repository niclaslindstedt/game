// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENTRY CHUNK, AND ALL IT IS ALLOWED TO BE: the studio card, and the fetch
// of everything behind it.
//
// The app used to enter at `App.tsx`, which meant the first script a player
// waited on carried the title menu, its settings/mods/vault screens, the sky,
// the paper doll, the character roster, the parked-run reader, the engine's
// item and difficulty catalogs and the whole sprite atlas — ~139 KB gzipped
// before a single pixel could be drawn. None of that is needed to draw the
// card, and the card is up for a second or three anyway (`splash.ts`), so all
// of it now arrives DURING the card instead of before it. The entry is the card
// plus the pixel font it is drawn in; `warmBoot` fetches the rest in parallel
// and the card refuses to lift until it has landed (`SplashScreen` `warm`), so
// the menu is exactly as finished when the card clears as it was before.
//
// Which makes the split invisible to the player and load-bearing for the
// budget: `pwa/scripts/check-seo.mjs` now weighs BOTH paths — the card alone
// against the 170 KB critical-path budget, and the card plus the whole app
// shell against a MENU-READY budget that is the old number. The second one is
// what still catches a startup module reaching back through `@game/core`.
//
// THE CARD OWNS ITS OWN LIFETIME AND NOTHING ELSE. It is decided once from the
// URL, never re-raised, and the app underneath it does not know it exists.

import { Suspense, lazy, useEffect, useState } from "react";

import { ErrorBoundary } from "@ui/lib/ErrorBoundary.tsx";

import { loadAppShell } from "./app-shell.ts";
import { LoadingScreen } from "./game/LoadingScreen.tsx";
import { markSplashSettled, splashWanted } from "./game/splash.ts";
import { SplashScreen } from "./game/SplashScreen.tsx";

// Through `loadAppShell` rather than a bare `import()` so this and `warmBoot`
// name the same specifier and share one chunk and one fetch.
const App = lazy(() => loadAppShell().then((m) => ({ default: m.App })));

// The app shell itself failed to arrive — a stale page against a fresh deploy,
// a flaky network, a stale native webroot. Plain DOM and a system font on
// purpose: the game's own assets are in the chunk that did not come.
function BootError() {
  return (
    <div className="run-load-error">
      <p>The game failed to load.</p>
      <button type="button" onClick={() => window.location.reload()}>
        RELOAD
      </button>
    </div>
  );
}

export function Boot() {
  // Decided ONCE, from the URL, and never re-asked: a harness driving the app
  // gets no card at all (see `splashWanted`), and the flag only ever falls to
  // false — a card is an opening, not a screen the app can return to.
  const [splash, setSplash] = useState(() =>
    splashWanted(window.location.search),
  );

  // Tell the menu underneath that the card is out of its way — the moment it
  // clears, or on the first commit of a launch that never raises one. What is
  // waiting is everything the card is NOT buying, the title theme above all
  // (see `splashSettled`).
  useEffect(() => {
    if (!splash) markSplashSettled();
  }, [splash]);

  return (
    <>
      {/* THE FALLBACK IS FOR THE IMPATIENT PLAYER, and it is the only thing
          they can be shown. The card takes a press as soon as it has been up
          long enough to read — it does NOT make them wait for the game to be
          warm first — so a tap on a slow connection can clear it while the app
          shell is still on the wire. Behind the card that leaves this on
          screen; the menu replaces it the moment its chunk lands, and hands
          straight on to its OWN copy of it while the atlas finishes decoding,
          so the two read as one screen rather than as a flicker. */}
      <ErrorBoundary fallback={<BootError />}>
        <Suspense fallback={<LoadingScreen />}>
          <App />
        </Suspense>
      </ErrorBoundary>

      {/* LAST in the tree, so the menu above it has already mounted (and
          installed its listeners, the title theme's arrival unlock included)
          by the time the card's own effects run. */}
      {splash && <SplashScreen onDone={() => setSplash(false)} />}
    </>
  );
}
