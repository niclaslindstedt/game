---
title: A prop that "vanishes" beside the hero on a night lot is his own lamp washing it out — judge its colour from OUTSIDE the pool
date: 2026-08-13
scope: content/maps/, content/sprites/
concepts: [night, screenshots, lighting, props, debugging]
---

A lawn tree next to the hero on the garage rendered as a bare dark ring with
grass inside it, and it looked exactly like a broken draw — it cost a round of
disabling render passes to find that the sprite was fine. The hero carries a
light on a `sky: earth` lot, and the crown's mid-greens sit close enough to
lit grass that inside the pool only the outline survives; the same tree 60 px
away reads as a solid green mass.

So before chasing a render bug on a night map, re-shoot the prop with the hero
well clear of it. And when judging whether a piece READS, judge it lit and
unlit — the parts of a machine a player is actually shown (a rocket's skirt and
legs, everything above being off-frame) must not be painted in the deepest
darks the palette has, or the one visible piece of it is a silhouette.
