---
type: Changed
title: The game opens sooner, and the card takes a tap
---

The studio card now appears almost immediately instead of after the whole game had downloaded: the menu, its screens and the sprite atlas are fetched behind the card while it is up, and it still holds itself for its full three seconds — so the menu arrives exactly as finished as before, with the wait moved behind the card rather than in front of it. Tapping the card after the first second now always clears it, even on a slow connection where the game is not ready yet; you get a Loading screen until it catches up instead of a card that ignores you. The title theme now waits for the card to clear, since no sound can play before you touch the screen anyway.
