// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared PWA wiring. The framework owns the update *state machine*
// (`usePwaUpdate`) and the prompt UI; this app owns the service-worker
// *build* (website/pwa-plugin.ts). The one value both sides must agree on is
// the precache cache id — the SW build names its cache `<cacheId>-precache`
// and the hook reads fill progress from a cache matching that prefix. This
// helper is imported by BOTH `App.tsx` (browser) and `pwa-plugin.ts` (the
// SW-emitting build plugin); keep it free of browser- or Node-only imports.
//
// The game deploys to three GitHub Pages slots on one origin (`/game/`,
// `/game/preview/`, `/game/branch/`). Service-worker scope keeps each slot's
// worker to its own path, but their precaches share Cache Storage, so each
// slot needs a DISTINCT cache id: `game`, `game-preview`, `game-branch`.

/** Per-deploy-slot precache cache id, derived from the bundler `base`. */
export function cacheIdForBase(base: string): string {
  const slug = base
    .replace(/^\/+|\/+$/g, "")
    .replace(/^game\/?/, "")
    .replace(/\W+/g, "-");
  return slug ? `game-${slug}` : "game";
}
