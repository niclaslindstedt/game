// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { statSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { IndexHtmlTransformResult, Plugin, ResolvedConfig } from "vite";

import {
  GENERATED_CAMPAIGN_ORDER,
  GENERATED_LEVEL_SUMMARIES,
} from "../src/generated/level-index.ts";
import { cacheIdForBase } from "./src/app/pwa.ts";
import {
  IDENTITY,
  FULL_TITLE,
  SOCIAL_TITLE,
  SEO_DESCRIPTION,
} from "./src/identity.ts";

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

// THE LIBRARY (docs/architecture.md, "/library/"): static reference documents emitted under
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
  // The bare semantic version (`0.1.0`), without the build ref `version`
  // carries. It is what the shell's JSON-LD reports as `softwareVersion`, which
  // wants the release the page describes and not this deploy's commit.
  appVersion: string;
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
function fillIdentityTokens(html: string, appVersion: string): string {
  const tokens: Record<string, string> = {
    TITLE: escapeHtml(IDENTITY.title),
    FULL_TITLE: escapeHtml(FULL_TITLE),
    TAGLINE: escapeHtml(IDENTITY.tagline),
    DESCRIPTION: escapeHtml(IDENTITY.description),
    // Search voice, not brand voice — these feed the meta description and the
    // social cards. See `GameIdentity.seo`. The `<title>` takes plain `TITLE`:
    // a tab has no room for a suffix (see `SOCIAL_TITLE`).
    SOCIAL_TITLE: escapeHtml(SOCIAL_TITLE),
    SEO_DESCRIPTION: escapeHtml(SEO_DESCRIPTION),
    SITE_URL: IDENTITY.siteUrl,
    REPO_URL: IDENTITY.repoUrl,
    AUTHOR_NAME: escapeHtml(IDENTITY.author.name),
    AUTHOR_URL: IDENTITY.author.url,
    OG_IMAGE_ALT: escapeHtml(IDENTITY.ogImageAlt),
    VERSION: escapeHtml(appVersion),
    // JSON, not HTML text — this one lands inside the JSON-LD block, so it is
    // serialised rather than entity-escaped (a `&amp;` there would be a parse
    // error, not an escape).
    GENRE_JSON: JSON.stringify(IDENTITY.genre),
    HERO_PARAGRAPHS: IDENTITY.heroParagraphs
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("\n        "),
    SHELL_SECTIONS: renderShellSections(),
    FAQ: renderFaq(),
    // JSON, like GENRE_JSON — this one lands inside the JSON-LD `@graph`.
    FAQ_JSON: JSON.stringify(faqSchema(), null, 2)
      .replace(/</g, "\\u003c")
      .split("\n")
      .join("\n          "),
  };
  return html.replace(
    /\{\{([A-Z_]+)\}\}/g,
    (match, key: string) => tokens[key] ?? match,
  );
}

/**
 * THE CAMPAIGN, NAMED, from the catalog the game itself runs on.
 *
 * The alternative was six venue names typed into `game.config.json`, and the
 * front page is the last surface that should be carrying a hand-copy of content
 * — a map renamed in its YAML would leave the old name on the most-linked URL
 * on the site, with nothing to fail. This reads the same generated summaries the
 * title menu's level picker reads.
 *
 * The campaign order only: the secret level is not something the front page
 * should be naming.
 */
function renderVenues(): string {
  const items = GENERATED_CAMPAIGN_ORDER.map((id) => {
    const summary = GENERATED_LEVEL_SUMMARIES[id];
    // Both constants come out of the same generator pass, so a campaign id with
    // no summary is a broken build, not a missing venue — say so rather than
    // quietly printing the front page one venue short.
    if (!summary) {
      throw new Error(
        `prelaunch: campaign level "${id}" has no entry in GENERATED_LEVEL_SUMMARIES`,
      );
    }
    return `<li><strong>${escapeHtml(summary.name)}</strong> — ${escapeHtml(summary.foes.toLowerCase())}</li>`;
  }).join("\n              ");
  return `<ul class="prelaunch-venues">\n              ${items}\n            </ul>`;
}

