#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Spell preview tool (see the `spell-fx` skill): the magic analog of
// weapon-swing.mjs. Two things to eyeball when authoring a spell — its ICON
// (the HUD/picker/unlock-modal pictogram, sprites/icons/spell_*.yaml) and its
// CAST EFFECT (the element-tinted bloom + bolt/nova/heal/ward cue, spell-fx.ts
// + render.ts). This renders both:
//
//   node scripts/spell-preview.mjs icons          # contact sheet of ALL 25 icons
//                                                 # (+ the mana potion + spirit glyph)
//   node scripts/spell-preview.mjs cast inferno   # slowed cast, frame by frame → strip
//   node scripts/spell-preview.mjs cast arc_bolt frost_nova sanctuary
//   node scripts/spell-preview.mjs sheet          # one peak still per spell → grid
//
// Flags: --frames N (cast samples, default 9) --slow F (cast speed, default 0.14)
//   --scale N (upscale, default 2) --seed S --url U --out DIR
//
// `icons` is self-contained (it shells out to sprite-preview.mjs). `cast` /
// `sheet` drive the REAL running game through the `?debug` hooks so what they
// show is exactly what ships:
//   window.__cast(spellId)   — unlock+afford the spell, slot it, and fire it
//   window.__timeScale(f)    — slow the whole run so the cast FX spread out
//   window.__scenario(spec)  — stage a frozen ring of targets for the bolt/nova
// (all documented in docs/configuration.md).
//
// Playwright is intentionally NOT a repo dependency; install it ephemerally to
// run the cast/sheet modes: `npm install --no-save playwright`.
// Usage (from pwa/, dev server on :5199 with assets built):
//   npm run assets && npx vite --port 5199 &
//
// `window` below only appears inside page.evaluate callbacks (browser scope).
/* global window */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");

const { SPELL_DEFS } = await import(path.join(root, "src/game/defs/spells.ts"));
const { ENEMY_DEFS } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);

const argv = process.argv.slice(2);
const mode = ["cast", "sheet", "icons"].includes(argv[0]) ? argv[0] : "icons";
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

// A common minion id to spawn as a cast target (bolt needs a foe in range;
// nova wants a crowd). The first minion-role def keeps this content-agnostic.
const TARGET =
  Object.values(ENEMY_DEFS).find((d) => d.role === "minion")?.id ??
  Object.values(ENEMY_DEFS)[0].id;

// The spells to preview: an explicit id list, or all of them in unlock order.
const orderedIds = Object.values(SPELL_DEFS)
  .sort((a, b) => a.minInt - b.minInt)
  .map((d) => d.id);
const explicit = argv
  .slice(1)
  .filter((a) => !a.startsWith("--") && SPELL_DEFS[a]);
const spellIds = explicit.length ? explicit : orderedIds;

// ---- icons mode: a contact sheet of the pictograms (no browser) -----------

if (mode === "icons") {
  const names = [
    ...orderedIds.map((id) => SPELL_DEFS[id].icon),
    "mana",
    "icon_stat_spirit",
  ];
  console.log(`spell-preview: rendering ${names.length} icons…`);
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/sprite-preview.mjs"), "names", ...names],
    { stdio: "inherit" },
  );
  process.exit(0);
}

// ---- cast / sheet modes: drive the real game (Playwright) -----------------

const { chromium } = await import("playwright");
const sharp = (await import("sharp")).default;

const url = flag("url", "http://localhost:5199");
const frames = Math.max(2, Number(flag("frames", "9")));
const slow = Math.max(0.02, Number(flag("slow", "0.14")));
const scale = Math.max(1, Number(flag("scale", "2")));
const seed = flag("seed", "7");
const outDir = flag("out", path.join(here, "../assets-preview/spells"));

// Crop around the hero (camera-centred in the 844×390 phone-landscape view).
const CROP = { x: 342, y: 96, width: 210, height: 198 };
const GAP = 2;
const BG = "#141018";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

await page.goto(`${url}/?debug&bot=idle&seed=${seed}`);
await page.getByRole("button", { name: "play", exact: true }).waitFor();
await page.getByRole("button", { name: "play", exact: true }).click();
await page.getByRole("button", { name: "new-game" }).click();
await page.getByRole("textbox", { name: "character-name" }).waitFor();
await page.getByRole("textbox", { name: "character-name" }).fill("SPELL");
await page.getByRole("button", { name: "character-create" }).click();
await page.getByRole("button", { name: "difficulty-easy" }).waitFor();
await page.getByRole("button", { name: "difficulty-easy" }).click();
try {
  await page
    .getByRole("button", { name: "level-spacez_hq" })
    .click({ timeout: 3000 });
} catch {
  /* a fresh hero walks straight into the first level */
}
await page.waitForFunction(() => window.__game !== undefined);

