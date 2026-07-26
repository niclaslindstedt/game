---
type: Fixed
title: The native app plays offline again
---

The native shell streamed the live website instead of serving the copy bundled
inside it, because `app.config.js` always set `extra.gameUrl` — which
`src/config.ts` treats as "skip the local server". Store builds now run fully
offline from the embedded game as designed.
