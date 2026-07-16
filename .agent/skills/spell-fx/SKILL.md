---
name: spell-fx
description: "Use when creating or tuning the CAST SPELLS — their pixel icons, their element-tinted cast effects, or their catalog balance (mana cost, cooldown, unlock INT, effect numbers). Drives the generate → look → evaluate → iterate loop with the spell preview tool: render the icon contact sheet and the cast-effect frames, judge them against the element/school language, refine the worst, and verify in the running game via the ?debug __cast hook."
---

# Authoring & tuning cast spells

The player-cast SPELL system (mana-costed, INTELLIGENCE-unlocked) has three
authoring surfaces, all data + presentation — the engine stays generic:

1. **The catalog** — `src/game/defs/spells.ts` (`SPELL_DEFS`): each spell's
   `minInt` (unlock, a multiple of 10), `manaCost`, `cooldownMs`, `category`
   (`attack` / `aoe` / `defense`), `element`, `effect` (bolt / nova / heal /
   shield / slow), `icon`, and `blurb`. Adding a spell is a new entry here —
   **not** an engine change. The cast path + regen live in
   `src/game/sorcery.ts`; the pool/regen tuning in config `MANA` / `REGEN`.
2. **The icon** — a 12×12 sprite YAML under
   `website/scripts/sprites/icons/spell_<id>.yaml`, drawn through the
   [`pixel-assets`](../pixel-assets/SKILL.md) cycle (load that skill — its
   palette rules and quality bar govern every icon). One bold, outlined,
   element-tinted motif, legible at the HUD slot's ~30px.
3. **The cast effect** — the marvellous element-tinted flourish, in
   `website/src/game/spell-fx.ts` (`spellCastEffects`) + the `spellcast` draw
   in `website/src/game/render.ts`, themed by
   `website/src/game/spellVisuals.ts` (the element palette + school labels).
   It rides ON TOP of the shared `lightning` / `nova` / heal / ward cues, so a
   defensive cast with no field FX still reads as "magic happened".

## The element / school language

Keep the look coherent so a spell reads at a glance:

- **Element** (`spellVisuals.ts` `SPELL_ELEMENT_COLORS`) sets the colour of the
  icon, the slot ring, and the cast bloom: storm=electric blue, fire=ember
  orange, frost=pale ice, holy=radiant gold, void=amethyst, arcane=magenta,
  blood=crimson.
- **School** (`category`) sets the motif + the bloom shape: `attack` → a
  bolt/lance/beam and a sharp rotating starburst; `aoe` → a burst/flame and a
  broad expanding ring; `defense` → a shield/cross/snowflake and a soft double
  halo. A spell's icon motif should match its school so the picker reads.

## The loop — generate → LOOK → evaluate → iterate

Never author blind. `website/scripts/spell-preview.mjs` is the eyes of this
skill (the spell analog of `weapon-swing.mjs`):

```sh
npm run assets                                   # rebuild the atlas first
node website/scripts/spell-preview.mjs icons     # contact sheet of ALL icons
#   (+ the mana potion + spirit glyph) → assets-preview/descriptions/names.png
# then, with a dev server on :5199 and playwright installed:
npx vite --port 5199 &                           # (npm install --no-save playwright)
node website/scripts/spell-preview.mjs cast inferno   # slowed cast, frame by frame
node website/scripts/spell-preview.mjs sheet          # one peak still per spell → grid
```

1. **Generate** — edit the icon YAML (or `spell-fx.ts` / the `spellcast` draw).
   Re-run `npm run assets` after any sprite YAML change (the atlas is a build
   output; never edit `website/src/game/assets/`).
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
`node scripts/simulate-run.mjs --full` prints the `spells:` line for a caster
build, and `progression-chart.mjs` plots SPIRIT alongside the other stats. A
magic-lane bot invests INT + SPIRIT and casts (`src/game/bot.ts`
`pickSpellToCast`), so a long run exercises the whole loop. Sanity: a spell
must be castable a few times the moment it unlocks (pool at unlock ≈
`MANA.base + minInt × MANA.perInt`), and its authored damage rides
`abilityPowerScale` like the abilities/granted spells so it keeps meaning the
same fraction of a level-appropriate healthbar all campaign.

## Where new code goes

| Change | File |
| --- | --- |
| A spell's numbers / effect / unlock | `src/game/defs/spells.ts` |
| Mana pool / regen tuning | `src/game/config.ts` (`MANA`, `REGEN`) |
| Cast path / effect resolution | `src/game/sorcery.ts` |
| A spell icon | `website/scripts/sprites/icons/spell_<id>.yaml` (+ `npm run assets`) |
| A cast effect / its theming | `website/src/game/spell-fx.ts`, `render.ts` (`spellcast`), `spellVisuals.ts` |
| The spell bar / picker / unlock modal | `website/src/game/{SpellBar,SpellUnlockOverlay}.tsx` |
| Tests | `tests/engine/{spells,mana}_test.ts` |
