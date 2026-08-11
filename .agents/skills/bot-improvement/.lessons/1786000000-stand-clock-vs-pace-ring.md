---
title: Gate the bot's STANDS on a contact clock, but leave the recovery WALK on the distance ring — swapping both cost 9% of the kills per minute
date: 2026-07-26
scope: content/bot.yaml
concepts: [stands, pacing, tuning-knobs]
---

Making the autopilot "more stamina aware" splits cleanly into two questions
that want DIFFERENT reads, and conflating them is a measurable regression:

- **"May I stand still?"** wants a CLOCK. `contactEtaSec` (perception.ts) —
  worst-case seconds until the first body is on the hero, every foe assumed to
  turn and sprint straight at him — is the honest gauge, because the cost of a
  bad stand is a free hit and the question is literally about elapsed time. A
  parked shooter 200px out never arrives; a charger at 600px arrives inside a
  second. `walkThreatDist` (a 260px ring) can't tell them apart.
- **"May I run?"** wants the RING. Pacing the APPROACH by the clock — walking
  at half speed toward everything slow — measured **9% fewer kills per minute
  and a level lost** over five seeds on `goodco_hq` easy. Keep the plain
  `foeDist <= walkThreatDist` there.

The one exception: a hero at the STAND FLOOR reads urgency off the clock too,
because he has nothing to sprint WITH — a burst of full speed, then the winded
jog (half speed, regaining nothing) for the rest of the level. Splitting it
that way turned the same change from −9% k/min into **+3% k/min, −10% damage
taken, one more victory and two fewer deaths** against baseline.

Related, on the EMPTY-POOL LOCKOUT (`STAMINA.emptyRegenLockMs`): regen is
frozen until the hero stands DEAD STILL for 2s uninterrupted, and any step
re-arms the whole window — so a spent hero who keeps shuffling never regains a
point. That makes it a race worth computing (`digInForLockout`): if the clock
beats the remaining debt, plant and pay it off in one LATCHED stand (a stand
abandoned at 1.9s bought nothing). The plant must outrank a branch's own
`sprint()` — the gauntlet RUSH sprints explicitly, and left alone it burns
every point the stand just bought and re-arms the lockout, cycling forever.
Reflexes (the preempt ladder) keep their licence.

Two mechanical traps that cost time here:

- `DT` in `tests/engine/helpers.ts` is **16 MILLISECONDS**, and `step()` takes
  ms. `ms / DT` is the tick count; `seconds / DT` silently drives ~0 ticks and
  the assertion fails somewhere far from the bug.
- A `content/bot.yaml` edit does NOTHING until `npm run levels` regenerates
  `engine/generated/botTuning.ts`. Vitest regenerates on its own pretest hook, so
  a test can pass while a hand-run `simulate-run.mjs` still uses the old knob —
  and an isolation experiment ("set the knob to 0 and re-measure") silently
  measures the same build twice.
