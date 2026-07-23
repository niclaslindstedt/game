---
name: new-game
description: "Use when turning a clone of this repo into a NEW game (a sequel): strip the first game's identity, assets, and story, then rebuild new content on the same engine. The agent entry point that says what is content vs machinery, in the order to change it."
---

# Bootstrapping a New Game From This Clone

This repo is a **reusable game engine plus one game's content**. A sequel is
a clone with the content stripped and new content authored on the same
engine. This skill is the ordered playbook. The rule of thumb throughout:

> **The engine (`src/`, minus `src/game/defs/`) and everything under
> `src/lib/` and `pwa/src/lib/` are machinery — keep them. The content
> catalogs (`src/game/defs/`), the generated assets, the scores, the story
> docs/tests, and the brand identity are the game — replace them.**

Work top to bottom; each step ends at a checkpoint you can verify.

## 1. Rename — the identity

Everything brand-shaped is one file. Edit it and regenerate art; nothing else
should hardcode the old name.

- [ ] Edit **`game.config.json`** (repo root): `title`, `shortName`,
      `tagline`, `description`, `shortDescription`, `siteUrl`, `repoUrl`,
      `author`, `storagePrefix`, `cacheIdPrefix`, `ogImageAlt`, `og.*`, and
      `heroParagraphs`. App code reads it via `pwa/src/identity.ts`; the
      shell (`index.html`) and `manifest.webmanifest` are filled/generated
      from it at build time by `pwa/pwa-plugin.ts`; the SEO/OG node
      scripts import the JSON directly.
- [ ] Update **`package.json`** and **`pwa/package.json`** `name` /
      `description` (npm metadata — the identity config cannot reach them).
- [ ] Replace **`pwa/public/icon.svg`** with the new vector icon, then
      `make icons` (regenerates every PNG **and** the OG card art from
      `game.config.json` — never edit the emitted PNGs).
- [ ] **Checkpoint:** `git grep -i "<old title>\|<old domain>"` returns only
      `CHANGELOG.md` / `.changes/` history.

## 2. Strip the old content

Delete or empty each of these — they are 100% this-game data:

- [ ] **`src/game/defs/*` + `content/items/*`** — the content catalogs: the
      `levels/` and `enemies/` directories (one module per level / roster),
      the item YAML tree (`content/items/<rarity>/*.yaml` — weapons, gear,
      uniques; the `content/item_quality.yaml` / `content/item_rarity.yaml`
      knob files usually carry over as-is), `abilities.ts`, `companions.ts`,
      `difficulties.ts`, `story.ts`, `cutscenes.ts`, `thoughts.ts`. Keep the
      **types and accessors** (`levels/types.ts`, `enemies/types.ts`, the
      `index.ts` registries, `registry.ts`, `equipment.ts`/`gear.ts`/
      `uniques.ts`/`grades.ts` machinery incl. the built-in `blaster`;
      `LevelDef`, `levelDef`, `TileSpec`, `EnemyRole`, …); replace the
      **entries**. The engine references content only by id, so it compiles
      against an empty-but-typed catalog.
- [ ] **`scripts/sprites/*`** — the sprite families. Keep
      `core.mjs` conventions and `index.mjs` wiring; replace the family
      modules. Then `make assets`.
- [ ] **`pwa/src/game/music/*.ts`** (every score file — `title.ts`,
      `level.ts`, and the per-level tracks; keep `index.ts`, the player) —
      rewrite with the `sound-effects` skill.
- [ ] **`pwa/src/game/copy.ts`** — the loose UI copy (how-to-play lines,
      the level-entry button label).
- [ ] **`tests/content/`** — this game's story/level/boss/atlas suites
      (one per level plus `story_test.ts`, `last_words_test.ts`,
      `wounds_test.ts`, `uniques_test.ts`, …). Delete the directory and
      rewrite suites for the new content. The **engine** suites in `tests/engine/`
      are content-agnostic — they run on the synthetic fixtures in
      `tests/engine/fixtures.ts` (installed via `registerDefs`), so `make
      test` stays green with the content catalogs empty. Adjust
      `tests/engine/fixtures.ts` only if the new game changes engine
      *mechanics* (new archetypes), not for new content. Lib tests at the
      `tests/` root (`chiptune`, `synth`, …) are untouched.
