---
title: An AGENTS.md rule that UNDERCOUNTS is worse than no rule — it teaches the next session to stop looking
date: 2026-08-10
scope: AGENTS.md
concepts: [drift, router, verification]
---

AGENTS.md said a minigame "meets the game in four places and must never meet it
in a fifth". An audit found eight. The four it named were all real and all
still correct — what was wrong was the CLAIM OF COMPLETENESS, and that is the
part that does damage: a session that trusts the count stops auditing after the
fourth hit, so every new coupling lands unchallenged and the rule drifts further
from the tree it is supposed to govern.

The fix that held was to keep the aspiration as a TEST rather than as a count
("delete the two folders and nothing outside them should be left orphaned"),
list the seams that genuinely exist, and mark which of them are deliberate
(`GameScreen` and `MinigameScreen` are two mounts on purpose — the prop sets are
disjoint) versus which are debt (a cloud-save slot named after one minigame).

The general form: when a router rule counts things, the count is a claim that
rots silently. Prefer a rule that states the INVARIANT and then enumerates the
current exceptions with a word on why each one is or is not acceptable.
