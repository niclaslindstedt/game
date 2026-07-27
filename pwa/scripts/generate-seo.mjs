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

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import identity from "../../game.config.json" with { type: "json" };
import { libraryRoutes } from "./library/model.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
const REPO = resolve(__dirname, "../..");
// Single source of truth for the domain/title lives in game.config.json.
const SITE_URL = identity.siteUrl;

if (!existsSync(DIST)) {
  console.error("generate-seo: dist/ is missing — run `vite build` first");
  process.exit(1);
}

// The build's own clock — the fallback `lastmod`, and NOT what we want to ship
// (see `lastModified`).
const BUILD_TIME = new Date().toISOString();

/**
 * When the content behind a URL last actually changed: the commit date of the
 * newest commit touching the sources that page is built from.
 *
 * Deliberately NOT the build time. Google uses `lastmod` only while it judges
 * the value "consistently and verifiably accurate", and stamping every URL with
 * the moment the build ran is the pattern that gets the whole field discarded —
 * this site rebuilds on every push to `main` (the `/preview/` slot) and on every
 * release, so a privacy policy nobody has touched since it was written was
 * claiming a fresh modification date several times a day, right next to a
 * `changefreq` of `yearly`. Once the signal is distrusted the GAME page loses it
 * too, which is the one page where "this really did change" is worth saying.
 *
 * Falls back to the build time when git can't answer — a tarball export, a
 * shallow clone with the relevant commit pruned, or a path with no history yet.
 * The deploy workflow checks out with `fetch-depth: 0`, so CI always can.
 */
function lastModified(paths) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", ...paths],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    // An untracked/never-committed path yields empty output, not an error.
    return out ? new Date(out).toISOString() : BUILD_TIME;
  } catch {
    return BUILD_TIME;
  }
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
    images: dropShotFor(route.path),
  }));
}

/**
 * The DROP SHOT this route carries, if it has one — the picture of the subject
 * standing on the venue it comes from (pwa/scripts/library/drop-shot.mjs).
 *
 * Listing it is what puts it in front of Google Images, which does not discover
 * images from `og:image` and is not guaranteed to reach one from the page alone.
 *
 * The existence check is not belt-and-braces, it is the rule: a monster with no
 * home venue has no map to stand on and so gets no shot, and a sitemap that
 * advertises an image which 404s costs more than the entry is worth. This runs
 * after the library build in the same npm script, so the files are on disk to
 * be asked about.
 */
function dropShotFor(path) {
  if (!path) return [];
  const slug = path.replace(/\//g, "-");
  return existsSync(join(DIST, "library", "shots", `${slug}.png`))
    ? [`${SITE_URL}/library/shots/${slug}.png`]
    : [];
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
    `- [Arsenal](${SITE_URL}/library/arsenal/): every item — the named chase relics and the base types under them, with damage, armor, level requirements, make quality and drop sources`,
    `- [Missions](${SITE_URL}/library/missions/): every level — what it fields on each difficulty, its roster, its loot pool, its powers and its map`,
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
