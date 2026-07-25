---
type: Fixed
title: Title screen frame rate
---

The title screen no longer recomputes the style of every element on screen sixty times a second: the moon's live orbital centre, which only the detonation overlay reads, was being written as an inherited custom property onto the shared parent of the whole screen. On the coin store — the busiest title surface — this alone cost most of the frame rate.
