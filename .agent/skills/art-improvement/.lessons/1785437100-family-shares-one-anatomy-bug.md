---
title: Hierarchy and identity are FAMILY properties — read the defs, then look at the family on one sheet
date: 2026-07-30
---

Two defects that are invisible sprite-by-sprite and obvious the moment the
family is lined up together.

**Identity collision.** Five of GOODCO HQ's humans (guard, security chief,
engineer, night manager, architect) were built from the same torso template, in
which the ARMS are the same char as the torso with no seam between them. Every
one of them therefore read as a blob, and the four in navy or grey read as the
SAME blob — the elite CHIEF was indistinguishable from the 64hp GUARD at a
glance. That is one defect, not five, and it only shows on a `sheet <all the
family's mobs>` where the identical silhouettes line up. So when a level pass
turns up several same-family candidates, diff their TEMPLATES before sketching
and fix the shared rule once (here: a 1px darker sleeve column plus an `O` seam
between arm and torso, which costs 2px of width and gives every mob arms), then
differentiate each on top of it — silhouette, headgear, one accent colour.

The same move pays off in reverse: when one sprite in a family reads badly and
its siblings read well, the fix is usually to READ THE STRONGEST SIBLING'S YAML
and adopt its language rather than invent one. Mars's `marsrock_*` trio were
smooth two-tone potatoes while `marsboulder_*` in the same family carried a dark
outline, a sun-caught dust rim just inside it, a broad lit face and a deep
shadow — copying that structure fixed all three at once.

**Hierarchy.** `art-audit.mjs level <id>` prints `(role, Nhp)` in its legend, so
read it and make sure the drawing sorts the way the numbers do. The classic
offender is a tanky mob drawn *smaller and quieter* than a squishy minion, which
the eye alone misses: GOODCO had an 80hp named minion on a 16² canvas while a
55hp one sat on 20². Moving him to 18² (between the 16² rank and file and the
20² heavies) fixed the lie without touching `radius` or any balance number. The
defs also give speed, `gore` and dialogue — the raw material for the Phase 4
brief.
