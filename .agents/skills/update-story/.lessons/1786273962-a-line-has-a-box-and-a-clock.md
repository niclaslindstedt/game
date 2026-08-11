---
title: A line's LENGTH is governed by the box it plays in and the seconds it has, not only by the page budget
date: 2026-08-09
scope: content/thoughts.yaml
concepts: [barks, length-budget, dialogue-box, drive]
---

The schema's `PAGE_WARN_CHARS` (~120) is the authoring ceiling; it is not the
whole constraint, and on a BARK it is not the binding one. Two things bite
first:

THE BOX. A bark plays in `DialogueBox` with `pointer-events: none` — nothing on
that screen can tap it — and the box folds a page longer than three visual rows
into tap-to-scroll SCREENS. On the reference phone that turned a 100-character
line into a first screen plus a "there's more" arrow pointing at a press the
player does not have, with the tail never shown at all. A player reported it as
a bug, and it was two: the line was too long AND the box was advertising an
action it could not offer.

THE CLOCK. A barked line has only as long as the beat it plays over. The drive's
opening is a fixed stretch of held road, so a page that reads past the end of it
lands over the crowd instead of over the empty road it was written for — which
for `drive_out_welfare` changes what the line MEANS.

So when a line plays over a moving picture, check both, and say the constraint
out loud in the manuscript's stage note: the next pass that "improves" the line
will otherwise lengthen it straight back. Do not restate the beat's LENGTH in
seconds in a lesson, a comment or a stage note without the number's owner beside
it (`DRIVE.opening`) — the seconds are a tuning knob and every copy of them goes
stale the first time somebody turns it.
