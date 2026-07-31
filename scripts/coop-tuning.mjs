#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CO-OP TUNING PROBE — is grouping worth doing, and by how much?
// (multiplayer plan §4.3, the measured pass §4.7 says shipped as STRUCTURE.)
//
//   node scripts/coop-tuning.mjs [--levels moon,goodco_hq] [--difficulties medium,hard]
//     [--party 1,2,4,8] [--players 1] [--minutes 6] [--seeds 3] [--seed 4242]
//     [--start-level 50] [--gear-tier rare]
//
// **THE ONE READ THIS EXISTS TO PRODUCE IS PER-CAPITA XP PER MINUTE, and the
// reason is the whole difficulty of tuning co-op.** A party shares each kill AND
// clears the floor faster, so the two effects point in opposite directions and
// either one alone gives the wrong answer:
//
//   - the PER-KILL SHARE says grouping is a tax (four heroes split one kill), and
//   - the KILL RATE says grouping is free money (four heroes clear four times as
//     fast),
//
// and both are true. Only the rate per head per minute says which won. §4.7 named
// this in advance and could not run it, because the simulator flew exactly one
// hero; §7.2 gave it a party, and this is the harness that reads it.
//
// **THE TWO KNOBS IT MOVES ARE `XP_SHARE.partyBonusPerHero` AND THE `/players N`
// PAIRING.** They are deliberately measured apart. The first is a fact about a
// fight several people are standing in; the second is a bargain the HOST strikes
// whether or not anybody has arrived. Folding them together would make a host's
// difficulty setting silently change what being in the same room is worth — so
// the probe prints both axes and never multiplies them into one figure.
//
// **AND IT IS NOISY, WHICH IS WHY IT TAKES `--seeds`.** One carve, one horde,
// one set of drops: a single seed's difference between party 2 and party 4 is
// mostly which map got cut. Every figure below is the MEDIAN over the seeds, and
// the spread is printed beside it so a reading that rests on one lucky run is
// visible as one.
//
// Takes `--mod <dir>` (repeatable, load order) like every other analyzer.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register("./game-alias-loader.mjs", import.meta.url);

const { applyMods, takeModFlags } = await import(
  path.join(root, "scripts/mod-support.mjs")
);
const { mods, rest: argv } = takeModFlags(process.argv.slice(2));
await applyMods(mods);

const { simulateLevel } = await import(path.join(root, "src/sim/simulate.ts"));
const { playerScaling } = await import(
  path.join(root, "server/wire/players.ts")
);
const { synthesizeArrival } = await import(
  path.join(root, "src/sim/arrival.ts")
);

// ---- Flags -----------------------------------------------------------------------

function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const list = (name, fallback) =>
  String(opt(name, fallback))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const nums = (name, fallback) => list(name, fallback).map(Number);

const levels = list("levels", "moon,goodco_hq");
const difficulties = list("difficulties", "medium,hard");
const parties = nums("party", "1,2,4,8");
const players = nums("players", "1");
const minutes = Number(opt("minutes", "6"));
const seedCount = Math.max(1, Number(opt("seeds", "3")));
const seed0 = Number(opt("seed", "4242"));
// THE DEEP RUNGS NEED A HERO WHO EARNED HIS WAY THERE. The campaign is played in
// ORDER, so measuring NIGHTMARE with a fresh level-1 party measures nothing: the
// first read of this matrix had every party AND the soloist finish nightmare
// with zero kills, which is not a co-op result, it is a naked rookie result.
// `--start-level` mints the hero the campaign implies (spun up, stat points
// spent, dressed in real rolled gear of the rung below) — the same
// `synthesizeArrival` the campaign simulator uses — and hands the SAME loadout
// to every seat, because a party whose members arrived at different strengths
// would make the per-capita read a measurement of who got the good kit.
const startLevel = opt("start-level", "");
const gearTier = opt("gear-tier", "rare");

// ---- Measure ---------------------------------------------------------------------

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n) => Math.round(n * 10) / 10;
const pad = (v, w) => String(v).padStart(w);
const padE = (v, w) => String(v).padEnd(w);

/**
 * One cell of the matrix: `seedCount` runs at this (level, difficulty, party,
 * players), reduced to medians.
 *
 * The solo case has no `PartyReport` — deliberately, so no existing consumer had
 * to learn about parties — so the per-capita figures are recovered from the run
 * totals, which at one hero ARE the per-capita figures.
 */
