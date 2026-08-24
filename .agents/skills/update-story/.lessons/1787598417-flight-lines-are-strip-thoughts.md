---
title: The flight's lines print as a bare thought strip, not a DialogueBox — keep them ONE page and short
date: 2026-08-24
scope: content/thoughts.yaml, pwa/src/game/rocket-screen/
concepts: [thoughts, minigame, presentation, length-budget]
---

The rocket flight renders its thoughts as a small centred PixelText strip
(`.rocket-thought`, ~20rem wide at scale 1) with no window, no portrait, no
speaker plate and no crawl — a man alone in a cockpit gets no dialogue box,
and the sky never parks for a line. So a flight thought must be ONE page and
roughly one sentence: a second page still turns on the bark clock, but a long
page wraps into a block hanging mid-sky over the play column. The manuscript
transcribes them as `**ME (thinks):**` under "Travel — THE FLIGHT". The
tip-over line is a ROTATION (`flight_tipping_0..2`, cycled by
`FlightBeats.tips`); the sky's surprises (first bird, first canopy, jet
stream, off-course) are once-per-flight latches in `FlightBeats`.
