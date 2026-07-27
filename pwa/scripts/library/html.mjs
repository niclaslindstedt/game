// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page shell: the head every library page carries, and the small handful of
// markup helpers the renderers build bodies out of.
//
// A library page is a DOCUMENT. It links one stylesheet, loads one webfont, and
// runs NO JavaScript — not the game's bundle, not a router, not a byte. That is
// the constraint the whole exercise rests on: these pages exist to be found, and
// a reference table that downloads a game engine to render itself does not get
// found.

import identity from "../../../game.config.json" with { type: "json" };

export const SITE_URL = identity.siteUrl;
export const TITLE = identity.title;

export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** JSON safe to inline in a `<script>` — a literal `</script>` would close it. */
const jsonLd = (node) => JSON.stringify(node, null, 2).replace(/</g, "\\u003c");

/**
 * Secondary deploy slots must never be indexed (§11.5.1) — `/preview/library/`
 * competing with `/library/` would be the library losing to itself.
 */
const robotsFor = (base) =>
  base.endsWith("/preview/") || base.endsWith("/branch/")
    ? "noindex,nofollow"
    : "index,follow,max-image-preview:large";

/**
 * One complete page.
 *
 * `path` is the route under `/library/` (`""` for the landing page); every URL
 * on the page is built from it plus the deploy slot's `base`, so the same
 * generator output is correct at `/`, `/preview/` and `/branch/`.
 */
export function page({
  base,
  path,
  title,
  description,
  heading,
  crumbs = [],
  ground = null,
  body,
  schema,
}) {
  const root = `${base}library/`;
  const canonical = `${SITE_URL}${root}${path ? `${path}/` : ""}`;
  const head = escapeHtml(title);
  const desc = escapeHtml(description);
  const crumbHtml = crumbs.length
    ? `<nav class="crumb" aria-label="Breadcrumb">${crumbs
        .map((c) =>
          c.href
            ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`
            : `<span>${escapeHtml(c.label)}</span>`,
        )
        .join(" &raquo; ")}</nav>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#0b0d10" />
    <title>${head}</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="${robotsFor(base)}" />
    <link rel="stylesheet" href="${root}library.css" />
    <link rel="icon" href="${base}icon.svg" type="image/svg+xml" />
    <meta property="og:site_name" content="${escapeHtml(TITLE)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${head}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_URL}/og-default.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(identity.ogImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${head}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${SITE_URL}/og-default.png" />
    <script type="application/ld+json">
${jsonLd(schema)}
    </script>
  </head>
  <body>
    <div class="ground" aria-hidden="true"${ground ? ` style="--ground: url('${ground}')"` : ""}></div>
    <div class="wrap">
      <header class="site-head">
        <a class="brand" href="${base}">${escapeHtml(TITLE)}</a>
        <nav class="site-nav" aria-label="Library">
          <a href="${root}"${path === "" ? ' aria-current="page"' : ""}>LIBRARY</a>
${["bestiary", "arsenal", "missions", "story"]
  .map(
    (section) =>
      `          <a href="${root}${section}/"${
        path === section || path.startsWith(`${section}/`)
          ? ' aria-current="page"'
          : ""
      }>${section.toUpperCase()}</a>`,
  )
  .join("\n")}
          <a href="${base}">PLAY</a>
        </nav>
      </header>
      ${crumbHtml}
      <main>
        <h1>${escapeHtml(heading)}</h1>
${body}
      </main>
      <footer class="site-foot">
        <p>
          Every number on this page is read out of the game itself and rebuilt
          with it, so it cannot drift. <a href="${base}">Play ${escapeHtml(TITLE)}</a> —
          free, offline, in your browser.
        </p>
      </footer>
    </div>
  </body>
</html>
`;
}

/**
 * The shared JSON-LD spine. Every page describes ITSELF and points at the game
 * through `about`/`isPartOf`, so the game keeps exactly one `@id` across the
 * whole site rather than four hundred pages each claiming to be it.
 */
export function pageSchema({ type, canonical, name, description, image }) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${canonical}#page`,
    url: canonical,
    name,
    description,
    inLanguage: "en",
    ...(image ? { image } : {}),
    isPartOf: {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: TITLE,
    },
    about: { "@id": `${SITE_URL}/#game` },
  };
}

/** An `<img>` with everything check-seo (and a good Core Web Vitals score) wants. */
export function img({
  src,
  alt,
  width,
  height,
  className,
  lazy = true,
  cssWidth,
}) {
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" height="${height}"${
    className ? ` class="${className}"` : ""
  }${cssWidth ? ` style="width:${cssWidth}"` : ""} loading="${lazy ? "lazy" : "eager"}" decoding="async" />`;
}

/** A table that scrolls inside its own box rather than making the page do it. */
export function table({ caption, head, rows }) {
  return `<div class="scroller">
  <table>
    ${caption ? `<caption>${escapeHtml(caption)}</caption>` : ""}
    <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead>
    <tbody>
${rows
  .map(
    (row) =>
      `      <tr>${row
        .map((cell, i) =>
          i === 0
            ? `<th scope="row">${cell}</th>`
            : `<td class="num">${cell}</td>`,
        )
        .join("")}</tr>`,
  )
  .join("\n")}
    </tbody>
  </table>
</div>`;
}

/**
 * The spoiler panel: a checkbox, a label, and the text — which is ALWAYS
 * rendered, only blurred. No `display: none`, no JavaScript, so the words are
 * in the DOM and indexed exactly like the rest of the page while a reader who
 * arrived cold has to choose to see them.
 */
/**
 * One switch that uncovers every panel below it. A story chapter is nothing but
 * covered panels, and asking a reader who has already finished the game to
 * click seven of them to read one chapter is a toll for no reason. It is the
 * same mechanism — a checkbox and a sibling selector — reaching further down
 * the page, so the words are still in the DOM either way, and each panel keeps
 * its own switch for a reader who wants only one of them.
 */
export function revealAll({ id, label }) {
  return `      <input class="reveal-all-toggle" type="checkbox" id="${escapeHtml(id)}" />
      <label class="reveal-label reveal-all-label" for="${escapeHtml(id)}"><span class="hidden">SHOW ${escapeHtml(label)}</span><span class="shown">HIDE ${escapeHtml(label)}</span></label>`;
}

export function reveal({ id, label, body }) {
  return `<div class="reveal">
  <input class="reveal-toggle" type="checkbox" id="${escapeHtml(id)}" />
  <label class="reveal-label" for="${escapeHtml(id)}"><span class="hidden">SHOW ${escapeHtml(label)}</span><span class="shown">HIDE ${escapeHtml(label)}</span></label>
  <div class="reveal-body">
${body}
  </div>
</div>`;
}