- [ ] **`pwa/src/game/achievement-defs.ts`** — the achievement catalog.
      The generated groups (one badge per level, difficulty, unique,
      companion) rebuild themselves from the new registries automatically;
      the FIXED entries (kill/loot ladders, feats, their names and flavor)
      are this game's copy — rewrite them for the sequel. The tracking
      machinery (`achievement-totals.ts`, `achievements.ts`) is machinery;
      keep it.
- [ ] **`docs/manuscript.md`** — the story's single source of truth; 100%
      this-game narrative. Replace it wholesale with the new game's
      manuscript (its "Where the data lives" table stays as the template).
      Writing it FIRST pays off: every intro, dialogue, lastWord, and lore
      page you author in step 3 must transcribe from it.
- [ ] **`docs/game-content.md`** — this game's story/level/roster
      walkthrough; replace it wholesale. Trim the flavored README sections
      (premise, how-to-play story beats) to the new game.
- [ ] **Per-game data embedded in scripts** — the balance checkers carry
      tables keyed by this game's level ids: `scripts/weapon-stats.mjs`
      (`LEVEL_MLVL_BANDS`, `CAMPAIGN_LANDINGS` — re-derive from
      `scripts/leveling-curve.mjs --by-level` once the new campaign
      exists) and the default `--level` in `pwa/scripts/playtest.mjs`
      / the examples in `scripts/simulate-run.mjs`. Grep the old level ids
      across `scripts/` and `scripts/` when the new catalogs land.
- [ ] **`.changes/unreleased/*`** and **`CHANGELOG.md`** — per-game history;
      clear them. Reset versions with `scripts/update-versions.sh` (never by
      hand) and start the new game's changelog fresh.
- [ ] **Skill `GAME_NOTES.md` files** — truncate
      `.agent/skills/{engine-system,pixel-assets,sound-effects,playtest}/GAME_NOTES.md`
      to a stub; the `SKILL.md` playbooks stay.

## 3. Rebuild new content

Author the new game on the untouched engine, one catalog at a time:

- [ ] Levels → the **`level-design`** skill; enemies → the
      **`enemy-design`** skill; equipment/loot → the **`weapon-system`**
      skill; new _mechanics_ (closed unions, step pipeline) → the
      **`engine-system`** skill (config → types → step → events → tests →
      presentation) — see **Architecture › Extension points**
      (`docs/architecture.md`).
- [ ] Sprites/tiles/font → the **`pixel-assets`** skill.
- [ ] SFX and music → the **`sound-effects`** skill.
- [ ] Verify feel in the running game → the **`playtest`** skill.

## 4. Deploy / ops

- [ ] GitHub Pages custom domain is UI-configured (Settings → Pages) — there
      is no `CNAME` file; point it at the new `siteUrl` and update the DNS
      CNAME to the GitHub Pages origin. The domain mentions in `pages.yml`
      are comments that already defer to `game.config.json`.
- [ ] Provision a `GITHUB_PAT` with `read:packages` for
      `@niclaslindstedt/oss-framework` (see `.npmrc`); CI falls back to the
      workflow token.
- [ ] Confirm the per-slot precache ids changed with `cacheIdPrefix` (they
      derive from it in `pwa/src/app/pwa.ts`).
- [ ] If the fork lives **outside** the `niclaslindstedt` org, repoint the
      `sync-oss-spec` skill's `SPEC_URL` to your spec source.

## 5. Verify

- [ ] `make build && make test && make lint && make assets`
- [ ] `npm run check:seo` (from `pwa/`, after a build)
- [ ] `git grep -i "<old title>\|<old domain>"` is clean (CHANGELOG/.changes
      history aside).

**Definition of done:** a renamed shell that builds, tests, and lints green,
ready to receive new content.
