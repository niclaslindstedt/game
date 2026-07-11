---
title: Scripted early drops constrain levelReq
date: 2026-07-10
---

Anything in a level's `earlyDrops` (or dropped by kill ~2) must be
equippable when it arrives: HQ's `security_baton` drops at kill 2, so its
req is 1 even though it's the pool's second-best melee. Check every
guaranteed drop against the hero's level at that story moment.
