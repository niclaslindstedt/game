// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The library's one stylesheet. It is deliberately small and hand-written:
// a library page is a DOCUMENT, and the app's stylesheet is ten thousand lines
// of game. What the two genuinely share — the window skin every panel in the
// game wears — is INLINED from its own file rather than restated, so a change
// to the skin moves both (see pwa/src/lib/pixel-panel.css).
//
// Nothing here needs JavaScript, including the spoiler reveal: a checkbox and a
// sibling selector turn the blur off, so the story text is real markup that a
// crawler reads and a reader has to ask for.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO } from "./catalogs.mjs";
import {
  CAP_HEIGHT,
  EM_PIXELS,
  UNITS_PER_EM,
} from "../../../scripts/asset-tools/webfont.mjs";

/** The shared window skin, verbatim. */
const panelSkin = () =>
  readFileSync(join(REPO, "pwa/src/lib/pixel-panel.css"), "utf8");

/** The shared ITEM CARD skin, verbatim — the same file the app imports, so an
 * arsenal page's card IS the game's card rather than an approximation of it. */
const cardSkin = () =>
  readFileSync(join(REPO, "pwa/src/lib/item-card.css"), "utf8");

/**
 * How much of the em the glyphs actually fill, read off the font this build
 * packed — so a glyph-metric change can't leave the CSS behind. The pixel font
 * has no descenders and a cap height of ${CAP_HEIGHT}/${UNITS_PER_EM} em, so a
 * default line-height leaves a canyon between lines; leading of one more cap
 * height is the classic setting and is what the rule below uses.
 */
export const CAP_EM = CAP_HEIGHT / UNITS_PER_EM;
const PIXEL_LEADING = (CAP_EM * 2).toFixed(3);

