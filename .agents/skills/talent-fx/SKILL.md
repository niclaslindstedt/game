---
name: talent-fx
description: "Use when creating or tuning the PASSIVE TALENTS — the always-on WoW-style trees the hero grows: melee/Warlord (STR), ranged/Windrunner (DEX), magic/Archon (INT). Covers a talent's rank numbers and its ALWAYS-ON FX — the magic tree's orbiting flames / storm / seeker orbs / singularity / immolation aura, and the melee/ranged proc + defensive cues — plus per-rank FX upgrades and catalog balance (rank slopes, proc caps, unlock stat). Drives the generate → look → evaluate → iterate loop with the talent preview tool: stage a trained hero amid a horde, judge the effect, refine the worst, and verify in the running game via the ?debug __talent hook."
---

# Authoring & tuning passive talents

Talents replace the old cast-spell system: no mana, no cooldown bar, no tapping
— every one is ALWAYS ON. Every 10 CHOSEN points a hero pours into STRENGTH /
DEXTERITY / INTELLIGENCE earns one talent point in THAT stat's tree, spent
through the level-up TALENT PICKER on a new talent or a rank-up (up to
`TALENTS.maxRank`). A talent has **no HUD icon** — the picker draws rank pips and
a blurb, not a pictogram — so what you author here is a talent's NUMBERS and its
ALWAYS-ON FX.

A talent is WHAT IT CARRIES (`defs/talents/index.ts`) — `kind:` is a label the
picker tints by and nothing branches on it. Three shapes, freely combined:

- **STAT-MODIFIER** — folds an additive term into an existing combat read site
  (crit, dodge, move speed, max hp, damage reduction, the enrage curve, damage
  reflection). Mostly numbers, little or no continuous FX.
- **CONJURATION** (`effect.conjure`) — the magic tree's showpiece. The talent's
  rank feeds an always-on granted spell through the SAME machinery a legendary's
  granted `spell` affix drives (`syncItemSpells` / `stepItemSpells`), so talent
  rank + worn source stack: orbiting flames, storm call, seeker orbs, arcane
  singularity, immolation aura.
- **PROC / STRUCK** — a **proc BLOCK** on the def, fired off the blows the hero
  lands or takes (Twin Strike, Cleaving Echo, Volley, Piercing/Concussive/
  Crippling shots, Parry, Seismic Landing, Frost Nova, Spring Heels, Evasion's
  burst). Its chances, radii and cooldowns are authored IN the block, and the
  hook finds it by asking the catalog which trained talent CARRIES that block
  (`procTalent`) — never by talent id. One carrier per proc; the build refuses a
  second.

## The four authoring surfaces

1. **The catalog** — `content/talents.yaml` (the 24 defs, 8 per tree), compiled
   by `make levels` to `engine/generated/talents.ts` and typed in
   `defs/talents/index.ts` (`TalentDef` / `TalentEffect` / the proc blocks / the
   registry). **It is CONTENT: never edit the generated file, and never put a
   talent number in engine code** — a mod authors its own `talents.yaml` through
   this exact loader and schema. Per-rank numbers are a linear `…PerRank` slope
   (`rank × slope`); a `conjure` talent carries no slope — its per-rank power
   lives in the spell's own config (`SPELL`); a proc's numbers are its block.
   Retuning or adding a talent is a YAML edit, **not** an engine change; accept
   the new baseline with `node scripts/update-talent-snapshot.mjs`. The runtime
   (`talentRank`, `spendTalentPoint`, stat-scaling, the respec floor) is
   `engine/game/talents.ts`; the effect read-sites are `engine/game/talent-effects.ts`.
2. **The shared knob** — `engine/game/config/talents.ts` (`TALENTS`) holds ONLY the
   rank ceiling, because it is the one number true of every talent (the picker
   draws that many pips and the point milestones are priced against a full
   tree). Per-talent proc CAPS and cooldown FLOORS live on the def, in its block.
   A chance-based proc MUST get a `chanceCap` or an internal cooldown there so
   rank 5 × high stat can't degenerate into a per-frame proc — the schema takes
   the fields, and it is on you to give them a sane value.
3. **The FX** — the always-on flourish the talent is felt through:
   - **Conjurations** draw as running ability visuals in
     `pwa/src/game/render/actors.ts`, sized by the engine helpers in
     `engine/game/spells.ts` (`orbitSpellBlock`, `stormSpellBlock`,
     `seekerSpellBlock`, `singularitySpellBlock`, `immolationSpellBlock`;
     `stasisSpellParams` is the one that kept the old suffix) —
     these are where the PER-RANK upgrade lives (more orbs, wider aura, faster
     storm).
   - **Proc / struck bursts** are engine events mapped to app effects in
     `pwa/src/game/game-screen/event-fx.ts` (nova, singularity, parry,
     seismicLanding, the frost-tinted Frost Nova) and drawn in
     `pwa/src/game/render/effects.ts`.
   - **Melee/ranged proc styling** (afterimages, slash glow) rides the weapon FX
     catalog in `pwa/src/game/weapon-fx.ts`.
