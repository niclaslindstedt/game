---
type: Changed
title: The game loads less than half as much before the menu appears
---

The startup path no longer downloads the simulation: the engine gained a menu-side entry point (`@game/menu`) carrying the catalogs and the saved-hero math but nothing that simulates, the compiled level and item catalogs are split into menu-facing and run-facing halves, the LOST & FOUND, the developer ARSENAL, the cutscene workbench, the soundtrack and the in-run sound banks load on demand, and the critical-path budget dropped from a temporary 1000 KB to Google's 170 KB compressed — with the real figure now 150 KB gzipped, down from 310 KB.
