---
title: Don't re-redraw recently-updated art (Phase 1, step 5)
date: 2026-07-11
---

A sprite can read a little awkward and still be freshly, deliberately made.
Two tells flag recent work: its git history (`git log`/`git blame` on the
family sprite-data module) and its own sprite-data comment — an elaborate,
just-finished rationale ("drawn on a 20×20 canvas so it looms over the
crowd", "drawn bulkier… so it looms over the 16px staff") is a shipped
redesign, not a placeholder. Check recency BEFORE locking the long list and
cut those candidates; a redraw of fresh art is churn, and the vote will
reject it. (A spacez pass learned this the hard way — redrew OPTIMUSK and
HAZMAT, both recently reworked, and both were voted out.)
