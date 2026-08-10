---
type: Changed
title: The main menu arrives about four times sooner
---

The game used to cut all 2,333 sprites out of the atlas before it would show you the menu, even though the menu draws about a dozen of them — which was, measurably, the entire wait on opening the game. Sprites are now cut the first time something actually draws one, so the menu comes up as soon as it is drawn rather than when the last unrelated sprite has finished decoding. Frame rate in a run is unchanged.
