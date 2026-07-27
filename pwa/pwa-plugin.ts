// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { statSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import type { IndexHtmlTransformResult, Plugin, ResolvedConfig } from "vite";

import { cacheIdForBase } from "./src/app/pwa.ts";
import { IDENTITY, FULL_TITLE } from "./src/identity.ts";

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
// THREE SLOTS, ONE ORIGIN. The game deploys to `/` (release), `/preview/`
// (main), and `/branch/` (a parked branch) on one origin (the identity
// `siteUrl`). Each
// slot gets its own worker (scoped to its base) and its own precache id. The
// release worker's scope (`/`) also covers the sibling slots nested under
// it, so it carries a navigation denylist and refuses to answer their
// navigations, letting each slot boot its own shell and worker.

// The deploy slots `pages.yml` serves, in priority order. Mirror that file.
export const DEPLOY_SLOTS = ["/", "/preview/", "/branch/"];

// THE LIBRARY (docs/library-plan.md): static reference documents emitted under
// each slot by `pwa/scripts/library/build.mjs`, AFTER this plugin has run. They
// are deliberately outside the app — no bundle, no JavaScript — which makes them
// the one in-scope path this slot's worker must keep its hands off: the
// navigation handler below answers every in-scope navigation with the cached
// app shell, so without this the game would shadow all four hundred of them and
// a reader clicking a search result would get the title screen.
const LIBRARY_PATH = "library/";

