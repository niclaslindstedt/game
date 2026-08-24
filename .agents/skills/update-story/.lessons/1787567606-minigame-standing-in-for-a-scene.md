---
title: A minigame that replaces a cutscene owes that scene's story beats, said its own way — and both paths must exist, neither doubled
date: 2026-08-24
scope: content/thoughts.yaml, pwa/src/game/rocket-screen/
concepts: [minigame, cutscenes, thoughts, drift]
---

The rocket flight stands in for `voyage_moon` when MINIGAMES are on (the app
skips that one scene via `skipScene`), so the scene's load-bearing facts (the
tracker pings from the moon; nobody goes there for chips and soda) had to be
re-said as the flight's own barks in `content/thoughts.yaml` — or the played
path would silently lose plot. The manuscript now carries BOTH: the flight's
bark section and the cutscene marked "the film version — plays when the flight
is not flown; nobody gets both." When adding a minigame that replaces a scene,
walk the replaced scene line by line and decide, per fact: carried by the
minigame's voice, or lost on purpose. A tier-3 grep for the scene's key nouns
in the new voice file is the check.
