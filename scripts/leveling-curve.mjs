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
//
// GOLDEN XP ARROWS are folded in on top: they drop from the ordinary loot rain
// (`LOOT.dropChance × LOOT.arrowShare × the difficulty's arrowDropMult`) and
// each grants `arrowXpShareAt(L)` of the current level bar — a second, parallel
// XP faucet the raw kill-XP count above ignores. The `w/arrows` column folds it
// in, so the two columns bracket the real pace: arrows shave the most off early
// (big share, cheap levels) and thin out up the rungs (zero on JESUS).
//
// From a kill rate (kills/hour × hours/day) the model reads out LEVELS PER DAY
// at each level and the cumulative kills/days to a target level, so you can aim
// the taper (fast early → slow near the cap).
//
//   node scripts/leveling-curve.mjs                 # medium, 1500 kills/hr, 1 h/day
//   node scripts/leveling-curve.mjs --difficulty easy --kills-per-hour 3000
//   node scripts/leveling-curve.mjs --hours-per-day 2 --to 99
//   node scripts/leveling-curve.mjs --luck 20       # more LUCK → more arrows
//
// The kill rate is an ASSUMPTION — measure the real one with the `playtest`
// skill (kills ÷ timeMs from a bot run) and pass it here.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { LEVELING, LOOT, STATS } = await import(
  path.join(root, "src/game/config.ts")
);
const { xpToLevelUp, arrowXpShareAt, arrowColdXp } = await import(
  path.join(root, "src/game/leveling.ts")
);
const { mobHpScaleFor } = await import(path.join(root, "src/game/menace.ts"));
const { DIFFICULTY_ORDER, meetsMinDifficulty, difficultyDef } = await import(
  path.join(root, "src/game/defs/difficulties.ts")
);
const { LEVELS, LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { enemyDef } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const difficulty = opt("difficulty", "medium");
const killsPerHour = Number(opt("kills-per-hour", "1500"));
const hoursPerDay = Number(opt("hours-per-day", "1"));
const luck = Number(opt("luck", "0"));
const target = Math.min(LEVELING.maxLevel, Number(opt("to", "99")));
const killsPerDay = killsPerHour * hoursPerDay;

// The per-kill chance that a kill drops a golden XP arrow at `diff`: the drop
// gate (base + the rung's bonus + LUCK) times the arrow slice of the ladder
// (thinned by `arrowDropMult`, zero on JESUS). The nuke slice is skimmed first,
// hence the `(1 - nukeShare)`.
const arrowDropProb = (diff) => {
  const d = difficultyDef(diff);
  const dropChance = Math.min(
    1,
    LOOT.dropChance + d.dropChanceBonus + luck * STATS.dropChancePerLuck,
  );
  return dropChance * (1 - LOOT.nukeShare) * LOOT.arrowShare * d.arrowDropMult;
};
// `--campaign` models a full story playthrough instead of the per-level table:
// clearing every level at every difficulty in order, to check where the
// campaign leaves the hero (design target: ~level 60, leaving the rest as the
// grind-to-cap endgame). `--clear-share` overrides the assumed fraction of a
// level's roster actually killed per clear (default: the engine's ARRIVAL one).
const campaign = args.includes("--campaign");
// `--by-level` is `--campaign` with the intermediate detail: the hero's level
// at the START of every (difficulty × level) clear, so you can see exactly what
// level a given level is reached at on a first pass. This is the view that sizes
// a LEVEL-LOCKED world-drop gate — set the gate above the level a level is first
// cleared at and the drop can only be farmed on a RETURN (boss-run) pass.
const byLevel = args.includes("--by-level");
const clearShare = Number(opt("clear-share", "0.5"));

if (!DIFFICULTY_ORDER.includes(difficulty)) {
  console.error(
    `unknown difficulty "${difficulty}" (expected: ${DIFFICULTY_ORDER.join(", ")})`,
  );
  process.exit(1);
}

if (campaign || byLevel) {
  // The XP a full clear of a level's roster pays (mirrors arrival.ts rosterXp):
  // every placed spawn + wave-budget mob at its catalog hp, difficulty-gated
  // lines the run never fielded left out. The actual XP is that × how tough the
  // horde is at the hero's CURRENT level (mobHpScaleFor) × the clear share.
  const mobXp = (id) => {
    const e = enemyDef(id);
    return e.xp ?? Math.round(e.hp * LEVELING.xpPerHp);
  };
  const rosterXp = (def, diff) => {
    let t = 0;
    for (const s of def.spawns ?? []) {
      if (!meetsMinDifficulty(diff, s.minDifficulty)) continue;
      t += mobXp(s.enemy) * ("count" in s ? s.count : 1);
    }
    for (const e of def.waves?.budget ?? []) {
      if (!meetsMinDifficulty(diff, e.minDifficulty)) continue;
      t += mobXp(e.enemy) * e.count;
    }
    return t;
  };
  // The head-count of the same roster — how many kills the clear yields, so the
  // arrow drops (a per-kill roll) can be estimated on top of the kill XP.
  const rosterCount = (def, diff) => {
    let n = 0;
    for (const s of def.spawns ?? []) {
      if (!meetsMinDifficulty(diff, s.minDifficulty)) continue;
      n += "count" in s ? s.count : 1;
    }
    for (const e of def.waves?.budget ?? []) {
      if (!meetsMinDifficulty(diff, e.minDifficulty)) continue;
      n += e.count;
    }
    return n;
  };
  let level = 1;
  let xp = 0;
  const advance = () => {
    while (level < LEVELING.maxLevel && xp >= xpToLevelUp(level)) {
      xp -= xpToLevelUp(level);
      level++;
    }
  };
  console.log(
    `\nCampaign playthrough — clearShare=${clearShare} · base=${LEVELING.killsPerLevelBase} growth=${LEVELING.killsPerLevelGrowth} cap=${LEVELING.maxLevel}\n`,
  );
  if (byLevel) {
    // Column header: one column per level, in story order.
    console.log(
      "  " +
        "diff".padEnd(11) +
        LEVEL_ORDER.map((id) => id.padEnd(12)).join("") +
        "-> end",
    );
  }
  for (const diff of DIFFICULTY_ORDER) {
    const starts = [];
    for (const id of LEVEL_ORDER) {
      starts.push(level); // the hero's level as this level's clear BEGINS
      const kills = rosterCount(LEVELS[id], diff) * clearShare;
      const killXp =
        rosterXp(LEVELS[id], diff) * clearShare * mobHpScaleFor(level, diff);
      // Arrow XP for the clear: each of `kills` mobs has `arrowDropProb` to
      // drop an arrow. While the hero is UNDER this map/difficulty's arrow cap
      // it pays `arrowXpShareAt(level)` of the current bar; once he is AT/ABOVE
      // the cap the arrow goes COLD (`arrowColdXp`, a flat few mob kills). The
      // level is taken at the clear's START (an approximation — it climbs as
      // the clear plays out), so on a clean first pass START < cap = END and
      // arrows read hot; only an over-levelled start (high --luck, a replay)
      // trips the cold branch — which is exactly the anti-over-level behaviour.
      const cap = LEVELS[id].loot.arrowCapByDifficulty?.[diff];
      const arrowPerDrop =
        cap !== undefined && level >= cap
          ? arrowColdXp(level)
          : arrowXpShareAt(level) * xpToLevelUp(level);
      const arrowXp = kills * arrowDropProb(diff) * arrowPerDrop;
      xp += killXp + arrowXp;
      advance();
    }
    if (byLevel) {
      console.log(
        "  " +
          diff.padEnd(11) +
          starts.map((l) => `lvl ${l}`.padEnd(12)).join("") +
          `-> ${level}`,
      );
    } else {
      console.log(`  ${diff.padEnd(10)} -> lvl ${level}`);
    }
  }
  console.log(
    `\nafter all difficulties: lvl ${level}  (then ${LEVELING.maxLevel - level} levels of grind to the cap)\n`,
  );
  process.exit(0);
}

// Kills to clear level L at this difficulty, from the real curve. xpToLevelUp
// already bakes in refMobHp × the level ramp × autoPowerScale at offset 0; the
// actual mob's toughness uses the difficulty's offset, so autoPowerScale
// cancels and only the offset shifts the count.
const killsPerLevel = (L) =>
  xpToLevelUp(L) / (LEVELING.refMobHp * mobHpScaleFor(L, difficulty));

// The same count with golden arrows folded in. Over the `k0` kills a level
// takes on kill XP alone, arrows drip an extra `k0 × pArrow × arrowXpShareAt(L)`
// levels' worth of XP, so the kills actually needed fall to
// `k0 / (1 + k0 × pArrow × arrowShareAt(L))`. On JESUS pArrow is 0 and the two
// columns coincide. Arrows read HOT here: this table models a hero levelling
// THROUGH on-content, always under the arrow cap (see `arrowCapByDifficulty`);
// the cold-once-capped branch only bites on REPLAY, which the `--campaign`
// model handles per (map, difficulty).
const pArrow = arrowDropProb(difficulty);
const killsPerLevelWithArrows = (L) => {
  const k0 = killsPerLevel(L);
  return k0 / (1 + k0 * pArrow * arrowXpShareAt(L));
};

const rows = [
  1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 99,
].filter((L) => L <= target);

console.log(
  `\nLeveling curve — difficulty=${difficulty}, ${killsPerHour} kills/hr × ${hoursPerDay} h/day = ${killsPerDay} kills/day`,
);
console.log(
  `knobs: base=${LEVELING.killsPerLevelBase} growth=${LEVELING.killsPerLevelGrowth} refMobHp=${LEVELING.refMobHp} ramp=${LEVELING.earlyRampStart}→1 over ${LEVELING.earlyRampLevels} · cap=${LEVELING.maxLevel}`,
);
console.log(
  `arrows: share@L1=${LEVELING.arrowXpShare} taper=${LEVELING.arrowXpShareTaper} · slice=${LOOT.arrowShare}×${difficultyDef(difficulty).arrowDropMult} · luck=${luck} → ~${pArrow.toFixed(3)} arrows/kill\n`,
);
console.log(
  "   L     xpToNext   kills/lvl   w/arrows   levels/day   cum.kills   cum.days",
);

// Cumulative and levels/day ride the WITH-ARROWS count — the realistic pace;
// the raw `kills/lvl` column stays beside it as the kill-XP-only baseline.
let cumKills = 0;
let cumDays = 0;
let firstDing = 0;
for (let L = 1; L < target; L++) {
  const kpl = killsPerLevel(L);
  const kplA = killsPerLevelWithArrows(L);
  cumKills += kplA;
  cumDays += kplA / killsPerDay;
  if (L === 1) firstDing = kplA;
  if (rows.includes(L)) {
    const lpd = killsPerDay / kplA;
    console.log(
      `${String(L).padStart(4)}  ${String(xpToLevelUp(L)).padStart(11)}  ${kpl
        .toFixed(0)
        .padStart(9)}  ${kplA.toFixed(0).padStart(8)}  ${lpd
        .toFixed(1)
        .padStart(10)}  ${Math.round(cumKills)
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
    "weaker (worth less XP), so the very first ding takes more kills in play.\n" +
    "`w/arrows` folds in the golden-arrow drip at an ASSUMED drop rate — confirm\n" +
    "the real pace with a bot run (see the playtest skill).\n",
);