export function libraryCss() {
  return `/* GENERATED — do not edit. Emitted by pwa/scripts/library/. */
${panelSkin()}
${cardSkin()}
@font-face {
  font-family: "GamePixel";
  /* Packed from the same GLYPHS map as the in-game atlas — see
     scripts/asset-tools/webfont.mjs. Relative to this stylesheet, so the
     deploy slot's base path costs nothing. */
  src: url("pixel.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

:root {
  color-scheme: dark;
  --ink: #e6e8eb;
  --ink-dim: #98a0aa;
  --ink-faint: #6d747d;
  --amber: #ffd75e;
  --mint: #7ef0c8;
  --void: #0b0d10;
  --rule: #2a2f36;
  /* One font-pixel at the body's heading size. The pixel font's em is
     ${EM_PIXELS} font-pixels, so every heading size below is a multiple of
     ${EM_PIXELS}px and the art never lands on a fraction. */
  --pix: ${EM_PIXELS}px;
}

* { box-sizing: border-box; }

/* scroll-padding-top keeps an in-page anchor from landing under the sticky
   header that is covering the top of the viewport. */
html { -webkit-text-size-adjust: 100%; scroll-padding-top: 5rem; }

body {
  margin: 0;
  background-color: var(--void);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.65;
}

/* The venue's own ground, tiled — the same cells the renderer would lay down at
   those coordinates — under a scrim heavy enough that it never competes with
   the text. */
.ground {
  position: fixed;
  inset: 0;
  z-index: -1;
  background-image: var(--ground, none);
  background-repeat: repeat;
  background-size: 256px;
  image-rendering: pixelated;
  opacity: 0.3;
  mask-image: linear-gradient(180deg, #000 0, rgba(0, 0, 0, 0.35) 60vh, transparent 110vh);
}

/* THE PIXEL FONT SETS EVERY NUMBER, and the prose font sets every sentence.
   A stat block that shouts its label in the game's own typeface and then answers
   in the system sans reads as two documents spliced together — so a figure
   (.stat-val, a table's .num) wears the same face as the key above it, and only
   running text is left to the sans. */
.pixel, h1, h2, h3, .stat-key, .stat-val, .chip, .crumb, .site-nav a, th, .num {
  font-family: "GamePixel", ui-monospace, monospace;
  font-weight: normal;
  letter-spacing: 0.06em;
  line-height: ${PIXEL_LEADING};
}

a { color: var(--mint); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { color: var(--amber); }

/* ---- shell ---------------------------------------------------------------- */

.wrap { max-width: 62rem; margin: 0 auto; padding: 1.25rem 1rem 4rem; }

/* THE HEADER STICKS, because it carries the way out (see html.mjs). In the
   installed PWA and the native WebView there is no browser chrome and no back
   button; that one link is the whole exit, and an exit that scrolls off the top
   of a four-screen bestiary page is not one.

   It sits OUTSIDE .wrap so the bar reaches both edges of the viewport rather
   than floating with a stripe of ground either side of it, and it is kept to
   ONE line wherever one will fit — on the 844x390 reference phone every row the
   header costs is a row of the page the reader came for. */
.site-head {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--rule);
  /* FULLY opaque. A sheer bar over the fixed ground tile looks better standing
     still and fails the moment the page moves: at 6% transparency a scrolled
     paragraph ghosts through the bar line by line, which reads as a rendering
     fault rather than as glass. The ground is a texture, not information — the
     bar is allowed to cover its top inch. */
  background: var(--void);
}
.head-inner {
  max-width: 62rem;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 1.25rem;
  padding: 0.6rem 1rem 0.5rem;
}
.site-head .brand {
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 24px;
  color: var(--amber);
  text-decoration: none;
  letter-spacing: 0.08em;
}
/* THE WAY OUT. Drawn as a button rather than a link because in a chromeless
   build it is doing a browser's job, and a reader scanning for one is looking
   for a control, not a line of text. */
.back-to-game {
  flex: none;
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 16px;
  letter-spacing: 0.06em;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  color: var(--amber);
  border: 1px solid #5c4a1c;
  border-radius: 4px;
  padding: 0.4rem 0.55rem 0.3rem;
  background: rgba(0, 0, 0, 0.45);
}
.back-to-game:hover { color: var(--void); background: var(--amber); }
.back-to-game:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }

/* THE NAV GIVES WAY IN THREE STAGES, and never by letting the PAGE carry the
   overflow — a document that slides under the reader's thumb while they are
   trying to scroll it reads as broken, and it was the nav that used to make
   every page do exactly that.

   1. It drops to its OWN LINE: the flex-basis is the width the section names
      want, so the header keeps one line while there is room beside the brand
      and wraps rather than squeezing when there is not.
   2. Then it WRAPS WITHIN ITSELF. Five names in the pixel font are ~420 px and
      a phone is 390, so on the reference device they cannot share a line at
      any sane gap — and no-wrap made the last one silently disappear off the
      right edge, which is worse than any layout: the reader cannot even tell
      that STORY exists. A wrapped nav is two tidy rows.
   3. Only THEN does it scroll inside its own box, with no scrollbar drawn —
      the last resort, for a viewport too narrow even to wrap into.

   Below the burger breakpoint stage 2 stops being the answer — see the burger
   block further down; a wrapped nav is tidy and still costs a phone two rows of
   sticky chrome on every page. Stages 1 and 3 keep governing everything wider. */
.site-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  flex: 1 1 20rem;
  justify-content: flex-end;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.site-nav::-webkit-scrollbar { display: none; }
.site-nav a { flex: none; font-size: 16px; text-decoration: none; color: var(--ink-dim); }
.site-nav a[aria-current="page"] { color: var(--amber); }

/* ---- the burger ------------------------------------------------------------ */

/* SIX SECTION NAMES DO NOT FIT A PHONE, and wrapping them is not free: the
   header is STICKY, so every row it costs is a row taken off every screenful of
   the page the reader actually came for — the nav alone was two of the four
   rows of chrome above the first sentence on a 390 px phone.

   So below 900 px the nav folds behind one control. The number is the file's
   existing phone breakpoint and it is also where the nav genuinely stops
   fitting: measured, the six names sit beside the brand on one line from about
   915 px up, so the two regimes meet with nothing but a hair's band of the old
   wrap fallback between them.

   Three decisions in it are load-bearing:

   - IT IS A CHECKBOX (the same trick the spoiler panels use), because these
     pages run NO JavaScript. Nothing about the markup changes between the two
     regimes; only which rules apply. A reader with CSS disabled sees the six
     links, which is the honest degradation.
   - THE PANEL IS ABSOLUTE, not another wrapped flex row. A panel in the flow
     grows the sticky header when it opens, which shoves the whole document down
     under the reader's thumb at the exact moment they are reaching for a link.
     Overlaying it leaves the page where they left it.
   - IT NEVER GETS TALLER THAN THE SCREEN. Six rows do not need it today; a
     seventh section must not be able to push a link off the bottom of a phone
     into a panel that cannot scroll, so the panel carries its own max-height. */
.nav-toggle { position: absolute; opacity: 0; width: 0; height: 0; }
.nav-burger { display: none; }

@media (max-width: 900px) {
  /* The burger is drawn as the way out's twin, and it takes the RIGHT of
     whichever line it lands on: 'order' puts it after the brand (which the DOM
     cannot, since the panel it opens has to follow the checkbox), and the auto
     margin pushes it to the edge. Left to wrap on its own terms it costs the
     844x390 landscape phone nothing at all — the back link, the brand and the
     burger share one line there — and the portrait phone one line instead of
     the three the wrapped nav used to take. */
  .nav-burger {
    display: inline-flex;
    order: 1;
    align-items: center;
    gap: 0.45rem;
    margin-left: auto;
    font-family: "GamePixel", ui-monospace, monospace;
    font-size: 16px;
    letter-spacing: 0.06em;
    line-height: 1;
    color: var(--amber);
    border: 1px solid #5c4a1c;
    border-radius: 4px;
    padding: 0.4rem 0.55rem 0.3rem;
    background: rgba(0, 0, 0, 0.45);
    cursor: pointer;
  }
  .nav-burger:hover { color: var(--void); background: var(--amber); }
  .nav-toggle:focus-visible + .nav-burger { outline: 2px solid var(--mint); outline-offset: 2px; }
  .nav-burger .shown { display: none; }
  .nav-toggle:checked + .nav-burger .shown { display: inline; }
  .nav-toggle:checked + .nav-burger .hidden { display: none; }

  /* Three bars in the page's own ink, drawn rather than fetched: an icon font
     or an SVG file would be a second request for six pixels of rule. They take
     currentColor, so the hover state inverts them with the label. */
  .burger-bars {
    width: 14px;
    height: 10px;
    background:
      linear-gradient(currentColor 0 0) 0 0 / 100% 2px no-repeat,
      linear-gradient(currentColor 0 0) 0 4px / 100% 2px no-repeat,
      linear-gradient(currentColor 0 0) 0 8px / 100% 2px no-repeat;
  }

  /* Last of all, so a wrapped nav can never be pulled up beside the brand. */
  .site-nav { order: 2; display: none; }
  .nav-toggle:checked ~ .site-nav {
    display: flex;
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    flex-direction: column;
    gap: 0;
    padding: 0.25rem 0.75rem 0.5rem;
    max-height: 70vh;
    overflow-y: auto;
    background: var(--void);
    /* The one place this flat chrome is allowed depth. The panel cuts across
       running text, and a 1 px rule against a paragraph it is half-covering
       reads as a rendering fault rather than as something lying over the page —
       the same complaint the header's own transparency once earned. A rule plus
       a short shadow says "over", which is what it is. */
    border-bottom: 1px solid var(--rule);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.55);
  }
  .nav-toggle:checked ~ .site-nav a {
    padding: 0.55rem 0 0.45rem;
    border-top: 1px solid var(--rule);
  }
  .nav-toggle:checked ~ .site-nav a:first-child { border-top: 0; }
}

.crumb {
  font-size: 16px;
  color: var(--ink-faint);
  margin: 0 0 0.75rem;
}
.crumb a { color: var(--ink-dim); text-decoration: none; }
.crumb a:hover { color: var(--amber); }

h1 { font-size: 40px; color: var(--amber); margin: 0 0 0.4em; }
h2 { font-size: 24px; color: var(--ink); margin: 2.25rem 0 0.75rem; }
h3 { font-size: 16px; color: var(--mint); margin: 1.5rem 0 0.4rem; }

.lede { font-size: 1.0625rem; color: var(--ink); margin: 0 0 1rem; max-width: 46em; }
p { max-width: 46em; }

.site-foot {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--rule);
  color: var(--ink-faint);
  font-size: 0.9rem;
}

/* Wraps rather than scrolls: two links at the bottom of a 390px-wide phone. */
.site-foot-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.2rem;
}

/* ---- panels --------------------------------------------------------------- */

.panel { padding: 1rem 1.1rem; margin: 1rem 0; }
.panel > :first-child { margin-top: 0; }
.panel > :last-child { margin-bottom: 0; }

.chip {
  display: inline-block;
  font-size: 16px;
  padding: 0.25rem 0.5rem 0.15rem;
  border: 1px solid var(--rule);
  border-radius: 4px;
  color: var(--ink-dim);
  background: rgba(0, 0, 0, 0.35);
}
.chip-row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1rem; padding: 0; list-style: none; }
/* Which rung of a grade ladder a chip's relic is built on — dimmer than the
   name it qualifies, so the row still reads as a list of names. */
.chip-note { color: var(--ink-faint); margin-left: 0.4rem; }
.chip.role-boss { color: #ff8c42; border-color: #6b3a1c; }
.chip.role-elite { color: var(--amber); border-color: #5c4a1c; }
.chip.role-minion { color: var(--ink-dim); }
.chip.tag { color: var(--mint); border-color: #23524a; }

/* ---- the portrait --------------------------------------------------------- */

.portrait {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
  flex-wrap: wrap;
  margin: 0 0 1rem;
}
/* The monster's portrait — the DIRECT child only. An arsenal page puts an item
   CARD in this slot instead, and the card's own icon must keep the card's
   sizing rather than being blown up to a portrait. */
.portrait > img {
  image-rendering: pixelated;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 0.5rem;
  flex: none;
  width: 160px;
  height: auto;
}
.portrait .portrait-body { flex: 1 1 20rem; min-width: 0; }

.sprite {
  image-rendering: pixelated;
  vertical-align: middle;
  width: 24px;
  height: auto;
}

/* ---- tables --------------------------------------------------------------- */

.scroller { overflow-x: auto; margin: 0.75rem 0; }
table { border-collapse: collapse; width: 100%; min-width: 22rem; font-variant-numeric: tabular-nums; }
caption { text-align: left; color: var(--ink-faint); font-size: 0.85rem; padding-bottom: 0.4rem; }
th, td { text-align: left; padding: 0.4rem 0.75rem 0.35rem 0; border-bottom: 1px solid var(--rule); white-space: nowrap; }
th { font-size: 16px; color: var(--ink-faint); font-weight: normal; }
td { font-size: 0.95rem; }
td.num { font-size: 16px; color: var(--ink); }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: none; }

.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.75rem 1.25rem; margin: 1rem 0; padding: 0; list-style: none; }
.stats > li { min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; }
.stat-key { display: block; font-size: 16px; color: var(--ink-faint); }
/* 24px, not 1.15rem: a pixel-font size that is not a multiple of the em's
   ${EM_PIXELS} font-pixels lands the glyph grid on fractions and the art turns
   to mush. The step up from the key's 16px is what keeps the figure leading the
   label now that the two share a typeface. */
.stat-val { display: block; font-size: 24px; color: var(--ink); }
.note { color: var(--ink-faint); font-size: 0.9rem; }

.notes { list-style: none; padding: 0; margin: 1rem 0; }
.notes > li { margin: 0 0 0.6rem; padding-left: 0.9rem; border-left: 2px solid var(--rule); }
.notes .stat-key { color: var(--mint); }

/* ---- the reveal ----------------------------------------------------------- */

/* The spoiler panel. The text is ALWAYS in the document and always rendered —
   it is blurred, not hidden — so it is indexed like any other prose while a
   reader arriving cold is not spoiled by it. Never "display: none", never
   injected: either would stop the words counting, which is the whole point of
   publishing them. */
.reveal { margin: 1rem 0; }
.reveal-toggle { position: absolute; opacity: 0; width: 0; height: 0; }
.reveal-label {
  display: inline-block;
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 16px;
  letter-spacing: 0.06em;
  color: var(--amber);
  border: 1px solid #5c4a1c;
  border-radius: 4px;
  padding: 0.35rem 0.6rem 0.25rem;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.4);
}
.reveal-label:hover { color: var(--void); background: var(--amber); }
.reveal-toggle:focus-visible + .reveal-label { outline: 2px solid var(--mint); outline-offset: 2px; }
.reveal-label .shown { display: none; }
.reveal-toggle:checked + .reveal-label .shown { display: inline; }
.reveal-toggle:checked + .reveal-label .hidden { display: none; }

/* The page-wide switch: same trick, longer reach. The general sibling
   combinator walks every following sibling and its descendants, so one checkbox
   at the top of a chapter lifts every cover under it — and hides the individual
   switches while it is on, so the page doesn't offer to reveal what is already
   revealed. */
.reveal-all-toggle { position: absolute; opacity: 0; width: 0; height: 0; }
.reveal-all-label { display: inline-block; margin-bottom: 0.5rem; }
.reveal-all-toggle:checked + .reveal-label .shown { display: inline; }
.reveal-all-toggle:checked + .reveal-label .hidden { display: none; }
.reveal-all-toggle:focus-visible + .reveal-label { outline: 2px solid var(--mint); outline-offset: 2px; }
.reveal-all-toggle:checked ~ * .reveal-body { filter: none; user-select: auto; }
.reveal-all-toggle:checked ~ * .reveal-label { display: none; }

.reveal-body {
  margin-top: 0.75rem;
  filter: blur(6px);
  user-select: none;
  transition: filter 160ms ease;
}
.reveal-toggle:checked ~ .reveal-body { filter: none; user-select: auto; }

@media (prefers-reduced-motion: reduce) {
  .reveal-body { transition: none; }
}

.speech { margin: 0 0 0.9rem; padding-left: 0.9rem; border-left: 2px solid #5c4a1c; }
.speech.hero { border-left-color: #23524a; }
.speech .who { display: block; font-family: "GamePixel", ui-monospace, monospace; font-size: 16px; color: var(--ink-faint); }
.speech p { margin: 0; }

/* ---- the story ------------------------------------------------------------- */

/* A cutscene's narrator card. It has no speaker on the stage and none in the
   markup either — it is the scene talking, so it is centred and set apart from
   the lines around it rather than blockquoted like speech. */
.caption {
  margin: 1.1rem 0;
  text-align: center;
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink-faint);
  letter-spacing: 0.04em;
}
.last-words { margin: 0.9rem 0 0.3rem; color: var(--ink-faint); font-size: 0.9rem; }
/* A speaker's own portrait, riding its heading. */
h3 > .sprite { width: 32px; vertical-align: middle; margin-right: 0.4rem; }
h4 { font-family: "GamePixel", ui-monospace, monospace; font-size: 16px; color: var(--ink-faint); margin: 1.2rem 0 0.4rem; }
/* The chapter list. Not a rack like the other indexes: a campaign is READ in
   one order, so it is one column of rows rather than a grid of cells — and the
   row has room for the name at full length instead of folding it a letter at a
   time into a narrow cell. */
.chapters { list-style: none; padding: 0; margin: 1rem 0 1.5rem; }
.chapters > li { margin: 0 0 0.35rem; }
.chapters a {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.7rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 6px;
  text-decoration: none;
  color: var(--ink);
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 16px;
  line-height: 1.3;
}
.chapters a:hover { border-color: var(--rule); background: rgba(0, 0, 0, 0.4); color: var(--amber); }
/* The campaign's own order, dimmed so the venue name still leads the row. */
.chapters .chapter-no { flex: none; width: 1.6em; color: var(--ink-faint); }
.chapters .chapter-holds { margin-left: auto; color: var(--ink-faint); font-size: 14px; }

/* ---- indexes -------------------------------------------------------------- */

.roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.5rem; padding: 0; margin: 0.75rem 0 0; list-style: none; }
.roster a {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 6px;
  text-decoration: none;
  color: var(--ink);
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 16px;
  line-height: 1.2;
  /* A rack cell is a flex row with a trailing detail pushed right. Without a
     shrinkable first child a long name refuses to fold and shoves that detail
     off the viewport — which on a phone is the whole page scrolling sideways. */
  min-width: 0;
}
.roster a > span:not(.req) { min-width: 0; overflow-wrap: anywhere; }
.roster a:hover { border-color: var(--rule); background: rgba(0, 0, 0, 0.4); color: var(--amber); }
.roster img { image-rendering: pixelated; flex: none; width: 32px; height: auto; }
.roster .role-boss { color: #ff8c42; }
.roster .role-elite { color: var(--amber); }
/* An ERRAND rack, which is the one index whose entries are sentences rather
   than names — THE BOY IN THE SAILOR SUIT beside a monster's LONGHORN. At the
   shared 11rem the cell folds a title over three lines and the anywhere-wrap
   above breaks it mid-word (THE GREENHOU / SE); a wider column is all it takes,
   and the grid still collapses to one column on a phone. */
.roster.errands { grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; padding: 0; margin: 1.5rem 0; list-style: none; }
.cards h2 { margin-top: 0; }

/* ---- the badge shelf ------------------------------------------------------- */

/* A BADGE ROW, laid out the way the game's own shelf lays one out: the sprite in
   a fixed column, then the name, the condition, and the figures stacked under
   it.

   A LIST RATHER THAN A TABLE, and the phone is the reason. Every table here is
   set white-space: nowrap because its cells are figures; a badge's cell is a
   SENTENCE, and a column of sentences that cannot wrap turns the reference
   viewport into a horizontal scroll several screens wide. So the condition wraps
   and the figures sit beneath it. */
.badges { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.4rem; }
.badges > li {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 0.7rem;
  align-items: start;
  padding: 0.5rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
}
.badges > li:target { border-color: var(--rule); background: rgba(0, 0, 0, 0.5); }
.badges .badge-cell { display: flex; align-items: flex-start; min-height: 32px; }
.badges img { image-rendering: pixelated; width: 32px; height: auto; }
.badge-body { min-width: 0; }
/* Achievement gold, the colour the shelf frames an earned badge in — a library
   page has no player state to dim a locked one with, so every badge is drawn
   the way the shelf draws one you have. */
.badge-name {
  display: block;
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 16px;
  letter-spacing: 0.06em;
  line-height: ${PIXEL_LEADING};
  color: var(--amber);
  overflow-wrap: anywhere;
}
/* The condition, in the game's own words — the one part of a row that is prose,
   so it is the one part set in the prose face. */
.badge-ask { display: block; color: var(--ink-dim); font-size: 0.95rem; }
.badge-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.9rem;
  margin-top: 0.15rem;
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 14px;
  letter-spacing: 0.06em;
  color: var(--ink-faint);
}

/* An index rack's trailing detail — a level requirement, how a monster reaches
   the board. Pushed to the row's right edge and dimmed, so the NAME still leads. */
.roster .req { margin-left: auto; padding-left: 0.5rem; color: var(--ink-faint); font-size: 14px; flex: none; }

/* What separates a monster from the two others of the same name — the venue, or
   the word their ids don't share. It sits UNDER the name rather than in the
   trailing column beside it: that column is sized for an "L34", and a venue name
   in it takes enough of a cell to fold the name itself mid-word. */
.roster .where { display: block; color: var(--ink-faint); font-size: 14px; margin-top: 0.15rem; }
/* A talent rack reads in its TREE's colour — the same accent the picker heads
   that tree with, handed in as a custom property by the renderer rather than
   restated here, so the three colours have exactly one home
   (pwa/src/game/talent-look.ts). The role under the name uses the same slot a
   monster's disambiguating venue does. */
.talent-rack .talent-name { color: var(--tree, inherit); }
.talent-rack a:hover .talent-name { color: var(--amber); }

/* A BADGE rack — the relic wall and the companion roster, where a whole family
   is one condition with a different subject each time. It is the shared rack
   with the badge's own tier and point value in the sub-label slot a monster's
   venue uses, and the name in achievement gold (the same #ffd75e the shelf
   frames an earned badge in) so a wall of them reads as trophies. */
.badge-rack .badge-name { color: var(--amber); }
.badge-rack a:hover .badge-name { color: var(--ink); }
/* A relic's name is two long words more often than a monster's — GLEIPNIR
   CHAUSSES, HELM OF DARKNESS — and at the shared 11rem the wall folds nearly
   every cell over two lines. A wider column reads as a wall instead of as a
   ransom note, and the grid still collapses to one on a phone. */
/* …and a bottom margin, because a rack is one block among several on a category
   page: a wall butting straight up against the row list under it reads as one
   run of badges rather than as two families. */
.badge-rack { grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); margin-bottom: 1.25rem; }

.roster li > span.self { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; font-family: "GamePixel", ui-monospace, monospace; font-size: 16px; color: var(--amber); }
.dim { color: var(--ink-faint); }
h2 .count, h3 .count { color: var(--ink-faint); font-size: 16px; margin-left: 0.6rem; }

/* ---- the arsenal ----------------------------------------------------------- */

/* The item card is the GAME's card — .item-card, .tier-*, .card-foot and
   .tooltip-row all come from pwa/src/lib/item-card.css, inlined above. What
   these rules add is only the part the app draws with PixelText canvases and a
   document draws as text: the type itself. Never restate the card's own skin
   here; change it in that file and both move. */
/* THE CARD IS THE GAME'S CARD, at the size the game would draw it.
   In play a stat line is the pixel font at scale 1 and the NAME at scale 2 —
   a 5px cap and a 10px one — inside a 16rem box. The em of the packed webfont
   is ${EM_PIXELS} font-pixels tall against a ${CAP_HEIGHT / (UNITS_PER_EM / EM_PIXELS)}-pixel cap, so a
   font-size of 8px reproduces scale 1 exactly and 16px reproduces scale 2, with
   every pixel landing on a whole one. Sizes that are not multiples of 8 would
   put the glyph grid on fractions and turn the art to mush, so the ladder here
   is 8 / 16 / 24 and nothing between.

   Large screens then double it, because the GAME doubles it: past
   UI_SCALE_BREAKPOINT_PX the app doubles its root font-size and the card grows
   with everything else (see the media query at the foot of this file). A
   desktop reader gets the desktop card, a phone reader the phone card. */
.item-portrait { align-items: flex-start; }
.item-card {
  flex: none;
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 8px;
  /* NOT ${"$"}{PIXEL_LEADING}. That is the library's PROSE leading — a whole extra
     cap height between lines, which is right for a paragraph and wrong here.
     In the game a card line is a PixelText canvas exactly one cap tall, and the
     only thing between two of them is item-card.css's own \`gap: 0.35rem\`. So a
     card line box is one cap high and the shared gap does the spacing: both
     terms come from somewhere shared (the packed font's metrics, the game's own
     stylesheet), which is what stops this drifting again. Measured against a
     real in-game card the old rule ran the pitch ~70% wide. */
  line-height: ${CAP_EM.toFixed(3)};
  letter-spacing: 0.05em;
  /* HUGS its content, capped at the game's own 16rem — the in-game card is a
     max-width, not a fixed one, so a four-line weapon card is narrow and a set
     piece's is wide. Forcing the full width instead leaves a lake of empty
     panel beside every short stat block. */
  width: fit-content;
  max-width: min(16rem, 100%);
}
/* A long name WRAPS inside the card the way PixelText's wrap width wraps it in
   play. Without this it rides straight out over the rarity border. */
.card-name { font-size: 16px; min-width: 0; overflow-wrap: anywhere; }
/* Sized to one row of the scale-2 name, exactly as the in-game name row is. */
.card-icon { width: 16px; height: auto; flex: none; }
.tooltip-name-row { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
.card-ilvl { color: #e6b84d; }
.card-label { color: var(--ink); }
.card-value { color: #9aa3ad; }
.tooltip-row { min-width: 0; overflow-wrap: anywhere; }
.card-foot { color: var(--ink-faint); }
.card-tier { flex: none; }
.card-set-name { color: #4ade80; }
.card-set-member { color: var(--ink-faint); padding-left: 0.5rem; }
.card-set-member.self { color: #4ade80; }
.card-set-bonus { color: #4ade80; }

/* An item's authored flavor. A named relic's one-liner is shouted in the pixel
   font the way the card shouts it; a base's few sentences are prose and read as
   prose. */
.flavor { margin: 1rem 0 0; padding-left: 0.9rem; border-left: 2px solid #5c4a1c; }
.flavor p { margin: 0; font-family: "GamePixel", ui-monospace, monospace; font-size: 16px; letter-spacing: 0.06em; line-height: ${PIXEL_LEADING}; color: var(--amber); }
.flavor-plain { color: var(--ink-dim); font-style: italic; }

/* A chip carrying a rarity, and a rack row naming one: the tier's own colour,
   from the game's palette. */
.chip.tier-chip-regular { color: var(--ink-dim); }
.chip.tier-chip-trash { color: #8a8073; border-color: #4a453d; }
.chip.tier-chip-set, .tier-text-set { color: #4ade80; }
.chip.tier-chip-unique, .tier-text-unique { color: #c7a25a; }
.chip.tier-chip-legendary, .tier-text-legendary { color: #ffa726; }
.chip.tier-chip-artifact, .tier-text-artifact { color: #ff5e6c; }
.chip.tier-chip-set { border-color: #256b3d; }
.chip.tier-chip-unique { border-color: #5c4a1c; }
.chip.tier-chip-legendary { border-color: #6b4416; }
.chip.tier-chip-artifact { border-color: #6b2028; }
.chip a { text-decoration: none; color: inherit; }
.chip a:hover { color: var(--amber); }

/* ---- the missions ---------------------------------------------------------- */

/* The reader's map, behind its cover. It scrolls inside its own box on a phone
   rather than making the page do it, and it is drawn pixelated because it is
   pixel art. */
.map { margin: 0; overflow-x: auto; }
.map-img { image-rendering: pixelated; max-width: 100%; height: auto; min-width: 22rem; border: 1px solid var(--rule); border-radius: 6px; }
.map figcaption { color: var(--ink-faint); font-size: 0.9rem; padding-top: 0.5rem; }

/* THE DROP SHOT — the subject standing on its own venue (drop-shot.mjs). Unlike
   the mission map it is a composed 1200x630 picture rather than pixel art at
   true scale, so it simply scales to the column and is NOT drawn pixelated: the
   sprite inside it was already blown up to whole pixels when the image was
   baked, and pixelating the resample would fight the shadow and the vignette. */
.drop-shot { margin: 1.25rem 0 0; }
.drop-shot-img { width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 6px; display: block; }
.drop-shot figcaption { color: var(--ink-faint); font-size: 0.9rem; padding-top: 0.5rem; }

.campaign-nav { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--rule); font-family: "GamePixel", ui-monospace, monospace; font-size: 16px; }
.campaign-nav a { text-decoration: none; }
.campaign-nav a:only-child:last-child { margin-left: auto; }

/* ---- large screens: the game's own 2× regime ------------------------------- */

/* The app doubles its root font-size past UI_SCALE_BREAKPOINT_PX (700px) so the
   phone-tuned UI stays legible instead of shrinking. The item card is that UI,
   so it doubles here too — keeping the two breakpoints in step, and keeping a
   desktop reader's card identical to a desktop player's. */
@media (min-width: 700px) and (min-height: 700px) {
  .item-card { font-size: 16px; max-width: min(32rem, 100%); }
  .card-name { font-size: 32px; }
  .card-icon { width: 32px; }
}

/* ---- the reference phone (844×390) ---------------------------------------- */

@media (max-width: 900px) {
  .wrap { padding: 1rem 0.75rem 3rem; }
  .head-inner { padding: 0.5rem 0.75rem 0.45rem; }
  h1 { font-size: 32px; }
  h2 { font-size: 24px; }
  .portrait img { width: 120px; }
}

/* There used to be a rule here left-aligning the nav once it had wrapped to a
   line of its own. Every width it covered is now inside the burger's regime —
   the nav is a dropped panel below 900 px and trails the brand on one line from
   ~915 px up — so it applied to nothing and was removed rather than re-aimed at
   the ~15 px band between the two, where the wrap fallback already looks right. */
`;
}
