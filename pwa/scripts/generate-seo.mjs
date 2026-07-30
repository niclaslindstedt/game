#!/usr/bin/env node
// Post-build SEO generator (§11.3). Runs after `vite build` and emits the
// discovery files the spec mandates into dist/:
//
//   - sitemap.xml — every public route the project wants indexed
//   - robots.txt  — `Allow: /` plus an absolute Sitemap: line
//   - llms.txt    — §11.3.6 AI-crawler index per llmstxt.org
//   - 404.html    — noindex SPA-fallback shell for unknown URLs
//
// Only the production slot is indexed; the pages workflow serves this dist/
// at the site root, and secondary slots (/preview/, /branch/)
// carry a noindex robots meta injected by pwa-plugin.ts.

import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import identity from "../../game.config.json" with { type: "json" };
import { lastModified } from "./library/git-dates.mjs";
import { libraryRoutes } from "./library/model.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
// Single source of truth for the domain/title lives in game.config.json.
const SITE_URL = identity.siteUrl;

if (!existsSync(DIST)) {
  console.error("generate-seo: dist/ is missing — run `vite build` first");
  process.exit(1);
}

/**
 * THE LIBRARY (docs/architecture.md, "/library/") — the generated companion site under
 * `/library/`. Its routes are enumerated from the same model that renders them
 * (`libraryRoutes`), never listed by hand: a page without a sitemap entry is
 * a page that doesn't get crawled, and an entry without a page is a URL that
 * 404s — check-seo fails the build on either, and the only way to make both
 * impossible is for the two to come from one list.
 *
 * Each entry keeps the git-derived `lastmod` rule the rest of this file uses,
 * dated from the YAML that page is compiled out of — so a monster's page says
 * it changed when that monster last actually changed.
 */
function librarySitemapUrls() {
  return libraryRoutes().map((route) => ({
    loc: `${SITE_URL}/library/${route.path ? `${route.path}/` : ""}`,
    lastmod: lastModified(route.sources),
    changefreq: "monthly",
    // Below the game itself, above the store-mandated documents: these are the
    // pages the site actually wants found for a long-tail search.
    priority: route.path ? "0.5" : "0.6",
    images: libraryImagesFor(route.path),
  }));
}

/**
 * Every picture this library route owns, for the sitemap's `image:` block.
 *
 * Two kinds, and a route may carry either or both: the DROP SHOT a bestiary or
 * arsenal page is illustrated with, and — for the mission guide and the story
 * chapter that shares its venue — the MISSION MAP, the whole level drawn with
 * the game's own sprites (pwa/scripts/library/map-render.mjs).
 *
 * The map is the reason this function replaced a drop-shot-only one. It is the
 * single most distinctive image the site owns for a venue, it was already being
 * emitted and rendered on the page, and it was reaching Google Images by no
 * route at all: an `<img>` deep in a page's body is discovered opportunistically
 * at best, and `og:image` is not an image-discovery surface.
 */
function libraryImagesFor(path) {
  if (!path) return [];
  return [...dropShotFor(path), ...missionMapFor(path)];
}

/**
 * The DROP SHOT this route carries, if it has one — the picture of the subject
 * standing on the venue it comes from (pwa/scripts/library/drop-shot.mjs).
 *
 * Listing it is what puts it in front of Google Images, which does not discover
 * images from `og:image` and is not guaranteed to reach one from the page alone.
 *
 * The existence check is not belt-and-braces, it is the rule. A monster with no
 * home venue has no map to stand on and so gets no shot; and the pictures are a
 * DEPLOY-TIME step (see `LIBRARY_IMAGES_DIR`), so an ordinary CI build has none
 * of them at all. A sitemap advertising an image that 404s costs more than the
 * entry is worth. This runs after the library build in the same npm script, so
 * whatever exists is on disk to be asked about.
 */
