---
title: A page reached from inside an app has to carry its own way back
date: 2026-07-27
---

The library's "no JavaScript" rule is the constraint the whole exercise rests
on, and it quietly decides UI questions too. The library is reached from the
title menu's LIBRARY row — a real navigation out of the app — and in the two
builds that matter most (the installed PWA and the native WebView) there is no
address bar and no back button on the other side. A reader who followed the row
had one gesture out: an edge-swipe nobody advertises.

The tempting fix is to show the exit only where it is needed, and there is no
way to do that here:

- `@media (display-mode: standalone)` is the obvious detector and it is wrong —
  a plain WKWebView reports `browser`, so the native build (the one case with
  the least chrome) is exactly the one it misses.
- Reading a `?app=1` the game appends needs JavaScript, which these pages do not
  get to have.

So don't detect. Render the exit unconditionally: a browser reader gets a link
they did not need, a native reader gets the only one they have. Make it
`position: sticky` — an escape hatch at the top of a four-screen bestiary page
is not an escape hatch — and put the header OUTSIDE the centred `.wrap` so the
bar spans the viewport instead of floating with a stripe of background either
side of it.

Two things the screenshot caught that the markup could not:

- A sticky bar at `rgba(…, 0.94)` looks like glass standing still and like a
  rendering fault the moment the page moves: text ghosts through it line by
  line. Make a sticky bar over a textured background fully opaque.
- The nav was making every page scroll sideways on a phone. The fix is never
  `overflow-x: hidden` on the page (it breaks `position: sticky`) — give the nav
  `flex: 1 1 <its own width>` so it drops to a line of its own before it has to
  squeeze, and only then let it scroll inside its own box. Scrolling is the last
  resort, not the first.

## Two other things worth generalising

**A generated page must not explain that it is generated.** "Every number here
is read out of the game and rebuilt with it, so it cannot drift" is a note to
the person who built the site, printed on four hundred pages for readers who
came to look up a boss's health. The provenance rule is a rule for the
GENERATOR; the pages are the evidence for it, not the place to argue it. Keep a
caveat only when it is about the GAME — "these are the figures with nothing of
the wielder in them" earns its line; "these figures come from the item card"
does not.

**Mixing the pixel font with the prose font inside one stat block reads as two
documents spliced together.** The split that works is by KIND, not by role: the
pixel font sets every number and every label, the sans sets every sentence. When
you move a figure into the pixel font, check the glyph coverage first — the en
dash in every damage range (`14–21`) was missing from `GLYPHS` entirely and was
silently falling back to the browser's monospace mid-number.
