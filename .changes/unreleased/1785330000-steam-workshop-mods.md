---
type: Added
title: Steam Workshop mods — author levels, monsters and sprites
---

Players can build their own venues, monsters and pixel art as a folder of YAML
and publish it to the Steam Workshop. A mod is authored in the same format the
game's own content is, validated by the same schema (`make mod-check`, or
`node mod/tools/cli.mjs check`), and loaded by the desktop build only — see
`mod/README.md` for the guide and `mod/examples/greenhouse` for a worked mod.
