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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPixelWoff2 } from "../../../scripts/asset-tools/webfont.mjs";
import { copySprites, spriteCell, writeGroundTile } from "./art.mjs";
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

  // The social cards: one per monster and one per item, composited from that
  // page's own sprite over its own venue's floor (og-card.mjs). The index and
  // story pages keep the site default — a page with no single subject has no
  // portrait to put on a card.
  //
  // The specs come from the RENDERERS, which is what guarantees the file
  // written here and the URL written into `og:image` are the same name.
  mkdirSync(join(dir, "cards"), { recursive: true });
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
  ];

  mkdirSync(join(dir, "shots"), { recursive: true });

  // THE BACKDROPS: a patch of a venue's real floor at a given zoom, dimmed.
  //
  // Keyed by venue AND zoom because a mob is staged at whatever zoom shows it
  // at a readable size, and the ground must be blown up by the SAME factor or
  // the mob stops looking like it is standing there. Items all share one zoom.
  // Written to disk because the mob shots are composed in the browser and need
  // a URL; the directory is removed once the run is done.
  const backdropDir = join(dir, ".backdrops");
  mkdirSync(backdropDir, { recursive: true });
  const backdrops = new Map();
  async function backdropFor(venueId, zoom, strength) {
    const venue = model.venues.find((v) => v.id === venueId);
    if (!venue || !LEVELS[venue.id]) return null;
    const key = `${venue.slug}:${zoom}`;
    if (!backdrops.has(key)) {
      const png = await dimBackdrop(
        await renderMapCrop(LEVELS[venue.id], {
          width: SHOT_W,
          height: SHOT_H,
          zoom,
        }),
        strength,
      );
      const file = `${venue.slug}-${zoom}x.png`;
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
      if (job.kind === "item") {
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
      writeFileSync(join(dir, "cards", `${spec.slug}.png`), ogCard);
      const out = join(dir, "shots", `${spec.slug}.png`);
      if (spawnShot) {
        writeFileSync(out, spawnShot);
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

  writeFileSync(join(dir, "library.css"), libraryCss());
  writeFileSync(join(dir, "pixel.woff2"), buildPixelWoff2(version));

  const context = {
    base: slot,
    groundFor,
    mapFor,
    venueOf: (item) => venueForItem(item, home),
    // The venue's display name, for the drop shot's caption and alt text.
    venueName: (id) => model.venues.find((v) => v.id === id)?.name ?? null,
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
    cards: cardJobs.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await buildLibrary();
  process.stdout.write(
    `library: wrote ${result.pages} page(s), ${result.sprites} sprite(s), ${result.maps} map(s) and ${result.cards} card(s) → ${libraryDir}\n`,
  );
}
