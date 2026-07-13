#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon-swing preview tool (see the `weapon-system` skill): stage the field
// hero holding a weapon and screenshot its WEAPON SWING animation frame by
// frame, so the held-weapon pose (weapon art) and its slash/muzzle effect
// (weapon effects) can be tuned by eye instead of guessed. Output is one
// numbered horizontal strip per weapon into website/assets-preview/swing/
// (gitignored).
//
// The animation lives in render.ts (`weaponPose`, pivoted about the shoulder —
// paper-doll.ts `WEAPON_SHOULDER`) and the slash/muzzle effects in GameScreen;
// this script only drives the real running game through two `?debug` hooks so
// what it shows is exactly what ships:
//   window.__swing({kind, weaponClass, t})  — PIN the held weapon at a fixed
//       fraction t (0..1) of its swing, holster the live attack. Deterministic
//       per-frame sampling of the POSE (weapon art). Used by `poses` mode.
//   window.__timeScale(f)                    — slow the whole run to f× speed
//       so the fast live swing AND its effect spread across many frames.
//       Used by `live` mode (weapon effects).
// Both hooks (and the CHARACTER WEAPON / WEAPON SWING flags this script forces
// on via localStorage) are documented in docs/configuration.md.
//
// Playwright is intentionally NOT a dependency of this repo; install it
// ephemerally when previewing: `npm install --no-save playwright`.
//
// Usage (from website/, dev server on :5199 with assets built):
//   npm run assets && npx vite --port 5199 &
//   node scripts/weapon-swing.mjs poses                    # one strip per class
//   node scripts/weapon-swing.mjs poses medieval_sword nine_mm hairy_potters_wand
//   node scripts/weapon-swing.mjs poses --class melee      # every melee weapon
//   node scripts/weapon-swing.mjs live medieval_sword      # slowed real attack
// Flags: --frames N (samples, default 9) --slow F (live speed, default 0.12)
//   --scale N (nearest-neighbour upscale, default 2) --seed S --url U --out DIR
//
// `window` below only appears inside page.evaluate callbacks, which run in the
// browser page, not in Node.
/* global window */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");

const { WEAPON_DEFS } = await import(
  path.join(root, "src/game/defs/equipment.ts")
);

const argv = process.argv.slice(2);
const mode = argv[0] === "live" ? "live" : "poses";
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const url = flag("url", "http://localhost:5199");
const frames = Math.max(2, Number(flag("frames", "9")));
const slow = Math.max(0.01, Number(flag("slow", "0.12")));
const scale = Math.max(1, Number(flag("scale", "2")));
const seed = flag("seed", "7");
const outDir = flag("out", path.join(here, "../assets-preview/swing"));
// Override the melee cone (poses mode): a total sweep in degrees. Demonstrates
// how the blade widens to accompany an INT-boosted cone — pass 180 to see the
// half-circle cap. Unset uses the weapon's own base cone.
const arcDeg = flag("arc", null);

// Which weapons to shoot: an explicit id list, every weapon of one --class, or
// (default) one representative per class.
const classFilter = flag("class", null);
const explicit = argv
  .slice(1)
  .filter((a) => !a.startsWith("--") && WEAPON_DEFS[a]);
const DEFAULTS = ["medieval_sword", "nine_mm", "hairy_potters_wand"];
let weaponIds;
if (explicit.length) weaponIds = explicit;
else if (classFilter) {
  weaponIds = Object.values(WEAPON_DEFS)
    .filter((d) => d.class === classFilter)
    .map((d) => d.id);
} else weaponIds = DEFAULTS;
if (!weaponIds.length) {
  console.error(`weapon-swing: no weapons matched (class=${classFilter})`);
  process.exit(1);
}

// A melee weapon swings ("swing"); guns and wands fire ("shot"). The pose math
// keys off the weapon CLASS, so pass the equipped weapon's own class through.
const kindFor = (cls) => (cls === "melee" ? "swing" : "shot");

// Crop box around the hero — the camera centres him at the viewport middle
// (844×390 phone-landscape, the reference device).
const CROP = { x: 372, y: 118, width: 150, height: 154 };
const GAP = 2;
const BG = "#1b1b22";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

