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

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
// Single source of truth for the domain/title lives in game.config.json.
const SITE_URL = identity.siteUrl;

if (!existsSync(DIST)) {
  console.error("generate-seo: dist/ is missing — run `vite build` first");
  process.exit(1);
}

const SITEMAP_URLS = [
  {
    loc: `${SITE_URL}/`,
    lastmod: new Date().toISOString(),
    changefreq: "weekly",
    priority: "1.0",
  },
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
  const body = SITEMAP_URLS.map(
    (u) =>
      `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
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
    "",
    "## Development",
    "",
    `- [Source repository](${identity.repoUrl}): TypeScript source, docs, and contribution guide`,
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
