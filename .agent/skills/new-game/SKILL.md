---
name: new-game
description: "Use when turning a clone of this repo into a NEW game (a sequel): strip the first game's identity, assets, and story, then rebuild new content on the same engine. The agent entry point that says what is content vs machinery, in the order to change it."
---

# Bootstrapping a New Game From This Clone

This repo is a **reusable game engine plus one game's content**. A sequel is
a clone with the content stripped and new content authored on the same
engine. This skill is the ordered playbook. The rule of thumb throughout:

> **The engine (`src/`, minus `src/game/defs/`) and everything under
> `src/lib/` and `website/src/lib/` are machinery — keep them. The content
> catalogs (`src/game/defs/`), the generated assets, the scores, the story
> docs/tests, and the brand identity are the game — replace them.**

Work top to bottom; each step ends at a checkpoint you can verify.

## 1. Rename — the identity

Everything brand-shaped is one file. Edit it and regenerate art; nothing else
should hardcode the old name.

- [ ] Edit **`game.config.json`** (repo root): `title`, `shortName`,
      `tagline`, `description`, `shortDescription`, `siteUrl`, `repoUrl`,
      `author`, `storagePrefix`, `cacheIdPrefix`, `ogImageAlt`, `og.*`, and
      `heroParagraphs`. App code reads it via `website/src/identity.ts`; the
      shell (`index.html`) and `manifest.webmanifest` are filled/generated
      from it at build time by `website/pwa-plugin.ts`; the SEO/OG node
      scripts import the JSON directly.
- [ ] Update **`package.json`** and **`website/package.json`** `name` /
      `description` (npm metadata — the identity config cannot reach them).
- [ ] Replace **`website/public/icon.svg`** with the new vector icon, then
      `make icons` (regenerates every PNG **and** the OG card art from
      `game.config.json` — never edit the emitted PNGs).
- [ ] **Checkpoint:** `git grep -i "<old title>\|<old domain>"` returns only
      `CHANGELOG.md` / `.changes/` history.

## 2. Strip the old content

Delete or empty each of these — they are 100% this-game data:

- [ ] **`src/game/defs/*`** — the content catalogs: `levels.ts`,
      `enemies.ts`, `equipment.ts`, `abilities.ts`, `difficulties.ts`,
      `story.ts`, `cutscenes.ts`. Keep the **types and accessors**
      (`LevelDef`, `levelDef`, `TileSpec`, `EnemyRole`, …); replace the
      **entries**. The engine references content only by id, so it compiles
      against an empty-but-typed catalog.
- [ ] **`website/scripts/sprite-data/*`** — the sprite families. Keep
      `core.mjs` conventions and `index.mjs` wiring; replace the family
      modules. Then `make assets`.
- [ ] **`website/src/game/music/{title,level}.ts`** — the scores. Rewrite
      with the `sound-effects` skill.
- [ ] **`website/src/game/copy.ts`** — the loose UI copy (how-to-play lines,
      the level-entry button label).
- [ ] **Content tests** — this game's story/level/boss suites:
      `tests/spacez_test.ts`, `story_test.ts`, `last_words_test.ts`,
      `last_stand_test.ts`, `spacesuit_test.ts`, `aggro_test.ts`, and the
      boss-loot parts of `items_test.ts`. Delete and rewrite for the new
      content. (The generic engine suites — `movement`, `game`, `leveling`,
      `durability`, `powerups`, `obstacles`, `waves`, `abilities`,
      `held_items`, `bot`, `wounds`, `cutscene`, `difficulty` — are engine
      rules; keep them. **Note:** they are currently calibrated against the
      shipped `moon` level via `tests/helpers.ts` `startGame`, so to keep
      `make test` green with no content, either add a minimal fixture level
      and point `helpers.startGame` at it, or author your first level early
      and repoint `helpers.startGame` to its id. Decoupling these onto
      synthetic fixtures — a `tests/engine/` (fixture-driven) vs
      `tests/content/` (this game) split — is the recommended hardening
      described in issue #35 §3.)
- [ ] **`docs/game-content.md`** — this game's story/level/roster
      walkthrough; replace it wholesale. Trim the flavored README sections
      (premise, how-to-play story beats) to the new game.
- [ ] **`.changes/unreleased/*`** and **`CHANGELOG.md`** — per-game history;
      clear them. Reset versions with `scripts/update-versions.sh` (never by
      hand) and start the new game's changelog fresh.
- [ ] **Skill `GAME_NOTES.md` files** — truncate
      `.agent/skills/{engine-system,pixel-assets,sound-effects,playtest}/GAME_NOTES.md`
      to a stub; the `SKILL.md` playbooks stay.

## 3. Rebuild new content

Author the new game on the untouched engine, one catalog at a time:

- [ ] Levels, enemies, equipment, abilities, difficulties, cutscenes, story
      → the **`engine-system`** skill (config → types → step → events →
      tests → presentation). New _content_ is data; new _mechanics_ touch
      the closed unions — see **Architecture › Extension points**
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
      derive from it in `website/src/app/pwa.ts`).
- [ ] If the fork lives **outside** the `niclaslindstedt` org, repoint the
      `sync-oss-spec` skill's `SPEC_URL` to your spec source.

## 5. Verify

- [ ] `make build && make test && make lint && make assets`
- [ ] `npm run check:seo` (from `website/`, after a build)
- [ ] `git grep -i "<old title>\|<old domain>"` is clean (CHANGELOG/.changes
      history aside).

**Definition of done:** a renamed shell that builds, tests, and lints green,
ready to receive new content.
