---
title: A deck that garrisons the landing breaks every test that staged "open ground" beside the hero — fix the staging, not the deck
date: 2026-08-12
scope: content/maps/, tests/
concepts: [parts, mob-spawns, tests, staging]
---

Four suites failed when the moon moved onto its parts deck, and none of them
was about the map: story_test measured rush speed over ground that now has a
ridge in it (push-out read as movement), net_prediction walked "open ground
due east" through a garrisoned landing (un-predicted mob contact broke the
lockstep claim), items_test's chosen-seed boss haul rolled a SET piece its
tier list never anticipated (stream shift), and sim_party's one-minute window
stopped containing a ding (fewer bodies per minute is the model, not a bug).

The pattern: a test that stages a measurement near the hero on a SHIPPED map
is betting on that map's spawn model. The honest fixes are staging — clear the
furniture for a free-field measurement, clear the field for a prediction walk,
widen a tier list to what the roller can legitimately produce, size a sim
window to the garrison's kill rate. Reverting the deck to keep old stagings
green would be the tail wagging the dog.

Two more instances from the boss-roll reshuffle, same class:

- **A fixed offset from the hero can stand a body in the VOID.** A parts map
  is rooms sewn into unexcavated rock, so "hero.pos + 1200" is not open
  ground — the excavation push-out walks a staged pair apart before the
  mechanic under test ever runs (and near a map edge the bounds clamp snaps a
  stack to one corner, dist 0). CHOOSE the spot instead of offsetting: the
  boss's stand is the one point promised both open and far (the assembler's
  boss-walk floor), and clearing the field afterwards leaves it free.
- **A prediction walk must drain dialogue BEFORE measuring, not tap through
  it mid-loop.** The first-sight freeze is the server's; an unfreeze inside
  the measured window costs the client a one-tick disagreement and an easing
  reconcile that decays over the next publishes — which reads as a mysterious
  sub-pixel divergence (0.728 → 0.47 → 0.31…) and is a fact about dialogue,
  not prediction. An exponentially DECAYING divergence whose largest value is
  at the first publish is the reconcile easing, not a physics push.
