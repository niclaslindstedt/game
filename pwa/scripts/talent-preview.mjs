#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Talent preview tool (see the `talent-fx` skill): the passive-talent analog of
// weapon-swing.mjs, and the successor to the retired spell-preview. A talent
// has no HUD icon (the picker draws rank pips, not a pictogram) — what you tune
// is its ALWAYS-ON FX: the magic tree's orbiting flames / storm / seeker orbs /
// singularity / immolation aura (`render/effects.ts`), and the melee/ranged
// proc + defensive cues. This stages a trained hero amid a live horde and
// screenshots the effect:
//
//   node scripts/talent-preview.mjs fx                 # a frame strip per magic talent
//   node scripts/talent-preview.mjs fx orbiting_flames storm_call
//   node scripts/talent-preview.mjs sheet              # one still per talent → grid
//   node scripts/talent-preview.mjs ranks orbiting_flames   # R1/R3/R5 side by side
//
// Flags: --frames N (fx samples, default 8) --slow F (sim speed, default 0.14)
//   --rank N (fx/sheet rank, default max) --tree melee|ranged|magic (filter the
//   default set) --scale N (upscale, default 2) --seed S --url U --out DIR
//
// It drives the REAL running game through the `?debug` hooks so what it shows is
// exactly what ships:
//   window.__talent(id, rank) — train the talent to `rank` on the live run
//   window.__timeScale(f)     — slow the whole run so the FX spread out
//   window.__scenario(spec)   — stage a ring of targets, a weapon, and high stats
// (all documented in docs/configuration.md).
//
// Playwright is intentionally NOT a repo dependency; install it ephemerally:
//   npm install --no-save playwright
// Usage (from pwa/, dev server on :5199 with assets built):
//   npm run assets && npx vite --port 5199 &
//
// `window` below only appears inside page.evaluate callbacks (browser scope).
/* global window */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");

const { MELEE_TALENTS } = await import(
  path.join(root, "src/game/defs/talents/melee.ts")
);
const { RANGED_TALENTS } = await import(
  path.join(root, "src/game/defs/talents/ranged.ts")
);
const { MAGIC_TALENTS } = await import(
  path.join(root, "src/game/defs/talents/magic.ts")
);
const { WEAPON_DEFS } = await import(
  path.join(root, "src/game/defs/equipment.ts")
);
const { ENEMY_DEFS } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);

// The catalog, tagged by tree — the fx/sheet default set and the id→tree lookup.
const TALENTS = [
  ...MELEE_TALENTS.map((d) => ({ ...d, tree: "melee" })),
  ...RANGED_TALENTS.map((d) => ({ ...d, tree: "ranged" })),
  ...MAGIC_TALENTS.map((d) => ({ ...d, tree: "magic" })),
];
const byId = new Map(TALENTS.map((d) => [d.id, d]));

// The stat that governs (and scales) each tree — set high so a talent's power
// and its rank-scaled FX read at full richness.
const TREE_STAT = {
  melee: "strength",
  ranged: "dexterity",
  magic: "intelligence",
};

// A low-requirement weapon of the tree's own class, so a proc talent's cue
// (which rides the matching weapon) actually fires. Content-agnostic: the
// cheapest weapon in the class.
const weaponForTree = (tree) => {
  const wanted = tree === "magic" ? "magic" : tree; // melee/ranged/magic classes
  const w = Object.values(WEAPON_DEFS)
    .filter((d) => d.class === wanted)
    .sort((a, b) => (a.levelReq ?? 0) - (b.levelReq ?? 0))[0];
  return w?.id ?? null;
};

// A common minion to ring the hero with (the horde the FX plays over). The
// first minion-role def keeps this content-agnostic.
const TARGET =
  Object.values(ENEMY_DEFS).find((d) => d.role === "minion")?.id ??
  Object.values(ENEMY_DEFS)[0].id;

const argv = process.argv.slice(2);
const mode = ["fx", "sheet", "ranks"].includes(argv[0]) ? argv[0] : "fx";
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const treeFilter = flag("tree", null);
const explicit = argv
  .slice(1)
  .filter((a) => !a.startsWith("--") && byId.has(a));