/** Stage a frozen ring of targets and bolster the hero so the cast reads on a
 * clean, still field. */
const stage = (enemy) =>
  page.evaluate(
    ({ enemy }) => {
      window.__scenario({
        clearEnemies: true,
        stopWaves: true,
        freeze: true,
        spawns: [{ enemy, count: 6, minDistance: 34, maxDistance: 66 }],
      });
      const p = window.__game.player;
      p.maxHp = Math.max(p.maxHp, 800);
      p.hp = p.maxHp * 0.4; // wounded, so a heal visibly tops him up
      p.hurtFlashMs = 0;
    },
    { enemy },
  );

async function writeStrip(name, shots) {
  const cell = CROP.width + GAP;
  const labelled = await Promise.all(
    shots.map(({ buf, label }, i) =>
      sharp(buf)
        .composite([
          {
            input: {
              text: {
                text: `<span foreground="#8fd0ff">${i + 1}. ${label}</span>`,
                rgba: true,
                dpi: 96,
              },
            },
            left: 4,
            top: 4,
          },
        ])
        .toBuffer(),
    ),
  );
  const strip = await sharp({
    create: {
      width: cell * shots.length,
      height: CROP.height,
      channels: 4,
      background: BG,
    },
  })
    .composite(labelled.map((input, i) => ({ input, left: i * cell, top: 0 })))
    .png()
    .toBuffer();
  const file = path.join(outDir, `${name}.png`);
  const out = await sharp(strip)
    .resize({ width: cell * shots.length * scale, kernel: "nearest" })
    .png()
    .toFile(file);
  console.log(`${name}: ${file} (${out.width}×${out.height})`);
}

async function writeGrid(name, shots) {
  const cols = Math.min(5, Math.ceil(Math.sqrt(shots.length)));
  const rows = Math.ceil(shots.length / cols);
  const cw = CROP.width + GAP;
  const ch = CROP.height + GAP;
  const at = (i) => ({ left: (i % cols) * cw, top: Math.floor(i / cols) * ch });
  const layers = shots.map(({ buf }, i) => ({ input: buf, ...at(i) }));
  const labels = shots.map(({ label }, i) => {
    const p = at(i);
    return {
      input: {
        text: {
          text: `<span foreground="#8fd0ff">${i + 1}. ${label}</span>`,
          rgba: true,
          dpi: 58,
        },
      },
      left: p.left + 3,
      top: p.top + 3,
    };
  });
  const grid = await sharp({
    create: {
      width: cw * cols,
      height: ch * rows,
      channels: 4,
      background: BG,
    },
  })
    .composite([...layers, ...labels])
    .png()
    .toBuffer();
  const file = path.join(outDir, `${name}.png`);
  const out = await sharp(grid)
    .resize({ width: cw * cols * scale, kernel: "nearest" })
    .png()
    .toFile(file);
  console.log(`${name}: ${file} (${out.width}×${out.height}, ${shots.length})`);
}

const setSlow = (f) => page.evaluate((f) => window.__timeScale(f), f);
const fire = (id) => page.evaluate((id) => window.__cast(id), id);
// Real ms to wait for `simMs` of sim time at the current slow factor.
const waitSim = (simMs) => page.waitForTimeout(Math.round(simMs / slow));

const sheet = [];
for (const id of spellIds) {
  await stage(TARGET);
  await setSlow(slow);
  await page.waitForTimeout(120);

  if (mode === "sheet") {
    await fire(id);
    await waitSim(120); // near the bloom's peak
    sheet.push({ buf: await page.screenshot({ clip: CROP }), label: id });
  } else {
    // Sample the cast arc frame by frame over the effect's life (~520 sim ms).
    await fire(id);
    const shots = [];
    for (let i = 0; i < frames; i++) {
      shots.push({
        buf: await page.screenshot({ clip: CROP }),
        label: `${id} ${i}`,
      });
      await waitSim(520 / frames);
    }
    await writeStrip(`cast_${id}`, shots);
  }
}
if (mode === "sheet") await writeGrid("spell_casts", sheet);

await browser.close();
