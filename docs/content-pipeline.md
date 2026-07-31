# The content pipeline — every catalog is compiled from YAML

**Nothing the game plays is hand-written TypeScript.** Every catalog — levels,
maps, enemies, items, powerups, talents, companions, quests, sounds, music, the
story, the title menu, the bot's knobs — is authored as YAML under `content/`,
validated against the live engine catalogs at build time, and emitted into a
**gitignored, regenerated-on-build** module under `src/generated/` (engine
concerns) or `pwa/src/generated/` (app concerns). Never edit or commit a
generated file.

That uniformity is not tidiness — it is what makes a MOD possible at all (a
mod's files go through the SAME loaders and the SAME validators; see
`docs/modding.md`), and it is what lets a rebalance be a data change rather than
a code change.

`AGENTS.md` carries the one-row-per-catalog table. This document is the half
that does not fit in a table: the ORDER the generators run in and why, the
per-catalog rules that carry real information, and the non-catalog parity rules
that keep the repo's several copies of a fact in agreement.

## The order, and why it is that order

`make levels` runs the generators in a fixed chain (`npm run levels`, defined in
`pwa/package.json`). The order is a DEPENDENCY order, not a preference — each
generator validates its authored ids against the catalogs the earlier ones
emitted:

```
generate-leveling      leaf: the XP curve, nothing cross-refs it
generate-items         imports nothing from the engine; every later generator
                       reads the equipment catalogs
generate-sets          the kits the set items belong to
generate-companions    cross-refs a companion's signature weapon
generate-story         the enemy and level pipelines cross-ref the ids it writes
generate-enemies       the level pipeline cross-refs the enemy ids; the sprite
                       pipeline derives wound frames from every enemy's
                       role/gore
generate-powerups      the level pipeline cross-refs every loot.abilityPool id
generate-talents       leaf: its only engine import is config/talents.ts
generate-quests        cross-refs breeds, items and levels
generate-levels        cross-refs enemies, items, powerups, music, cutscenes
generate-maps          the blueprint each mission is carved from
generate-bot-tuning    per-level overrides, so it needs the level ids
generate-menu          leaf: its inputs are sprite stems and the font's glyphs
generate-sounds        \ into pwa/src/generated/ — a sound is an APP concern
generate-music         /   and the engine has no idea the game makes noise
```

`make assets` runs the SAME chain with one extra step spliced in:
`generate-assets.mjs` (the sprite atlas, tiles, the UI font) between
`generate-quests` and `generate-levels`, because the sprite pipeline derives
wound frames from every enemy's `role`/`gore`. So `assets` is a superset of
`levels`, and **`npm run levels` deliberately does not rebuild the atlas** —
which is exactly why verifying with a bare `npx vitest run` is unsafe: a
committed artifact compared against a half-stale build can agree with itself
while CI fails.

**The snapshot guards.** Most catalogs are pinned to a committed fixture under
`tests/content/fixtures/` by a round-trip test. Several were frozen from the
hand-written TypeScript catalog the moment before it was lifted to YAML, so the
snapshot is a PROOF that the lift changed nothing, not merely a baseline. Accept
an intentional change with the matching `node scripts/update-*-snapshot.mjs` —
never by editing the fixture.

## Per-catalog notes

