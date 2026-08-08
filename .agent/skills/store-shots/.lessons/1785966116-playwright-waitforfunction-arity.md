---
title: waitForFunction takes THREE arguments — options passed second are silently the page function's arg
date: 2026-08-05
scope: pwa/scripts/store-shots/
concepts: [playwright, api-arity]
---

`page.waitForFunction(pageFunction, arg, options)`. A recipe trigger that waits
for a staged event and passes `{ timeout: 40_000 }` as the SECOND argument does
not get a 40 s wait — Playwright takes that object as the page function's
argument and leaves the wait on its 30 s default. The failure reads as a
timeout with a number nobody wrote (`Timeout 30000ms exceeded`), which is the
tell: if the number in the error is not the number in your code, you passed the
options into the wrong slot. Pass `null` for the argument:
`waitForFunction(fn, null, { timeout })`.
