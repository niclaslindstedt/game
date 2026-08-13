---
title: A line with no box, no name and no portrait is authored in CODE — and still owes the manuscript, including a presentation mode's TWIN of it
date: 2026-08-07
scope: pwa/src/game/drive-screen/
concepts: [drive, placards, manuscript, barks, sfw]
---

The drive minigame's words (`GLUED_BARKS`, `CROWD_THOUGHTS`, `WITNESS_LINES`)
live in `pwa/src/game/drive-screen/placards.ts`, not `content/thoughts.yaml`. A
`ThoughtDef` is a speaker's NAME, a PORTRAIT and PAGES the box flows into a
measured column and the player taps through; a line floating over a head on a
road going past at 120 mph has none of those four. It is a BARK, like a boss's
set-piece line — and the chain still applies: `docs/story.md` gets the beat,
`docs/manuscript.md` gets every line verbatim, and the manuscript's "Where the
data lives" table gets a row pointing at the module.

**A PRESENTATION MODE THAT CHANGES WHAT THE GAME SAYS IS A SECOND SCRIPT, NOT A
FILTER.** SFW's twin lists (`placards-sfw.ts`) owe the manuscript a full
transcription of their own — every line, in narrative order, under its own
heading — because the chain cares that a line is WRITTEN DOWN. Two writing rules
came out of authoring them: the words must agree with what the mode DRAWS (a
bystander shouting about pieces of somebody over a shower of glitter tells the
player exactly what the mode is refusing to show), and the SHAPES survive the
swap even when nothing else does — a thought stays private, a shout stays
unheard, a reaction stays short and badly formed.

Two mechanical traps for any such list. The sim indexes a list it has never been
shown, so every twin must PAIR with the same count AND be wrapped against its
OWN length (a picker taking the flag, never a modulo at the call site). And the
camera shows ~308 world px past the bumper, so a line fading in beyond
`READ_PX` (260) is drawn half off the right edge.