- **Levels are compiled from YAML**, the same way — and a level YAML is a
  MISSION, not a map: the geometry lives in `content/maps/<id>.yaml` and is
  carved per run (the `mapgen-improvement` skill), so the loader refuses a mission that
  authors a wall, a spawn, a prop, a zone or a coordinate, naming where each one
  went. `content/levels/<id>.yaml`
  is the source of truth; `make levels` (folded into `make assets`, plus a root
  `pretypecheck`) validates it against the live engine catalogs and generates
  `src/generated/levels.ts` (the gitignored, regenerated-on-build output — never
  edit or commit it), which `src/game/defs/levels/index.ts` reads. The
  per-difficulty × per-map LEVEL LADDER — each map's `[start, end]` mob band +
  intended hero level per rung, PLUS the named DIFFICULTY RAMPS, the hp curves,
  and the three STAMINA ladders — lives in `content/ladder.yaml` (a
  hand-authored, committed source of
  truth like the level YAML, NOT in the level files). The stamina ladders price
  the sprint pool's whole economy per rung — `staminaDrain` (how fast a run
  spends it), `staminaRefill` (SECONDS a standstill breather takes) and
  `staminaEmptyLock` (SECONDS of dead-still a dry pool owes) — each climbing
  with the difficulty and validated as never easing; they compile into
  `DifficultyDef.staminaDrainMult` / `staminaRefillSec` / `staminaEmptyLockSec`
  and are tuned to one target: a build spending about a FIFTH of its stat
  points on STAMINA rides comfortably, one spending none runs dry, and the
  higher the rung the more that costs. A level's spawn points and
  pinned elites/bosses name a neutral, ordered **ramp** (`meek`→`monstrous` wave
  tiers off the band start, `endgame`/`apex` off the band end) and a single base
  `hp`; `loadLevels()` expands each ramp into the four [easy, medium, hard,
  nightmare] `mobLevels` / `level` + `hp` tuples (scaling hp by the map's
  `hpCurves` entry) and stamps `mobLevels` + `intendedLevel` onto every def — so
  the con viz and the engine read one ladder and every difficulty number is tuned
  from that one file. (A mission names no ramp of its own any more — its cast is
  the blueprint's, so `map-data/load-yaml.mjs` is what expands them now.) The
  round-trip guard (`tests/content/yaml_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/levels-snapshot.json`; accept an intentional
  level change with `node scripts/update-level-snapshot.mjs`. Read one run's
  carve of a map with `make map-layout LEVEL=<id>`
  (`scripts/map-layout.mjs` — a high-res visual overview: coordinate
  grid, walls, distinct shapes, and CON CIRCLES for spawns (area
  = count, colour = con vs the ladder's `intendedLevel`); `--seed` picks which
  run, `--size` the scale), and how it plays with `make map LEVEL=<id>`
  (`scripts/map-preview.mjs` — design/`--actual`/`--heatmap`).
- **The hero level curve is compiled from YAML**, the same way.
  `content/leveling.yaml` authors the XP each level costs (rows annotated with
  their kills-per-level equivalents); `make levels` runs
  `generate-leveling.mjs` first in the chain to validate it (levels 1..98, no
  gaps) and emit `src/generated/leveling.ts`, which the engine's `xpToLevelUp`
  reads. The per-difficulty tier slowdown and the endgame steepening stay
  config knobs applied on top (they power the DEVELOPER → BALANCE sliders).
- **Enemies are compiled from YAML**, the same way. `content/enemies/<biome>/<id>.yaml`
  is the source of truth — one self-describing file per mob, file stem == the
  enemy `id`, carrying the whole `EnemyDef` (`src/game/defs/enemies/types.ts`).
  `make levels` runs `generate-enemies.mjs` (loader
  `scripts/enemy-data/load-yaml.mjs`, schema
  `scripts/asset-tools/enemy-schema.mjs`) to validate every def against
  the live cross-ref catalogs (companions, uniques, story items, weapons/gear)
  and emit `src/generated/enemies.ts` (gitignored, regenerated on build — never
  edit or commit it), which `src/game/defs/enemies/index.ts` re-exposes as
  `ENEMY_DEFS`. It **must run before assets/levels** — both
  `generate-assets.mjs` (the sprite pipeline derives wound frames from every
  enemy's `role`/`gore`) and `generate-levels.mjs` (cross-ref the enemy ids)
  import the enemy catalog; see the chain above. The biome directory is organizational
  only (the merged catalog is flat; a duplicate id fails the build). The
  round-trip guard (`tests/content/enemy_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/enemies-snapshot.json`; accept an
  intentional enemy change with `node scripts/update-enemy-snapshot.mjs`. See the
  `enemy-design` skill.
  **EVERY MONSTER OWES A PARAGRAPH — `EnemyDef.lore`, and the rank and file owe
  it most.** A named elite explains itself in its `dialogue`; a minion never
  gets to, which is precisely why a horde nobody wrote a line about reads as a
  texture rather than as the inhabitants of somewhere. So the field is REQUIRED
  of all 106 (the build refuses a def without it, and warns past 420
  characters), it is written in the same dry register as an item's
  `description`, and it is the one field on the def authored for a READER —
  nothing in the simulation touches it, and the library's bestiary prints it
  under the portrait, in the open rather than behind the spoiler reveal. It is
  bound by the story chain like any other story text: it may only ELABORATE
  what `docs/story.md` and `docs/manuscript.md` already establish, never
  introduce a plot fact of its own, which is what keeps it out of the
  manuscript's verbatim transcription (exactly as an item's description is).
- **Powerups are compiled from YAML**, the same way — and they are the one
  catalog that lives in a SINGLE file. `content/powerups.yaml` is the source of
  truth for every timed pickup power (a `powerups:` map of id → power, the
  catalog key stamped in as the def's `id`), carrying every duration, damage
  figure, radius and interval, so a rebalance never touches engine code.
  `make levels` runs `generate-powerups.mjs` (schema
  `scripts/asset-tools/powerup-schema.mjs`) to validate each power — required
  fields, a known `kind`, EXACTLY the param block that kind requires and no
  other kind's, non-negative numbers, and every `icon`/`sprite` cross-checked
  against the sprite tree — and emit `src/generated/powerups.ts` (gitignored,
  regenerated on build — never edit or commit it), which
  `src/game/defs/abilities.ts` re-exposes as `ABILITY_DEFS`. That module keeps
  the TYPES (`AbilityDef`, and what each block means); the schema mirrors them,
  so keep the two in step when a kind gains a field. It **must run before
  levels** (the level pipeline cross-refs every `loot.abilityPool` id). The
  snapshot guard (`tests/content/powerup_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/powerups-snapshot.json`; accept an
  intentional rebalance with `node scripts/update-powerup-snapshot.mjs`.
  **THE CAMPAIGN INTRODUCES TWO NEW POWERS PER MAP** and every map's pool keeps
  what came before (`loot.abilityPool` in each `content/levels/<id>.yaml`), so
  the dock's vocabulary grows the whole way down and each venue is announced by
  two powers that could only have come from there.
- **THE PASSIVE TALENT TREES are compiled from YAML too, and a TALENT IS WHAT IT
  CARRIES.** `content/talents.yaml` (a `talents:` map of id → talent, the catalog
  key stamped in as the def's `id`) is the source of truth for all three trees;
  `make levels` runs `generate-talents.mjs` (schema
  `scripts/asset-tools/talent-schema.mjs`, loader `scripts/talent-data/`) to emit
  `src/generated/talents.ts`, which `src/game/defs/talents/index.ts` re-exposes
  as `TALENT_DEFS`. It is a LEAF pipeline — its only engine import is the
  import-free `config/talents.ts` for the shared rank cap — and nothing
  cross-references a talent id, so it has no downstream dependents in the chain.
  The snapshot guard (`tests/content/talent_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/talents-snapshot.json`; accept an
  intentional rebalance with `node scripts/update-talent-snapshot.mjs`.

  **`TalentKind` IS A LABEL, NEVER A DISPATCH KEY** — the same rule `AbilityDef`
  follows. It names the role the picker groups and tints by; what a talent DOES
  is whatever it carries: an `effect:` bag of per-rank slopes summed at the ONE
  read site that owns each rule, a `conjure:` feeding an always-on granted spell
  through the machinery a legendary's `spell` affix already drives, and/or a
  **PROC BLOCK** — a structured effect (`parry`, `volley`, `frostNova`,
  `seismic`, …) whose chances, radii and cooldowns live on the def. Those numbers
  used to sit in `config/talents.ts` under a key the accessor reached for by
  SHIPPED TALENT ID, which is exactly what made the trees unmoddable: a mod could
  author a talent and have no numbers to put in it. **A hook now asks the catalog
  WHICH TRAINED TALENT CARRIES A BLOCK (`procTalent` in `talent-effects.ts`),
  never what rank `frost_nova` is** — so a mod's talent can fire a shipped proc
  with its own tuning. Adding a proc is a block type on `TalentDef` + an entry in
  `TALENT_BLOCKS` + one reader + its `PROC_BLOCKS` entry in the schema.

  **A PROC HAS EXACTLY ONE CARRIER**, enforced at build time (over BASE ∪ MOD in
  the mod compiler): two carriers would make "whose numbers apply" a question
  about catalog order, which is not a decision anybody made — re-carrying a proc
  means REPLACING the talent that has it. And **a talent carrying nothing at all
  is refused**, since it would draw a card, cost a point and buy nothing forever
  with no error to explain it. What stays in `config/talents.ts` is only what is
  true of EVERY talent — the shared rank ceiling, which prices the whole level-up
  flow — and a def may choose a shallower ladder, never a deeper one.

- **Items are compiled from YAML**, the same way. `content/items/<rarity>/<id>.yaml`
  is the source of truth — one self-describing file per hand-authored item
  (stem == id, directory == rarity: `regular`/`trash` for the plain bases,
  `set`/`unique`/`legendary`/`artifact` for the named chase), each carrying its
  sprite refs, a few sentences of `description` lore, and (pool bases) its
  `grades:` identities — plus the two knob files: `content/item_quality.yaml`
  (the BROKEN→PERFECT make-quality axis) and `content/item_rarity.yaml` (the
  tier ladder, unlock gates, roll chances, MF saturation, elite/boss bonuses).
  `make levels` runs `generate-items.mjs` (loader `scripts/item-data/load-yaml.mjs`,
  schema `scripts/asset-tools/item-schema.mjs`) **first in the chain** — it
  imports nothing from the engine, and every later generator reads the
  equipment catalogs — to emit `src/generated/items.ts` (gitignored, regenerated
  on build — never edit or commit it), which `defs/equipment.ts`/`gear.ts`/
  `grades.ts`/`uniques.ts` and the config `QUALITY`/`LOOT` rarity knobs read.
  The engine's built-in `blaster` sidearm stays authored in `equipment.ts`
  (engine machinery, not content). The round-trip guard
  (`tests/content/item_roundtrip_test.ts`) pins the compiled catalogs to
  `tests/content/fixtures/items-snapshot.json`; accept an intentional item
  change with `node scripts/update-item-snapshot.mjs`. See the `weapon-system`
  skill.
- **Sounds and MUSIC are compiled from YAML too — and they emit into
  `pwa/src/generated/`, not `src/generated/`.** A sound is an APP concern: the
  engine emits events and has no idea they make a noise, so parking 273 voices
  and five scores in the engine's tree would hand every consumer of
  `@game/core` data it never reads. `content/sounds/<id>.yaml` is one sound (a
  list of synth VOICES, played by name or by an `on:` event shape) and
  `content/music/<id>.yaml` is one tracker-style score (instruments, patterns
  of note tokens, an order); `make levels` runs `generate-sounds.mjs` and
  `generate-music.mjs` (schemas `scripts/asset-tools/sound-schema.mjs` and
  `music-schema.mjs`, loaders `scripts/sound-data/` and `scripts/music-data/`).
  The sound bank emits SPLIT — `sounds.ts` for the run, `sounds-ui.ts` for the
  interface — because a menu click must not drag every kill and explosion into
  the 170 KB critical path; the music emits **one module per track** plus an
  index of dynamic imports, for the same reason, so a score is fetched when its
  venue starts and never before. The round-trip guard
  (`tests/content/music_roundtrip_test.ts`) pins the compiled scores to
  `tests/content/fixtures/music-snapshot.json` — frozen from the hand-written
  TypeScript scores the moment before the lift, so it is a PROOF that nothing
  changed, not merely a baseline; accept an intentional change with `node
scripts/update-music-snapshot.mjs`. `tests/sound_catalog_test.ts` is the
  sounds' equivalent, replaying the old imperative bank against the catalog.
  **A level's `music:` is cross-checked** against `content/music/` by the level
  schema — an unknown id used to be silent, the player falling back to the
  default theme so the venue quietly played the moon's music.
- **THE TITLE MENU is compiled from YAML too — and it is the one catalog a MOD
  may not replace.** `content/mainmenu.yaml` is the source of truth for the whole
  menu tree; `make levels` runs `generate-menu.mjs` (schema
  `scripts/asset-tools/menu-schema.mjs`, loader `scripts/menu-data/`) to emit
  `pwa/src/generated/menu.ts` — into the APP's tree, like the sound bank, because
  the engine has no idea the game has a title screen. It is a LEAF pipeline: its
  only inputs are the sprite stems and the pixel font's own glyph map, so nothing
  in the chain waits on it and it has no downstream dependents. See **THE TITLE
  MENU IS CONTENT** for the tree's shape, what the compiler refuses, and why the
  loader takes no directory.
- **THE COMPANION ROSTER is compiled from YAML too.**
  `content/companions.yaml` (a `companions:` map of id → companion — who a spared
  elite BECOMES when it joins the party) is the source of truth; `make levels`
  runs `generate-companions.mjs` (schema
  `scripts/asset-tools/companion-schema.mjs`, loader `scripts/companion-data/`)
  to emit `src/generated/companions.ts`, which `src/game/defs/companions.ts`
  re-exposes as COMPANION_DEFS. It runs AFTER the item pipeline (a companion's
  signature `weapon` is cross-checked against the live weapon catalog) but is
  deliberately NOT a prerequisite of the enemy pipeline: `generate-enemies.mjs`
  reads the ids an elite's `spareable:` may name from the content tree through
  the same loader, so neither generator waits on the other. The schema's one
  non-obvious rule is that a `power:` may not grow a kit the def hasn't got — a
  `novaRadiusPerRank` with no `nova:` block ranks up forever and adds nothing,
  silently, which is precisely what a compile-time check is for. The snapshot
  guard (`tests/content/companion_roundtrip_test.ts`) pins the compiled roster to
  `tests/content/fixtures/companions-snapshot.json`, frozen from the hand-written
  TypeScript catalog the moment before the lift so it is a PROOF that nothing
  changed; accept an intentional change with `node
scripts/update-companion-snapshot.mjs` (and remember a change to `joinWords` or
  `killQuotes` owes docs/manuscript.md an update, which needs the user's
  confirmation first).
- **THE STORY is compiled from YAML too, and that is what makes a CONVERSION
  possible.** `content/cutscenes/<id>.yaml` (one scene: a stage, a cast, a
  timeline of beats), `content/thoughts.yaml` (the hero's inner monologues plus
  the `capRotation`) and `content/story-items.yaml` (the plot pieces and their
  `lore`) are the sources of truth; `make levels` runs `generate-story.mjs`
  (schema `scripts/asset-tools/story-schema.mjs`, loader `scripts/story-data/`)
  BEFORE the enemy and level pipelines, which cross-ref the ids it writes. Until
  the lift, a mod could ship a venue and a horde but no scenes, no monologues and
  no lore — a re-skin rather than a different game. Three things are worth
  knowing before touching it:
  - **`variants:` is how one scene is five.** The prelude is the same living room
    on every difficulty except the weapon on the wall, so it is authored ONCE
    with `label:` handles on the parts that differ; the loader patches those
    labels per rung and emits `prelude_<difficulty>`, which is exactly what
    `cutsceneVariant` resolves at run creation. Labels are authoring handles and
    never reach the game. Five near-identical files would have been five files to
    keep in step.
  - **A prop's sprite is `sprite:`, not `kind:`.** `CutsceneProp.kind` is a
    renderer key in the generic player (`src/lib/cutscene.ts`, which knows
    nothing about sprites); in this renderer a prop kind IS a sprite name, and
    one file cannot readably spell `kind` for both a prop's art and a beat's
    discriminant. The loader does that one rename and nothing else.
  - **A level's `prelude` is cross-referenced now.** An unknown scene id used to
    throw out of `cutsceneDef` at the moment the venue opened — invisible to
    every test that does not start that level.
- The **autopilot's positioning knobs** compile the same way. `content/bot.yaml`
  (a global `default:` layer + per-level `levels:` overrides, mirroring
  `ladder.yaml`) is the hand-authored source of truth; `make levels` runs
  `generate-bot-tuning.mjs` to emit `src/generated/botTuning.ts`, which
  `src/game/bot/index.ts` resolves per level via `botTuningFor(state.level.id)`
  (`src/game/bot/tuning.ts` holds the `BotTuning` schema + neutral defaults). See
  the `bot-improvement` skill. The generated file is gitignored/regenerated; the
  YAML is committed.
- The **pixel font glyph set** is hand-defined in
  `scripts/asset-tools/font.mjs` (the `GLYPHS` map — `#` lit, `.`
  transparent, 3×5 variable-width cells); `make assets` packs it into the font
  atlas + metrics that `PixelText`/`pixel-font.ts` render at runtime. Lookups
  uppercase the character, so anything `PixelText` draws must have a glyph key
  there or it falls back to `?`. **Before rendering a new character** (a symbol
  like `×`, an accented letter, punctuation), add its glyph to `GLYPHS` (and to
  the specimen line in `generate-assets.mjs`) and rerun `make assets` — don't
  work around a missing glyph with a substitute. Verify the new glyph in the
  running UI, not just the specimen preview. The same `GLYPHS` map is also
  packed into a real **WOFF2 webfont** (`scripts/asset-tools/webfont.mjs`) that
  the library's static pages set their headings in — one source, two outputs, so
  a new glyph reaches both.

## The rest of the parity rules

- **Game identity is centralized.** `game.config.json` (repo root) is the one
  source for the title, tagline, description, `siteUrl`, `repoUrl`,
  `storagePrefix`, and `cacheIdPrefix`. App code reads it through
  `pwa/src/identity.ts` (`IDENTITY`, `FULL_TITLE`, `storageKey`); node
  build scripts import the JSON directly; `pwa/index.html` and
  `manifest.webmanifest` are filled/generated from it at build time by
  `pwa/pwa-plugin.ts`. Never re-hardcode a brand string elsewhere.
- `pwa/pwa-plugin.ts` `DEPLOY_SLOTS`, `pwa/src/app/pwa.ts`
  `cacheIdForBase`, and the slot paths in `.github/workflows/pages.yml` must
  agree — a mismatch makes slots clobber each other's precache or serve the
  wrong shell.
- `src/version.ts`, root `package.json`, and `pwa/package.json` versions
  must match; `tests/version_test.ts` and the extract script both enforce it.
- Icons are generated from `pwa/public/icon.svg` only (`make icons`) —
  never edit the PNGs. The OG card is generated the same way (`generate-og.mjs`,
  also part of `make icons`).
- **The manifest's install-prompt screenshots are REAL frames of the running
  game**, captured by `make screenshots`
  (`pwa/scripts/generate-screenshots.mjs`, which drives the build's own
  autopilot in headless Chromium — Playwright installed ephemerally, like the
  playtest harness). They are committed, because the manifest names them by
  path. Never hand-draw or compose one: an install prompt is a promise about
  what the player is about to get, and it is the one image surface where
  marketing art would be a lie. Re-run after an art pass or a HUD change
  (`check-seo` fails the build if a named file is missing, and warns if either
  the `wide` or `narrow` form factor is).
- In-game pixel assets (the sprite atlas, tiles, the UI font atlas) are
  generated from the `content/sprites/` YAML tree (one self-describing
  file per base sprite — see the `pixel-assets` skill) + `asset-tools/` only
  (`make assets`) — never edit the files under
  `pwa/src/game/assets/`. Those files are **gitignored and regenerated
  on every build** (like `src/generated/`, §11.2): `npm run assets` runs
  ahead of `vite`, `tsc`, and `vitest`, so the pixel grids are the sole
  committed source of truth. Never commit `pwa/src/game/assets/` — the
  binary atlas is a build output, not a reviewable artifact.
