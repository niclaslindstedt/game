---
type: Changed
title: Menace works at endgame — mobs lag-follow hero damage
---

The horde now tracks only a fifth (`MENACE.damageLevelTracking`, 0.2) of the hero's weapon-output excess over their character level, instead of matching it 1:1. A full match pinned time-to-kill flat and stopped a strong build from ever OVERKILLING — which starved the menace (RAMPAGE) evolution ratchet, so the endgame never actually ramped. Now a geared hero pulls ahead of the base horde hp and the ratchet climbs (a level-99 spec reaches menace stage ~5 in seconds of slaughter, and better gear pushes it higher). A new **MOB DMG TRACK** developer-balance knob (`mobDamageTracking`) tunes it at runtime: 0 decouples toughness from weapon output entirely (maximum rampage), higher chases the hero's dps harder.
