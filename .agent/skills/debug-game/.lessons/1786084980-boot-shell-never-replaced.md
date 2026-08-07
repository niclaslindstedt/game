---
title: A game stuck forever on the boot shell is a module-eval throw, not a game bug
date: 2026-08-07
---

Symptom class: the page shows the title, the tagline and "BOOTING…" and never
moves. Reported as an installed iOS PWA that "can't get past this screen",
which invites a chase through the service worker's precache, iOS Cache Storage
eviction, and WebKit feature support. It was none of those. That screen is
`.prelaunch` — the prerendered shell `pwa/index.html` ships for crawlers and
no-JS readers (§11.3.1) — and the ONLY thing that ever removes it is React
mounting over it. So it standing means `main.tsx` never finished evaluating.

Mechanism: any throw while the entry module evaluates kills the mount before
`createRoot` is reached, and the shell is left up as real, styled content — so
it reads as a frozen game rather than as an error, and it fails everywhere at
once rather than on the reporter's device. It shipped once as react 19.2.8
against react-dom 19.2.7 (`Minified React error #527`, thrown when the DOM
renderer is evaluated); a bad top-level import or a failed module-scope check
would present identically.

Triage shortcut — two facts settle it in a minute, and neither needs the
reporter's device:

- `document.documentElement.classList.contains("app-locked")` is FALSE.
  `main.tsx` adds that class BEFORE the first render, so a missing lock means
  the module never got that far. A crash during render leaves it true, and a
  crash after mount leaves the shell gone — both are different bugs.
- It reproduces in headless Chromium against a built `pwa/dist` served by a
  plain `python3 -m http.server`, which rules out the device, the browser
  engine and the service worker in one shot. Listen for `pageerror` and read
  it BEFORE forming any theory about caching.

Worth knowing while you look: CI can be fully green over this. Nothing in the
suite boots the built bundle, and Lighthouse scores the boot shell — which is
genuine prerendered content — so an app that does not mount at all still
passes lint, typecheck, ~6000 tests and the SEO gate.
