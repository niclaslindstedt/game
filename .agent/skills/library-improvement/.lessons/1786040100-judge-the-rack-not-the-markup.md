---
title: A fullPage shot of a library index is mostly empty until you un-lazy the images
date: 2026-07-28
scope: pwa/scripts/library/
concepts: [screenshots, lazy-images, judging]
---

Every sprite in a library rack carries `loading="lazy"`, which is right for a
reader and wrong for the capture harness: Playwright's `fullPage: true` grows
the picture without scrolling the viewport, so nothing below the first screen
ever enters the intersection observer and a bestiary index screenshots as three
rows of art followed by two hundred rows of bare text. That reads exactly like
a generator that lost its sprites, and it sent one session looking for a bug in
`copySprites`.

Force them eager before the shot and give the network a beat:

```js
await page.evaluate(async () => {
  for (const img of document.querySelectorAll("img")) img.loading = "eager";
  await new Promise((r) => setTimeout(r, 500));
});
```

Two more things from the same pass, both of which only the screenshot could
have told you:

- **A disambiguating qualifier goes UNDER the name, not in the trailing `.req`
  column.** That column is sized for an `L34`. A venue name in it (`BOOT HILL`)
  takes so much of a rack cell that the NAME — the only thing the row exists to
  say — folds mid-word: `LAB SCIENTI ST`. A `display: block` span inside the
  name gives it its own dim line and costs the row nothing.
- **A teaser rack should sample the axis its own sentence claims.** "104
  monsters across 6 venues" under six monsters all drawn from venue one
  illustrates the wrong half of the sentence. One per venue, in campaign order,
  says both numbers at once — and it fell out of the same change that stopped
  the front door leading with the bosses.
