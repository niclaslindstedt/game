#!/usr/bin/env node
// Post-build site files. Runs after `vite build` and the library, and emits
// into dist/:
//
//   - robots.txt — `Allow: /` and nothing else
//   - 404.html   — a noindex fallback page for unknown URLs
//
// THE SITE IS NOT MEANT TO BE FOUND through a search engine: every page carries
// `noindex`, and there is no sitemap and no llms.txt, by owner decision.
// robots.txt still ALLOWS crawling on purpose — a crawler has to fetch a page
// to read its `noindex`, and one barred at the door can still list a URL it
// already knows.

import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import identity from "../../game.config.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
// Single source of truth for the domain/title lives in game.config.json.
const SITE_URL = identity.siteUrl;

if (!existsSync(DIST)) {
  console.error(
    "generate-site-files: dist/ is missing — run `vite build` first",
  );
  process.exit(1);
}

function renderRobots() {
  return `User-agent: *\nAllow: /\n`;
}

// §11.3.1 — a noindex fallback page so unknown URLs neither soft-404 nor
// leak into an index. GitHub Pages serves 404.html for unmatched paths.
function render404() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Not found — ${identity.title}</title>
    <meta name="description" content="This page does not exist. The game itself lives at the site root and works offline once loaded." />
    <meta name="robots" content="noindex" />
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

writeFileSync(join(DIST, "robots.txt"), renderRobots());
writeFileSync(join(DIST, "404.html"), render404());
console.log("generate-site-files: wrote robots.txt, 404.html");
