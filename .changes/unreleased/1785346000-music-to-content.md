---
type: Changed
title: The soundtrack moved into content, and mods can score their own levels
---

All five scores now live in `content/music/*.yaml` as readable tracker modules
instead of TypeScript, a Steam Workshop mod can ship tracks of its own and name
one from a level's `music:`, and a level naming a track nobody ships is now a
build error rather than a venue quietly playing the moon's theme.
