---
type: Changed
title: Faster initial load
---

The playable game screen and the engine renderer it pulls in now load on demand once a run begins, instead of shipping in the entry chunk — shrinking the critical-path JavaScript the browser must fetch and parse before the title menu appears.
