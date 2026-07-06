// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { statSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from "vite";

import { cacheIdForBase } from "./src/app/pwa.ts";

// Hand-rolls the game's service worker at build time so the deployed app is an
// installable, self-updating, offline-first PWA. The pattern follows the
// oss-framework demo (`demo/pwa-plugin.ts`): the framework's `usePwaUpdate`
// hook owns the update state machine and the prompt UI, and only needs three
// emitted files plus one cache-naming convention — cheaper than pulling a
// Workbox toolchain in for.
//
// What the hook (@niclaslindstedt/oss-framework/pwa) expects, and what we emit:
//   - `${base}sw.js`                  a "prompt to update" worker (installs,
//                                     parks in `waiting`, never auto-skips)
//   - `${base}version.json`           `{ version }` shown in the update toast
//   - `${base}precache-manifest.json` `{ totalBytes, assets }` driving the fill
//   - a Cache Storage entry named `<cacheId>-precache`
//
// THREE SLOTS, ONE ORIGIN. The game deploys to `/game/` (release),
// `/game/preview/` (main), and `/game/branch/` (a parked branch) on the
// GitHub Pages origin. Each slot gets its own worker (scoped to its base) and
// its own precache id. The release worker's scope (`/game/`) also covers the
// sibling slots nested under it, so it carries a navigation denylist and
// refuses to answer their navigations, letting each slot boot its own shell
// and worker.

// The deploy slots `pages.yml` serves, in priority order. Mirror that file.
export const DEPLOY_SLOTS = ["/game/", "/game/preview/", "/game/branch/"];

type GamePwaOptions = {
  // The bundler base (`/game/`, `/game/preview/`, `/game/branch/`, or `/` for
  // local builds). Drives the SW scope, the emitted file URLs, and — via
  // `cacheIdForBase` — the precache name.
  base: string;
  // Label shown in the "a new version is ready" toast (short commit sha or a
  // build timestamp). Embedding it in the SW also guarantees the worker's
  // bytes differ between deploys even when no asset hash changed.
  version: string;
  // All deploy-slot bases sharing this origin. Defaults to `DEPLOY_SLOTS`.
  slots?: string[];
};

// Public assets we never want in the precache: source maps are dead weight
// offline, and the OG card is only ever fetched by link unfurlers.
const PUBLIC_SKIP = new Set(["og-default.png"]);

