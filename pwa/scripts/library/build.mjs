#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds THE LIBRARY into `pwa/dist/library/` — the generated companion site
// (see `docs/architecture.md`, "/library/"): static documents compiled from the
// same content the game itself is compiled from.
//
// It runs AFTER `vite build` and emits into the same dist, but it deliberately
// does NOT go through the app's doc-page mechanism (pwa-plugin.ts), which works
// by copying the built `index.html`. That is right for two pages sitting beside
// the app and wrong for hundreds: every one would inherit the entry script and
// the whole modulepreload set, and download a game to render a stat table. The
// library has its own minimal template instead — one small stylesheet, one
// webfont, no JavaScript at all.
//
//   node pwa/scripts/library/build.mjs [--out <dir>] [--base /preview/]
//
// `--base` mirrors Vite's, and defaults to VITE_BASE so a slot build's URLs
// come out right without being told twice.

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPixelWoff2 } from "../../../scripts/asset-tools/webfont.mjs";
import { copySprites, spriteCell, writeGroundTile } from "./art.mjs";
import sharp from "sharp";

import { renderMapCrop, writeMissionMap } from "./map-render.mjs";
import { LEVELS, itemIcon } from "./catalogs.mjs";
import { TITLE } from "./html.mjs";
import { libraryModel } from "./model.mjs";
import { openCardShooter } from "./card-shot.mjs";
import {
  dimBackdrop,
  ITEM_ZOOM,
  SHOT_W,
  SHOT_H,
  writeDropShot,
} from "./drop-shot.mjs";
import { spawnShotHtml, zoomFor } from "./spawn-shot.mjs";
import { ogCardHtml } from "./og-card.mjs";
import {
  bestiaryIndex,
  enemyCardSpec,
  enemyPage,
  landing,
} from "./render-bestiary.mjs";
import {
  arsenalIndex,
  itemCard,
  itemCardSpec,
  itemPage,
} from "./render-arsenal.mjs";
import { missionPage, missionsIndex } from "./render-missions.mjs";
import { powerCardSpec, powerPage, powersIndex } from "./render-powers.mjs";
import {
  giverCardSpec,
  giverPage,
  questCardSpec,
  questPage,
  questsIndex,
} from "./render-quests.mjs";
import { talentCardSpec, talentPage, talentsIndex } from "./render-talents.mjs";
import { chapterPage, storyIndex, storyLinks } from "./render-story.mjs";
import { achievementsIndex, categoryPage } from "./render-achievements.mjs";
import { libraryCss } from "./styles.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const version = JSON.parse(
  readFileSync(join(REPO, "package.json"), "utf8"),
).version;

/**
 * EVERYTHING THE GENERATED PICTURES ARE DRAWN FROM.
 *
 * Mirrors the `hashFiles(...)` list in `.github/workflows/pages.yml` and
 * `library-images.yml`, which key the CI cache on the same sources — the two
 * answer the same question at different scopes (which cache, which set inside
 * it) and a source added to one list belongs in the other. Adding one here and
 * not there means a change that repaints the pictures without invalidating the
 * cache that holds them.
 */
/**
 * The marker that says a picture set is COMPLETE, written last by `buildImages`.
 *
 * The "have we built these already" test used to be `cards/` existing, which is
 * true one statement into a run that has produced nothing — so a generation that
 * died partway (a browser that would not launch, a killed job) left a directory
 * that every later build read as finished and copied happily, shipping a library
 * with some or none of its pictures and no complaint anywhere. A marker written
 * only on the way out cannot say that: a crashed run leaves no marker and the
 * next one regenerates over the debris, which is safe because a directory is
 * keyed to one content state and every file in it is a file that state produces.
 */
const IMAGES_DONE = ".complete";

const IMAGE_INPUTS = [
  "content",
  "pwa/scripts/library",
  "pwa/src/lib/item-card.css",
  "pwa/src/lib/pixel-panel.css",
  // The two app-side palettes a CARD is coloured from — an item card's tier
  // colours and a talent card's tree accent. They are shared with the game
  // rather than copied (see docs/architecture.md), which is exactly why they
  // belong here: a shade changed in either repaints pictures this build has
  // already cached, and nothing else in the list would notice.
  "pwa/src/game/tiers.ts",
  "pwa/src/game/talent-look.ts",
  "scripts/asset-tools",
  "game.config.json",
];