/**
 * The lists a shell section may ask for by name (`GameIdentity.sections`).
 *
 * A registry rather than an `if (section.list === "venues")` because the
 * failure that matters is a section naming a list that does not exist — a typo
 * in `game.config.json` that would otherwise render a section with its list
 * silently missing, on the front page, where nothing would ever catch it.
 */
const SHELL_LISTS: Record<string, () => string> = { venues: renderVenues };

/** The shell's body sections (`GameIdentity.sections`). */
function renderShellSections(): string {
  return IDENTITY.sections
    .map((section) => {
      const [lead, ...rest] = section.paragraphs.map(
        (p) => `<p>${escapeHtml(p)}</p>`,
      );
      const list = section.list ? SHELL_LISTS[section.list] : undefined;
      if (section.list && !list) {
        throw new Error(
          `prelaunch: section "${section.heading}" asks for unknown list "${section.list}"`,
        );
      }
      // The list sits between the first paragraph and the rest: the paragraph
      // above it introduces it, the ones below comment on it.
      const body = (list ? [lead, list(), ...rest] : [lead, ...rest]).join(
        "\n            ",
      );
      return `<section>
            <h2>${escapeHtml(section.heading)}</h2>
            ${body}
          </section>`;
    })
    .join("\n          ");
}

/**
 * The questions, as a description list.
 *
 * A `<dl>` rather than a run of headings because that is what this is — term
 * and definition — and because it keeps the shell's heading outline at one `h1`
 * and a flat row of `h2`s. Six questions rendered as `h3`s under an `h2` would
 * read identically and give a crawler an outline to walk that says nothing the
 * questions do not.
 */
function renderFaq(): string {
  const rows = IDENTITY.faq
    .map(
      (item) =>
        `<dt>${escapeHtml(item.q)}</dt>\n              <dd>${escapeHtml(item.a)}</dd>`,
    )
    .join("\n              ");
  return `<section>
            <h2>Questions</h2>
            <dl class="prelaunch-faq">
              ${rows}
            </dl>
          </section>`;
}

/**
 * The `FAQPage` node for the home page's `@graph`, built from the SAME `faq`
 * entries the shell renders — the whole point of structured data is that it
 * describes what is on the page, and two copies of a question is how it stops
 * doing that.
 */
