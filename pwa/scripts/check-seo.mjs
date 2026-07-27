#!/usr/bin/env node
// §11.3.10 — structural SEO check. Walks every HTML file under `dist/`
// after the build and asserts the signals Search Console, social-card
// unfurlers, and AI crawlers actually read. Failures emit GitHub
// Actions `::error::` annotations so the line surfaces inline on the
// PR file view; the script exits non-zero if anything fails.
//
// Run locally with `npm run check:seo` after a build, or wire into CI
// after `npm run build`. The point of this script is to make the
// failure modes the spec calls out (empty SSR body, missing canonical,
// JSON-LD that doesn't parse, BlogPosting.image drift from og:image,
// sitemap.xml that drops a route) impossible to ship silently.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import identity from "../../game.config.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
const SITE_URL = identity.siteUrl;

const findings = [];
const err = (file, message) => findings.push({ level: "error", file, message });
const warn = (file, message) =>
  findings.push({ level: "warning", file, message });

function walkHtml(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const textOf = (html) => html.replace(/<[^>]+>/g, " ");
const bodyOf = (html) => {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  return m ? m[1] : null;
};
const attr = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

function checkHtmlFile(file) {
  const rel = relative(DIST, file).replace(/\\/g, "/");
  const html = readFileSync(file, "utf8");
  const is404 = rel === "404.html";

  // §11.3.1 — prerendered body must contain substantive content.
  const body = bodyOf(html);
  if (!body) {
    err(rel, "no <body> tag");
  } else {
    const words = textOf(body).split(/\s+/).filter(Boolean).length;
    if (words < 20)
      err(
        rel,
        `<body> has only ${words} words — looks like an empty SPA shell`,
      );
  }

  // §11.3.5 — exactly one <h1>, no skipped heading levels.
  const h1Count = (body ?? html).match(/<h1[\s>]/g)?.length ?? 0;
  if (h1Count === 0) err(rel, "missing <h1>");
  else if (h1Count > 1)
    warn(rel, `${h1Count} <h1> tags — only one should describe the page topic`);
  if (body) {
    const seen = new Set();
    for (const m of body.matchAll(/<h([1-6])[\s>]/g)) seen.add(Number(m[1]));
    const levels = [...seen].sort((a, b) => a - b);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        warn(
          rel,
          `heading levels skip from h${levels[i - 1]} to h${levels[i]} — Lighthouse / a11y flag`,
        );
        break;
      }
    }
  }

  // §11.3.2 — <title>, meta description, canonical, robots.
  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (!title || !title.trim()) err(rel, "missing or empty <title>");
  else if (title.length > 70)
    warn(rel, `<title> is ${title.length} chars — Google truncates around 60`);

  const desc = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/);
  if (!desc || !desc.trim()) err(rel, "missing or empty meta description");
  else if (desc.length > 160)
    warn(
      rel,
      `meta description is ${desc.length} chars — Google truncates around 160`,
    );

  const canonical = attr(html, /<link\s+rel="canonical"\s+href="([^"]+)"/);
  if (!canonical) err(rel, "missing canonical link");
  else if (!canonical.startsWith(SITE_URL))
    err(rel, `canonical \`${canonical}\` is not absolute under ${SITE_URL}`);

  const robots = attr(html, /<meta\s+name="robots"\s+content="([^"]+)"/);
  if (!robots) err(rel, "missing robots meta");
  else if (is404) {
    if (!/\bnoindex\b/.test(robots)) err(rel, "404.html must have noindex");
  } else if (/\bnoindex\b/.test(robots))
    err(rel, `real page has \`noindex\` (\`${robots}\`) — it won't be indexed`);

  // §11.3.2 / §11.3.3 — og:image must resolve to a real file; if a
  // JSON-LD block carries an Article-shaped image, it must match.
  const ogImage = attr(html, /<meta\s+property="og:image"\s+content="([^"]+)"/);
  if (!ogImage) {
    err(rel, "missing og:image");
  } else if (ogImage.startsWith(`${SITE_URL}/`)) {
    const local = join(DIST, ogImage.slice(SITE_URL.length + 1));
    if (!existsSync(local))
      err(rel, `og:image \`${ogImage}\` doesn't exist in dist/`);
  }

  const jsonLdBlocks = [
    ...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g),
  ];
  for (const block of jsonLdBlocks) {
    const raw = block[1].replace(/\\u003c/g, "<");
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      err(rel, `JSON-LD block doesn't parse: ${e.message}`);
      continue;
    }
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      const type = item && typeof item === "object" ? item["@type"] : undefined;
      if (
        type === "BlogPosting" ||
        type === "TechArticle" ||
        type === "Article"
      ) {
        const rawImg = item.image;
        const imageUrl =
          typeof rawImg === "string"
            ? rawImg
            : rawImg &&
                typeof rawImg === "object" &&
                typeof rawImg.url === "string"
              ? rawImg.url
              : undefined;
        if (imageUrl && ogImage && imageUrl !== ogImage)
          err(
            rel,
            `${type} JSON-LD image \`${imageUrl}\` doesn't match og:image \`${ogImage}\``,
          );
      }
    }
  }

  // §11.3 — every <img> needs alt + width + height + loading.
  if (body) {
    for (const img of body.match(/<img\b[^>]*>/g) ?? []) {
      const altMatch = img.match(/\balt="([^"]*)"/);
      if (!altMatch) err(rel, `<img> without alt: ${img.slice(0, 80)}…`);
      if (!/\bwidth="/.test(img) || !/\bheight="/.test(img))
        warn(
          rel,
          `<img> missing width/height (layout shift risk): ${img.slice(0, 80)}…`,
        );
      if (!/\bloading="/.test(img))
        warn(rel, `<img> without loading attribute: ${img.slice(0, 80)}…`);
    }
  }
}

