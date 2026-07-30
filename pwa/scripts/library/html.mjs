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
import { escapeHtml } from "./escape.mjs";
import { firstPublished, lastModified } from "./git-dates.mjs";
import { libraryRoutes } from "./model.mjs";

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
 * It renders NOTHING until `appStoreUrl` or `steamUrl` is filled in
 * (game.config.json, the one identity source). Four hundred pages carrying a
 * dead link, or a guessed one, is worse than four hundred pages carrying none —
 * and turning them all on the day the app ships is those two fields.
 *
 * Each store is pitched on what IT adds, because they do not add the same
 * thing: the phone build brings haptics, Game Center and a roster that follows
 * the player between devices; the desktop build brings Steam Cloud and Steam
 * achievements, and is bought once with no coin store in it.
 */
export function storeNudge(lead = "") {
  const pitches = [];
  if (identity.appStoreUrl) {
    pitches.push(
      `<a href="${escapeHtml(identity.appStoreUrl)}">Get ${escapeHtml(TITLE)} on the App Store</a> — the whole game, with haptics, Game Center, and heroes that follow you between devices.`,
    );
  }
  if (identity.steamUrl) {
    pitches.push(
      `<a href="${escapeHtml(identity.steamUrl)}">Get ${escapeHtml(TITLE)} on Steam</a> — the whole game on Windows, macOS and Linux, with Steam Cloud saves and achievements.`,
    );
  }
  if (pitches.length === 0) return "";
  return `${lead}${pitches.join(" ")}`;
}

export { escapeHtml };

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
 * WHEN THIS PAGE FIRST APPEARED AND WHEN IT LAST CHANGED, keyed by route.
 *
 * Google reads `dateModified` off an Article before it reads the body, and the
 * honest answer already exists: the sitemap dates every URL by the commit that
 * last touched the content it is compiled from. Reading it from the SAME
 * `libraryRoutes()` list the sitemap enumerates means the two can't disagree —
 * a page claiming one date in its markup and another in the sitemap is worse
 * than a page claiming neither.
 *
 * `datePublished` is the same question asked at the other end of the history
 * (`firstPublished`), and it is here because an Article that only says when it
 * changed has no age — the pair is what the field is read as.
 *
 * THE PAIR IS ORDERED BEFORE IT SHIPS. A page compiled from several sources can
 * be handed a first-add that post-dates its last-change — one source file gets
 * split or renamed, its ADD lands after an older sibling's last edit — and
 * "published after it was modified" is a contradiction a validator will call
 * out and a crawler is right to distrust. Where that happens the two collapse
 * to the one date that is certainly true.
 *
 * Built on first use, not at import: `libraryRoutes()` walks the whole model,
 * and the renderers import this module long before any of them has a page to
 * emit.
 */
let ROUTE_DATES = null;
function datesFor(path) {
  ROUTE_DATES ??= new Map(
    libraryRoutes().map((route) => {
      const modified = lastModified(route.sources);
      const published = firstPublished(route.sources);
      return [
        route.path,
        { modified, published: published > modified ? modified : published },
      ];
    }),
  );
  return ROUTE_DATES.get(path) ?? null;
}

