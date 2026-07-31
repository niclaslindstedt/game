---
type: Added
title: Multiplayer — the wire
---

A session server can now open a UDP port and a Steam lobby, admit remote
clients behind a challenge handshake and an optional password, seat them as
spectators of the host's run, and carry chat and `/players N` between them.
Steam builds only; the HOST and JOIN screens land with the rest of the
renderer cutover.
