---
title: A full-width pixel-button parks its label on the left
date: 2026-07-26
scope: pwa/src/styles.css
concepts: [buttons, labels, alignment]
---

`.pixel-button canvas { display: block }` means the button's `text-align: center`
does nothing — a block-level replaced element sits at the inline start. A button
sized to its own text hides this completely, so it only shows up on the FULL-WIDTH
footer buttons (CLOSE, RESUME, MENU, STORE/CANCEL), where the label reads as
jammed into the left padding.

`margin-inline: auto` on the label canvas is the fix, but scope it to the direct
child of the button and to the buttons that actually want it — `.pixel-button
canvas` is a descendant selector, and an auto margin inside a flex-row button
(the coin-store pack rows, the level-up stat buttons) eats the free space that
row's own `justify-content`/left-alignment depends on. The repo now has a
`.modal-action` class for the shared footer-button shape; put new footer buttons
on it rather than re-deriving the width/padding/centring per modal.
