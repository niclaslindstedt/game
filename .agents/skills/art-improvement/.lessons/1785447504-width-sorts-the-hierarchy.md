---
title: Measure every family member's WIDTH before and after a size change — hierarchy fixes cascade
date: 2026-07-30
scope: content/sprites/
concepts: [hierarchy, width, families]
---

The "scale/hierarchy lies" rubric line is checkable with one number: the widest
row of each sprite's grid. A ten-line script over `content/sprites/<family>/`
prints it, and sorting that against the legend's `(role, Nhp)` shows the whole
family's threat ordering at a glance — far more reliably than eyeballing a
sheet, where a taller-but-thinner sprite reads as "bigger".

Run it BEFORE the first redraw and AFTER every install, because a size change
cascades. On THE BUNKER: widening the 380hp guards to fix their anatomy made
them out-mass an 1800hp resident; then giving the two nerd elites a proper
frame made THEM out-mass the 2600hp toughest resident. Neither was visible in
its own concept sheet — each only showed on a sheet holding the whole tier.
The pass ended up settling on one width per tier (fodder 13, guards 14,
residents 16) and the two under-drawn residents had to be redrawn as well, as
a candidate nobody had planned for.

```py
import re, glob
for f in sorted(glob.glob('content/sprites/<family>/*_0.yaml')):
    rows = [r[2:] for r in re.search(r'grid: \|\n((?:  .*\n)+)', open(f).read())
            .group(1).split('\n') if r.startswith('  ')]
    w = max(max(i for i,c in enumerate(r) if c!='.') -
            min(i for i,c in enumerate(r) if c!='.') + 1
            for r in rows if r.strip('.'))
    print(f, w)
```