// Force the two field-hero flags on before the app reads its settings — the
// held weapon (CHARACTER WEAPON) and its animation (WEAPON SWING) are both
// developer-only and off by default.
await page.addInitScript(() => {
  window.localStorage.setItem(
    "gone-in-space:settings",
    JSON.stringify({ characterWeapon: "on", weaponSwing: "on" }),
  );
});

await page.goto(`${url}/?debug&bot=idle&seed=${seed}`);
await page.getByRole("button", { name: "play", exact: true }).waitFor();
await page.getByRole("button", { name: "play", exact: true }).click();
await page.getByRole("button", { name: "new-game" }).click();
await page.getByRole("textbox", { name: "character-name" }).waitFor();
await page.getByRole("textbox", { name: "character-name" }).fill("SWING");
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

/** Compose the captured frames into one upscaled numbered strip. */
async function writeStrip(name, shots) {
  const cell = CROP.width + GAP;
  const labelled = await Promise.all(
    shots.map(({ buf, label }, i) =>
      sharp(buf)
        .composite([
          {
            input: {
              text: {
                text: `<span foreground="#ffd166">${i + 1}. ${label}</span>`,
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

for (const id of weaponIds) {
  const def = WEAPON_DEFS[id];
  const cls = def.class;
  const kind = kindFor(cls);

  if (mode === "poses") {
    // Clean POSE arc: hero armed but holstered (no live swing to clutter the
    // frame), empty frozen field. `__swing` pins each sampled fraction. For a
    // melee weapon, hand its cone + reach in so the slash AoE draws pinned at
    // the same fraction — blade and cone as one motion.
    const coneDeg = arcDeg != null ? Number(arcDeg) : (def.sweepDeg ?? 110);
    const arc = cls === "melee" ? coneDeg * (Math.PI / 180) : null;
    const range = def.range ?? 40;
    await page.evaluate((weapon) => {
      window.__scenario({
        weapon,
        disarmed: true,
        freeze: true,
        clearEnemies: true,
        stopWaves: true,
      });
    }, id);
    await page.waitForTimeout(120);
    const shots = [];
    for (let i = 0; i < frames; i++) {
      const t = i / (frames - 1);
      await page.evaluate(
        ({ kind, weaponClass, t, arc, range }) =>
          window.__swing({
            kind,
            weaponClass,
            t,
            ...(arc != null ? { arc, range } : {}),
          }),
        { kind, weaponClass: cls, t, arc, range },
      );
      await page.waitForTimeout(70);
      shots.push({
        buf: await page.screenshot({ clip: CROP }),
        label: t.toFixed(2),
      });
    }
    await page.evaluate(() => window.__swing(null));
    await writeStrip(`${id}-poses`, shots);
  } else {
    // LIVE effect: a real attack against a beefy frozen dummy just in front of
    // the hero, the whole run slowed to `slow`× so the swing AND its
    // slash/muzzle effect spread across the sampled frames.
    await page.evaluate(
      ({ weapon, range }) => {
        const g = window.__game;
        window.__scenario({
          weapon,
          freeze: true,
          clearEnemies: true,
          stopWaves: true,
          spawns: [
            {
              enemy: "guard",
              at: { x: g.player.pos.x + range, y: g.player.pos.y },
              hpMult: 50,
            },
          ],
        });
      },
      { weapon: id, range: cls === "melee" ? Math.max(28, def.range - 6) : 60 },
    );
    await page.evaluate((f) => window.__timeScale(f), slow);
    await page.waitForTimeout(150);
    const shots = [];
    for (let i = 0; i < frames; i++) {
      // Clear the post-hit blink each frame: the level's opening strike leaves
      // the hero flashing, and at slow-mo that brief blink stretches over the
      // whole capture, dropping him out of frames. Purely a preview concern.
      await page.evaluate(() => {
        window.__game.player.hurtFlashMs = 0;
      });
      await page.waitForTimeout(80);
      shots.push({
        buf: await page.screenshot({ clip: CROP }),
        label: `${i}`,
      });
    }
    await page.evaluate(() => window.__timeScale(1));
    await writeStrip(`${id}-live`, shots);
  }
}

await browser.close();
