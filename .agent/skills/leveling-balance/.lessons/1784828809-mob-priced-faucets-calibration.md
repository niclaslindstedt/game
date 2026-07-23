---
title: With mob-priced faucets, calibrate rows per BAND from sim dings — the level-diff premium and tier step pull opposite ways
date: 2026-07-23
---

After the 2026-07 rework every XP faucet is mob-priced (elite ×5 / boss ×10 /
arrow = 5 mob-kills, authored at the top of `content/leveling.yaml`), so a
row's `~N kills` annotation is the in-play design target. But `xp = N ×
referenceMobXp(L)` is NOT the right row value: on the bottom lanes and
nightmare the mob bands sit ABOVE the hero (level-diff premium up to ×1.5 on
a ×1.47-clamped base, plus elite/rare density), so a naive row runs ~0.5–0.7×
its annotation in play — while on JESUS the ×2.64 tier step outweighs the
premium and the same naive row runs ~1.5–1.7× over. Calibrate per band:
measure kills-per-ding with `simulate-run` (lane run for the bottom band;
`--start-level 40 --farm` for nightmare; `--level moon --start-level 58
--farm --rerun 30 --max-minutes 8` clear-chains for JESUS — short caps keep
runs at clear-pace and avoid dead farm stretches), then scale each row by the
Gaussian-smoothed (σ≈3, log space) annotation/measured ratio WITHIN its band
(1–39 / 40–57 / 58+). Smooth within bands only: the band seams are real
discontinuities (the tier step + each band's income mix), and the row cost
legitimately DIPS at the L58 seam because the JESUS tier multiplier carries
the rise. One calibration pass landed nightmare dead-on and JESUS within
~15%; don't iterate further — the residue is single-run noise.
