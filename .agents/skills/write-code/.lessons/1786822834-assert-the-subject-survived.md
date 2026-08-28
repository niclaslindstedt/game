---
title: An assertion about an object's state after an event is VACUOUS if the event can delete the object — assert it survived first
date: 2026-08-15
scope: tests/
concepts: [tests, false-green, assertions, drive]
---

`expect(machine.fire > 0).toBe(false)` passed for a bicycle for the wrong
reason: at the speed the test staged, a fourteen-kilo bike clears `snapForce`,
is torn in half and is REMOVED from `drive.traffic` — so the object being
questioned was a detached husk that nothing would ever have written to. The
test would have gone on passing if the rule it guards were deleted.

The shape generalises past the drive: any suite that stages an event and then
reads a field on the subject owes an assertion that the subject is still IN the
collection the system writes to. Here that is one extra line —
`expect(state.traffic.includes(machine)).toBe(true)` — and it is what turns
"the bike did not catch fire" into "the bike went through the ignition door and
did not catch fire".

The tell is a negative assertion (`toBe(false)`, `toEqual([])`, `not.toContain`)
whose subject is destroyed by the very event under test.
