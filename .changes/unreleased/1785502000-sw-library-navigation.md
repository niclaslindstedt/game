---
type: Fixed
title: The library is reachable without a trailing slash
---

Visiting `/library` in an installed or previously-visited browser opened the
game instead of the reference site — the service worker's navigation denylist
only recognised the trailing-slash form, so it answered the bare URL with the
cached app shell.
