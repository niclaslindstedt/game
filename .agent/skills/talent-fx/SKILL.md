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

A talent is one of three shapes (`TalentEffect`, `defs/talents/index.ts`); the
picker and economy never branch on which:

- **STAT-MODIFIER** — folds an additive term into an existing combat read site
  (crit, dodge, move speed, max hp, damage reduction, the enrage curve, damage
  reflection). Mostly numbers, little or no continuous FX.
- **CONJURATION** (`effect.conjure`) — the magic tree's showpiece. The talent's
  rank feeds an always-on granted spell through the SAME machinery a legendary's
  granted `spell` affix drives (`syncItemSpells` / `stepItemSpells`), so talent
  rank + worn source stack: orbiting flames, storm call, seeker orbs, arcane
  singularity, immolation aura.
- **PROC / STRUCK** — fires off the blows the hero lands or takes (Twin Strike,
  Cleaving Echo, Volley, Piercing/Concussive/Crippling shots, Parry, Seismic
  Landing, Frost Nova, Arcane Retribution).

## The three authoring surfaces

1. **The catalog** — `src/game/defs/talents/{melee,ranged,magic}.ts` (the 24
   defs, 8 per tree), typed in `defs/talents/index.ts` (`TalentDef` /
   `TalentEffect` / the registry). Per-rank numbers are authored as a linear
   `…PerRank` slope on the def (`rank × slope`); a `conjure` talent carries no
   slope — its per-rank power lives in the spell's own config (`SPELL`). Adding
   or retuning a talent is a def edit, **not** an engine change. The runtime
   (`talentRank`, `spendTalentPoint`, stat-scaling, the respec floor) is
   `src/game/talents.ts`; the effect read-sites are `src/game/talent-effects.ts`.
2. **The shared knobs** — `src/game/config/talents.ts` (`TALENTS`): the rank
   ceiling, and the per-talent proc CAPS / cooldown FLOORS (Frost Nova radius/
   freeze/cooldown, Twin Strike & Volley chance caps, …) — one lever per shared
   rule, each read at the single site that owns it, BALANCE-slider-ready. A
   chance-based proc MUST get a cap or internal cooldown here so rank 5 × high
   stat can't degenerate into a per-frame proc.
3. **The FX** — the always-on flourish the talent is felt through:
   - **Conjurations** draw as running ability visuals in
     `pwa/src/game/render/actors.ts`, sized by the engine helpers in
     `src/game/spells.ts` (`orbitSpellParams`, `stormSpellParams`,
     `seekerSpellParams`, `singularitySpellParams`, `immolationSpellParams`) —
     these are where the PER-RANK upgrade lives (more orbs, wider aura, faster
     storm).
   - **Proc / struck bursts** are engine events mapped to app effects in
     `pwa/src/game/game-screen/event-fx.ts` (nova, singularity, parry,
     seismicLanding, the frost-tinted Frost Nova) and drawn in
     `pwa/src/game/render/effects.ts`.
   - **Melee/ranged proc styling** (afterimages, slash glow) rides the weapon FX
     catalog in `pwa/src/game/weapon-fx.ts`.

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
(`src/game/bot/index.ts`), so a long run exercises the whole loop. Guardrails:

- Every damage-dealing talent must ride `abilityPowerScale` (like the abilities
  and granted spells) so a rank keeps meaning the same fraction of a
  level-appropriate healthbar all campaign.
- Every chance-based proc needs a cap or internal cooldown in
  `config/talents.ts` (fps + balance) — a rank-5 proc on a high-stat hero must
  not fire every frame.
- All procs roll through the run's seeded RNG so sim and bot runs stay
  reproducible.
- A hybrid (40 STR / 30 INT) is genuinely weaker in each tree than a pure spec —
  the stat-scaling SLOPE, not just rank access, is what keeps specialization
  attractive. Watch it in a `--compare` run.

## Where new code goes

| Change | File |
| --- | --- |
| A talent's rank numbers / effect / unlock | `src/game/defs/talents/{melee,ranged,magic}.ts` |
| Shared types / the registry | `src/game/defs/talents/index.ts` |
| Shared knobs — rank cap, proc caps, cooldown floors | `src/game/config/talents.ts` |
| Runtime: rank, spend, stat-scaling, respec floor | `src/game/talents.ts` |
| Effect read-sites (crit/dodge/dmg-cut/procs) | `src/game/talent-effects.ts` |
| A conjuration's per-rank params (orbs, aura, storm) | `src/game/spells.ts` (`*SpellParams`) + config `SPELL` |
| A conjuration's always-on visual | `pwa/src/game/render/actors.ts` |
| A proc/struck burst (event → effect) | `pwa/src/game/game-screen/event-fx.ts`, `render/effects.ts` |
| A melee/ranged proc's slash/muzzle styling | `pwa/src/game/weapon-fx.ts` |
| The talent picker overlay | `pwa/src/game/overlays/TalentPickerOverlay.tsx` |
| Tests | `tests/engine/talents_test.ts` |
