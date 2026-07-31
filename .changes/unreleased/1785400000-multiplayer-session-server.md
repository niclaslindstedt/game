---
type: Added
title: The session server
---

The simulation can now run in a process of its own — the foundation multiplayer
is built on. The desktop app compiles the engine for Node, forks it as a session
server, and speaks a delta-coded wire to the page; the game itself is unchanged
until the run loop moves across.
