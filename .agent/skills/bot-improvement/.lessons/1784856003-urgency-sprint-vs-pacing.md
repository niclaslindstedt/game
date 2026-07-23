---
title: Mark urgent branches with an explicit sprint throttle — never infer urgency from thought labels
date: 2026-07-23
---

The stamina-pacing block in `botAct` is a POST-decision modifier: it walks or
stands any steering input when the pool is low. That made reflex dodges
(meteor, storm, well, stampede on a clear field) and emergency bails
walk-paced whenever the pool was low — a walking-pace meteor dodge is a
death. Two rules from fixing it:

- **Urgency is declared at the branch, not inferred afterward.** The
  `sprint(input)` helper (state.ts) pins `throttle = 1` on the input, and the
  pacing block skips any input whose throttle is already set
  (`decided.throttle === undefined` gate). Dodges, emergency escapes,
  KEEP EXIT, GIVE GROUND, the boss orbit, and the gauntlet rush all
  `sprint()`. Do NOT branch pacing on `bot.lastThought` — thought labels are
  pure annotations the sim must never read back (the BOT VIEW contract).

- **Pace thresholds must be retuned when the engine's stamina economics
  change.** When walk regen dropped to 0.1x and running started burning the
  full drain at any pace, the old bravery-slid reserve floor (~25%) and the
  150px walk-threat ring were both wrong: the run threshold became a flat
  70% (the owner's rule — run only on urgency or a rested pool; bravery now
  only relaxes the pre-fight top-up bar, never the pacing), and the
  walk-threat ring widened to 260px because a pack that starts closing from
  200px catches a walking hero under the slower regen. Measure with
  `simulate-run` deaths/dmgIn across several seeds — a single seed is noise.
