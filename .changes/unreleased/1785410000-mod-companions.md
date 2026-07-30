---
type: Added
title: Mod-authored companions — a mod's spared elite can join the party
---

A mod can ship its own **companion roster** — who a spared elite becomes when it
joins you — as a `companions.yaml` at the mod's root, in the same format the
game's own roster is now authored in (`content/companions.yaml`). Point an elite
at one with `spareable: { companion: <id> }` and sparing it plays that
companion's own joining words before the figure falls in beside the hero,
fighting with its own weapon, earning its own levels, radiating its own aura and
talking over its own kills.

Sparing a beaten elite is one of the few decisions the game asks the player to
make, and until now the only figures a mod could hand over were the four the
game ships — so a total conversion's monsters, venues, script and loot could all
be its own while its allies stayed somebody else's. A mod's elite can still
recruit a shipped companion if that is what it wants.

The compiler checks a mod's roster with the same schema the shipped one goes
through: an unknown signature weapon, a sprite family with no frames, and a
signature power that grows a kit the companion hasn't got are all errors with a
field to blame rather than an ally that walks beside you swinging nothing.
`mod/examples/greenhouse` now ships a spareable elite and the companion she
becomes.

Also fixed: a mod's monster could not name a weapon or gear piece the **same
mod** shipped in its `loot.items`, because that one cross-reference resolved
against the base game's catalogs instead of base ∪ mod like every other.
