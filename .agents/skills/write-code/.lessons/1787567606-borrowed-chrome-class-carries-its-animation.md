---
title: Reusing another screen's chrome class inherits its ANIMATION lifecycle — override later in the sheet or the borrowed keyframe wins
date: 2026-08-24
scope: pwa/src/styles.css
concepts: [css, cascade, minigame, overlays, animations]
---

The rocket minigame reused `.drive-intro` for its title/controls cards and got
an invisible screen: that class carries `animation: drive-intro-lift 1900ms
forwards`, timed to a card that ALWAYS unmounts at 1900 ms — a second page that
outlives it sits under a container animated to opacity 0, still mounted, still
eating taps. Two traps in one:

1. A borrowed chrome class is not just a skin — it can carry a LIFECYCLE
   (self-lifting fades, filled `transform` states) tuned to the original
   screen's timing. Check its `animation:` before wearing it.
2. An equal-specificity override (`.rocket-intro { animation: none }`) placed
   EARLIER in styles.css silently loses to the original rule later in the
   sheet. DOM probes said the element existed; only a pixel screenshot showed
   it invisible. Either place the override after the original or double the
   selector (`.drive-intro.rocket-intro`).

Verify borrowed-chrome screens with a SCREENSHOT, not a DOM query — presence
is not visibility.
