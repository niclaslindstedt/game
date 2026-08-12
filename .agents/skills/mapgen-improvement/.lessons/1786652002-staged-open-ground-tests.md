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
