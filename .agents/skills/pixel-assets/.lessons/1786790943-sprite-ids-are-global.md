---
title: A sprite id is GLOBAL across every family — the loader refuses a second one, after you have drawn it
date: 2026-08-15
scope: content/sprites/
concepts: [naming, families, generators]
---

`content/sprites/<family>/<id>.yaml` looks namespaced by its folder and is not:
`scripts/sprite-data/load-yaml.mjs` keys the whole catalog by bare `name`, and a
duplicate is a hard build error — `sprite "plant" defined by both "goodco" and
"prelude"` — thrown by `make assets` AFTER the grid is authored and the file is
on disk.

So before naming a new sprite, check the whole tree, not the family:

```sh
find content/sprites -name "<id>.yaml"     # or: grep -rn "^name: <id>$" content/sprites
```

The obvious generic words are the ones already taken — `plant`, `table`,
`window`, `door`, `lamp` all exist somewhere. Reach for the thing's own name
(`houseplant`, `doormat`, `bookshelf`) rather than its category, which also
reads better in a scene's YAML.
