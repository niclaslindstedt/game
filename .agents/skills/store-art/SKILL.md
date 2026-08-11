---
name: store-art
description: "Create or revise platform-ready storefront key art, capsules, feature graphics, icons, and promotional images for Steam, App Store, Google Play, and similar stores. Use when Codex must generate painted or pixel-art marketing imagery, build a coherent multi-raster art set, ground store art in the shipped product, reserve safe logo/copy areas, or validate exact storefront image dimensions. For real gameplay screenshots, use store-shots instead."
---

# Store art

Create marketing art that is attractive because it is true to the shipped
product. Treat every image as a claim about the game.

## Route the request

- Use this skill for generated or hand-composed key art, capsules, feature
  graphics, icons, backgrounds, and library art.
- Use the repository's screenshot harness for real gameplay screenshots and
  its timed capture loop. Keep screenshot work under this truth audit even
  when a dedicated `store-shots` skill is unavailable.
- Use the image-generation skill for raster generation or semantic edits.
- Read `references/project-grounding.md` before generating art for this game.
- Read `references/platforms.md` when planning a multi-platform set or deciding
  crops, safe areas, filenames, and validation.

## Ground in the shipped product

Do not prompt from memory or marketing prose alone.

1. Find the store manifest, releasing docs, existing art, and exact output
   paths with `rg` / `rg --files`.
2. Build or load the shipped sprite atlas and render relevant contact sheets.
3. Capture real gameplay and the live effects gallery when characters, combat,
   loot, gore, terrain, or lighting appear in the art.
4. Read the relevant content definitions and story source for identities,
   equipment, enemy hierarchy, gore family, location, and narrative status.
5. Record a compact truth sheet before prompting: setting, cast, silhouettes,
   palette, real effects, real rewards, forbidden inventions, and crop needs.

If a detail is unclear, remove it or verify it. Never fill uncertainty with a
generic projectile, magic glow, enemy, planet, costume, or UI icon.

## Let strong art propose content

Treat generated art as a legitimate concept-design surface. An invented weapon,
enemy, effect, costume, or prop may be worth adding to the product when it is
distinctive, readable, compatible with the setting, and better than the current
catalog answer.

Before approving art that introduces a new feature, choose explicitly:

1. **Conform the art** — replace the invention with shipped content; or
2. **Promote the invention** — pause final art approval and implement it through
   the product's normal content workflow, including authored data, sprites,
   mechanics/effects, balance, tests, generated catalogs, documentation, and a
   user-visible changelog entry where required.

Never leave the decision implicit. Store art may lead product design, but the
depicted feature must ship before the storefront claims that it does. After
implementation, regenerate or edit the artwork against the final shipped asset
rather than treating the first concept rendering as authoritative.

## Establish one key-art language

Choose one approved image as the canonical style reference. Keep the whole set
at one abstraction level: do not mix literal sprites with invented painted
effects or counterfeit gameplay. Preserve:

- character proportions and ordinary-versus-heroic identity;
- biome materials and physically coherent sky landmarks;
- enemy variety and hierarchy (common, elite, boss);
- actual weapon signatures, loot presentation, and gore families;
- palette discipline and consistent pixel density or rendering detail.

## Pass both acceptance gates

Every artwork has two reviewers: the storefront and the eventual player. Pass
both before calling an image final.

### Platform acceptance

- Verify the current official image specification, content policy, age-rating
  implications, generated-content disclosure, and prohibited claims.
- Use exact rasters, formats, alpha rules, safe areas, and platform-specific
  crops. Do not assume another store's accepted asset will be accepted here.
- Do not include unlicensed marks, review scores, awards, prices, platform
  badges, rating marks, legal copy, or generated lettering.
- Avoid gore, sexual content, political symbols, or other sensitive material
  beyond what the shipped product and target rating actually support. A detail
  being present in-game does not guarantee it belongs in the primary capsule.
- Keep source/provenance and generated-content disclosure notes with the asset.

### Player-expectation honesty

Ask what a reasonable player will infer at thumbnail size, not what the prompt
technically intended. Audit every visible promise:

- viewpoint, graphical style, pixel density, and production value;
- playable characters, party size, co-op availability, and perspective;
- biome, enemy density/variety, bosses, and encounter scale;
- weapons, powers, loot, gore, UI, and frequency of spectacle;
- narrative characters, relationships, and whether a scene is literal or
  symbolic;
- the amount of action and visual clarity present during representative play.

