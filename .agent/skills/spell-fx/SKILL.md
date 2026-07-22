---
name: spell-fx
description: "Use when creating or tuning the CAST POWERS — melee ARTS (STR), ranged TECHNIQUES (DEX), or magic SPELLS (INT): their pixel icons, their element-tinted cast effects, or their catalog balance (mana cost, cooldown, unlock stat/threshold, effect numbers). Drives the generate → look → evaluate → iterate loop with the spell preview tool: render the icon contact sheet and the cast-effect frames, judge them against the element/school language, refine the worst, and verify in the running game via the ?debug __cast hook."
---

# Authoring & tuning cast spells

The player-cast power system (mana-costed, CLASS-unlocked) has three
authoring surfaces, all data + presentation — the engine stays generic. A
hero's CLASS is their dominant offensive stat (`dominantSpellStat`): STRENGTH →
25 melee ARTS, DEXTERITY → 25 ranged TECHNIQUES, INTELLIGENCE → 25 magic SPELLS.
You only ever see your own class's list, and the spell bar stays hidden until
you unlock a power:

1. **The catalog** — three ladder files merged in `src/game/defs/spells.ts`
   (`SPELL_DEFS`): `src/game/defs/spell-ladders/{melee,ranged,magic}.ts`. Each
   entry's `stat` (`strength`|`dexterity`|`intelligence` — its class), `minStat`
   (unlock, a multiple of 10), `manaCost`, `cooldownMs`, `category` (`attack` /
   `aoe` / `defense`), `element`, `effect` (bolt / nova / rain / heal / shield /
   slow / buff), `icon`, and `blurb`. Adding a power is a new entry in the right
   ladder file — **not** an engine change. The cast path + regen + buff tick
   live in `src/game/sorcery.ts`; the class helpers (`heroSpellStat`,
   `unlockedSpellIds`, `isSpellAvailable`) in `src/game/items.ts`; the pool/regen
   tuning in config `MANA` / `REGEN`. INT always sizes the mana pool, so a
   martial build fuels its arts off the base pool + SPIRIT, or buys a deeper
   reservoir with some INT.
2. **The icon** — a 12×12 sprite YAML under
   `scripts/sprites/icons/spell_<id>.yaml`, drawn through the
   [`pixel-assets`](../pixel-assets/SKILL.md) cycle (load that skill — its
   palette rules and quality bar govern every icon). One bold, outlined,
   element-tinted motif, legible at the HUD slot's ~30px.
3. **The cast effect** — the marvellous element-tinted flourish, in
   `pwa/src/game/spell-fx.ts` (`spellCastEffects`) + the `spellcast` draw
   in `pwa/src/game/render.ts`, themed by
   `pwa/src/game/spellVisuals.ts` (the element palette + school labels).
   It rides ON TOP of the shared `lightning` / `nova` / heal / ward cues, so a
   defensive cast with no field FX still reads as "magic happened".

## The element / school language

Keep the look coherent so a spell reads at a glance:

- **Element** (`spellVisuals.ts` `SPELL_ELEMENT_COLORS`) sets the colour of the
  icon, the slot ring, and the cast bloom: storm=electric blue, fire=ember
  orange, frost=pale ice, holy=radiant gold, void=amethyst, arcane=magenta,
  blood=crimson, plus the martial themes steel=blade silver, earth=quake
  amber, wind=pale gale green, venom=toxic green.
- **School** (`category`) sets the motif + the bloom shape: `attack` → a
  bolt/lance/blade/arrow and a sharp rotating starburst; `aoe` → a burst/flame/
  cleave/volley and a broad expanding ring; `defense` → a shield/cross/shout/
  buff and a soft double halo. A power's icon motif should match its school so
  the picker reads. Two effect kinds are new for the martial classes: `rain`
  (the ranged AOE — lands its burst on a distant cluster, so its bloom is a
  tight muzzle flash at the hero + the `nova` cue at the target) and `buff` (the
  martial signature — a timed self-amp of the hero's own weapon
  damage/haste/speed; blooms a tight self-aura).

## The loop — generate → LOOK → evaluate → iterate

Never author blind. `pwa/scripts/spell-preview.mjs` is the eyes of this
skill (the spell analog of `weapon-swing.mjs`):

```sh
npm run assets                                   # rebuild the atlas first
node pwa/scripts/spell-preview.mjs icons     # contact sheet of ALL icons
#   (+ the mana potion + spirit glyph) → assets-preview/descriptions/names.png
# then, with a dev server on :5199 and playwright installed:
npx vite --port 5199 &                           # (npm install --no-save playwright)
node pwa/scripts/spell-preview.mjs cast inferno   # slowed cast, frame by frame
node pwa/scripts/spell-preview.mjs sheet          # one peak still per spell → grid
```

1. **Generate** — edit the icon YAML (or `spell-fx.ts` / the `spellcast` draw).
   Re-run `npm run assets` after any sprite YAML change (the atlas is a build
   output; never edit `pwa/src/game/assets/`).
2. **LOOK** — `Read` the rendered PNG. Judge the icon on the contact sheet: is
   the motif bold and centred, the element colour right, distinct from its
   neighbours? Judge the cast effect on the `cast`/`sheet` frames: does the
   bloom read as its school, tinted its element, and does it land ON the fight?
3. **Evaluate** against the language above and the
   [art style guide](../../../docs/art-style.md). Fix the worst first.
4. **Iterate** until it passes, then verify in the RUNNING game: open
   `?debug`, call `window.__cast("<id>")` (optionally `window.__scenario({...})`
   to stage targets and `window.__timeScale(0.15)` to slow it) and watch the
   real cast — what ships, not a mock.

## Balance

When you touch a spell's numbers, measure — don't guess. The headless sim
reports the spell economy (`src/sim/simulate.ts`: `combat.spellsCast` /
`manaSpent` / `spellsPerMinute`, and the `mana`/`maxMana`/`spirit` snapshots);
`node scripts/simulate-run.mjs --full` prints the `spells:` line for a build,
and `progression-chart.mjs` plots SPIRIT alongside the other stats. Every
lane bot (melee/ranged/magic) casts its class list (`src/game/bot.ts`
`pickSpellToCast`), so a long run exercises the whole loop. Sanity: a power
must be castable a few times the moment it unlocks (a mage's pool at unlock ≈
`MANA.base + minStat × MANA.perInt`; a warrior/ranger fuels the low tiers off
the base pool + SPIRIT), and its authored damage rides
`abilityPowerScale` like the abilities/granted spells so it keeps meaning the
same fraction of a level-appropriate healthbar all campaign.

## Where new code goes

| Change | File |
| --- | --- |
| A power's numbers / effect / unlock | `src/game/defs/spell-ladders/{melee,ranged,magic}.ts` |
| Shared types / class helpers / registry | `src/game/defs/spells.ts` |
| Mana pool / regen tuning | `src/game/config.ts` (`MANA`, `REGEN`) |
| Cast path / effect resolution / buff tick | `src/game/sorcery.ts` |
| Class gating (`heroSpellStat`, `unlockedSpellIds`, `isSpellAvailable`, buff mults) | `src/game/items.ts` |
| A spell icon | `scripts/sprites/icons/spell_<id>.yaml` (+ `npm run assets`) |
| A cast effect / its theming | `pwa/src/game/spell-fx.ts`, `render.ts` (`spellcast`), `spellVisuals.ts` |
| The spell bar / picker / unlock modal | `pwa/src/game/{SpellBar,SpellUnlockOverlay}.tsx` |
| Tests | `tests/engine/{spells,mana}_test.ts` |
