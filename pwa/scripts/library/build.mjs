#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds THE LIBRARY into `pwa/dist/library/` — the generated companion site
// (docs/library-plan.md): static documents compiled from the same content the
// game itself is compiled from.
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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPixelWoff2 } from "../../../scripts/asset-tools/webfont.mjs";
import { copySprites, writeGroundTile } from "./art.mjs";
import { writeMissionMap } from "./map-render.mjs";
import { LEVELS, itemIcon } from "./catalogs.mjs";
import { libraryModel } from "./model.mjs";
import { bestiaryIndex, enemyPage, landing } from "./render-bestiary.mjs";
import { arsenalIndex, itemPage } from "./render-arsenal.mjs";
import { missionPage, missionsIndex } from "./render-missions.mjs";
import { chapterPage, storyIndex, storyLinks } from "./render-story.mjs";
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

const outRoot = resolve(flag("out", join(REPO, "pwa/dist")));
const base = flag("base", process.env.VITE_BASE ?? "/");
const libraryDir = join(outRoot, "library");

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
  for (const mission of model.missions) {
    for (const power of mission.loot.powers) sprites.add(power.icon);
  }
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

  writeFileSync(join(dir, "library.css"), libraryCss());
  writeFileSync(join(dir, "pixel.woff2"), buildPixelWoff2(version));

  const context = {
    base: slot,
    groundFor,
    mapFor,
    venueOf: (item) => venueForItem(item, home),
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
  writePage("missions", missionsIndex(model, context));
  for (const mission of model.missions) {
    writePage(mission.path, missionPage(mission, context, sprites));
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
      model.missions.length +
      chapters.length +
      5,
    sprites: spritesUsed(model).size,
    maps: maps.size,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await buildLibrary();
  process.stdout.write(
    `library: wrote ${result.pages} page(s), ${result.sprites} sprite(s) and ${result.maps} map(s) → ${libraryDir}\n`,
  );
}