// Which talents to preview. `ranks` takes exactly one; fx/sheet default to a
// sensible set: sheet shows the whole catalog, fx the FX-loud MAGIC tree unless
// a --tree or explicit ids narrow it.
let previewIds;
if (mode === "ranks") {
  const id = explicit[0] ?? "orbiting_flames";
  if (!byId.has(id)) {
    console.error(`ranks: unknown talent "${id}"`);
    process.exit(1);
  }
  previewIds = [id];
} else if (explicit.length) {
  previewIds = explicit;
} else {
  const base = treeFilter
    ? TALENTS.filter((d) => d.tree === treeFilter)
    : mode === "sheet"
      ? TALENTS
      : TALENTS.filter((d) => d.tree === "magic");
  previewIds = base.map((d) => d.id);
}

// ---- drive the real game (Playwright) --------------------------------------

const { chromium } = await import("playwright");
const sharp = (await import("sharp")).default;

const url = flag("url", "http://localhost:5199");
const frames = Math.max(2, Number(flag("frames", "8")));
const slow = Math.max(0.02, Number(flag("slow", "0.14")));
const scale = Math.max(1, Number(flag("scale", "2")));
const rankFlag = flag("rank", null);
const seed = flag("seed", "7");
const outDir = flag("out", path.join(here, "../assets-preview/talents"));

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

// `bot=survivor` steers a competent hero who holds ground and fights the ring,
// so procs land and struck-defenses trigger while the always-on FX runs.
await page.goto(`${url}/?debug&bot=survivor&seed=${seed}`);
await page.getByRole("button", { name: "play", exact: true }).waitFor();
await page.getByRole("button", { name: "play", exact: true }).click();
await page.getByRole("button", { name: "new-game" }).click();
await page.getByRole("textbox", { name: "character-name" }).waitFor();
await page.getByRole("textbox", { name: "character-name" }).fill("TALENT");
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

/** Ring the hero with a fresh horde, arm him with the tree's weapon, and pump
 * the tree's stat so the talent runs at full power on a survivable hero. */
const stage = (tree, enemy) =>
  page.evaluate(
    ({ enemy, stat, weapon }) => {
      window.__scenario({
        clearEnemies: true,
        stopWaves: true,
        ...(weapon ? { weapon } : {}),
        spawns: [{ enemy, count: 14, minDistance: 30, maxDistance: 92 }],
      });
      const p = window.__game.player;
      p.stats[stat] = Math.max(p.stats[stat] ?? 0, 180);
      p.maxHp = Math.max(p.maxHp, 4000);
      p.hp = p.maxHp;
      p.hurtFlashMs = 0;
    },
    { enemy, stat: TREE_STAT[tree], weapon: weaponForTree(tree) },
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
const train = (id, rank) =>
  page.evaluate(({ id, rank }) => window.__talent(id, rank), { id, rank });
// Real ms to wait for `simMs` of sim time at the current slow factor.
const waitSim = (simMs) => page.waitForTimeout(Math.round(simMs / slow));

const rankOf = (def) =>
  rankFlag !== null
    ? Math.max(1, Math.min(def.maxRank, Number(rankFlag)))
    : def.maxRank;

if (mode === "ranks") {
  const def = byId.get(previewIds[0]);
  await stage(def.tree, TARGET);
  await setSlow(slow);
  await page.waitForTimeout(120);
  const shots = [];
  for (const rank of [1, 3, 5].filter((r) => r <= def.maxRank)) {
    await train(def.id, rank);
    await waitSim(600); // let the FX respin at the new rank
    shots.push({
      buf: await page.screenshot({ clip: CROP }),
      label: `${def.id} R${rank}`,
    });
  }
  await writeStrip(`ranks_${def.id}`, shots);
} else {
  const sheet = [];
  for (const id of previewIds) {
    const def = byId.get(id);
    await stage(def.tree, TARGET);
    await setSlow(slow);
    await train(def.id, rankOf(def));
    await waitSim(240); // let the always-on FX spin up

    if (mode === "sheet") {
      sheet.push({
        buf: await page.screenshot({ clip: CROP }),
        label: `${def.id} R${rankOf(def)}`,
      });
    } else {
      const shots = [];
      for (let i = 0; i < frames; i++) {
        shots.push({
          buf: await page.screenshot({ clip: CROP }),
          label: `${def.id} ${i}`,
        });
        await waitSim(900 / frames);
      }
      await writeStrip(`fx_${def.id}`, shots);
    }
  }
  if (mode === "sheet") await writeGrid("talent_fx", sheet);
}

await browser.close();
