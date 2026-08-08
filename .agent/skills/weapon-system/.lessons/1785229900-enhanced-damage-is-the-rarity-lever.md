---
title: ENHANCED DAMAGE is the rarity lever — don't reintroduce a hidden multiplier
date: 2026-07-28
scope: content/item_rarity.yaml
concepts: [rarity, enhanced-damage, multipliers]
---

Weapon damage used to be moved by two invisible multipliers: a global ×0.5 on
every LOOTED weapon (uniques/legendaries/artifacts were exempt, because the
exemption keyed off `durability === undefined`) and `+2%/ilvl` above the base's
`levelReq`. Together they were most of what made a named weapon feel strong —
an artifact rode ×3.5–7.8 over a rolled copy of the same base on those two
terms alone. Both are gone. What replaced them:

- **A weapon's catalog `damage` and `cooldownMs` are exactly what it deals and
  waits.** No global damper, no ilvl growth, no balance knob. This finally makes
  `scripts/weapon-budget.mjs` honest — it authors against an effective-DPS line
  and never accounted for the halving, so every authored figure had been 2× what
  a player actually swung.
- **`Equipment.enhancedDamage`** — D2's `+X% Enhanced Damage`, rolled uniformly
  inside a per-tier band authored in `content/item_rarity.yaml`, stamped at mint,
  frozen for life, and PRINTED ON THE ITEM CARD. It is now the whole reason a
  rarer weapon out-hits a white one of the same base.
- **The horde carries the difficulty** (`MENACE.mobHpBase`), not the item.

## What this means when you author or rebalance

**Item level no longer touches weapon damage.** It gates and sizes AFFIXES, and
it prices a named item's bonus budget (`weapon-ilvl.mjs`). A deep find of an old
base is not automatically better — if you want that, it has to come from the
roll or the affixes.

**A named weapon's power is its authored bonuses plus its ED band, full stop.**
If a chase tier reads flat in play, fix it by authoring better bonuses or by
moving that tier's band in `item_rarity.yaml` — never by adding a multiplier
back into `weaponDamageFor`. The whole point is that a player can read the
number off the card.

**A named WEAPON takes no `baseRoll`.** Its per-drop variance IS the ED roll
(wide and visible); `baseRoll` survives only for named ARMOR, where it is baked
into the stamped `armor`. Tests and tools that reached for `baseRoll` on a
weapon need `enhancedDamage` instead.

**ED is drawn off `fxRng`, not `rng`.** Like the make-quality range roll it is a
draw on an item the loot sequence has already chosen, so adding it cannot shift
WHICH items drop. Any new per-instance roll should follow the same rule, or
every existing seeded drop test changes.

## The band ladder, and why it is shaped this way

```
magic      +10–50%     rare       +30–90%     set        +75–150%
unique    +100–200%    legendary +150–250%    artifact  +250–700%
```

Two properties are load-bearing and the schema enforces the first:

1. **The ladder never sags** — neither `min` nor `max` may sit under the tier
   below (`item-schema.mjs` fails the build). A rarer weapon must beat a commoner
   one of the same base whatever either rolled.
2. **The artifact band is deliberately the widest in the game.** A floor
   artifact (×3.5) only matches the finest legendary; a perfect one (×8.0) is
   more than twice that. That spread is the endgame chase — the reason to keep
   farming a boss whose drop you already own. Narrowing it removes the point of
   farming; widening it makes the tier a lottery.

The named bands were derived, not guessed: `2 × (1 + 0.02·(ilvl − req))` is
exactly what each named tier LOST when the two hidden multipliers went, measured
per tier off the catalog. Unique lost ×2.00–3.08 (band restores ×2.0–3.0),
legendary ×2.80–3.08 (×2.5–3.5), artifact ×3.52–7.76 (×3.5–8.0).

## The knock-on nobody expects

Giving magic/rare a real ED roll makes the EVERYDAY loadout stronger, which is
why `MENACE.mobHpBase` went 2 → 2.5. And because white starter weapons roll no
ED, that same bump lands on the opening fight undiluted — the calibration-anchor
starters have to be retuned by the same factor. See the `simulate-run` lesson on
recalibration for the measurement loop and the exact file list.

Calibrate that figure against the everyday magic/rare loadout, NOT against what
a chase weapon does. A perfect artifact leaving the player overpowered is the
INTENT — it is what the farm is for — and the menace meter is the system that
answers it. Flattening the everyday game to police the top end trades the whole
curve for one outlier.
