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
// A weapon id is a base WEAPON_DEFS id OR a UNIQUE_DEFS weapon id — a unique
// shows its signature slash + themed gore (slash-fx.ts).
//
// Usage (from website/, dev server on :5199 with assets built):
//   npm run assets && npx vite --port 5199 &
//   node scripts/weapon-swing.mjs poses                    # one strip per class
//   node scripts/weapon-swing.mjs poses medieval_sword excalibur
//   node scripts/weapon-swing.mjs poses --class melee      # every melee weapon
//   node scripts/weapon-swing.mjs poses excalibur --arc 180  # the half-circle swing
//   node scripts/weapon-swing.mjs uniques                  # contact sheet of every unique slash
//   node scripts/weapon-swing.mjs live muramasa            # slowed real attack + its gore
// Flags: --frames N (samples, default 9) --slow F (live speed, default 0.12)
//   --scale N (nearest-neighbour upscale, default 2) --arc DEG (poses cone)
//   --seed S --url U --out DIR
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
const { UNIQUE_DEFS } = await import(
  path.join(root, "src/game/defs/uniques.ts")
);

const argv = process.argv.slice(2);
const mode = ["live", "uniques"].includes(argv[0]) ? argv[0] : "poses";
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

// Resolve a weapon id — a base WEAPON_DEFS id OR a UNIQUE_DEFS weapon id — to
// what the preview needs: the class + the base's cone/reach, and whether it is a
// named unique (so its signature slash shows). Unknown ids resolve to null.
const weaponMeta = (id) => {
  const base = WEAPON_DEFS[id];
  if (base)
    return {
      id,
      class: base.class,
      sweepDeg: base.sweepDeg,
      range: base.range,
    };
  const u = UNIQUE_DEFS[id];
  if (u && u.slot === "weapon") {
    const b = WEAPON_DEFS[u.base];
    if (b)
      return {
        id,
        class: b.class,
        sweepDeg: b.sweepDeg,
        range: b.range,
        unique: true,
        name: u.name,
      };
  }
  return null;
};
const uniqueMeleeIds = Object.values(UNIQUE_DEFS)
  .filter((u) => u.slot === "weapon" && WEAPON_DEFS[u.base]?.class === "melee")
  .map((u) => u.id);

// Which weapons to shoot: an explicit id list (base or unique), every weapon of
// one --class, every unique melee (`uniques` mode), or one per class (default).
const classFilter = flag("class", null);
const explicit = argv
  .slice(1)
  .filter((a) => !a.startsWith("--") && weaponMeta(a));
const DEFAULTS = ["medieval_sword", "nine_mm", "hairy_potters_wand"];
let weaponIds;
if (explicit.length) weaponIds = explicit;
else if (mode === "uniques") weaponIds = uniqueMeleeIds;
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

/** Lay labelled stills out in a numbered grid — a contact sheet of signatures.
 * Labels composite onto the whole grid (not each cell), so long unique names
 * can overrun a 150px cell without sharp rejecting an over-size overlay. */
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
          text: `<span foreground="#ffd166">${i + 1}. ${label}</span>`,
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
  console.log(
    `${name}: ${file} (${out.width}×${out.height}, ${shots.length} items)`,
  );
}

// The peak of the strike — where a signature slash reads best for a still.
const PEAK_T = 0.42;
const sheet = []; // {buf,label} per unique, for the `uniques` contact sheet

for (const id of weaponIds) {
  const meta = weaponMeta(id);
  const cls = meta.class;
  const kind = kindFor(cls);
  const coneDeg = arcDeg != null ? Number(arcDeg) : (meta.sweepDeg ?? 110);
  const arc = cls === "melee" ? coneDeg * (Math.PI / 180) : null;
  const range = meta.range ?? 40;
  const pinPose = (t) =>
    page.evaluate(
      ({ kind, weaponClass, t, arc, range }) =>
        window.__swing({
          kind,
          weaponClass,
          t,
          ...(arc != null ? { arc, range } : {}),
        }),
      { kind, weaponClass: cls, t, arc, range },
    );
  const stagePinned = (weapon) =>
    page.evaluate((w) => {
      window.__scenario({
        weapon: w,
        disarmed: true,
        freeze: true,
        clearEnemies: true,
        stopWaves: true,
      });
    }, weapon);
  // Make the hero hardy enough to hold ANY weapon for the shot: some uniques
  // are cursed (Muramasa's -150 maxHp would drop a fresh hero to 0 and end the
  // run just by equipping it), and the level's un-frozen opening strike chips
  // him. Floor his pool and clear the blink. Purely a preview concern.
  const bolster = () =>
    page.evaluate(() => {
      const p = window.__game.player;
      p.maxHp = Math.max(p.maxHp, 600);
      p.hp = p.maxHp;
      p.hurtFlashMs = 0;
    });

  if (mode === "uniques") {
    // One peak-strike still per unique, gathered into a labelled contact sheet.
    await stagePinned(id);
    await bolster();
    await page.waitForTimeout(110);
    await pinPose(PEAK_T);
    await page.waitForTimeout(70);
    sheet.push({
      buf: await page.screenshot({ clip: CROP }),
      label: meta.name ?? id,
    });
    await page.evaluate(() => window.__swing(null));
  } else if (mode === "poses") {
    // Clean POSE arc: hero armed but holstered (no live swing to clutter the
    // frame), empty frozen field. `__swing` pins each sampled fraction. For a
    // melee weapon, hand its cone + reach in so the slash AoE draws pinned at
    // the same fraction — blade and cone as one motion.
    await stagePinned(id);
    await bolster();
    await page.waitForTimeout(120);
    const shots = [];
    for (let i = 0; i < frames; i++) {
      const t = i / (frames - 1);
      await pinPose(t);
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
    // the hero, the whole run slowed to `slow`× so the swing, its slash and its
    // themed gore burst spread across the sampled frames.
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
      { weapon: id, range: cls === "melee" ? Math.max(28, range - 6) : 60 },
    );
    await bolster();
    await page.evaluate((f) => window.__timeScale(f), slow);
    await page.waitForTimeout(150);
    const shots = [];
    for (let i = 0; i < frames; i++) {
      // Keep the hero hale each frame: the un-frozen opening strike leaves him
      // flashing, and at slow-mo that brief blink stretches over the whole
      // capture, dropping him out. Purely a preview concern.
      await page.evaluate(() => {
        const p = window.__game.player;
        p.hurtFlashMs = 0;
        if (p.hp < p.maxHp) p.hp = p.maxHp;
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

if (mode === "uniques") await writeGrid("uniques", sheet);

await browser.close();
