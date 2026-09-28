// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAM PAGE'S WORDS, READ — never written — by the mock.
//
// The words (the brief description, About This Game, the mature-content
// description) are not in this repository: they are the page's own prose, and
// a public copy would put it on a crawlable page somewhere else. Whoever
// reviews the page puts the private copy at tauri/store/steam.md, which is
// GITIGNORED, and the mock reads it; without it, the committed page shows its
// placeholders. This file only turns that markdown into paragraphs, keyed by
// the `## ` heading each section sits under, so it can be tested outside a
// browser (tests/steam_page_words_test.ts).

globalThis.steamPageWords = (() => {
  // The heading each slot of the page is filled from, lower-cased. Anything
  // else in the file — its preamble, a note to whoever fills the Steamworks
  // survey — is not shown.
  const SECTIONS = {
    brief: "brief description",
    about: "about this game",
    mature: "mature content description",
  };

  const slotFor = (heading) => {
    const key = heading.trim().toLowerCase().replace(/\s+/g, " ");
    return Object.keys(SECTIONS).find((slot) => SECTIONS[slot] === key) ?? null;
  };

  /**
   * @param {string} markdown
   * @returns {Record<string, string[]>} each slot's paragraphs, in order
   */
  function parse(markdown) {
    const lines = {};
    let slot = null;
    for (const line of markdown.split(/\r?\n/)) {
      const heading = /^##\s+(.+)$/.exec(line);
      if (heading) {
        slot = slotFor(heading[1]);
        if (slot) lines[slot] = [];
      } else if (/^#\s/.test(line)) {
        slot = null;
      } else if (slot) {
        lines[slot].push(line);
      }
    }
    return Object.fromEntries(
      Object.entries(lines).map(([key, body]) => [
        key,
        body
          .join("\n")
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
          .filter(Boolean),
      ]),
    );
  }

  /**
   * One paragraph's inline runs: `**bold**` becomes a strong run, everything
   * else is plain text (the page never interprets the words as HTML).
   *
   * @param {string} paragraph
   * @returns {{ text: string, strong: boolean }[]}
   */
  function inline(paragraph) {
    return paragraph
      .split(/\*\*(.+?)\*\*/)
      .map((text, index) => ({ text, strong: index % 2 === 1 }))
      .filter((run) => run.text);
  }

  return { SECTIONS, parse, inline };
})();
