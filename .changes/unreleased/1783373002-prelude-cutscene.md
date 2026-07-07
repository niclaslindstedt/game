---
type: Added
title: Movie-night prelude cutscene
---

Runs now open on a short scene: movie night, Ada leaves for chips and soda,
and never comes back. Tap advances a beat, SKIP jumps to the level intro.
Built on a new data-driven cutscene system (scenes are beat timelines in
`src/game/defs/cutscenes.ts`) with a `?cutscene=<id>` authoring workbench
and a headless storyboard-screenshot harness for iterating on scenes.
