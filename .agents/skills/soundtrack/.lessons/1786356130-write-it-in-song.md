---
title: Write a score in `.song`, not in YAML — and the two authoring mistakes that cost the most
date: 2026-08-10
scope: content/songs/, content/music/
concepts: notation, authoring, tracker, figures
---

Writing THE LONG NOON in the `.song` notation took roughly a tenth of the
characters the YAML did, and the bar-check (`|`) caught two miscounts that the
YAML has no way to catch — in the YAML a mis-sized bar is just a rhythm that
shifted by a sixteenth, and it reads as a composition choice.

Two mistakes made repeatedly while writing the first score, both now settled by
the format but worth knowing before the first edit:

- **A figure line and note tokens cannot be mixed on one line.** `bass pump 2`
  fills the WHOLE section from its `chords` line; there is no way to say "pump
  for six bars then walk". A voice that enters partway through, or changes
  behaviour mid-section, uses the per-bar form (`roll:4` = that figure for one
  bar) in an otherwise longhand line.
- **A melody does not fit on one line and must not try.** Eight bars run off the
  edge and become unreadable, which defeats the point — the shape of the line is
  the thing being written. Four bars to a line, continued on an indented line
  that does not open with a voice name.

The division of labour that worked: **figures for everything accompanying**
(bass, pads, arpeggios, the kit) and **longhand for the tune**. A bassline typed
out by hand is a bassline that disagrees with the chord plan in bar 19.
