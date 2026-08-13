---
title: A visual bug reported from a screenshot may already be fixed — date the BUILD from the picture before hunting the code
date: 2026-08-13
scope: pwa/src/game/
concepts: rendering, repro, build-provenance, screenshots, false-hunt
---

"The street lamps no longer have a cone light" came with a phone screenshot,
and the code on `main` was correct — the picture was from a build one commit
old. Two tells dated it, both IN the screenshot: the wagon read 94% DAMAGE with
no dents on it, and the gore was pastel. That pair is SFW mode as it behaved
before the branch that stopped withholding collision sprites — the same branch
whose `continue` had been skipping the mast's beam.

So before reproducing a render bug, read the screenshot for what the build
believed, not just for the missing thing: a setting whose behaviour changed
recently, a dial that disagrees with the art, a feature that is present or
absent. Then reproduce ON HEAD with that setting on, and only start reading
code if it still happens.

When it does still happen, do not pixel-peep a translucent overlay to decide
whether it was drawn. Patch the one draw call to a solid opaque colour
(`fillStyle = "rgba(255,0,255,0.9)"`), screenshot once, and the answer is
unambiguous — where the shape landed, how big it is, whether there is one per
object. Diffing two page loads does NOT work here: the drive diverges between
loads, so the diff is mostly traffic and smoke.
