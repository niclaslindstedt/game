---
title: A front-door row gated on state needs its own test — ctxFor's roster is empty
date: 2026-07-31
---

`tests/content/menu_tree_test.ts`'s `ctxFor` wires every context field to
something truthy (`hasResume: true`, `hasVault: true`, `canQuit: true`) EXCEPT
`roster`, which defaults to `[]`. So the moment a front-door row is gated on the
roster having a hero, it silently vanishes from the two tests that pin the whole
main-menu row ORDER — and they read as "this build has everything" while
testing a build that doesn't.

Pass `roster: [HERO]` in the build-shape tests (there is a `HERO` literal at the
top of the file for it) and assert the hidden case in a test of its own. Same
trap waits for any future context field somebody adds to `MenuContext` without
giving `ctxFor` a populated default.
