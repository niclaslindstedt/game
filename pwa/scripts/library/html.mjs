// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page shell: the head every library page carries, and the small handful of
// markup helpers the renderers build bodies out of.
//
// A library page is a DOCUMENT. It links one stylesheet, loads one webfont, and
// runs NO JavaScript — not the game's bundle, not a router, not a byte. That is
// the constraint the whole exercise rests on: these pages exist to be read, and
// a reference table that downloads a game engine to render itself is slow to
// read. (They are not meant to be found through search: every page carries
// `noindex`, by owner decision.)

import identity from "../../../game.config.json" with { type: "json" };
import { escapeHtml } from "./escape.mjs";
import { firstPublished, lastModified } from "./git-dates.mjs";
import { libraryRoutes } from "./model.mjs";

export const SITE_URL = identity.siteUrl;
export const TITLE = identity.title;

/**
 * Is this library going INSIDE a store shell (the phone or desktop app) rather
 * than onto the web? `VITE_SHELL_BUILD=on` is set by each shell's
 * `bundle-web.mjs` and reaches this script through `npm run build`.
 *
 * A store build carries no address of the web edition (by owner decision —
 * see `shellIdentity` in pwa-plugin.ts), so its pages drop the share tags that
 * are nothing BUT such an address: `og:url`, `og:image`, `twitter:image`.
 * Nothing unfurls a page served off the device anyway.
 */
const SHELL_BUILD = process.env.VITE_SHELL_BUILD === "on";

/**
 * THE ONE THING THESE PAGES ASK FOR: get the app.
 *
 * A library page's job, once read, is to send the reader somewhere,
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

/**
 * The card a page unfurls as when it has no subject art of its own — the index
 * pages, the mission guide, the story chapters. The bestiary and arsenal pages
 * each build their own (og-card.mjs) and pass it in.
 *
 * `cardFor` is what a renderer calls to name one, so every card URL is built
 * the same way.
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
 * It is an `<img>` and not merely an `og:image` on purpose — it is part of the
 * page a reader reads, and the alt text and the caption beneath it describe
 * what the picture shows: the subject's name, what it is, and where in the
 * game it comes from.
 */
export function dropFigure({ src, alt, caption }) {
  return `      <figure class="drop-shot">
${img({ src, alt, width: 1200, height: 630, className: "drop-shot-img" })}
        <figcaption>${escapeHtml(caption)}</figcaption>
      </figure>`;
}

/**
 * WHEN THIS PAGE FIRST APPEARED AND WHEN IT LAST CHANGED, keyed by route.
 *
 * An article's Open Graph card carries `article:modified_time`, and the honest
 * answer already exists: the commit that last touched the content the page is
 * compiled from, read off the same `libraryRoutes()` list that renders it.
 *
 * `article:published_time` is the same question asked at the other end of the
 * history (`firstPublished`), and it is here because an article that only says
 * when it changed has no age — the pair is what the fields are read as.
 *
 * THE PAIR IS ORDERED BEFORE IT SHIPS. A page compiled from several sources can
 * be handed a first-add that post-dates its last-change — one source file gets
 * split or renamed, its ADD lands after an older sibling's last edit — and
 * "published after it was modified" is a contradiction nobody should be
 * shown. Where that happens the two collapse
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
 *
 * THE NAV FOLDS INTO A BURGER ON A PHONE, and it is the SAME CHECKBOX the
 * spoiler panels are built on — because these pages run no JavaScript, and a
 * menu that needs a script to open is a menu that does not open. The markup is
 * one nav either way; only the CSS differs, so there is no second copy of the
 * section list to keep in step and a reader with CSS off still gets six links.
 *
 * The switch is a real `<input type="checkbox">` with a real `<label>`, so it
 * takes keyboard focus, toggles on Space, and is announced as a control — all of
 * which a `<div onclick>` would have had to be taught.
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
  // `article` for an entry about one subject, `website` for an index page.
  ogType = "website",
}) {
  const root = `${base}library/`;
  const url = `${SITE_URL}${root}${path ? `${path}/` : ""}`;
  const card = ogImage ?? DEFAULT_CARD;
  const head = escapeHtml(title);
  const desc = escapeHtml(description);
  // Stamped here rather than at every call site: the dates are a property of
  // the ROUTE, and `path` is the only thing that identifies one.
  const dates = datesFor(path);
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
    <meta name="robots" content="noindex" />
    <link rel="stylesheet" href="${root}library.css" />
    <link rel="icon" href="${base}icon.svg" type="image/svg+xml" />
    <meta property="og:site_name" content="${escapeHtml(TITLE)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:type" content="${ogType}" />${
      // An `og:type` of `article` opens the `article:*` namespace, and a page that declares the
      // type and then none of its properties is telling an unfurler it is an
      // article about nothing.
      ogType === "article" && dates
        ? `\n    <meta property="article:published_time" content="${dates.published}" />` +
          `\n    <meta property="article:modified_time" content="${dates.modified}" />`
        : ""
    }
    <meta property="og:title" content="${head}" />
    <meta property="og:description" content="${desc}" />
${
  SHELL_BUILD
    ? ""
    : `    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${card.url}" />
    <meta property="og:image:width" content="${card.width}" />
    <meta property="og:image:height" content="${card.height}" />
    <meta property="og:image:alt" content="${escapeHtml(card.alt)}" />
`
}    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${head}" />
    <meta name="twitter:description" content="${desc}" />${
      SHELL_BUILD
        ? ""
        : `
    <meta name="twitter:image" content="${card.url}" />
    <meta name="twitter:image:alt" content="${escapeHtml(card.alt)}" />`
    }
  </head>
  <body>
    <div class="ground" aria-hidden="true"${ground ? ` style="--ground: url('${ground}')"` : ""}></div>
    <header class="site-head">
      <div class="head-inner">
        <a class="back-to-game" href="${base}"><span aria-hidden="true">&laquo;</span> PLAY ${escapeHtml(TITLE.toUpperCase())}</a>
        <input class="nav-toggle" type="checkbox" id="nav-toggle" />
        <label class="nav-burger" for="nav-toggle"><span class="burger-bars" aria-hidden="true"></span><span class="hidden">MENU</span><span class="shown">CLOSE</span></label>
        <a class="brand" href="${root}"${path === "" ? ' aria-current="page"' : ""}>${escapeHtml(TITLE)}</a>
        <nav class="site-nav" aria-label="Library">
${[
  "bestiary",
  "allies",
  "arsenal",
  "talents",
  "powers",
  "missions",
  "errands",
  "achievements",
  "story",
]
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
           conditional. They are the two pages a store review and a wary reader
           both go looking for, and the library is where this site's links live,
           so this is where they go. -->
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

/** An `<img>` with its dimensions, alt text and lazy loading — what a good Core Web Vitals score wants. */
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
