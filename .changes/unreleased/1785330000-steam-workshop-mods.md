---
type: Added
title: Steam Workshop mods — author levels, monsters and sprites
---

Players can build their own venues, monsters and pixel art as a folder of YAML
and publish it to the Steam Workshop. A mod is authored in the same format the
game's own content is, validated by the same schema (`make mod-check`, or
`node mod/tools/cli.mjs check`), and loaded by the desktop build only — see
`mod/README.md` for the guide and `mod/examples/greenhouse` for a worked mod.

Several mods can be enabled at once, in a **load order** the player controls
(MODS → LOAD ORDER): mods apply top to bottom and the last one wins when two of
them ship the same sprite, level or monster, with a row saying so when a mod is
being overridden.

Mods can add their own **items** too — plain weapon and gear bases the loot
system rolls tiers onto, and named relics with fixed bonuses — authored in the
same `items/<rarity>/<id>.yaml` format the game's own use.
