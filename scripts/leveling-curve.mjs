#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Leveling-curve modeler (see the `leveling-balance` skill): the tool that
// answers "how fast does the hero level, and how does it taper" from the REAL
// engine config — so a tweak to LEVELING can be judged before it ships.
//
// The curve is authored in KILLS PER LEVEL (see src/game/leveling.ts): each
// level's XP cost is `killsPerLevel(L) × a reference mob's XP at L`, and kill
// XP is hp-proportional, so the kills a level actually takes is
//
//   killsPerLevel(L) = xpToLevelUp(L) / (refMobHp × mobHpScaleFor(L, diff))
//
// which is INVARIANT to the auto-stat flag and the hero's damage (autoPowerScale
// cancels top and bottom) — only the difficulty's mob-level offset moves it.
// From a kill rate (kills/hour × hours/day) the model reads out LEVELS PER DAY
// at each level and the cumulative kills/days to a target level, so you can aim
// the taper (fast early → slow near the cap).
//
//   node scripts/leveling-curve.mjs                 # medium, 1500 kills/hr, 1 h/day
//   node scripts/leveling-curve.mjs --difficulty easy --kills-per-hour 3000
//   node scripts/leveling-curve.mjs --hours-per-day 2 --to 99
//
// The kill rate is an ASSUMPTION — measure the real one with the `playtest`
// skill (kills ÷ timeMs from a bot run) and pass it here.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { LEVELING } = await import(path.join(root, "src/game/config.ts"));
const { xpToLevelUp } = await import(path.join(root, "src/game/leveling.ts"));
const { mobHpScaleFor } = await import(path.join(root, "src/game/menace.ts"));
const { DIFFICULTY_ORDER } = await import(
  path.join(root, "src/game/defs/difficulties.ts")
);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const difficulty = opt("difficulty", "medium");
const killsPerHour = Number(opt("kills-per-hour", "1500"));
const hoursPerDay = Number(opt("hours-per-day", "1"));
const target = Math.min(LEVELING.maxLevel, Number(opt("to", "99")));
const killsPerDay = killsPerHour * hoursPerDay;

if (!DIFFICULTY_ORDER.includes(difficulty)) {
  console.error(
    `unknown difficulty "${difficulty}" (expected: ${DIFFICULTY_ORDER.join(", ")})`,
  );
  process.exit(1);
}

// Kills to clear level L at this difficulty, from the real curve. xpToLevelUp
// already bakes in refMobHp × the level ramp × autoPowerScale at offset 0; the
// actual mob's toughness uses the difficulty's offset, so autoPowerScale
// cancels and only the offset shifts the count.
const killsPerLevel = (L) =>
  xpToLevelUp(L) / (LEVELING.refMobHp * mobHpScaleFor(L, difficulty));

const rows = [
  1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 99,
].filter((L) => L <= target);

console.log(
  `\nLeveling curve — difficulty=${difficulty}, ${killsPerHour} kills/hr × ${hoursPerDay} h/day = ${killsPerDay} kills/day`,
);
console.log(
  `knobs: base=${LEVELING.killsPerLevelBase} growth=${LEVELING.killsPerLevelGrowth} refMobHp=${LEVELING.refMobHp} ramp=${LEVELING.earlyRampStart}→1 over ${LEVELING.earlyRampLevels} · cap=${LEVELING.maxLevel}\n`,
);
console.log(
  "   L     xpToNext   kills/lvl   levels/day   cum.kills   cum.days",
);

let cumKills = 0;
let cumDays = 0;
let firstDing = 0;
for (let L = 1; L < target; L++) {
  const kpl = killsPerLevel(L);
  cumKills += kpl;
  cumDays += kpl / killsPerDay;
  if (L === 1) firstDing = kpl;
  if (rows.includes(L)) {
    const lpd = killsPerDay / kpl;
    console.log(
      `${String(L).padStart(4)}  ${String(xpToLevelUp(L)).padStart(11)}  ${kpl
        .toFixed(0)
        .padStart(9)}  ${lpd.toFixed(1).padStart(10)}  ${Math.round(cumKills)
        .toLocaleString()
        .padStart(10)}  ${cumDays.toFixed(1).padStart(8)}`,
    );
  }
}

console.log(
  `\nfirst ding (L1→2): ~${Math.round(firstDing)} kills` +
    `   ·   to L${target}: ~${Math.round(cumKills).toLocaleString()} kills, ~${cumDays.toFixed(1)} days at this rate`,
);
console.log(
  "note: kills/lvl uses refMobHp as the reference mob; the opening waves are\n" +
    "weaker (worth less XP), so the very first ding takes more kills in play —\n" +
    "confirm it with a bot run (see the playtest skill).\n",
);
