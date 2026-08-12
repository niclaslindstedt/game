---
title: A line assembled from TWO catalog entries is app-side, and moving a line from a BOX to a BARK re-prices it in milliseconds
date: 2026-08-12
scope: content/thoughts.yaml, pwa/src/game/drive-screen/
concepts: [thoughts, barks, length-budget, drive, testing, seams]
---

When one printed sentence is two authored lines picked by two different
questions — the drive's arrival is the trip's VERDICT (`driveVerdict`, chosen by
the journey) plus the PLACE (`driveVoice`, chosen by the destination) — do NOT
author the cross product in `content/`. Keep both halves as ordinary thoughts and
JOIN them where the box is filled (`arrivalLine`, drive-screen/voice.ts), so a
mod can still replace either half and the manuscript still transcribes two
entries. Join onto the first row of the first page rather than adding a page: a
page break turns one remark into two beats.

The trap that comes with the move: a line spoken in a MONOLOGUE box has as long
as the player takes to tap, and the same line BARKED over a moving picture has
only the beat it plays over. So a rehomed line is under a clock it was never
written against — and because it is now a CROSS PRODUCT, the combination that
overruns is one nobody wrote down. Pin it with a test that walks every
verdict × every destination against the beat's own numbers
(`tests/drive_bark_test.ts` vs `DRIVE.arrival.blackoutMs - sightMs`), and when
one overruns, move the BEAT first — the words are the writing, the beat is a
number (`blackoutMs`, with `arrivalHoldMs` following it or the crossing lands
mid-fade).

Mechanical note: `thoughtDef` THROWS on an unknown id, it does not return
undefined — so `if (!def) return` around it is dead code, and a missing id is a
crash rather than a silent line.
