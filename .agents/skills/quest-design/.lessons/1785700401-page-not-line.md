---
title: Author a page as a PARAGRAPH — hand-broken lines are a convention that was deleted
date: 2026-07-31
scope: content/conversations/
concepts: [dialogue, formatting, pages]
---

The dialogue box flows an authored line into whatever column the device really
has (`wrapPage` + `useTextColumn`), so a line is a paragraph and the renderer
owns where rows break. The old convention — typing ~34-character lines against a
fixed box — is gone, and writing to it produces a ragged half-width column with
the right of the window empty.

It is easy to write to the dead convention anyway, because the YAML LOOKS like
a box. Nine quests and three conversation trees were authored that way and the
schema flagged 47 pages at once; a chain written by eye will do it again.

Two things the reflow taught that the warning does not say:

- **The budget is per PAGE, not per line.** Splitting one long page into two
  lines does not help — a `say` block is one page. Fixing an over-long page
  means shorter words, or a second NODE with a `goto` between them.
- **A second node is usually the better fix.** The surveyor's 181-char reveal
  became two nodes with a choice between them and reads better than it did as
  one wall; the assessor's apology got its own page instead of being trimmed to
  fit. Reach for the node before you reach for the delete key — the line you
  would cut is often the one worth keeping.

Mechanical joining is a trap for the `...` beat: a held pause merged into the
sentence after it and left a stray quoted scalar that broke the YAML parse.
