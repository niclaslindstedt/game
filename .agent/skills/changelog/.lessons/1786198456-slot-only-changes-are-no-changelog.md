---
title: A change only the /preview/ or /branch/ slot can show is `no-changelog`, however much `pwa/src/` it touches
date: 2026-08-08
scope: pwa/src, pwa/pwa-plugin.ts, pwa/vite.config.ts
concepts: [no-changelog, deploy-slots, player-would-notice, skip-list]
---

"A player would notice" is scoped to the RELEASED build — the `/` slot and the
store binaries — not to the repo. Work gated on `isSecondarySlot(base)` (the
title footer's clickable commit link is the shipped example) changes nothing
any player can reach, so it takes the `no-changelog` label even though it lands
squarely in `pwa/src/` and `pwa/pwa-plugin.ts`, neither of which is skip-listed
in `check-changeset.mjs`. The red check is expected; the label is the verdict.

The same reading settles the near-miss that tempts a fragment out of you: such a
PR usually also corrects something the released footer PRINTS (here, the commit
hash the root slot stamps when it builds a tag). Metadata a developer reads off
a build is still not a player-visible change — do not mint a `Fixed` fragment
for it.
