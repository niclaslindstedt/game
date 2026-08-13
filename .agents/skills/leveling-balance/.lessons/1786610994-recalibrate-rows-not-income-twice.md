---
title: The parts-era row reprice kept L1-11 and cut L14-40 to ~0.45× — bands land, boot_hill legs are bot-variance
date: 2026-08-13
scope: content/leveling.yaml, content/ladder.yaml
concepts: [xp-curve, calibration, parts, simulator, lanes]
---

After the income levers (quests ×1.7, elite ×8 / boss ×15, +posts), the medium
lane still landed L22 vs intended 34: the L14-40 rows carried knot-era income
factors. The fix that measured true: author NEW monotone kills-per-level
annotations (~31 at L12 rising to ~49 at L40, versus the old 32→111) and derive
raw XP as `new_annot × (old_raw / old_annot)` — the old raw/annot ratio IS the
band's baked income factor, and multiplying a rising annotation by that rising
ratio keeps raw XP monotone by construction. Verified landings: easy 1→34,
medium rift leg on band (25-26 across seeds), hard-from-L20 →34+. Two reads to
remember: a dud boot_hill leg (0.6 k/min) in one sweep was the bot failing to
FIND the open-country garrison on that deal, not economics — the same map solo
cleared 25→37 at 29 k/min — so judge a lane across seeds before touching rows
again; and hard-from-scratch is unplayable for the bare-hands bot (0.5 k/min),
which is the lane's "help, not pace" design plus bot skill, not a curve fault.
