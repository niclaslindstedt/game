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

/**
 * THE ONE THING THESE PAGES ASK FOR: get the app.
 *
 * A library page's job is to be found and then to send the reader somewhere,
 * and the somewhere is the STORE build — the same game plus the things a
 * browser cannot give it (Taptic haptics, an audio session that plays through
 * the ringer switch, Game Center, and a roster and coin bank that follow the
 * player between their own devices).
 *
 * It renders NOTHING until `appStoreUrl` is filled in (game.config.json, the
 * one identity source). Four hundred pages carrying a dead link, or a guessed
 * one, is worse than four hundred pages carrying none — and turning them all on
 * the day the app ships is that single field.
 */
export function storeNudge(lead = "") {
  if (!identity.appStoreUrl) return "";
  return `${lead}<a href="${escapeHtml(identity.appStoreUrl)}">Get ${escapeHtml(TITLE)} on the App Store</a> — the whole game, with haptics, Game Center, and heroes that follow you between devices.`;
}

export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** JSON safe to inline in a `<script>` — a literal `</script>` would close it. */
const jsonLd = (node) => JSON.stringify(node, null, 2).replace(/</g, "\\u003c");

/**
 * The card a page unfurls as when it has no subject art of its own — the index
 * pages, the mission guide, the story chapters. The bestiary and arsenal pages
 * each build their own (og-card.mjs) and pass it in.
 *
 * `cardFor` is what a renderer calls to name one. It exists so that ONE value
 * reaches both the `og:image` tag and the JSON-LD `image` property: check-seo
 * fails the build when an Article's schema image disagrees with its `og:image`,
 * and the way to never trip it is for the two never to be written separately.
 */
export const DEFAULT_CARD = {
  url: `${SITE_URL}/og-default.png`,
  width: 1200,
  height: 630,
  alt: identity.ogImageAlt,
};

/** A page's own card: `{ url, width, height, alt }` for the given slug + alt. */
export function cardFor(base, slug, alt) {
  return {
    url: `${SITE_URL}${base}library/cards/${slug}.png`,
    width: 1200,
    height: 630,
    alt,
  };
}

/**
 * THE DROP SHOT on a page (drop-shot.mjs): the subject standing on the venue it
 * comes from, as a real `<img>` in the document.
 *
 * It is an `<img>` and not merely an `og:image` on purpose — Google Images ranks
 * what it finds IN the page, and reads the alt text and the caption beneath it
 * as the description of what the picture shows. So both are written to say the
 * thing a person would have searched for: the subject's name, what it is, and
 * where in the game it comes from.
 */
export function dropFigure({ src, alt, caption }) {
  return `      <figure class="drop-shot">
${img({ src, alt, width: 1200, height: 630, className: "drop-shot-img" })}
        <figcaption>${escapeHtml(caption)}</figcaption>
      </figure>`;
}

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
  ogImage = null,
  body,
  schema,
}) {
  const root = `${base}library/`;
  const canonical = `${SITE_URL}${root}${path ? `${path}/` : ""}`;
  const card = ogImage ?? DEFAULT_CARD;
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
    <meta property="og:image" content="${card.url}" />
    <meta property="og:image:width" content="${card.width}" />
    <meta property="og:image:height" content="${card.height}" />
    <meta property="og:image:alt" content="${escapeHtml(card.alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${head}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${card.url}" />
    <meta name="twitter:image:alt" content="${escapeHtml(card.alt)}" />
    <script type="application/ld+json">
${jsonLd(graphFor(schema, crumbs))}
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
          with it, so it cannot drift.${storeNudge(" ")}
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
 * whole site rather than four hundred pages each claiming to be it. Both ids
 * (`#website`, `#game`) are DEFINED by the home page's own `@graph` — see the
 * JSON-LD block in `pwa/index.html`; renaming one there orphans every page here.
 */
export function pageSchema({ type, canonical, name, description, image }) {
  // `Article` is the type these reference entries claim, and Google reads an
  // Article's `headline`/`author` before it reads anything else on it. Left off,
  // the markup parses and then says nothing — so the two are filled in here
  // rather than at four hundred call sites, and by REFERENCE to the author node
  // the home page declares, not by restating a name.
  const isArticle = type === "Article";
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${canonical}#page`,
    url: canonical,
    name,
    ...(isArticle ? { headline: name } : {}),
    description,
    inLanguage: "en",
    ...(image ? { image } : {}),
    ...(isArticle
      ? {
          author: { "@id": `${SITE_URL}/#author` },
          publisher: { "@id": `${SITE_URL}/#author` },
        }
      : {}),
    isPartOf: {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: TITLE,
    },
    about: { "@id": `${SITE_URL}/#game` },
  };
}

/**
 * The page's schema plus a `BreadcrumbList` built from THE VERY CRUMBS THE PAGE
 * DRAWS — the same array `page()` renders into the visible trail, so the two can
 * never disagree. Google wants the markup to describe the breadcrumb the reader
 * actually sees, and the way to guarantee that is to have one source, not two;
 * a hand-maintained second copy would drift the first time a section moved.
 *
 * The labels go in verbatim, uppercase and all, for the same reason. The final
 * crumb is the current page and carries no `href`, which is exactly the item
 * Google says to leave without an `item` URL — so the shapes line up already.
 *
 * A page with no crumbs (the library landing page) gets no list rather than a
 * one-item one: a breadcrumb trail to the page you are on is not a trail.
 */
function graphFor(schema, crumbs) {
  if (crumbs.length === 0) return schema;
  const { "@context": context, ...page } = schema;
  return {
    "@context": context,
    "@graph": [
      page,
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: crumb.label,
          ...(crumb.href ? { item: `${SITE_URL}${crumb.href}` } : {}),
        })),
      },
    ],
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
