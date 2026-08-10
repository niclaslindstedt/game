// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ONE PLACE THE APP SHELL IS IMPORTED FROM.
//
// `App.tsx` is reached through a dynamic import, and it is reached by two
// callers that must not race each other into two chunks: `Boot.tsx` renders it
// (through `lazy`), and `SplashScreen.tsx` fetches it as the card goes up (so
// the menu is mounted and warm behind the card rather than after it). Both go
// through this function, so there is exactly one specifier, one chunk and one
// module promise — the second caller gets the first one's fetch for free.
//
// BOTH OF THOSE CALLERS ARE `.tsx`, AND THE POLICY MODULE BESIDE THEM IS NOT —
// which is why the fetch lives here and is called from the card's own effect
// rather than from `game/splash.ts`. That module is imported by
// `tests/splash_test.ts`, the root `tsconfig.json` (which covers `tests/`) sets
// no `jsx`, and a `.tsx` anywhere in that graph is a hard `TS6142` that only
// `make lint` reports. Keeping the renderer-free half renderer-free is the
// standing answer here, not a `jsx` setting added to the root config.

export function loadAppShell(): Promise<typeof import("./App.tsx")> {
  return import("./App.tsx");
}
