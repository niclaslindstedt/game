# Ada's Trail grounding

Use these sources before generating this game's store art.

## Visual truth

- `docs/art-style.md` — grounded working-man science fiction and palette rules.
- `docs/rendering.md` — projection, effects, loot, fog, and presentation.
- `content/sprites/**` — authored identity and palette descriptions.
- `pwa/src/game/assets/atlas.png` — shipped atlas after content generation.
- `scripts/sprite-preview.mjs` — contact sheets from the same sprite source.
- `pwa/scripts/effects-gallery.mjs` — live, shipped effects in motion.
- `pwa/scripts/store-shots.mjs` and `store-shots/recipes.mjs` — truthful staged
  gameplay at storefront rasters.

Build the atlas without previews:

```sh
npm run assets:check --workspace pwa
```

Render only relevant sprites rather than loading the entire atlas blindly:

```sh
node scripts/sprite-preview.mjs names <sprite...> --out pwa/assets-preview/store-art
```

## Story truth

- `docs/story.md` is canonical narrative context.
- Ada wears a red jacket over a white shirt and blue jeans.
- Ada is a trail and destination through the campaign, not an on-screen combat
  companion. Use her as a distant story cue unless the depicted scene is one
  where she is canonically present.

## Lessons from the approved Moon header

- The suited hero is short, stocky, broad-shouldered, top-heavy, and wears
  recovered working gear with an amber visor—not sleek power armor.
- A lunar battlefield shows distant Earth, not another moon in its sky.
- The Moon roster is varied: ghosts, wisps, lost cosmonauts, wraiths, specialist
  figures, Selene Drowned as an elite, and The Flagbearer as a lurking boss.
- Haunted Moon enemies use pale mint ectoplasm (`gore: ecto`), never red blood.
- Real combat signatures include pale cleave arcs, compact muzzle flashes,
  vertical lightning, orange flame, localized impacts, and narrow loot rarity
  beams. Generic mint shooting stars were rejected as untruthful.
- Generated art can propose new game content. When a concept is strong, either
  replace it with an existing catalog item or deliberately implement it before
  approving the store art. For weapons, load `weapon-system` and follow the
  authored YAML, sprite, effect, balance, test, catalog, and changeset workflow.
- Bosses read best in the deep background; elites can carry the immediate
  foreground threat.
- The approved Steam header is `electron/store/capsules/header.png`; use it as
  the canonical abstraction/style reference for subsequent capsules.
- The approved helmet close-up is `electron/store/capsules/small.png`.

## Repository destinations and checks

- Steam art: `electron/store/capsules/`
- Steam requirements/prompts: `electron/store/capsules/PROMPTS.md`
- Release checklist: `electron/RELEASING.md`
- Store preflight: `make store-preflight`

The real wordmark must be composited from the game's font. Never generate it.
