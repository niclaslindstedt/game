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

/**
 * How much of the em the glyphs actually fill, read off the font this build
 * packed — so a glyph-metric change can't leave the CSS behind. The pixel font
 * has no descenders and a cap height of ${CAP_HEIGHT}/${UNITS_PER_EM} em, so a
 * default line-height leaves a canyon between lines; leading of one more cap
 * height is the classic setting and is what the rule below uses.
 */
const CAP_EM = CAP_HEIGHT / UNITS_PER_EM;
const PIXEL_LEADING = (CAP_EM * 2).toFixed(3);

export function libraryCss() {
  return `/* GENERATED — do not edit. Emitted by pwa/scripts/library/. */
${panelSkin()}
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

html { -webkit-text-size-adjust: 100%; }

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

.pixel, h1, h2, h3, .stat-key, .chip, .crumb, .site-nav a, th, .num {
  font-family: "GamePixel", ui-monospace, monospace;
  font-weight: normal;
  letter-spacing: 0.06em;
  line-height: ${PIXEL_LEADING};
}

a { color: var(--mint); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { color: var(--amber); }

/* ---- shell ---------------------------------------------------------------- */

.wrap { max-width: 62rem; margin: 0 auto; padding: 0 1rem 4rem; }

.site-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1.25rem;
  padding: 1.25rem 0 1rem;
  border-bottom: 1px solid var(--rule);
  margin-bottom: 1.5rem;
}
.site-head .brand {
  font-family: "GamePixel", ui-monospace, monospace;
  font-size: 24px;
  color: var(--amber);
  text-decoration: none;
  letter-spacing: 0.08em;
}
.site-nav { display: flex; gap: 1rem; margin-left: auto; }
.site-nav a { font-size: 16px; text-decoration: none; color: var(--ink-dim); }
.site-nav a[aria-current="page"] { color: var(--amber); }

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
.portrait img {
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
.stat-val { display: block; font-size: 1.15rem; color: var(--ink); }
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
}
.roster a:hover { border-color: var(--rule); background: rgba(0, 0, 0, 0.4); color: var(--amber); }
.roster img { image-rendering: pixelated; flex: none; width: 32px; height: auto; }
.roster .role-boss { color: #ff8c42; }
.roster .role-elite { color: var(--amber); }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; padding: 0; margin: 1.5rem 0; list-style: none; }
.cards h2 { margin-top: 0; }

/* ---- the reference phone (844×390) ---------------------------------------- */

@media (max-width: 900px) {
  .wrap { padding: 0 0.75rem 3rem; }
  h1 { font-size: 32px; }
  h2 { font-size: 24px; }
  .portrait img { width: 120px; }
  .site-nav { width: 100%; margin-left: 0; }
}
`;
}