type GamePwaOptions = {
  // The bundler base (`/`, `/preview/`, or `/branch/`; local builds also use
  // `/`). Drives the SW scope, the emitted file URLs, and — via
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
// offline, the OG card is only ever fetched by link unfurlers, and the install
// prompt's screenshots are read by the BROWSER before the app is installed —
// the game itself never requests any of them, so precaching would spend ~90 KB
// of every player's offline budget on images they will never see.
const PUBLIC_SKIP = new Set([
  "og-default.png",
  "screenshot-narrow.png",
  "screenshot-wide.png",
]);

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

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Fill the `{{TOKEN}}` placeholders in index.html from the identity config so
// every brand-shaped string in the shell has one source of truth
// (game.config.json). Runs at build time — dev never renders the shell.
function fillIdentityTokens(html: string): string {
  const tokens: Record<string, string> = {
    TITLE: escapeHtml(IDENTITY.title),
    FULL_TITLE: escapeHtml(FULL_TITLE),
    TAGLINE: escapeHtml(IDENTITY.tagline),
    DESCRIPTION: escapeHtml(IDENTITY.description),
    SITE_URL: IDENTITY.siteUrl,
    REPO_URL: IDENTITY.repoUrl,
    AUTHOR_NAME: escapeHtml(IDENTITY.author.name),
    AUTHOR_URL: IDENTITY.author.url,
    OG_IMAGE_ALT: escapeHtml(IDENTITY.ogImageAlt),
    // JSON, not HTML text — this one lands inside the JSON-LD block, so it is
    // serialised rather than entity-escaped (a `&amp;` there would be a parse
    // error, not an escape).
    GENRE_JSON: JSON.stringify(IDENTITY.genre),
    HERO_PARAGRAPHS: IDENTITY.heroParagraphs
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("\n        "),
  };
  return html.replace(
    /\{\{([A-Z_]+)\}\}/g,
    (match, key: string) => tokens[key] ?? match,
  );
}

// The DOCUMENT pages. Each is served by copying the built `index.html` and
// rewriting its head + prerendered body, so they cost one HTML file each and no
// second bundle; `main.tsx` reads `location.pathname` and mounts the matching
// component. Without the rewrite a copy would inherit the game's title,
// description, and — worst — a canonical pointing at `/`, which tells search
// engines the document IS the home page.
//
// Both URLs are required by the app stores: a privacy policy, and a support
// page because App Store Connect rejects a bare `mailto:`. They therefore have
// to be real, indexable pages rather than aliases. Keep this table in step with
// the path switch in `main.tsx` and the sitemap in `scripts/generate-seo.mjs`.
const DOC_PAGES = [
  {
    slug: "privacy",
    // schema.org has no privacy-policy type; a plain WebPage `about` the game
    // is the accurate description of what this document is.
    schemaType: "WebPage",
    title: `Privacy policy — ${IDENTITY.title}`,
    description: `How ${IDENTITY.title} handles your data: no account, no analytics, no backend — saves stay on your device, and sync only through your own iCloud.`,
    body: () => `<p>${escapeHtml(IDENTITY.title)} runs entirely on your own device. There is no account, no sign-up, no backend of ours, no cookies, and no analytics or tracking. Your heroes, settings, and progress are stored on the device you play on, and we never receive them.</p>
            <p>In the installed app your roster can be carried between your own devices through your own iCloud account, and purchases are handled by the App Store or Google Play — never by us.</p>`,
  },
  {
    slug: "contact",
    schemaType: "ContactPage",
    title: `Contact and support — ${IDENTITY.title}`,
    description: `Support for ${IDENTITY.title} — report a bug, ask about a purchase, or get help with your heroes.`,
    body: () => `<p>Support for ${escapeHtml(IDENTITY.title)}. Questions, bugs, crashes, problems with a purchase, or anything about your saved heroes all go to one address, read by a person.</p>
            <p>Coin packs are sold and refunded by Apple or Google rather than by us, and the game keeps your progress on your own device.</p>`,
  },
];

// The prerendered body for a document page. Crawlers (and a no-JS reader) get
// the gist without running the app, which is also what keeps check-seo's
// "substantive body" rule satisfied; React swaps in the full page.
function renderDocShell(page: DocPage): string {
  return `<main class="prelaunch">
        <div class="prelaunch-console">
          <h1 class="prelaunch-title">${escapeHtml(page.title.split(" — ")[0] ?? page.title)}</h1>
          <div class="prelaunch-brief">
            ${page.body()}
          </div>
        </div>
      </main>`;
}

/**
 * A document page's own JSON-LD node. It describes THIS document and points at
 * the game through `about`/`isPartOf` rather than restating it, so the game
 * keeps exactly one `@id` across the site (`{siteUrl}/#game`) and the two
 * documents read as pages belonging to it.
 *
 * `<` for `<` because the block is inlined into HTML: a literal `</script>`
 * anywhere inside the JSON would close the tag early. JSON.stringify does not
 * escape it, so we do — check-seo un-escapes before parsing.
 */
function renderDocJsonLd(page: DocPage, canonical: string): string {
  const node = {
    "@context": "https://schema.org",
    "@type": page.schemaType,
    "@id": `${canonical}#page`,
    url: canonical,
    name: page.title,
    description: page.description,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      "@id": `${IDENTITY.siteUrl}/#website`,
      url: `${IDENTITY.siteUrl}/`,
      name: IDENTITY.title,
    },
    // The one cross-page reference, and the point of the whole node: this
    // document is ABOUT the game defined on the home page. A bare `@id` is how
    // a site-wide graph is linked; everything else here resolves locally.
    about: { "@id": `${IDENTITY.siteUrl}/#game` },
  };
  const json = JSON.stringify(node, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n    </script>`;
}

/** One document page served alongside the game (see `DOC_PAGES`). */
type DocPage = {
  slug: string;
  /** schema.org @type for the page's own JSON-LD (see `renderDocJsonLd`). */
  schemaType: string;
  title: string;
  description: string;
  /** Prerendered body HTML — already escaped by the caller. */
  body: () => string;
};

// Turn the built `index.html` into a document page's shell: same hashed asset
// URLs (so nothing has to be rewritten or re-bundled), its own head metadata,
// and its own prerendered body.
function renderDocHtml(indexHtml: string, base: string, page: DocPage): string {
  const canonical = `${IDENTITY.siteUrl}${base}${page.slug}/`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  return (
    indexHtml
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(
        /(<meta\s+name="description"\s+content=")[^"]*(")/,
        `$1${description}$2`,
      )
      .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${canonical}$2`)
      .replace(
        /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
        `$1${title}$2`,
      )
      .replace(
        /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
        `$1${description}$2`,
      )
      .replace(
        /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
        `$1${canonical}$2`,
      )
      .replace(
        /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
        `$1${title}$2`,
      )
      .replace(
        /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
        `$1${description}$2`,
      )
      // The VideoGame JSON-LD describes the game, not this document — two pages
      // claiming the same @id is worse than none. Swap in the page's OWN node,
      // which points back at the game rather than impersonating it.
      .replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        renderDocJsonLd(page, canonical),
      )
      .replace(/<main class="prelaunch">[\s\S]*?<\/main>/, renderDocShell(page))
  );
}

