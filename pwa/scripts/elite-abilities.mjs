#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELITE TIER's preview tool (see src/game/defs/enemies/abilities.ts and the
// `visual-effects` skill) — the generate → LOOK → judge → iterate loop for the
// ten primitives every named elite now fights with.
//
// IT ANSWERS THE ONE QUESTION THE FEATURE RESTS ON, which the general effects
// contact sheet cannot. `effects-gallery.mjs` shoots each exhibit once, which
// tells you whether an effect reads. But the whole claim of the elite tier is
// that ONE shared primitive reads as a DIFFERENT MOVE in a different mob's
// hands — the ring is a leprechaun's gold on one elite and an astronaut's
// ghost-lights on another, off nothing but their authored `look:` kits. That
// claim can only be judged by putting the same primitive side by side in every
// kit that carries it, which is what the CAST sheet below does.
//
// It drives the REAL gallery in the REAL game, restaging each exhibit through
// the `?caster=<enemy id>` deep link — so the colours on the sheet are the
// colours the mob actually casts in, read off its own compiled def. Nothing
// here re-implements a look, and nothing here can drift from what ships.
//
// Usage (from pwa/, dev server on :5199 with assets built):
//   npx vite --port 5199 &
//
//   # every primitive, each in its signature elite's colours — the overview
//   node scripts/elite-abilities.mjs
//
//   # ONE primitive across every elite that carries it — the comparison
//   node scripts/elite-abilities.mjs --ability snare_field
//
//   # ONE elite's whole kit, primary then secondary
//   node scripts/elite-abilities.mjs --elite lucky
//
//   # a filmstrip of one cast, to judge its timing rather than its colour
//   node scripts/elite-abilities.mjs --ability blink_strike --strip 6
//
// Options: --url, --out DIR, --viewport WxH, --at ms,ms, --speed N (slow
// motion — the gallery's own SIM-time scale, the only way to read a burst that
// is over in a fifth of a second), --chrome (keep the gallery's own UI in
// frame, for a review of the gallery rather than of the effects).
//
// Writes numbered frames + a sheet.html contact sheet under
// pwa/assets-preview/elite-abilities/. Playwright is installed ephemerally:
//   npm install --no-save playwright
//

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

// The compiled roster, read the same way every other tooling script reads it —
// so the sheet covers whatever is authored RIGHT NOW, a mod's elites included
// once they are merged in, and never a list somebody kept by hand here.
const { GENERATED_ENEMIES } = await import(
  pathToFileURL(resolve(repo, "src/generated/enemies.ts")).href
);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt("url", "http://localhost:5199");
const chrome = args.includes("--chrome");
const speed = Number(opt("speed", "1")) || 1;
const strip = Number(opt("strip", "0")) || 0;
const onlyAbility = opt("ability", null);
const onlyElite = opt("elite", null);
const [viewW, viewH] = (opt("viewport", "844x390") ?? "").split("x").map(Number);
const outDir = resolve(
  repo,
  opt("out", "pwa/assets-preview/elite-abilities"),
);
const sampleAt = (opt("at", "180,900") ?? "")
  .split(",")
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isFinite(n));

/**
 * Which exhibit stages which primitive. The gallery is the source of the
 * STAGING (a real level, a real caster, the real event), and this is only the
 * index into it — kept here rather than derived from the exhibit ids so a
 * renamed exhibit fails loudly at the first shot instead of silently shooting
 * nine tenths of the catalog.
 */
const EXHIBITS = {
  orbit_guard: "elite-orbit-guard",
  seeker_volley: "elite-seeker-volley",
  ember_trail: "elite-ember-trail",
  shock_pulse: "elite-shock-pulse",
  blink_strike: "elite-blink-strike",
  rally_cry: "elite-rally-cry",
  snare_field: "elite-snare-field",
  siphon_tether: "elite-siphon-tether",
  ward_shield: "elite-ward-shield",
  quake_line: "elite-quake-line",
};

/** Every (elite, primitive) pair the shipped roster authors, in roster order.
 * Read off the compiled defs, so it is the truth rather than a transcription. */
function signatures() {
  const rows = [];
  for (const [id, def] of Object.entries(GENERATED_ENEMIES)) {
    const sets = [def.mechanics, ...(def.phases ?? []).map((p) => p.mechanics)];
    for (const set of sets) {
      for (const ability of set?.abilities ?? []) {
        if (!EXHIBITS[ability.id]) continue; // a BOSS-tier move; not this sheet
        rows.push({
          elite: id,
          name: def.name,
          ability: ability.id,
          exhibit: EXHIBITS[ability.id],
          // The FIRST authored entry is the mob's signature — authored order is
          // cast order, so a mob leads with the move that is its own.
          signature: (set.abilities ?? [])[0]?.id === ability.id,
        });
      }
    }
  }
  return rows;
}