/**
 * A short digest of those sources — the name of the directory this build's
 * pictures belong in.
 *
 * Hashed from the FILES rather than from `git rev-parse HEAD:<path>`, which
 * would be free: the tree hash is blind to uncommitted work, so a local run
 * with an edited sprite would quietly reuse the committed sprite's pictures.
 * Reading a few hundred small files costs milliseconds and is never wrong.
 *
 * Paths go into the digest alongside their bytes, so moving a file changes the
 * answer even when nothing inside it did.
 */
function imagesFingerprint() {
  const hash = createHash("sha256");
  for (const rel of IMAGE_INPUTS) {
    for (const file of filesUnder(resolve(REPO, rel))) {
      hash.update(relative(REPO, file).split(sep).join("/"));
      hash.update(readFileSync(file));
    }
  }
  return hash.digest("hex").slice(0, 16);
}

/** Every file at or under `path`, depth-first and in a stable order. */
function filesUnder(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((entry) => filesUnder(join(path, entry)));
}

/**
 * WHERE THE GENERATED PICTURES LIVE — and the switch that decides whether they
 * are built at all.
 *
 * Unset (the default, and every per-commit CI job): no cards, no search shots,
 * no browser. The pages fall back to the site's shared default card and omit
 * their drop figure, which costs a link preview some personality and costs the
 * build ninety seconds and a Chromium install. That is the right trade for a
 * job whose question is "do the tests pass".
 *
 * Set (the deploy, and the scheduled job that warms its cache): the pictures are
 * generated once per DISTINCT CONTENT STATE and copied into every slot built
 * from it. No URL is baked into any picture, so two slots drawing the same
 * content share the work — but they have to be drawing the same content, which
 * is what `imagesFingerprint` decides and what this directory is keyed on.
 *
 * IT IS KEYED BECAUSE THE SLOTS DIVERGE. `pages.yml` builds all of them in one
 * job, from DIFFERENT REFS: `/preview/` from the commit that triggered the run,
 * `/` from the latest release tag. Before the first release those are the same
 * commit and nothing here matters. After it they are not, and an unkeyed
 * directory meant the first slot to build (preview, off `main`) generated the
 * pictures and every later slot copied them — so the RELEASED library would
 * have shown `main`'s art beside the release's own numbers and prose, a monster
 * wearing a sprite it had not been given yet. Nothing failed; it was simply
 * wrong, on the slot that is the actual website.
 */
const imagesCacheDir = process.env.LIBRARY_IMAGES_DIR
  ? // Resolved against the REPO, not the cwd. `npm run build --workspace pwa`
    // runs this with the cwd inside `pwa/`, so a relative path lands a directory
    // deeper than whoever set the variable meant — and a CI cache pointed at the
    // repo root then silently saves nothing.
    join(resolve(REPO, process.env.LIBRARY_IMAGES_DIR), imagesFingerprint())
  : null;

const outRoot = resolve(flag("out", join(REPO, "pwa/dist")));
const base = flag("base", process.env.VITE_BASE ?? "/");
const libraryDir = join(outRoot, "library");

/**
 * Run `worker` over every item, `size` at a time.
 *
 * The card pass is ~370 independent image composites, and doing them one after
 * another leaves most of the machine idle for the length of the build; firing
 * all 370 at once instead hands sharp several hundred concurrent encodes and
 * the memory that comes with them. A small window is the whole trick.
 */
async function inBatches(items, size, worker) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(worker));
  }
}

/**
 * Copy a prebuilt picture set into this slot. Returns how many landed.
 *
 * Tolerates an empty or missing cache rather than throwing: a deploy whose
 * cache never populated should still ship the site, with the fallback card,
 * instead of failing outright over a social image.
 */
function copyImages(cacheDir, dir) {
  let count = 0;
  for (const kind of ["cards", "shots"]) {
    const from = join(cacheDir, kind);
    if (!existsSync(from)) continue;
    mkdirSync(join(dir, kind), { recursive: true });
    for (const file of readdirSync(from)) {
      copyFileSync(join(from, file), join(dir, kind, file));
      count++;
    }
  }
  return count;
}