// Secondary slots must never be indexed (§11.5.1): only the production slot
// carries an indexable robots meta.
function robotsContentForBase(base: string): string {
  const isSecondary = base.endsWith("/preview/") || base.endsWith("/branch/");
  return isSecondary
    ? "noindex,nofollow"
    : "index,follow,max-image-preview:large";
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function buildServiceWorker(
  cacheId: string,
  base: string,
  version: string,
  precache: string[],
  denylist: string[],
): string {
  const cacheName = `${cacheId}-precache`;
  return `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GENERATED — do not edit. Emitted by website/pwa-plugin.ts. A minimal
// "prompt to update" precaching worker: it installs the build's assets, parks
// in \`waiting\` (never auto-skipWaiting — a silent swap would destroy a run
// in progress), and applies on a SKIP_WAITING message from the update toast.
// Build: ${version}
const CACHE = ${JSON.stringify(cacheName)};
const BASE = ${JSON.stringify(base)};
const INDEX = ${JSON.stringify(`${base}index.html`)};
const PRECACHE = ${JSON.stringify(precache)};
const PRECACHE_PATHS = new Set(
  PRECACHE.map((u) => new URL(u, self.location.href).pathname),
);
// Sibling deploy slots nested under this worker's scope (e.g. \`/game/preview/\`
// for the \`/game/\` release worker). Navigations into them are NOT ours.
const DENY = ${JSON.stringify(denylist)};

self.addEventListener("install", (event) => {
  // Populate the precache one entry at a time so the window-side progress
  // poller (usePwaUpdate) watches the fill advance as bytes land. No
  // skipWaiting: park in \`waiting\` until the user accepts the prompt.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of PRECACHE) {
        try {
          await cache.add(new Request(url, { cache: "reload" }));
        } catch {
          // A single asset failing to cache must not abort the whole install.
        }
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Drop precache entries from older builds that are no longer wanted.
      for (const req of await cache.keys()) {
        if (!PRECACHE_PATHS.has(new URL(req.url).pathname)) {
          await cache.delete(req);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App-shell navigations: serve the cached index for any in-scope route so
  // the installed PWA opens offline, falling back to the network then the
  // shell (the offline navigateFallback).
  if (req.mode === "navigate") {
    // A sibling slot nested under our scope: never answer it, or this slot's
    // shell would shadow the other build. Let it reach the network so that
    // slot boots its own shell and registers its own worker.
    if (DENY.some((p) => url.pathname.startsWith(p))) return;
    if (!url.pathname.startsWith(BASE)) return;
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (
          (await cache.match(INDEX)) ||
          fetch(req).catch(() => cache.match(INDEX))
        );
      })(),
    );
    return;
  }

  // Precached assets: cache-first (they are content-hashed, so safe to pin).
  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) || fetch(req);
      })(),
    );
  }
});
`;
}

export function gamePwa({
  base,
  version,
  slots = DEPLOY_SLOTS,
}: GamePwaOptions): Plugin {
  const cacheId = cacheIdForBase(base);
  // Sibling slots that fall inside our scope — nested under `base` but not
  // `base` itself. For `/game/` this is `/game/preview/` + `/game/branch/`;
  // for either of those it's empty.
  const denylist = slots.filter((s) => s !== base && s.startsWith(base));
  let config: ResolvedConfig;

  return {
    name: "game-pwa",
    apply: "build",
    // Run after Vite's own build plugins so the generated `index.html` is
    // already in the bundle when we collect assets for the precache.
    enforce: "post",

    configResolved(resolved) {
      config = resolved;
    },

    // Wire the manifest, icons, robots policy, and iOS install metadata into
    // the shell. Done here (not in index.html) so every slot gets
    // base-correct hrefs and the correct per-slot robots meta (§11.5.1) from
    // a single source of truth.
    transformIndexHtml(): HtmlTagDescriptor[] {
      return [
        {
          tag: "meta",
          attrs: { name: "robots", content: robotsContentForBase(base) },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: { rel: "manifest", href: `${base}manifest.webmanifest` },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: {
            rel: "sitemap",
            type: "application/xml",
            href: `${base}sitemap.xml`,
          },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: `${base}icon.svg`,
            type: "image/svg+xml",
          },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: `${base}apple-touch-icon-180x180.png`,
          },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "mobile-web-app-capable", content: "yes" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: {
            name: "apple-mobile-web-app-status-bar-style",
            content: "black-translucent",
          },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-title", content: "Game" },
          injectTo: "head",
        },
      ];
    },

    // After the bundle is built, collect every emitted asset plus the public
    // assets and emit the worker + the two manifests the update hook reads.
    generateBundle(_options, bundle) {
      const assets: Record<string, number> = {};

      const add = (urlPath: string, bytes: number) => {
        assets[urlPath] = bytes;
      };

      // Hashed build output (JS, CSS, the HTML shell, any emitted assets).
      for (const [fileName, output] of Object.entries(bundle)) {
        const bytes =
          output.type === "chunk"
            ? Buffer.byteLength(output.code)
            : typeof output.source === "string"
              ? Buffer.byteLength(output.source)
              : output.source.byteLength;
        add(`${base}${fileName}`, bytes);
      }

      // Public assets (icons, the web manifest) — copied verbatim by Vite, so
      // they are not in `bundle`; read their sizes off disk. Skip source maps
      // and unfurler-only assets.
      const publicDir = config.publicDir;
      if (publicDir) {
        for (const file of listFiles(publicDir)) {
          const rel = relative(publicDir, file).split(sep).join(posix.sep);
          if (PUBLIC_SKIP.has(rel) || rel.endsWith(".map")) continue;
          add(`${base}${rel}`, statSync(file).size);
        }
      }

      const precache = Object.keys(assets);
      const totalBytes = Object.values(assets).reduce((a, b) => a + b, 0);

      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: buildServiceWorker(cacheId, base, version, precache, denylist),
      });
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version }, null, 2)}\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "precache-manifest.json",
        source: `${JSON.stringify({ totalBytes, assets }, null, 2)}\n`,
      });
    },
  };
}