/** What this run is shooting, and why — see the three modes in the usage. */
function plan() {
  const all = signatures();
  if (onlyElite) {
    const rows = all.filter((r) => r.elite === onlyElite);
    if (rows.length === 0) {
      console.error(
        `no elite "${onlyElite}" carries an elite-tier ability. ` +
          `Try one of: ${[...new Set(all.map((r) => r.elite))].join(", ")}`,
      );
      process.exit(1);
    }
    return { title: `${rows[0].name} — its whole kit`, rows };
  }
  if (onlyAbility) {
    const rows = all.filter((r) => r.ability === onlyAbility);
    if (rows.length === 0) {
      console.error(
        `nothing carries "${onlyAbility}". ` +
          `Try one of: ${Object.keys(EXHIBITS).join(", ")}`,
      );
      process.exit(1);
    }
    // THE COMPARISON: one primitive, every kit that casts it, side by side.
    return {
      title: `${onlyAbility} — the same move in ${rows.length} sets of colours`,
      rows,
    };
  }
  // THE OVERVIEW: each primitive once, in its SIGNATURE elite's colours (the
  // mob that leads with it), so the sheet is ten moves rather than sixty casts.
  const seen = new Set();
  const rows = [];
  for (const row of all) {
    if (!row.signature || seen.has(row.ability)) continue;
    seen.add(row.ability);
    rows.push(row);
  }
  return { title: "the elite tier — every primitive, once", rows };
}

const { title, rows } = plan();
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: viewW || 844, height: viewH || 390 },
  deviceScaleFactor: 2,
});

const shots = [];
let n = 0;
for (const row of rows) {
  // `caster` restages the exhibit in THIS elite's authored colours; the staging
  // (level, mob, event) stays the gallery's own.
  const deep =
    `${url}/?effects=${row.exhibit}&caster=${row.elite}` +
    `&speed=${speed}${chrome ? "" : "&bare=1"}`;
  await page.goto(deep, { waitUntil: "networkidle" });
  // The gallery replays on a loop; give it a beat to stage and start.
  await page.waitForTimeout(700);

  const offsets = strip > 0 ? stripOffsets(strip) : sampleAt;
  for (const at of offsets) {
    await page.waitForTimeout(at === offsets[0] ? at : at - offsets[offsets.indexOf(at) - 1]);
    const file = `${String(++n).padStart(3, "0")}-${row.elite}-${row.ability}-${at}ms.png`;
    await page.screenshot({ path: resolve(outDir, file) });
    shots.push({ ...row, at, file });
    console.log(`  ${file}`);
  }
}

await browser.close();

/** N frames spread evenly across one show — a filmstrip of the WHOLE effect
 * rather than two moments of it (the same rule effects-gallery.mjs's own
 * `--strip` follows). */
function stripOffsets(count) {
  const span = 1400 * speed;
  return Array.from({ length: count }, (_, i) =>
    Math.round(((i + 1) / count) * span),
  );
}

// The sheet: a ROW PER CAST, frames left to right — which is what a review
// actually reads. Judging a colour kit from a directory of PNGs is judging it
// one at a time, and one at a time is exactly the comparison this tool exists
// to replace.
const byCast = new Map();
for (const shot of shots) {
  const key = `${shot.elite}/${shot.ability}`;
  if (!byCast.has(key)) byCast.set(key, []);
  byCast.get(key).push(shot);
}
const html = `<!doctype html>
<meta charset="utf-8">
<title>ELITE ABILITIES — ${title}</title>
<style>
  body { background:#0d0f16; color:#e8ecf4; font:14px/1.5 system-ui, sans-serif; margin:24px; }
  h1 { font-size:18px; letter-spacing:.08em; text-transform:uppercase; }
  .cast { margin:26px 0; }
  .cast h2 { font-size:14px; margin:0 0 6px; letter-spacing:.06em; }
  .cast h2 small { opacity:.55; font-weight:400; letter-spacing:0; }
  .frames { display:flex; gap:8px; flex-wrap:wrap; }
  figure { margin:0; }
  img { width:340px; display:block; border:1px solid #222838; border-radius:4px; }
  figcaption { opacity:.5; font-size:11px; margin-top:3px; }
</style>
<h1>${title}</h1>
${[...byCast.entries()]
  .map(
    ([key, frames]) => `<div class="cast">
  <h2>${frames[0].name} <small>— ${frames[0].ability}${frames[0].signature ? " (signature)" : " (shared)"}</small></h2>
  <div class="frames">${frames
    .map(
      (f) =>
        `<figure><img src="${f.file}" alt="${key} at ${f.at}ms"><figcaption>${f.at} ms</figcaption></figure>`,
    )
    .join("")}</div>
</div>`,
  )
  .join("\n")}
`;
writeFileSync(resolve(outDir, "sheet.html"), html);
console.log(`\n${shots.length} frames → ${resolve(outDir, "sheet.html")}`);
