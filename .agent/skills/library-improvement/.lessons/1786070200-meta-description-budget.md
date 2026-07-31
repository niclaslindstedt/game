---
title: Write the meta description to the 160-char budget FIRST — the natural sentence is always 240
date: 2026-07-31
---

`library_test.ts` asserts every page's description matches `[^"]{20,160}` —
Google's cut. Writing the sentence the way it wants to be written and then
trimming produced 240 characters on the first try and needed two rounds, on a
section whose four pages differ by 15 characters of name and would have passed
or failed together.

The natural wording was a full sentence with a subordinate clause:

> AMELIA EARHART joins the party if you spare the elite of the same name on THE
> RIFT — one of the Gone in Space companions: 150 health, BLUNDERBUSS in hand, a
> rank of FULL BROADSIDE every 3 levels, and what every rank of it actually
> comes to.

The shape that fits is **name, one-clause what-it-is, then bare facts separated
by commas, full stop**. No "and what X actually comes to" tail — that clause
says nothing a searcher can act on and is the first thing the result page eats:

> AMELIA EARHART, a Gone in Space companion — spared on THE RIFT rather than
> finished. 150 health, BLUNDERBUSS, FULL BROADSIDE every 3 levels.

Two rules that generalise:

- **Budget the variable parts.** The fixed frame is what you control; the
  catalog supplies the name, the venue, the weapon and the power, and the
  LONGEST combination is what has to fit. Compose the description for the
  worst-case entry (here GRIGORI RASPUTIN + EXECUTIONER'S AXE + DEEPENING
  FROST, 149 chars) rather than for a typical one, or the test fails on one
  page out of four.
- **An INDEX description must not list its entries.** Four names cost 45
  characters and pushed everything actionable past the cut — and the names are
  on the page the reader lands on. Same rule the landing page already
  discovered when a sixth section pushed its fuller phrasing past 160.

Print the lengths before rendering anything: one `console.log(d.length, d)`
over the model catches it in ten seconds instead of in a test run.
