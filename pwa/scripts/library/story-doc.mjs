// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `docs/story.md`, read as data.
//
// THE STORY SECTION HAS TWO SOURCES, AND THEY ARE NOT INTERCHANGEABLE.
//
// The spoken words — every monologue, every arrival scene, every last gasp,
// every lore page — come out of the COMPILED GAME, exactly as the bestiary's
// dialogue does. The narrative around them, the connective prose that says what
// a chapter is ABOUT, exists in only one place: `docs/story.md`, the top of the
// story chain (see CLAUDE.md, "Story & dialogue"). So that is what this module
// reads, and it reads nothing else.
//
// It deliberately does NOT read `docs/manuscript.md`. The manuscript is a
// verbatim transcription of lines that already ship in the catalogs, and
// quoting a transcription instead of the thing transcribed would give the
// library the one thing it is built not to have: a second copy of something,
// free to drift. The manuscript still governs — `tests/content/library_test.ts`
// holds the pages to it — it just isn't a source of text.
//
// The markdown support here is deliberately tiny: paragraphs, bold, italics.
// Anything else in a rendered section THROWS, because the alternative is a
// heading or a list quietly shipping as literal asterisks on a live page.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO } from "./catalogs.mjs";
import { escapeHtml } from "./html.mjs";

export const STORY_DOC = "docs/story.md";

/**
 * The document's `##` sections, in narrative order, each with the raw markdown
 * under it. Everything above the first heading is the file's own note to
 * authors about the chain, and is not part of the story.
 */
export function storySections() {
  const text = readFileSync(join(REPO, STORY_DOC), "utf8");
  const sections = [];
  let current = null;
  for (const line of text.split("\n")) {
    const heading = /^## +(.+?)\s*$/.exec(line);
    if (heading) {
      current = { heading: heading[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (/^#{1,6} /.test(line)) {
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (sections.length === 0) {
    throw new Error(`library: ${STORY_DOC} has no sections to publish`);
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.lines.join("\n").trim(),
  }));
}

/** A section's paragraphs, still as markdown. */
export function paragraphsOf(body) {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * The markdown constructs a story section is allowed to use. A section that
 * reaches a page may only be prose: the renderer here understands paragraphs,
 * `**bold**` and `_italics_`, and nothing else. A heading, list, table, quote
 * or code fence would ship as its own source text, so it stops the build
 * instead — the same bargain the field-coverage maps strike.
 */
function assertProse(block, heading) {
  const offender = block
    .split("\n")
    .find((line) => /^\s*(#{1,6} |[-*+] |\d+\. |> |\||```)/.test(line));
  if (offender) {
    throw new Error(
      `library: ${STORY_DOC} section "${heading}" uses markdown the story pages cannot render:\n` +
        `  ${offender.trim()}\n` +
        `The chapter pages render prose only (paragraphs, bold, italics). Either write it as prose ` +
        `or teach pwa/scripts/library/story-doc.mjs the construct — a page is never edited by hand, ` +
        `so this would otherwise ship as literal markdown.`,
    );
  }
}

/** Inline markdown → HTML, on already-escaped text. */
const emphasis = (html) =>
  html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // `("` have already been escaped to `&quot;` by here, hence the `;`.
    .replace(/(^|[\s(;])_([^_]+)_/g, "$1<em>$2</em>");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/**
 * A name → route dictionary, longest name first so `DOGE-1` wins over `DOGE`.
 *
 * The names in the story's prose are the game's own, in the game's own capitals
 * — which is exactly what makes automatic linking safe here: a match is a full
 * uppercase run, so "the moon" in a sentence stays prose while "THE MOON" the
 * venue becomes a link. That is the whole point of this section, and the reason
 * the plan calls the library a graph rather than a pile of pages: a reader who
 * meets ARMSTRONG in the story is one click from his health, his drops and the
 * map of the place he is standing in.
 */
export function linkDictionary(groups) {
  const byName = new Map();
  for (const entries of groups) {
    for (const entry of entries) {
      if (!entry?.name || entry.name.length < 4) continue;
      if (!byName.has(entry.name)) byName.set(entry.name, entry.path);
    }
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  if (names.length === 0) return null;
  // A catalog knows him as CHIEF OF SECURITY and the prose calls him THE CHIEF
  // OF SECURITY, which is the same man — so an article in front of a name is
  // taken into the link rather than left stranded outside it.
  const article = (name) => (name.startsWith("THE ") ? "" : "(?:THE |A |AN )?");
  return {
    byName,
    pattern: new RegExp(
      `<[^>]+>|(?<![A-Z0-9'-])(?:${names
        .map((n) => `${article(n)}${escapeRe(escapeHtml(n))}`)
        .join("|")})(?![A-Z0-9'-])`,
      "g",
    ),
  };
}

/**
 * Turn a section's prose into HTML, linking each name in the dictionary the
 * FIRST time it appears on the page (`seen` carries across the page's blocks).
 * Linking every occurrence would leave a paragraph more link than sentence.
 */
export function prose(body, { heading, dict, href, seen = new Set() } = {}) {
  return paragraphsOf(body)
    .map((block) => {
      assertProse(block, heading);
      const html = emphasis(escapeHtml(block.replace(/\n/g, " ")));
      return `      <p>${dict ? link(html, dict, href, seen) : html}</p>`;
    })
    .join("\n");
}

function link(html, dict, href, seen) {
  return html.replace(dict.pattern, (match) => {
    if (match.startsWith("<")) return match;
    const name = resolveName(match, dict);
    if (!name || seen.has(name)) return match;
    seen.add(name);
    return `<a href="${href(dict.byName.get(name))}">${match}</a>`;
  });
}

/** The dictionary is keyed on raw names; a match is escaped, and may have
 * picked up the article in front of it. */
function resolveName(match, dict) {
  const plain = match.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  if (dict.byName.has(plain)) return plain;
  const bare = plain.replace(/^(?:THE|AN|A) /, "");
  return dict.byName.has(bare) ? bare : null;
}

/**
 * A section's opening sentence, stripped to plain text — the one line a chapter
 * can put in a meta description without handing over the chapter.
 */
export function firstSentence(body) {
  const [first = ""] = paragraphsOf(body);
  const plain = first
    .replace(/\n/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
  const stop = /[.!?](?=\s|$)/.exec(plain);
  return stop ? plain.slice(0, stop.index + 1) : plain;
}
