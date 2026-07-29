---
title: A one-class override of .pixel-button padding must come AFTER it in styles.css
date: 2026-07-29
---

`.pixel-button` sets `padding: 0.75rem 1.5rem`, and a per-button modifier
(`.defeat-retry`, `.defeat-quit`, …) is also a single class — so the two TIE on
specificity and the cascade falls to document order. A modifier declared earlier
in `styles.css` than the `.pixel-button` block therefore does nothing at all,
silently: no warning from the linter, no error in the browser, and the button
still looks plausible because it keeps the base padding.

It is invisible in code review and it does not even show in a screenshot on its
own — you have to MEASURE. A button intended to be visibly bigger came out
44 px tall in the capture, exactly `5px glyph × 4 scale + 12px × 2`, i.e. the
base padding; the "0.9rem" that was supposed to carry it had lost the cascade.

Two habits fix it: put new `.pixel-button` modifiers next to `.modal-action` /
`.modal-close-btn`, which already sit after the base block, and when a size
override "seems not to be doing much", measure the box in the screenshot against
the base padding before touching the numbers.
