// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HTML escaping, alone in a leaf module on purpose.
//
// It used to live in `html.mjs`, which meant `story-doc.mjs` — a parser that
// reads `docs/story.md` and is part of the page MODEL — imported the page SHELL
// to get at four `.replace` calls. That edge pointed the wrong way (the model
// knows nothing of markup) and it closed a cycle the moment the shell needed
// anything from the model. `html.mjs` re-exports this, so every renderer still
// imports `escapeHtml` from where it always did.

export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
