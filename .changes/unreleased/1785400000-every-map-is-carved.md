---
type: Changed
title: Every map is carved fresh — the hand-drawn layouts are gone
breaking: true
---

The boss is never where it was last time. Every mission's map — the rooms, the
walls between them, the props, the horde's knots, the caches, the trader's pitch
and the boss's hiding place — is now carved from the venue's own blueprint on the
run's seed, on every run, for every player. The hand-drawn layouts the campaign
shipped with have been deleted, and with them the second run of a map being a
commute: no intended route is emitted, so the guidance arrow stays silent and the
fog-of-war minimap is the only record of where you have been. The DEVELOPER →
GENERATED MAPS switch is gone because there is nothing left to switch between;
MAP SIZE stays, and picks the scale.

A level file is now a MISSION — the venue minus its floor plan: its story, its
rung on the ladder, its hazards, its merchant, its loot pools. Its map lives
beside it in `content/maps/<id>.yaml`, and a mission that tries to author a wall,
a spawn, a prop or a coordinate is refused at build time by name. Mod authors get
the same split and the same refusal, plus a `bystanders` list for the neutral
cast an errand sends the hero to talk to.

The keycards open rooms the carve picked: a blueprint names the KIND of place
worth sealing and the keys that open one, and the carve hangs a door on the
deepest such district it can afford to lock — never one whose sealing would cut
the map in half, and never with the landing, the objective, a set piece or a
placed item inside it, so the key is always reachable without the key. Each
locked room pays for the walk with a cache of its own, and BOOT HILL's buried
control room now needs the marshal's card before the lift will come. The sentries
walk a beat too, swept down the length of whatever room the carve grew them in
rather than pottering on their posts.