function dropShotFor(path) {
  if (!path) return [];
  const slug = path.replace(/\//g, "-");
  return existsSync(join(DIST, "library", "shots", `${slug}.webp`))
    ? [`${SITE_URL}/library/shots/${slug}.webp`]
    : [];
}

/**
 * The MISSION MAP a `missions/<slug>` or `story/<slug>` route is drawn with.
 *
 * Both sections key off the level id, so the two routes that describe one venue
 * name the same file — deliberately: the map IS the picture of that venue, and
 * a chapter about the moon illustrated by the moon is the honest entry.
 *
 * Existence-checked like the drop shots, and for a live reason rather than
 * caution: the story section carries a chapter (`the-hellborn`) that belongs to
 * no level and so has no map, and maps are only emitted for levels the mission
 * model actually renders.
 */
function missionMapFor(path) {
  const m = /^(?:missions|story)\/(.+)$/.exec(path);
  if (!m) return [];
  return existsSync(join(DIST, "library", "maps", `${m[1]}.png`))
    ? [`${SITE_URL}/library/maps/${m[1]}.png`]
    : [];
}

/** Slot-root images (pwa/public/), kept to the ones this build really emitted. */
function siteImages(names) {
  return names
    .filter((name) => existsSync(join(DIST, name)))
    .map((name) => `${SITE_URL}/${name}`);
}

const SITEMAP_URLS = [
  {
    // The game itself. Its "content" is the whole app: the engine, the app
    // shell, and the authored content catalogs the build compiles in. Brand
    // strings live in game.config.json, which feeds the title and description
    // this very page is indexed on.
    loc: `${SITE_URL}/`,
    lastmod: lastModified(["src", "pwa/src", "content", "game.config.json"]),
    changefreq: "weekly",
    priority: "1.0",
    // The two install-prompt screenshots are REAL frames of the running game
    // (`make screenshots`), which makes them the only pictures on the site that
    // show what playing it looks like — and until now the site's most important
    // URL was the one advertising no image at all. `og:image` doesn't count:
    // it feeds unfurlers, and Google Images does not discover from it.
    images: siteImages([
      "og-default.png",
      "screenshot-wide.png",
      "screenshot-narrow.png",
    ]),
  },
  {
    // The privacy policy (pwa/src/PrivacyPage.tsx, emitted to `privacy/` by
    // pwa-plugin.ts). It is the URL the App Store and Play Console require, so
    // it must stay reachable and indexable — check-seo asserts every emitted
    // HTML file appears here, which is what keeps the two in step.
    loc: `${SITE_URL}/privacy/`,
    lastmod: lastModified(["pwa/src/PrivacyPage.tsx"]),
    changefreq: "yearly",
    priority: "0.3",
  },
  {
    // The contact/support page (pwa/src/ContactPage.tsx). App Store Connect
    // requires a support URL and rejects a bare `mailto:`, so the address needs
    // a page to live on.
    loc: `${SITE_URL}/contact/`,
    lastmod: lastModified(["pwa/src/ContactPage.tsx"]),
    changefreq: "yearly",
    priority: "0.3",
  },
  ...librarySitemapUrls(),
];

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderSitemap() {
  const body = SITEMAP_URLS.map((u) => {
    const images = (u.images ?? [])
      .map(
        (src) =>
          `\n    <image:image>\n      <image:loc>${escapeXml(src)}</image:loc>\n    </image:image>`,
      )
      .join("");
    return (
      `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n` +
      `    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n` +
      `    <changefreq>${u.changefreq}</changefreq>\n` +
      `    <priority>${u.priority}</priority>${images}\n  </url>`
    );
  }).join("\n");
  // The `image` namespace is declared whether or not any entry uses it — an
  // undeclared prefix makes the whole document invalid XML, and the set of
  // routes carrying a shot is decided at runtime.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `${body}\n</urlset>\n`
  );
}

function renderRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

// §11.3.6 — AI crawlers (Claude, Perplexity, ChatGPT) look for an llms.txt at
// the site root. Generated from the same URL list the sitemap uses.
function renderLlmsTxt() {
  return [
    `# ${identity.title}`,
    "",
    `> ${identity.description}`,
    "",
    "## App",
    "",
    `- [Play the game](${SITE_URL}/): the deployed game — production slot, latest release`,
    `- [Privacy policy](${SITE_URL}/privacy/): what the game stores, and why nothing reaches a server of ours`,
    `- [Contact and support](${SITE_URL}/contact/): how to reach a human about a bug or a purchase`,
    "",
    "## Reference",
    "",
    `- [The library](${SITE_URL}/library/): the game's own reference material, compiled from the same content the game runs on`,
    // No source-repository entry, deliberately: the site does not advertise
    // where the code lives. It is public and findable, but through a search
    // rather than a link from here.
    `- [Bestiary](${SITE_URL}/library/bestiary/): every monster — health, damage, where it spawns, what it drops, one page each`,
    `- [Arsenal](${SITE_URL}/library/arsenal/): every item — the base types and the named chase relics stacked on them, with damage, armor, level requirements, make quality and drop sources`,
    `- [Talents](${SITE_URL}/library/talents/): every passive talent — what each of its ranks buys, which stat pays for it, and how the three trees are earned and spent`,
    `- [Powers](${SITE_URL}/library/powers/): every powerup — what each does, its numbers, how long it runs, whether it stacks, and which venues drop it`,
    `- [Missions](${SITE_URL}/library/missions/): every level — what it fields on each difficulty, its roster, its loot pool, its powers and its map`,
    `- [Errands](${SITE_URL}/library/errands/): every side quest and the people who hand them out — what each asks for, what it pays, and which errand it opens next`,
    `- [Story](${SITE_URL}/library/story/): the whole plot, a chapter per mission — every cutscene, monologue, arrival scene and piece of found lore, as the game plays them`,
    "",
  ].join("\n");
}

// §11.3.1 — a noindex SPA-fallback shell so unknown URLs neither soft-404 nor
// leak into the index. GitHub Pages serves 404.html for unmatched paths.
function render404() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Not found — ${identity.title}</title>
    <meta name="description" content="This page does not exist. The game itself lives at the site root and works offline once loaded." />
    <meta name="robots" content="noindex,follow" />
    <link rel="canonical" href="${SITE_URL}/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Not found — ${identity.title}" />
    <meta property="og:description" content="This page does not exist. The game itself lives at the site root." />
    <meta property="og:url" content="${SITE_URL}/" />
    <meta property="og:image" content="${SITE_URL}/og-default.png" />
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
             background: #0b0d10; color: #e6e8eb;
             font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      main { max-width: 32rem; padding: 2rem; text-align: center; line-height: 1.6; }
      a { color: #7ef0c8; }
    </style>
  </head>
  <body>
    <main>
      <h1>There is nothing here</h1>
      <p>
        The page you were looking for does not exist — maybe it was never
        spawned, or maybe it did not survive. The game itself lives at the
        site root and is fully playable offline once it has loaded.
      </p>
      <p><a href="${SITE_URL}/">Back to the game</a></p>
    </main>
  </body>
</html>
`;
}

writeFileSync(join(DIST, "sitemap.xml"), renderSitemap());
writeFileSync(join(DIST, "robots.txt"), renderRobots());
writeFileSync(join(DIST, "llms.txt"), renderLlmsTxt());
writeFileSync(join(DIST, "404.html"), render404());
console.log("generate-seo: wrote sitemap.xml, robots.txt, llms.txt, 404.html");