function checkSitemap(htmlFiles) {
  const sitemapPath = join(DIST, "sitemap.xml");
  if (!existsSync(sitemapPath)) {
    err("sitemap.xml", "sitemap.xml is missing");
    return;
  }
  const sitemap = readFileSync(sitemapPath, "utf8");
  for (const file of htmlFiles) {
    const rel = relative(DIST, file).replace(/\\/g, "/");
    if (rel === "404.html") continue;
    const slug =
      rel === "index.html" ? "/" : `/${rel.replace(/\/index\.html$/, "/")}`;
    const loc = `${SITE_URL}${slug}`;
    if (!sitemap.includes(`<loc>${loc}</loc>`))
      err("sitemap.xml", `missing entry for ${loc}`);
  }
}

function checkRobotsTxt() {
  const robotsPath = join(DIST, "robots.txt");
  if (!existsSync(robotsPath)) {
    err("robots.txt", "robots.txt is missing");
    return;
  }
  const robots = readFileSync(robotsPath, "utf8");
  if (!/Sitemap:\s*https?:\/\//i.test(robots))
    err("robots.txt", "missing `Sitemap:` line pointing at sitemap.xml");
  if (/Disallow:\s*\/\s*$/m.test(robots))
    err("robots.txt", "`Disallow: /` blocks the entire site from indexing");
}

function checkLlmsTxt() {
  const llmsPath = join(DIST, "llms.txt");
  if (!existsSync(llmsPath)) {
    err("llms.txt", "llms.txt is missing");
    return;
  }
  const llms = readFileSync(llmsPath, "utf8");
  if (!/^#\s+\S/m.test(llms))
    err("llms.txt", "missing top-level `# Site title` heading");
}

function checkBundleBudgets() {
  // §11.3.9 — critical-path JS budget. Anything the entry HTML preloads
  // counts as critical; lazy chunks reached through a runtime import()
  // do not. The render-heavy game code lives in the lazy GameScreen chunk, so
  // the critical path is the title/menu shell.
  //
  // This crept 600k → 664k over several content drops and was then parked at a
  // TEMPORARY 1000k, because the app's startup path imported the whole engine
  // through the `@game/core` barrel: the title menu wanted `levelDef`, and one
  // module graph away sat `createGame`, the step pipeline, the autopilot, the
  // loot roller, the spawners and the enemy catalog. Splitting the engine off
  // the menu shell — the fix that note called overdue — landed as `@game/menu`
  // (src/menu.ts): the startup path now reaches the CATALOGS and nothing that
  // simulates, and the budget came back DOWN past every earlier raise.
  //
  // What stays eager is the level and equipment catalogs the menus genuinely
  // read (the difficulty ladder, the level picker, a saved hero's gear), so
  // this still grows with content — but a jump of more than a KB or two now
  // means something reached back through `@game/core` from the startup path,
  // and the fix is to move that import to `@game/menu` (or make its screen
  // lazy), not to nudge this number.
  //
  // The budget is GZIPPED bytes, not bytes on disk, because that is the unit
  // Google's guidance is written in and the only one a player's connection
  // actually pays: web.dev's performance-budget advice is ≤ 170 KB of
  // compressed critical-path JavaScript, the figure behind a ~5 s
  // time-to-interactive on a slow 3G phone — this game's reference device. Both
  // GitHub Pages and the native shell's local server serve compressed, and gzip
  // is the conservative floor (brotli, which every modern browser negotiates,
  // lands ~15% under it). The raw figure is still reported for context.
  //
  // Headroom is DELIBERATELY thin: the next content drop that pushes past 170 KB
  // should split the level catalog's map geometry (`spawners`/`spawns`/`walls`
  // and the rest of the run-only fields are ~70% of `generated/levels.ts`, and
  // no menu reads a single one of them) out of the eager catalog, the same way
  // `generated/uniques.ts` was split off the item catalog. That is the next real
  // win, and it is worth more than this budget's whole current margin.
  const BUDGET_BYTES = 170 * 1024;
  const assetsDir = join(DIST, "assets");
  if (!existsSync(assetsDir)) return;
  const indexHtml = join(DIST, "index.html");
  if (!existsSync(indexHtml)) return;
  const html = readFileSync(indexHtml, "utf8");
  const critical = new Set();
  for (const m of html.matchAll(
    /<(?:script[^>]*src|link[^>]*href)="(\/assets\/[^"]+\.js)"/g,
  )) {
    critical.add(m[1]);
  }
  let total = 0;
  let raw = 0;
  for (const url of critical) {
    const file = join(DIST, url.replace(/^\//, ""));
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    raw += bytes.length;
    total += gzipSync(bytes, { level: 9 }).length;
  }
  const summary =
    `critical-path JS is ${(total / 1024).toFixed(1)} KB gzipped ` +
    `(${(raw / 1024).toFixed(1)} KB raw) across ${critical.size} chunk(s)`;
  if (total > BUDGET_BYTES) {
    err(
      "dist/assets",
      `${summary} — exceeds the ${(BUDGET_BYTES / 1024).toFixed(0)} KB compressed budget`,
    );
  } else {
    process.stdout.write(
      `check-seo: ${summary} — within the ${(BUDGET_BYTES / 1024).toFixed(0)} KB compressed budget\n`,
    );
  }
}

function main() {
  if (!existsSync(DIST)) {
    process.stderr.write(
      "check-seo: dist/ is missing — run `npm run build` first\n",
    );
    process.exit(1);
  }

  const htmlFiles = walkHtml(DIST);
  if (htmlFiles.length === 0) err("dist/", "no HTML files found");
  for (const file of htmlFiles) checkHtmlFile(file);

  checkSitemap(htmlFiles);
  checkRobotsTxt();
  checkLlmsTxt();
  checkBundleBudgets();

  const errors = findings.filter((f) => f.level === "error");
  const warnings = findings.filter((f) => f.level === "warning");

  for (const f of findings) {
    const prefix = f.level === "error" ? "::error" : "::warning";
    process.stdout.write(`${prefix} file=pwa/dist/${f.file}::${f.message}\n`);
  }
  process.stdout.write(
    `check-seo: ${htmlFiles.length} page(s) checked — ${errors.length} error(s), ${warnings.length} warning(s)\n`,
  );
  if (errors.length > 0) process.exit(1);
}

main();
