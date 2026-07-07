---
type: Added
title: Injectable def registry
---

The engine exposes a `registerDefs` hook that swaps the active content catalogs (levels, enemies, equipment, abilities, difficulties, story items, cutscenes), letting the engine test suites run against synthetic fixtures independent of any shipped game content.
