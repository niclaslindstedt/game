---
title: The cutscene harness cannot show you a caption — it shoots the beat's first frame, before the typewriter has drawn anything
date: 2026-08-16
scope: content/cutscenes/, pwa/scripts/cutscene-preview.mjs
concepts: [cutscenes, captions, verification, typewriter, silent-failure]
---

`cutscene-preview.mjs` screenshots 120 ms into each beat, which is right for
staging and useless for a LINE: a `caption`/`say` beat is photographed with an
empty box, so a rewritten page cannot be judged from the contact sheet at all.
The box is drawn on the canvas, so `document.body.innerText` is empty too —
polling the page for your own words never fires.

To look at a page, hold on its beat INDEX and let the typewriter finish:
poll `window.__cutscene.beat` (`?debug&cutscene=<id>`, tapping every ~1.5 s to
advance the text beats before it), stop tapping on the target index, wait ~6 s,
then screenshot. A two-entry page needs the full wait — at 1.5 s it is still
mid-word.

**Get the index from the running scene, never by counting the generated
JSON.** `variants:` re-emits the scene per difficulty and the counted index
came out two beats late, landing on the next caption — which looks like a
successful shot of the wrong line. Log `beat` as it advances and read the
number off the scene that is actually playing.
