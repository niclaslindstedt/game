---
type: Fixed
title: The page no longer scrolls under a modal in a browser
---

Dragging on a modal in a phone browser could pull the whole game down out of frame — the level-up chooser slid off the screen behind the browser's own pull-to-refresh spinner — because the drag reached the document instead of stopping at the modal; the document is now locked against scrolling for every game surface, and every in-game scroll box keeps its overscroll to itself.
