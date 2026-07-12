#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEGENDARY / ARTIFACT drop-rate probe. Drives the REAL engine drop path
// (`hitEnemy` → `killEnemy` → rollEquipment/rollTier/pickUniqueForDrop +
// the world-drop channel) over a representative farm run, many times, and
// reports the per-tier AGGREGATE and per-item drop rates per run — the
// measurement loop the legendary/artifact economy is tuned against.
//
//   node scripts/drop-rate.mjs [--level the_rift] [--difficulty jesus]
//     [--runs 400] [--minions 1000] [--elites 5] [--bosses 2] [--hero 99]
//
// A "run" = kill `minions` minions + `elites` elites + `bosses` bosses at
// the given hero level, each killed for EXACTLY its max hp (overkill
// efficiency 1, no drop penalty). Runs on plain `node` via type stripping.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// The engine uses the @game/lib alias at runtime — map it before importing.
register("./game-alias-loader.mjs", import.meta.url);

const { createGame } = await import(path.join(root, "src/index.ts"));
const { hitEnemy } = await import(path.join(root, "src/game/loot.ts"));
const { ENEMY_DEFS } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);
const { UNIQUE_DEFS } = await import(
  path.join(root, "src/game/defs/uniques.ts")
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const levelId = arg("level", "the_rift");
const difficulty = arg("difficulty", "jesus");
const runs = Number(arg("runs", "400"));
const nMin = Number(arg("minions", "1000"));
const nElite = Number(arg("elites", "5"));
const nBoss = Number(arg("bosses", "2"));
const hero = Number(arg("hero", "99"));

// Pick clean representative defs per role — no apparition/spareable/flee/shield
// paths to muddy the kill.
const clean = (d) =>
  !d.apparition && !d.spareable && !d.flees && !d.shieldedBy && !d.ranged;
const byRole = (role) =>
  Object.values(ENEMY_DEFS).find((d) => d.role === role && clean(d));
const roleDefs = {
  minion: byRole("minion"),
  elite: byRole("elite"),
  boss: byRole("boss"),
};
if (!roleDefs.minion || !roleDefs.elite || !roleDefs.boss) {
  console.error("could not resolve a clean def for every role");
  process.exit(1);
}

const tierOf = (uid) => UNIQUE_DEFS[uid]?.tier ?? "unique";
const legendaryIds = new Set(
  Object.values(UNIQUE_DEFS)
    .filter((u) => u.tier === "legendary")
    .map((u) => u.id),
);
const artifactIds = new Set(
  Object.values(UNIQUE_DEFS)
    .filter((u) => u.tier === "artifact")
    .map((u) => u.id),
);

let nextId = 500_000;
function makeMob(def, mlvl) {
  return {
    id: nextId++,
    defId: def.id,
    home: { x: 0, y: 0 },
    pos: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    mlvl,
    speed: 0,
    contactCooldownMs: 0,
    powerScaled: true, // keep the staged mlvl — no engage re-stamp
    mech: {},
  };
}

const state = createGame(1234, levelId, difficulty);
state.player.level = hero;
// Silence waves / spawner side effects; we drive kills by hand.
if (state.level.waves)
  state.waveSpawned = state.level.waves.budget.map(() => 0);

const perItem = new Map(); // id -> total drops across all runs
let legRunsWith = 0; // runs that dropped ≥1 legendary
let artRunsWith = 0;
let legTotal = 0;
let artTotal = 0;
let uniqTotal = 0; // plain-unique named drops (any slot)

function killBatch(def, count, mlvl) {
  for (let i = 0; i < count; i++) {
    const mob = makeMob(def, mlvl);
    state.enemies = [mob];
    state.choice = null;
    hitEnemy(state, mob, mob.maxHp, "melee");
  }
}

const mlvlByRole = { minion: hero, elite: hero + 2, boss: hero + 3 };

for (let r = 0; r < runs; r++) {
  state.items = [];
  killBatch(roleDefs.minion, nMin, mlvlByRole.minion);
  killBatch(roleDefs.elite, nElite, mlvlByRole.elite);
  killBatch(roleDefs.boss, nBoss, mlvlByRole.boss);

  let legHere = 0;
  let artHere = 0;
  for (const item of state.items) {
    if (item.kind !== "equipment") continue;
    const uid = item.equipment.uniqueId;
    if (!uid) continue;
    if (legendaryIds.has(uid)) {
      legHere++;
      legTotal++;
      perItem.set(uid, (perItem.get(uid) ?? 0) + 1);
    } else if (artifactIds.has(uid)) {
      artHere++;
      artTotal++;
      perItem.set(uid, (perItem.get(uid) ?? 0) + 1);
    } else if (tierOf(uid) === "unique") {
      uniqTotal++;
    }
  }
  if (legHere > 0) legRunsWith++;
  if (artHere > 0) artRunsWith++;
}

const rate = (n) => (n / runs).toFixed(4);
const oneIn = (n) => (n > 0 ? Math.round(runs / n) : Infinity);
console.log(
  `\n${levelId} · ${difficulty} · hero ${hero} · ${runs} runs of ${nMin} minions + ${nElite} elites + ${nBoss} bosses\n` +
    `roles: minion=${roleDefs.minion.id} elite=${roleDefs.elite.id} boss=${roleDefs.boss.id}\n`,
);
console.log(
  `UNIQUE     aggregate: ${uniqTotal} drops → ${rate(uniqTotal)}/run  (≈ 1 per ${oneIn(uniqTotal)} runs)`,
);
console.log(
  `LEGENDARY  aggregate: ${legTotal} drops → ${rate(legTotal)}/run  (≈ 1 per ${oneIn(legTotal)} runs); ` +
    `${legRunsWith}/${runs} runs dropped ≥1`,
);
console.log(
  `ARTIFACT   aggregate: ${artTotal} drops → ${rate(artTotal)}/run  (≈ 1 per ${oneIn(artTotal)} runs); ` +
    `${artRunsWith}/${runs} runs dropped ≥1\n`,
);
const rows = [...perItem.entries()].sort((a, b) => b[1] - a[1]);
console.log("per-item (drops → 1 per N runs):");
for (const [id, n] of rows) {
  const tier = artifactIds.has(id) ? "artifact" : "legendary";
  console.log(
    `  ${id.padEnd(22)} ${tier.padEnd(9)} ${String(n).padStart(4)}  1/${oneIn(n)}`,
  );
}