function measure(levelId, difficulty, party, playersN) {
  const rows = [];
  for (let i = 0; i < seedCount; i++) {
    const loadout = startLevel
      ? synthesizeArrival({
          difficulty,
          level: Number(startLevel),
          seed: seed0,
          weaponTier: gearTier,
          gearTier,
        })
      : null;
    const report = simulateLevel({
      levelId,
      difficulty,
      seed: (seed0 + i * 104_729) >>> 0,
      ...(loadout ? { loadout } : {}),
      party,
      players: playersN,
      // `/players N` is applied as the balance pair it IS. The engine may never
      // import `server/`, so this is where the two halves meet — exactly as
      // `scripts/simulate-run.mjs` does it.
      ...(playersN > 1
        ? {
            balance: {
              mobHp: playerScaling(playersN).mobHp,
              xpGain: playerScaling(playersN).xpGain,
            },
          }
        : {}),
      maxMinutes: minutes,
    });
    const mins = Math.max(1 / 60, report.timeMs / 60_000);
    rows.push({
      xp: report.party
        ? report.party.perCapita.xpPerMinute
        : round1(report.hero.xpGained / mins),
      kills: report.party
        ? report.party.perCapita.killsPerMinute
        : round1(report.combat.kills / mins),
      dmg: report.party
        ? report.party.perCapita.damageTaken
        : Math.round(report.combat.damageTaken),
      level: report.hero.levelEnd,
      deaths: report.deaths,
      alive: report.party
        ? report.party.seats.filter((s) => s.alive).length
        : report.hero.levelEnd > 0
          ? 1
          : 1,
    });
  }
  const xps = rows.map((r) => r.xp);
  return {
    xp: round1(median(xps)),
    xpLow: round1(Math.min(...xps)),
    xpHigh: round1(Math.max(...xps)),
    kills: round1(median(rows.map((r) => r.kills))),
    dmg: Math.round(median(rows.map((r) => r.dmg))),
    level: median(rows.map((r) => r.level)),
    deaths: median(rows.map((r) => r.deaths)),
    alive: round1(median(rows.map((r) => r.alive))),
  };
}

// ---- Report ----------------------------------------------------------------------

console.log(
  `CO-OP TUNING — per-capita reads over ${seedCount} seed(s) × ${minutes} simulated min\n` +
    `levels ${levels.join(",")} · difficulties ${difficulties.join(",")} · ` +
    `party ${parties.join(",")} · /players ${players.join(",")}\n`,
);

const header =
  padE("level", 13) +
  padE("diff", 11) +
  pad("party", 6) +
  pad("/players", 9) +
  pad("xp/min", 9) +
  pad("spread", 17) +
  pad("vs solo", 9) +
  pad("k/min", 8) +
  pad("dmgIn", 8) +
  pad("alive", 7) +
  pad("heroL", 7);
console.log(header);
console.log("-".repeat(header.length));

for (const levelId of levels) {
  for (const difficulty of difficulties) {
    for (const playersN of players) {
      let solo = null;
      for (const party of parties) {
        const m = measure(levelId, difficulty, party, playersN);
        if (party === 1) solo = m.xp;
        const ratio = solo ? `${round1(m.xp / Math.max(1, solo))}×` : "—";
        console.log(
          padE(levelId, 13) +
            padE(difficulty, 11) +
            pad(party, 6) +
            pad(`${playersN}×`, 9) +
            pad(m.xp, 9) +
            pad(`${m.xpLow}–${m.xpHigh}`, 17) +
            pad(ratio, 9) +
            pad(m.kills, 8) +
            pad(m.dmg, 8) +
            pad(`${m.alive}/${party}`, 7) +
            pad(m.level, 7),
        );
      }
    }
  }
}

console.log(
  "\nvs solo = per-capita xp/min at this party size ÷ the same cell at party 1.\n" +
    "  Above 1× grouping PAYS; at 1× it is neutral; below 1× it is a tax and\n" +
    "  `XP_SHARE.partyBonusPerHero` is the lever. Read the SPREAD before moving\n" +
    "  anything — one seed's difference is mostly which map got carved.",
);