4. **The icon** — every talent ships a 12×12 glyph at
   `content/sprites/icons/icon_talent_<id>.yaml`, which the picker resolves by
   deriving the name from the def id (`TalentPickerOverlay`). Draw it with the
   `pixel-assets` skill; `tests/content/talent_icons_test.ts` fails until it is
   in the atlas, so a new talent is not done without one. The picker draws it on
   a slate plate (`.talent-row-icon`), NOT on the amber row — so the glyph may
   use bright fire/ice/arcane colors, and its dark outline still reads.

## The look language

Keep the effect coherent and its rank legible:

- **Element by conjuration** — orbiting flames read fire (ember orange), storm
  electric blue, seeker orbs arcane magenta, singularity void violet, immolation
  a fire heat-ring. Frost Nova freezes an icy blue; a parry flashes steel-blue.
  Reuse the existing nova / lightning / burst cues so a new effect lands ON the
  fight instead of floating over it.
- **Rank is VISIBLE** — the plan's rule: a talent's FX upgrades at ranks 1 / 3 /
  5 (more orbs, wider novas, richer trails). Leveling a talent must be felt, not
  just tallied — the per-rank param helpers in `spells.ts` are where that step
  change is authored.

## The loop — generate → LOOK → evaluate → iterate

Never author blind. `pwa/scripts/talent-preview.mjs` is the eyes of this skill
(the passive-talent analog of `weapon-swing.mjs`, successor to the retired
spell-preview): it stages a trained hero amid a live horde and screenshots the
effect.

```sh
npm run assets                                   # rebuild the atlas first
# then, with a dev server on :5199 and playwright installed:
npx vite --port 5199 &                           # (npm install --no-save playwright)
node pwa/scripts/talent-preview.mjs fx                 # a frame strip per magic talent
node pwa/scripts/talent-preview.mjs fx twin_strike volley --tree melee
node pwa/scripts/talent-preview.mjs sheet              # one still per talent → grid
node pwa/scripts/talent-preview.mjs ranks orbiting_flames  # R1/R3/R5 side by side
```

1. **Generate** — edit the def / its `spells.ts` params / the FX draw. Re-run
   `npm run assets` after any sprite YAML change (the atlas is a build output;
   never edit `pwa/src/game/assets/`).
2. **LOOK** — `Read` the rendered PNG. Judge the `fx` frames: does the always-on
   effect read as its element, land ON the horde, and stay legible at the phone
   viewport? Judge `ranks`: is the R1→R3→R5 step change obvious?
3. **Evaluate** against the language above and the
   [art style guide](../../../docs/art-style.md). Fix the worst first.
4. **Iterate** until it passes, then verify in the RUNNING game: open `?debug`,
   call `window.__talent("<id>", <rank>)` (optionally `window.__scenario({...})`
   to stage a horde and `window.__timeScale(0.15)` to slow it) and watch the real
   effect — what ships, not a mock.

## Balance

When you touch a talent's numbers, measure — don't guess. The headless sim
reports the talent build: `node scripts/simulate-run.mjs --full` prints a
`talents:` line (points spent/earned and every trained talent's end rank), and
each lane bot (melee/ranged/magic) drains its pending points via `botPickTalent`
(`engine/game/bot/index.ts`), so a long run exercises the whole loop. Guardrails:

- Every damage-dealing talent must ride `abilityPowerScale` (like the abilities
  and granted spells) so a rank keeps meaning the same fraction of a
  level-appropriate healthbar all campaign.
- Every chance-based proc needs a `chanceCap` or an internal cooldown in its own
  block (fps + balance) — a rank-5 proc on a high-stat hero must not fire every
  frame.
- All procs roll through the run's seeded RNG so sim and bot runs stay
  reproducible.
- A hybrid (40 STR / 30 INT) is genuinely weaker in each tree than a pure spec —
  the stat-scaling SLOPE, not just rank access, is what keeps specialization
  attractive. Watch it in a `--compare` run.

## Where new code goes

| Change | File |
| --- | --- |
| A talent's rank numbers / effect / proc block | `content/talents.yaml` (compiled by `make levels`) |
| Shared types, the proc blocks, the registry | `engine/game/defs/talents/index.ts` |
| A NEW proc kind | a block type + its `TALENT_BLOCKS` entry (`defs/talents/index.ts`) + one reader in `talent-effects.ts` + its `PROC_BLOCKS` entry in `scripts/asset-tools/talent-schema.mjs` |
| The shared rank cap (and nothing else) | `engine/game/config/talents.ts` |
| Runtime: rank, spend, stat-scaling, respec floor | `engine/game/talents.ts` |
| Effect read-sites (crit/dodge/dmg-cut/procs) | `engine/game/talent-effects.ts` |
| A conjuration's per-rank params (orbs, aura, storm) | `engine/game/spells.ts` (`*SpellBlock`) + config `SPELL` |
| A conjuration's always-on visual | `pwa/src/game/render/actors.ts` |
| A proc/struck burst (event → effect) | `pwa/src/game/game-screen/event-fx.ts`, `render/effects.ts` |
| A melee/ranged proc's slash/muzzle styling | `pwa/src/game/weapon-fx.ts` |
| The talent picker overlay | `pwa/src/game/overlays/TalentPickerOverlay.tsx` |
| Tests | `tests/engine/talents_test.ts` (rules), `tests/content/talent_roundtrip_test.ts` (the compiled catalog) |
