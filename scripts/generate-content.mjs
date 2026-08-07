#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CONTENT PIPELINE, in one place. Every catalog the game plays is authored
// as YAML under `content/` and compiled by one generator; this runs them, in
// the fixed DEPENDENCY order documented in `docs/content-pipeline.md`.
//
// It exists because that order used to be written out twice — as two
// sixteen-deep `&&` chains in `pwa/package.json`, one for `assets` and one for
// `levels`, differing by a single entry. Two copies of a dependency order is a
// copy that drifts, and neither copy could say WHY a step sat where it did.
//
// The step list below is the one copy. What varies is how much of it runs:
//
//   --previews=full     the whole preview set — the art-iteration loop
//   --previews=sprites  the per-sprite 8x previews the library build copies
//   --previews=none     no pictures; the atlas is still built and checked
//   --no-assets         skip the sprite/font pipeline entirely (`npm run
//                       levels` — the fast path when only a catalog changed)
//
// STEPS RUN IN SEQUENCE, deliberately. They are separate processes that read
// each other's output through the engine's def catalogs, and the whole chain
// costs about three seconds — running them concurrently would trade a
// dependency the loader can prove for one nobody can see, to save less time
// than the sprite atlas spends on a single contact sheet. The pipeline's real
// cost is `generate-assets.mjs`, and that one parallelizes INTERNALLY.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/**
 * The pipeline, in dependency order. `assets` is the sprite/font renderer and
 * is spliced between `quests` and `levels` because the sprite pipeline derives
 * every enemy's wound frames from its `role`/`gore` — see
 * `docs/content-pipeline.md` for the reasoning behind each position.
 */
const STEPS = [
  {
    id: "scripts",
    why: "leaf: its only engine imports are the VM and the hook list, and nothing cross-refs a hook",
  },
  { id: "leveling", why: "leaf: the XP curve, nothing cross-refs it" },
  { id: "items", why: "every later generator reads the equipment catalogs" },
  { id: "sets", why: "the kits the set items belong to" },
  { id: "companions", why: "cross-refs a companion's signature weapon" },
  { id: "story", why: "the enemy and level pipelines cross-ref its ids" },
  { id: "enemies", why: "levels cross-ref enemy ids; sprites derive wounds" },
  { id: "powerups", why: "levels cross-ref every loot.abilityPool id" },
  { id: "talents", why: "leaf: its only engine import is config/talents.ts" },
  { id: "quests", why: "cross-refs breeds, items and levels" },
  { id: "assets", kind: "assets", why: "wound frames need every enemy's role" },
  { id: "levels", why: "cross-refs enemies, items, powerups, cutscenes" },
  { id: "maps", why: "the blueprint each mission is carved from" },
  { id: "bot-tuning", why: "per-level overrides, so it needs the level ids" },
  { id: "menu", why: "leaf: sprite stems and the font's glyphs" },
  { id: "sounds", why: "into pwa/src/generated/ — a sound is an APP concern" },
  { id: "music", why: "…and the engine has no idea the game makes noise" },
  {
    id: "hud",
    why: "late: it cross-refs sprite stems and sound ids, and nothing reads it",
  },
  {
    id: "ingame-menus",
    why: "last, beside the HUD: the same sprite stems and sound ids, and nothing reads it either",
  },
];

const PREVIEW_MODES = ["full", "sprites", "none"];

const args = process.argv.slice(2);
const withAssets = !args.includes("--no-assets");
const previewArg = args.find((a) => a.startsWith("--previews="));
const previews = previewArg ? previewArg.slice("--previews=".length) : "full";
const unknown = args.find(
  (a) => a !== "--no-assets" && !a.startsWith("--previews="),
);
if (unknown || !PREVIEW_MODES.includes(previews)) {
  console.error(
    unknown
      ? `generate-content: unknown argument ${unknown}`
      : `generate-content: --previews=${previews} — expected one of ${PREVIEW_MODES.join(", ")}`,
  );
  console.error(
    "usage: generate-content.mjs [--previews=full|sprites|none] [--no-assets]",
  );
  process.exit(2);
}

/** Run one generator, inheriting stdio so its warnings land in the build log. */
const run = (step) =>
  new Promise((resolve, reject) => {
    const argv = [here(`generate-${step.id}.mjs`)];
    if (step.kind === "assets") argv.push(`--previews=${previews}`);
    const child = spawn(process.execPath, argv, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `generate-${step.id} failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
        ),
      );
    });
  });

for (const step of STEPS) {
  if (step.kind === "assets" && !withAssets) continue;
  try {
    await run(step);
  } catch (err) {
    // Name the step AND its place in the chain: a generator that fails because
    // an earlier one did not emit what it validates against is the common case,
    // and the position is the first clue.
    console.error(`\n${err.message} — ${step.why}`);
    process.exit(1);
  }
}