// The web manifest, generated from identity so `name`/`short_name`/
// `description` cannot drift from the shell. Icon paths are asset-shaped
// (regenerated by `make icons`), not identity, so they stay literal here.
function renderManifest(): string {
  const manifest = {
    name: FULL_TITLE,
    short_name: IDENTITY.shortName,
    description: IDENTITY.shortDescription,
    id: "./",
    start_url: "./",
    scope: "./",
    // iOS has no fullscreen display mode — a manifest asking for it gets the
    // app letterboxed with a dead black band over the home-indicator area
    // instead of falling back cleanly. `standalone` (+ viewport-fit=cover and
    // the black-translucent status bar meta) is what actually draws
    // edge-to-edge on iOS; Chromium browsers that do support true fullscreen
    // still get it via display_override.
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    lang: "en",
    categories: ["games", "entertainment"],
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    // Real frames of the running game, captured by scripts/generate-screenshots.mjs
    // (`make screenshots`) — Chrome shows these in the richer install prompt, so
    // they are a promise about what the player is about to get and must not be
    // marketing art. `form_factor` decides which prompt they appear in: `narrow`
    // is the reference landscape phone, `wide` a desktop window. Asset-shaped
    // like the icons, so the paths stay literal here.
    screenshots: [
      {
        src: "screenshot-narrow.png",
        sizes: "844x390",
        type: "image/png",
        form_factor: "narrow",
        label: "Holding off the horde on the moon's surface",
      },
      {
        src: "screenshot-wide.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "Holding off the horde on the moon's surface",
      },
    ],
    icons: [
      { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      {
        src: "pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
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
// GENERATED — do not edit. Emitted by pwa/pwa-plugin.ts. A minimal
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
// Paths nested under this worker's scope whose navigations are NOT ours: the
// sibling deploy slots (e.g. \`/preview/\` for the \`/\` release worker) and the
// library's static documents, which must never be answered with the app shell.
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
  // Paths inside our scope whose navigations this worker must not answer: the
  // sibling slots nested under `base` but not `base` itself (for `/` that is
  // `/preview/` + `/branch/`; for either of those it's empty), plus this slot's
  // own library (see `LIBRARY_PATH`).
  const denylist = [
    ...slots.filter((s) => s !== base && s.startsWith(base)),
    `${base}${LIBRARY_PATH}`,
  ];
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
    transformIndexHtml(html): IndexHtmlTransformResult {
      return {
        html: fillIdentityTokens(html),
        tags: [
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
            attrs: {
              name: "apple-mobile-web-app-title",
              content: IDENTITY.shortName,
            },
            injectTo: "head",
          },
        ],
      };
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

      // Public assets (icons) — copied verbatim by Vite, so they are not in
      // `bundle`; read their sizes off disk. Skip source maps and
      // unfurler-only assets.
      const publicDir = config.publicDir;
      if (publicDir) {
        for (const file of listFiles(publicDir)) {
          const rel = relative(publicDir, file).split(sep).join(posix.sep);
          if (PUBLIC_SKIP.has(rel) || rel.endsWith(".map")) continue;
          add(`${base}${rel}`, statSync(file).size);
        }
      }

      // The identity-driven web manifest is emitted below (not a public file),
      // so account for it explicitly and precache it like any shell asset.
      const manifestSource = renderManifest();
      add(`${base}manifest.webmanifest`, Buffer.byteLength(manifestSource));

      // The document pages (`/privacy/`, `/contact/`) the app stores require.
      // Each is the built shell with its own head + prerendered body
      // (`renderDocHtml`), loading the very same hashed assets, so they cost one
      // HTML file each and no second bundle. Emitted here rather than in their
      // own plugin so their bytes land in the precache alongside everything
      // else and the pages work offline (and inside the native app's local
      // server) like the game does.
      const index = bundle["index.html"];
      const docs =
        index && index.type === "asset"
          ? DOC_PAGES.map((page) => ({
              page,
              source: renderDocHtml(String(index.source), base, page),
            }))
          : [];
      for (const { page, source } of docs) {
        add(`${base}${page.slug}/index.html`, Buffer.byteLength(source));
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
        fileName: "manifest.webmanifest",
        source: manifestSource,
      });
      for (const { page, source } of docs) {
        this.emitFile({
          type: "asset",
          fileName: `${page.slug}/index.html`,
          source,
        });
      }
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
