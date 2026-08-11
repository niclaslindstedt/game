---
title: An overlay painted ON a character must MULTIPLY, not repaint
date: 2026-07-30
scope: content/sprites/
concepts: [overlays, blending, hero-doll]
---

Authoring a coating that goes over an existing sprite (blood, mud, frost, soot)
and blitting it `source-atop` at full alpha DELETES THE CHARACTER: the dark
outline every sprite here is built on gets repainted, the shading flattens, and
a fully covered figure comes out as a coloured blob in the shape of a man. The
visor's amber, the chest light, the gear's own form — all gone.

Composite it with `multiply` instead, clipped to the subject's own alpha:

```js
coat.globalCompositeOperation = "destination-in";  // clip the coat to the body
coat.drawImage(bodyCanvas, 0, 0);
body.globalCompositeOperation = "multiply";        // soak it IN
body.drawImage(coatCanvas, 0, 0);
body.globalCompositeOperation = "source-over";     // …then lift it back
body.globalAlpha = GLOSS;                          // ~0.45
body.drawImage(coatCanvas, 0, 0);
```

Multiply alone goes to MUD over already-dark material (a black boot, dark hair),
which is why the second `GLOSS` pass exists — pure multiply looked like dirt on
the lower body and correct on the white EVA suit, so judge the overlay on the
DARKEST and LIGHTEST thing it can land on, not just one.

Two consequences worth planning for:

- The clip needs the subject's alpha kept somewhere, so it is TWO scratch
  canvases, not one — `multiply` happily paints over a transparent backdrop and
  will hang the coating in the air around the sprite.
- Because it multiplies, ONE set of coat sprites works over every material the
  game has. Do not author a variant per gear colour.

And leave HOLES in the top rung, scattered rather than aligned: three unpainted
cells that happen to line up read as a bright streak down the middle of the
sprite, which looks like a bug rather than like a gap in the coating.
