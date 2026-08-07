---
type: Added
title: Mods can ship real recorded sounds
---

A mod can now replace any of the game's 135 sounds with a real `.wav` or `.mp3`, so a sound pack can bring professionally produced audio instead of synthesized voices. The file name is the whole of it — drop `sounds/enemy_killed.wav` into a mod and it is heard on every takedown — and `node mod/tools/cli.mjs sounds` lists every sound you can replace, what fires it, and what it is meant to sound like.