/**
 * One complete page.
 *
 * `path` is the route under `/library/` (`""` for the landing page); every URL
 * on the page is built from it plus the deploy slot's `base`, so the same
 * generator output is correct at `/`, `/preview/` and `/branch/`.
 *
 * THE HEADER'S FIRST ELEMENT IS THE WAY OUT, and it is not decoration.
 *
 * A library page is reached from inside the game — the title menu's LIBRARY row
 * is a real navigation out of the app — and the two builds that matter most have
 * NO BROWSER CHROME to come back with: the installed PWA and the native
 * WebView wrapper both render the page without an address bar or a back button.
 * An edge-swipe is the only gesture left there, and a reader four pages deep in
 * the bestiary should not have to know about it. So every page carries
 * the way back, unconditionally and in the same place — no display-mode
 * sniffing, because these pages run no JavaScript and a CSS `display-mode`
 * query answers `browser` inside a plain WebView anyway. A browser reader gets a
 * link they did not need; a native reader gets the only one they have.
 *
 * The header STICKS for the same reason: the escape hatch is worthless at the
 * top of a page the reader has scrolled a thousand pixels down.
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
  // Derived from the schema rather than stated twice: an index page whose
  // JSON-LD calls itself a `CollectionPage` was also telling Open Graph it was
  // an article, and the two disagreeing about what a page IS is exactly the
  // kind of contradiction structured data exists to avoid.
  const ogType = schema["@type"] === "Article" ? "article" : "website";
  // Stamped here rather than at ten `pageSchema` call sites: the dates are a
  // property of the ROUTE, and `path` is the only thing that identifies one.
  // `datePublished` rides along on articles only — it is an Article field, and
  // a `CollectionPage` claiming one says nothing about anything.
  const dates = datesFor(path);
  const dated = dates
    ? {
        ...schema,
        ...(ogType === "article" ? { datePublished: dates.published } : {}),
        dateModified: dates.modified,
      }
    : schema;
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
    <meta property="og:type" content="${ogType}" />${
      // Open Graph's own half of the pair the JSON-LD states. An `og:type` of
      // `article` opens the `article:*` namespace, and a page that declares the
      // type and then none of its properties is telling an unfurler it is an
      // article about nothing.
      ogType === "article" && dates
        ? `\n    <meta property="article:published_time" content="${dates.published}" />` +
          `\n    <meta property="article:modified_time" content="${dates.modified}" />`
        : ""
    }
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
${jsonLd(graphFor(dated, crumbs))}
    </script>
  </head>
  <body>
    <div class="ground" aria-hidden="true"${ground ? ` style="--ground: url('${ground}')"` : ""}></div>
    <header class="site-head">
      <div class="head-inner">
        <a class="back-to-game" href="${base}"><span aria-hidden="true">&laquo;</span> PLAY ${escapeHtml(TITLE.toUpperCase())}</a>
        <a class="brand" href="${root}"${path === "" ? ' aria-current="page"' : ""}>${escapeHtml(TITLE)}</a>
        <nav class="site-nav" aria-label="Library">
${["bestiary", "arsenal", "talents", "powers", "missions", "errands", "story"]
  .map(
    (section) =>
      `          <a href="${root}${section}/"${
        path === section || path.startsWith(`${section}/`)
          ? ' aria-current="page"'
          : ""
      }>${section.toUpperCase()}</a>`,
  )
  .join("\n")}
        </nav>
      </div>
    </header>
    <div class="wrap">
      ${crumbHtml}
      <main>
        <h1>${escapeHtml(heading)}</h1>
${body}
      </main>
      <!-- The store nudge inside this footer renders only once there is an app
           to link to; the two store-mandated documents below it are never
           conditional. Both were in the sitemap with NOTHING on the site linking
           to them, which left a sitemap entry as the only road in — the weakest
           discovery there is, for the two pages a store review and a wary reader
           both go looking for. The library is where this site's links live, so
           this is where they go. -->
      <footer class="site-foot">
${storeNudge() ? `        <p>${storeNudge()}</p>\n` : ""}        <p class="site-foot-links">
          <a href="${base}privacy/">Privacy</a>
          <a href="${base}contact/">Contact and support</a>
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
    // WHICH PAGE THIS ARTICLE IS THE POINT OF. Without it an Article is a
    // description of a thing that could have been syndicated from anywhere;
    // with it the article and the URL are the same object, which is what lets
    // the `@id` below be joined to the crawl of this address rather than merely
    // found at it. It is the canonical, always — a library page has exactly one
    // subject and exactly one home.
    ...(isArticle ? { mainEntityOfPage: { "@id": `${canonical}#page` } } : {}),
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