Compare the splash directly with real early-, mid-, and late-game screenshots.
Concept art may heighten composition, scale, lighting, and a truthful dramatic
moment, but it must not imply a different genre, camera, combat system, roster,
or routinely unavailable level of spectacle. The click is not a success if the
player later feels baited.

For every final sidecar, include a **Promise audit** stating why the image is
representative, what is heightened for key art, and what is symbolic. If the
defense relies on a technicality, revise the art.

Use narrative characters carefully. If someone is absent during gameplay, show
them as a distant destination, memory, trail, reflection, or other conceptual
story cue—not as a playable companion.

For Steam, keep the screenshot set as uncropped real gameplay with the shipped
HUD unless current platform guidance says otherwise. Peak endgame frames may
lead, but include at least one quieter frame and disclose in the inventory that
the set samples the dramatic ceiling. Never pass generated key art off as a
screenshot. Do not stage every encounter on the mission entrance tile: choose
deterministic, reachable interior positions from the generated map itself.
Suppress achievement recording and toasts in capture tooling by default so a
staged scenario neither mutates the operator's trophy shelf nor obscures the
frame. Make achievements a per-recipe opt-in only when the achievement UI is
the subject of the screenshot.

## Compose the master and derivatives

Design for the smallest crop first, then the largest panorama.

1. Pick a focal hierarchy: hero/action first, elite or environmental anchor
   second, boss or narrative cue discovered on a second look.
2. Reserve genuinely calm space for the real wordmark or store overlay.
3. Keep critical subjects inside the intersection of expected crops.
4. Generate without lettering unless the text itself is supplied as a
   deterministic asset.
5. Edit one authenticity issue at a time and preserve approved invariants.
6. Save non-destructive versions until the user explicitly approves replacing
   the canonical asset.

Do not stretch one master blindly into every aspect ratio. Recompose when a
crop changes the story, hierarchy, or logo safe area.

## Wordmarks and text

Never ask an image model to render the final title, legal copy, rating mark, or
platform badge. Generate art with reserved negative space, then composite the
real wordmark/font asset deterministically. Validate the result at thumbnail
size and at the most aggressive platform crop.

## Validate and deliver

For every final:

1. Inspect the generated master before resizing.
2. Crop to the target aspect ratio; do not distort it.
3. Use nearest-neighbor only when it preserves the established pixel grid;
   otherwise use a high-quality downsample and inspect edges.
4. Validate exact pixel dimensions with this skill's own
   `.agents/skills/store-art/scripts/validate_png_dimensions.py` (NOT the repo's
   top-level `scripts/`).
5. Inspect the final raster, not only the master.
6. Write a sibling `<asset-name>.md` description using the inventory below.
7. Run the repository's store preflight when one exists.
8. Report saved paths, dimensions, the final prompt/edit intent, generation
   mode, and any platform content-disclosure requirement.

Keep source art and approved finals in version control when the repository does.
Keep generated previews/contact sheets in their established ignored directory.

When a browser harness walks menus by accessible name, verify the live menu
model before assuming old selectors still work. Screen-qualified names such as
`main-new-game`, `difficulty-back`, and `levels-<id>` intentionally replace
ambiguous labels; a timed scene recipe can remain correct while its navigation
seam drifts.

For a local storefront mock, calibrate layout against recent captures of the
real store at the same viewport: global navigation, content-rail width, media
ratio, thumbnail rail, action strip, purchase box, main/sidebar proportions,
feature rows, mature-content treatment, and requirements tabs all change over
time. Mirror the platform's information hierarchy, but never fabricate its
dynamic social or commercial data. Reviews, curator quotes, broadcasts,
discounts, awards, events, language support, release status, and compatibility
verdicts remain explicit pending states until a real portal or shipped build
can supply them. Keep an unmistakable internal-preview label, and never upload
the store-like mock itself as an About image.

## Describe every artwork

Create a Markdown sidecar beside every approved image. Treat it as a semantic
inventory and truth audit, not vague alt text. Include:

- a concise scene description suitable for accessibility/marketing reuse;
- setting and physically meaningful background landmarks;
- named characters and their narrative role;
- every identifiable common mob, elite, and boss;
- every visible weapon, item, pickup, prop, and loot cue;
- combat, gore, weather, lighting, and other effects;
- reserved wordmark/copy space and expected crop behavior;
- status of each depicted feature: `shipped`, `concept awaiting implementation`,
  or `symbolic narrative cue`.
- a **Promise audit** comparing the image with representative shipped gameplay,
  naming every heightened or symbolic element and why it will not mislead.

If an element cannot be named, do not silently call the art final. Identify it
as an unresolved concept and choose whether to conform the art or promote the
concept into the product.
