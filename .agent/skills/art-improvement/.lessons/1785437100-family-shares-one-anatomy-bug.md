---
title: A whole family can share ONE anatomy bug — look for it on a side-by-side sheet
date: 2026-07-30
---

Five of SPACEZ HQ's humans (guard, security chief, engineer, night manager,
architect) were built from the same torso template, in which the ARMS are the
same char as the torso with no seam between them. Every one of them therefore
read as a blob, and the four in navy or grey read as the SAME blob — the elite
CHIEF was indistinguishable from the 64hp GUARD at a glance.

That is one defect, not five, and it is invisible when you judge sprites one at
a time: it only shows on a `sheet <all the family's mobs>` where the identical
silhouettes line up. So when a level pass turns up several same-family
candidates, diff their TEMPLATES before sketching, and fix the shared rule once
(here: a 1px darker sleeve column plus an `O` seam between arm and torso, which
costs 2 px of width and gives every mob arms), then differentiate each mob on
top of it — silhouette, headgear, one accent colour. The per-mob work after
that is small and the family stops looking like recolours of one man.

The paired check is HIERARCHY: `art-audit.mjs level <id>` prints `(role, Nhp)`
in its legend, so sort the candidates by hp and make sure the drawing sorts the
same way. SPACEZ had an 80hp named minion on a 16² canvas while a 55hp one sat
on 20²; moving him to 18² (between the 16² rank and file and the 20² heavies)
fixed the lie without touching `radius` or any balance number.