/** Write an HTML page at `<library>/<path>/index.html` (or the library root). */
function writePage(path, html) {
  const dir = path ? join(libraryDir, path) : libraryDir;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

/**
 * Every sprite any page draws. Gathered up front so `copySprites` can THROW on
 * a missing one: a page with a hole in it should fail the build rather than
 * ship, and the only way to know the whole set is to walk every page's model.
 */
function spritesUsed(model) {
  const sprites = new Set(model.enemies.map((enemy) => enemy.sprite));
  for (const enemy of model.enemies) {
    for (const id of [
      ...(enemy.drops?.items ?? []).map((i) => i.id),
      ...(enemy.drops?.storyItems ?? []),
      ...(enemy.drops?.uniqueItems ?? []),
      ...(enemy.drops?.uniques ?? []).flatMap((u) => u.ids),
    ]) {
      const icon = itemIcon(id);
      if (icon) sprites.add(icon);
    }
  }
  for (const item of model.items) sprites.add(item.icon);
  for (const talent of model.talents.talents) sprites.add(talent.icon);
  for (const power of model.powers.powers) {
    sprites.add(power.icon);
    // …and what the power actually puts on the field once it is spent, which
    // for half the catalog looks nothing like the thing you picked up.
    for (const entry of power.art) sprites.add(entry.sprite);
  }
  for (const giver of model.quests.givers) sprites.add(giver.sprite);
  for (const quest of model.quests.quests) {
    // The face the errand is racked and carded with, plus every piece it asks
    // for and everybody it walks — the only art an errand has.
    if (quest.face) sprites.add(quest.face);
    for (const objective of quest.objectives) {
      if (objective.item) sprites.add(objective.item.icon);
      if (objective.escort) sprites.add(objective.escort.sprite);
    }
  }
  // A badge's own sprite, which the catalog picks out of the same atlas
  // everything else here draws from — a relic's icon for a relic's trophy, a
  // companion's weapon for an ally, a skull for the body count.
  for (const badge of model.achievements.badges) sprites.add(badge.icon);
  return sprites;
}

/**
 * Which venue's ground an ARSENAL page is tiled with. An item belongs to a
 * place — the moon relic on lunar dust, the bunker's chase on its carpet — and
 * the first authored source that names a level is the honest answer. A base
 * nothing places falls back to the campaign's opening venue.
 */
function venueForItem(item, fallback) {
  for (const source of [...item.sources, ...(item.ladderSources ?? [])]) {
    if (LEVELS[source.from.id]) return source.from.id;
  }
  return fallback;
}

export async function buildLibrary({ out = outRoot, base: slot = base } = {}) {
  const dir = join(out, "library");
  mkdirSync(dir, { recursive: true });

  const model = libraryModel();

  // Each venue's page background is a real patch of its own floor, laid out by
  // the renderer's own tile rule (see art.mjs). Imported dynamically because it
  // reaches the `@game/lib` alias, and the resolver hook that maps it is only
  // registered once ./catalogs.mjs has run.
  const { groundTileName } =
    await import("../../src/game/render/ground-tiles.ts");
  mkdirSync(join(dir, "grounds"), { recursive: true });
  for (const venue of model.venues) {
    await writeGroundTile(
      venue.tiles,
      join(dir, "grounds", `${venue.slug}.png`),
      groundTileName,
    );
  }
  const home = model.venues[0].id;
  const groundFor = (venueId) => {
    const venue = model.venues.find((v) => v.id === (venueId ?? home));
    return venue ? `${slot}library/grounds/${venue.slug}.png` : null;
  };

  // The map of each venue: the level drawn WHOLE out of the game's own sprites
  // by the repo's own level renderer, then shrunk to fit a page (map-render.mjs).
  mkdirSync(join(dir, "maps"), { recursive: true });
  const maps = new Map();
  for (const mission of model.missions) {
    const size = await writeMissionMap(
      LEVELS[mission.id],
      join(dir, "maps", `${mission.slug}.png`),
    );
    maps.set(mission.id, {
      src: `${slot}library/maps/${mission.slug}.png`,
      ...size,
    });
  }
  const mapFor = (id) => maps.get(id) ?? null;

  copySprites([...spritesUsed(model)], dir);

  // BEFORE the cards are photographed, not after. The shooter's stage loads
  // this very stylesheet and the webfont it names, straight off disk — so a
  // font written later than the shot means every card is set in whatever
  // monospace the browser falls back to. It survived review once because a
  // previous build had left the file there; on a clean checkout (which is to
  // say, in CI) the whole set would have shipped in the wrong typeface.
  writeFileSync(join(dir, "library.css"), libraryCss());
  writeFileSync(join(dir, "pixel.woff2"), buildPixelWoff2(version));

  // THE PICTURES (cards + search shots) ARE A DEPLOY-TIME STEP, not a per-commit
  // one — see `imagesCacheDir`. Everything below is skipped unless a cache
  // directory is named, and the pages then fall back to the shared default card
  // and omit their drop figure.
  if (imagesCacheDir) {
    await buildImages({ cacheDir: imagesCacheDir, dir, model, home });
  }
  const imageCount = imagesCacheDir ? copyImages(imagesCacheDir, dir) : 0;

  const context = {
    base: slot,
    groundFor,
    mapFor,
    venueOf: (item) => venueForItem(item, home),
    // The venue's display name, for the drop shot's caption and alt text.
    venueName: (id) => model.venues.find((v) => v.id === id)?.name ?? null,
    // Whether this build has the generated pictures. Off on every per-commit
    // build, so a page must render correctly without them: the shared default
    // card in `og:image`, and no drop figure at all.
    hasImages: imageCount > 0,
    // What a name in the story's prose may link to, in priority order.
    linkGroups: storyLinks(model),
  };
  const sprites = `${slot}library/sprites/`;

  writePage("", landing(model, context));
  writePage("bestiary", bestiaryIndex(model, context));
  for (const enemy of model.enemies) {
    writePage(enemy.path, enemyPage(enemy, context));
  }
  writePage("arsenal", arsenalIndex(model, context));
  for (const item of model.items) {
    writePage(item.path, itemPage(item, context));
  }
  writePage("talents", talentsIndex(model.talents, context));
  for (const talent of model.talents.talents) {
    writePage(talent.path, talentPage(talent, model.talents, context));
  }
  writePage("powers", powersIndex(model.powers, context));
  for (const power of model.powers.powers) {
    writePage(power.path, powerPage(power, model.powers, context));
  }
  writePage("missions", missionsIndex(model, context));
  for (const mission of model.missions) {
    writePage(mission.path, missionPage(mission, context, sprites));
  }
  writePage("errands", questsIndex(model.quests, context));
  for (const quest of model.quests.quests) {
    writePage(quest.path, questPage(quest, model.quests, context));
  }
  for (const giver of model.quests.givers) {
    writePage(giver.path, giverPage(giver, model.quests, context));
  }
  writePage("achievements", achievementsIndex(model.achievements, context));
  for (const category of model.achievements.categories) {
    writePage(
      category.path,
      categoryPage(category, model.achievements, context),
    );
  }
  writePage("story", storyIndex(model, context));
  const chapters = model.story.chapters;
  for (const [i, chapter] of chapters.entries()) {
    writePage(
      chapter.path,
      chapterPage(chapter, context, i + 1, chapters.length),
    );
  }

  return {
    pages:
      model.enemies.length +
      model.items.length +
      model.powers.powers.length +
      model.talents.talents.length +
      model.missions.length +
      model.quests.quests.length +
      model.quests.givers.length +
      model.achievements.categories.length +
      chapters.length +
      9,
    sprites: spritesUsed(model).size,
    maps: maps.size,
    cards: imageCount,
  };
}

/**
 * Generate every card and search shot into `cacheDir`, once.
 *
 * Separated from the page build because it is the ONLY part that needs a
 * browser and it is by far the slowest — and because the three deploy slots
 * produce byte-identical pictures (no URL is baked into any of them), so the
 * deploy generates one set and copies it into each slot.
 */
async function buildImages({ cacheDir, dir, model, home }) {
  if (existsSync(join(cacheDir, IMAGES_DONE))) return; // already built
  mkdirSync(join(cacheDir, "cards"), { recursive: true });
  mkdirSync(join(cacheDir, "shots"), { recursive: true });
  const cardJobs = [
    // A MONSTER IS NOT LOOT. Its search picture is the mob staged on its own
    // floor at the scale it spawns (spawn-shot.mjs), not its stats in the loot
    // card's frame — that frame is a promise about pick-up-able things.
    ...model.enemies.map((enemy) => ({
      kind: "mob",
      spec: enemyCardSpec(enemy),
      venueId: enemy.home?.id ?? home,
    })),
    ...model.items.map((item) => ({
      kind: "item",
      spec: itemCardSpec(item),
      venueId: venueForItem(item, home),
      // Relative to the library directory the stage page is served from.
      cardHtml: () => itemCard(item, "sprites/"),
    })),
    // A POWER IS NOT LOOT EITHER, and for the same reason a monster isn't: it
    // never enters the bag and the game never draws a card for one. What the
    // player actually sees is the pickup lying on a floor, which is precisely
    // the picture the spawn shot already composes — so a power is staged like a
    // mob rather than framed like an item.
    ...model.powers.powers.map((power) => ({
      kind: "mob",
      spec: powerCardSpec(power),
      venueId: power.introducedBy?.id ?? home,
    })),
    // AN ERRAND IS A CONVERSATION AND A TALLY — the one subject here with no
    // art of its own, so it borrows the face of the thing it is about (the
    // piece, the person walked, the foe) and is staged like a mob on the venue
    // it is handed out on. The PERSON who hands it out is staged the same way,
    // and for once that is not a convention but the literal truth: they are
    // standing on that map, in the open, from the first frame of the run.
    ...model.quests.quests.map((quest) => ({
      kind: "mob",
      spec: questCardSpec(quest),
      venueId: quest.venue?.id ?? home,
    })),
    ...model.quests.givers.map((giver) => ({
      kind: "mob",
      spec: giverCardSpec(giver),
      venueId: giver.venue?.id ?? home,
    })),
    // A TALENT IS NOWHERE. It never lies on a floor and never stands on a map,
    // so it is the one subject in the library with no place to be photographed
    // in — it takes an og card and no search shot at all, rather than being
    // staged somewhere it has never been.
    ...model.talents.talents.map((talent) => ({
      kind: "card-only",
      spec: talentCardSpec(talent),
      venueId: null,
    })),
  ];

  mkdirSync(join(dir, "shots"), { recursive: true });

  // THE BACKDROPS: a patch of a venue's real floor at a given zoom, dimmed.
  //
  // Keyed by venue AND zoom because a mob is staged at whatever zoom shows it
  // at a readable size, and the ground must be blown up by the SAME factor or
  // the mob stops looking like it is standing there. Items all share one zoom.
  // Written to disk because the mob shots are composed in the browser and need
  // a URL; the directory is removed once the run is done.
  // Under the LIBRARY dir, not the cache: this is the one backdrop consumer
  // that reaches it through a browser, and the stage page is served out of
  // `dist/library/`, so a `.backdrops/...` URL only resolves from there. Putting
  // it in the cache dir made every mob shot silently lose its floor — the
  // background simply failed to load and the composition still rendered.
  const backdropDir = join(dir, ".backdrops");
  mkdirSync(backdropDir, { recursive: true });
  const backdrops = new Map();
  async function backdropFor(venueId, zoom, strength) {
    const venue = model.venues.find((v) => v.id === venueId);
    if (!venue || !LEVELS[venue.id]) return null;
    // Strength is part of the key: a mob wants its floor lighter than an
    // item card does, and at the same zoom the two would otherwise share one.
    const key = `${venue.slug}:${zoom}:${strength}`;
    if (!backdrops.has(key)) {
      const png = await dimBackdrop(
        await renderMapCrop(LEVELS[venue.id], {
          width: SHOT_W,
          height: SHOT_H,
          zoom,
        }),
        strength,
      );
      const file = `${venue.slug}-${zoom}x-${strength}.png`;
      writeFileSync(join(backdropDir, file), png);
      backdrops.set(key, { png, src: `.backdrops/${file}` });
    }
    return backdrops.get(key);
  }

  // The cards are PHOTOGRAPHED, one browser page for the whole run, and that
  // page can only hold one card at a time — so this pass is serial by nature
  // while the compositing below is not. Shooting everything first and then
  // fanning out the image work is what keeps the browser from idling.
  const shooter = await openCardShooter(dir);
  try {
    for (const job of cardJobs) {
      const cell = spriteCell(job.spec.sprite);
      if (!cell) {
        throw new Error(
          `library: no atlas cell for \`${job.spec.sprite}\` — cannot build its card`,
        );
      }
      if (job.kind === "card-only") {
        // Nothing to stage and nothing to composite — only the og card below.
      } else if (job.kind === "item") {
        // The loot card, photographed — then composited onto its floor below.
        job.shot = await shooter.shoot(job.cardHtml());
        job.backdrop = (await backdropFor(job.venueId, ITEM_ZOOM, 0.72))?.png;
      } else {
        // The mob, staged whole — nothing left to composite afterwards.
        const zoom = zoomFor(cell);
        const backdrop = await backdropFor(job.venueId, zoom, 0.45);
        job.spawnShot = backdrop
          ? await shooter.shootFrame(
              spawnShotHtml({
                backdropFile: join(backdropDir, basename(backdrop.src)),
                backdropSrc: backdrop.src,
                spriteSrc: `sprites/${job.spec.sprite}.png`,
                cell,
                zoom,
                title: job.spec.title,
                rank: job.spec.rarity,
                accent: job.spec.accent,
                flair: job.spec.flair,
              }),
            )
          : null;
      }
      job.ogCard = await shooter.shootFrame(
        ogCardHtml({
          spriteSrc: `sprites/${job.spec.sprite}.png`,
          cell,
          title: job.spec.title,
          subtitle: job.spec.subtitle,
          rarity: job.spec.rarity,
          accent: job.spec.accent,
          titleColor: job.spec.titleColor,
          flair: job.spec.flair,
          brand: TITLE.toUpperCase(),
        }),
      );
    }
  } finally {
    await shooter.close();
  }
  // The og cards are already whole; a mob's search picture is too. Only an
  // ITEM's still needs compositing — its photographed card laid on its floor.
  await inBatches(
    cardJobs,
    8,
    async ({ spec, shot, ogCard, spawnShot, backdrop }) => {
      // The OG card stays PNG: some unfurlers still handle WebP badly, and a
      // broken link preview costs more than the bytes. The SEARCH shot is read
      // by Google Images, which handles WebP fine, so it takes the smaller
      // format — together that is ~170 MB of deploy down to ~35 MB, against a
      // 1 GB Pages budget.
      // Quantised with DITHER. Flat 256-colour banded the card's gradient and
      // its rarity halo into visible rings; the dither breaks those up and the
      // file still halves. It stays a PNG — some unfurlers handle WebP badly,
      // and a broken link preview costs more than the bytes.
      await sharp(ogCard)
        .png({ palette: true, dither: 1, effort: 10 })
        .toFile(join(cacheDir, "cards", `${spec.slug}.png`));
      const out = join(cacheDir, "shots", `${spec.slug}.webp`);
      if (spawnShot) {
        await sharp(spawnShot).webp({ quality: 88 }).toFile(out);
      } else if (backdrop) {
        await writeDropShot({
          cardPng: shot,
          backdrop,
          accent: spec.accent,
          flair: spec.flair,
          out,
        });
      }
    },
  );

  // The backdrops were scaffolding for the browser; nothing links to them.
  rmSync(backdropDir, { recursive: true, force: true });
  // LAST, and only on the way out — see `IMAGES_DONE`.
  writeFileSync(join(cacheDir, IMAGES_DONE), "");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await buildLibrary();
  process.stdout.write(
    `library: wrote ${result.pages} page(s), ${result.sprites} sprite(s), ${result.maps} map(s) and ${result.cards} card(s) → ${libraryDir}\n`,
  );
}
