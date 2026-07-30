---
type: Fixed
title: The blood cloud stopped leaking a canvas per frame
---

A long fight no longer fills the tab with baked gradients — every landed blow's
blood cloud used to mint a fresh glow canvas per puff per frame and keep it for
ever, which eventually made the browser discard its canvas memory and blanked
every label in the game.
