---
type: Added
title: Hand a game, join a friend's, and watch it together
---

The Steam build can now open a run to other players, and the title menu has the
three doors that reach it: **HAND GAME** (who may come in, how many seats, an
optional password, which port to try, and a firewall check with a one-press
remedy), **JOIN GAME** (the server browser — every session this Steam account
can see, with the ones this build cannot join greyed and saying why rather than
hidden), and **JOIN BY ADDRESS** (a typed `hand:port`, with the addresses this
device has joined before one press away).

A joiner is a **spectator**: they see the run exactly as the hand does, stand on
the roster, and can talk. The session's chat sits in the bottom-left corner of
the field — ENTER opens it, ENTER sends — and carries the slash commands the
server answers, `/players N` included. While the run is paused, a live **SESSION
panel** prints the address a friend should type (the port the socket actually
got, never the one that was asked for), what the router said to the automatic
port mapping, and who is in the seats with their ping.

Accepting a Steam invite while the game is closed now lands in the right
session, and so does a shared `--connect` link.
