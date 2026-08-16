---
title: The cutscene harness shoots each beat's FIRST frame — so it can show you neither a caption nor a walk, and both need the scene polled live
date: 2026-08-16
scope: content/cutscenes/, pwa/scripts/cutscene-preview.mjs
concepts: [cutscenes, captions, blocking, verification, typewriter, silent-failure]
---

`cutscene-preview.mjs` screenshots 120 ms into each beat. That is right for
staging and blind to the two things most often wrong.

**A LINE.** A `caption`/`say` beat is photographed with an empty box, so a
rewritten page cannot be judged from the contact sheet. The box is drawn on the
canvas, so `document.body.innerText` is empty too — polling the page for your
own words never fires. Hold on the beat INDEX and let the typewriter finish:
poll `window.__cutscene.beat` (`?debug&cutscene=<id>`, tapping every ~1.5 s to
advance the text beats before it), stop tapping on the target index, wait ~6 s,
then shoot. A two-entry page needs the full wait.

**Get the index from the running scene, never by counting the generated JSON.**
`variants:` re-emits the scene per difficulty and the counted index came out two
beats late, landing on the next caption — a successful shot of the wrong line.

**A WALK.** A `move` beat is photographed before the actor has left, so an actor
clipping through scenery mid-leg never appears. No prop is solid and the stage
sorts by floor mark, so a leg authored across a piece of furniture just plays.
Poll `window.__cutscene.actors` and shoot when the one you care about is
`moving` and near the prop's `x`; a `deviceScaleFactor: 3` page plus a
`clip` box makes the overlap readable (stage units → screen is ×3 at +86, +6 on
an 844×390 viewport).

**In a test, the compiled prop is `{ kind, pos }`, not the YAML's
`{ sprite, at }`** — read the wrong pair and every prop reads `undefined` and
the check passes over nothing.