function faqSchema(): unknown {
  return {
    "@type": "FAQPage",
    "@id": `${IDENTITY.siteUrl}/#faq`,
    isPartOf: { "@id": `${IDENTITY.siteUrl}/#website` },
    about: { "@id": `${IDENTITY.siteUrl}/#game` },
    mainEntity: IDENTITY.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
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
//
// IT ENDS IN LINKS, and that is not decoration either. These two pages are
// reached from the library's footer and from the sitemap, and until now they
// carried NOT ONE outbound link of their own — a reader who followed a store
// listing's privacy link landed on a page with no way onward but the back
// button, and a crawler landed on a leaf. They are the two pages a store review
// and a wary player both go looking for, so they are also the two most likely
// to be somebody's first sight of the site; a first page should lead somewhere.
function renderDocShell(base: string, page: DocPage): string {
  return `<main class="prelaunch">
        <div class="prelaunch-console">
          <h1 class="prelaunch-title">${escapeHtml(page.title.split(" — ")[0] ?? page.title)}</h1>
          <div class="prelaunch-brief">
            ${page.body()}
          </div>
          <nav class="prelaunch-links" aria-label="${escapeHtml(IDENTITY.title)}">
            <ul>
              <li><a href="${base}">Play ${escapeHtml(IDENTITY.title)}</a> — free in your browser, no account</li>
              <li><a href="${base}library/">The library</a> — every monster, item, venue and chapter</li>
            </ul>
          </nav>
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
      .replace(
        /<main class="prelaunch">[\s\S]*?<\/main>/,
        renderDocShell(base, page),
      )
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

/**
 * Does this navigation belong to somebody else — a sibling deploy slot, or this
 * slot's library — and so must the worker keep its hands off it?
 *
 * EXPORTED AND INLINED BY SOURCE (see `buildServiceWorker`), because a service
 * worker is a generated string and cannot import: writing the rule twice is how
 * it drifts. Keep it free of closures, or `toString()` ships something the
 * worker cannot run.
 *
 * The trailing-slash normalisation is the load-bearing part. Every deny entry
 * ends in "/", so a bare `/library` — which is what a person actually types —
 * did not match, and the worker answered it with the cached game.
 */
export function deniesNavigation(pathname: string, deny: string[]): boolean {
  const path = pathname.endsWith("/") ? pathname : pathname + "/";
  return deny.some((p) => path.startsWith(p));
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
// Inlined from pwa-plugin.ts so the rule has exactly one definition.
const deniesNavigation = ${deniesNavigation.toString()};

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
    // A sibling slot nested under our scope, or this slot's library: never
    // answer it, or this slot's shell would shadow the other build. Let it
    // reach the network so that slot boots its own shell and registers its own
    // worker.
    if (deniesNavigation(url.pathname, DENY)) return;
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

/**
 * INLINE THE BOOT SCREEN'S STYLESHEET, so the prerendered shell paints on the
 * first round trip.
 *
 * The `.prelaunch` markup in `index.html` exists to put real content in front
 * of a crawler and a no-JS reader without running the app — and it was then
 * made to wait on `/assets/index-*.css`, 180 KB of app stylesheet (36 KB over
 * the wire) of which it uses about two. On the reference device — a phone on a
 * slow connection, the same one the 170 KB critical-path budget is written for
 * — that is a second network round trip spent before anything is legible, on
 * the one screen whose entire job is to be legible early.
 *
 * `prelaunch.css` is not imported by `main.tsx`, so this is the only thing that
 * loads it and there is no second copy in the bundle. It applies to every shell
 * the build emits, the document pages included (`renderDocShell` wears the same
 * classes), because they are all copies of this one `index.html`.
 *
 * Its own plugin rather than a branch inside `gamePwa`: that one is
 * `apply: "build"`, and the shell is visible in dev too — for the moment before
 * React mounts, and for as long as you look at it with JS off. A boot screen
 * that is styled in production and bare in dev is a difference nobody wants to
 * discover from a screenshot.
 */
export function prelaunchCss(): Plugin {
  return {
    name: "game-prelaunch-css",
    // Ahead of `gamePwa`'s `enforce: "post"` transform, which is only a
    // question of tidiness — the two touch different parts of the document.
    enforce: "pre",
    transformIndexHtml(): IndexHtmlTransformResult {
      const css = readFileSync(
        fileURLToPath(new URL("./src/prelaunch.css", import.meta.url)),
        "utf8",
      );
      return [
        {
          tag: "style",
          // Vite does not minify an injected literal, and this is served on
          // every first visit — so strip the comments (all of which are for a
          // reader of the source, who has the source) and the indentation.
          children: minifyCss(css),
          injectTo: "head",
        },
      ];
    },
  };
}

/**
 * Enough CSS minification for one hand-written file: drop comments, collapse
 * runs of whitespace, tighten the punctuation.
 *
 * Deliberately not a parser, and therefore deliberately timid. It only ever
 * sees `prelaunch.css` — committed, reviewed, and free of the constructs that
 * would need one — but "free of them today" is not a licence to be clever, so
 * the rules here are the ones that stay correct next to a string literal.
 * `>` is NOT collapsed for exactly that reason: `.prelaunch-links li::before`
 * sets `content: "> "`, and eating the space inside those quotes would change
 * what the page renders. A child combinator keeps its spaces; nobody pays for
 * that but the gzip table.
 */
function minifyCss(css: string): string {
  return (
    css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([{};,])\s*/g, "$1")
      // Only the `prop: value` colon — a space either side of it is always
      // droppable. Left alone inside `::before` and `@media (a: b)` by the same
      // rule that makes it safe: it is matched with its trailing space, and
      // those have none to give.
      .replace(/:\s+/g, ":")
      .replace(/;}/g, "}")
      .trim()
  );
}

export function gamePwa({
  base,
  version,
  appVersion,
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
        html: fillIdentityTokens(html, appVersion),
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
