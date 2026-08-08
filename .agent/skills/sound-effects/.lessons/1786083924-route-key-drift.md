---
title: The event→sound route key exists in four places, and a drift is silent
date: 2026-08-07
scope: pwa/src/game/sfx/
concepts: [route-key, drift, mods]
---

`type|weaponClass|crit|kind|tier` is built by `routeKey` (`sfx/index.ts`),
`matchKey` (`generate-sounds.mjs`), `soundMatchKey` (`mod/tools/build.mjs`)
and enumerated as `MATCHABLE` (the schema). A sixth field on ONE of them
makes every event lookup miss — and nothing in the shipped game goes quiet,
because the imperative fallbacks in `combat.ts`/`world.ts`/`pickups.ts` were
recorded FROM the catalog and keep playing the byte-identical sound. The only
casualty is a MOD's `on:`-routed replacement, which no shipped code path
exercises.

It happened: the runtime's key carried the event's own `sfx` (a legitimate
DEDUPE field — two powers in one step are two sounds) in the routing slot.
Every `content/sounds/*.yaml` edit had been a no-op for event-driven sounds,
and mod sound replacement had never worked at all.

Two lessons:

- **Never test a key by rebuilding it.** `sound_catalog_test.ts` compared the
  generator's formula against the generator's own output and agreed with
  itself. `catalog_routing_test.ts` now drives `playEventSounds` with a
  SENTINEL catalog entry the fallback could never produce — the only way to
  prove the catalog was reached rather than merely present.
- **Separate "which sound" from "is this the same noise".** They wanted
  different fields, and collapsing them into one function is what let the
  drift in.
