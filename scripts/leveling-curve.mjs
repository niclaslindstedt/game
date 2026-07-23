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
// (`LOOT.dropChance × arrowDropShare × the difficulty's arrowDropMult`) and
// each grants a flat `arrowXp(L)` — a few reference-mob kills' worth, the
// `arrowXpKills` knob in content/leveling.yaml — a second, parallel XP faucet
// the raw kill-XP count above ignores. The `w/arrows` column folds it in; the
// drip thins out up the rungs (zero on JESUS).
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

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The engine uses the @game/lib alias at runtime (menace.ts → items.ts →
// @game/lib) — map it before the first engine import, like simulate-run.mjs.
register("./game-alias-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { LEVELING, LOOT, STATS } = await import(
  path.join(root, "src/game/config/index.ts")
);
const { xpToLevelUp, arrowXp, xpLevelCap, xpCapMultiplier, mobLevelXp } =
  await import(path.join(root, "src/game/leveling.ts"));
const { XP_TUNING } = await import(
  path.join(root, "src/generated/leveling.ts")
);
const { mobLevelFor, mobLevelMidpoint } = await import(
  path.join(root, "src/game/menace.ts")
);
const { DIFFICULTY_ORDER, meetsMinDifficulty, difficultyDef, scaledMobCount } =
  await import(path.join(root, "src/game/defs/difficulties.ts"));
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
  return (
    dropChance *
    (1 - LOOT.nukeShare) *
    XP_TUNING.arrowDropShare *
    d.arrowDropMult
  );
};
// `--campaign` models a full story playthrough instead of the per-level table:
// clearing every level along the CRITICAL PATH in order, to check where the
// campaign leaves the hero (design target: ~level 60, leaving the rest as the
// grind-to-cap endgame). `--clear-share` overrides the assumed fraction of a
// level's roster actually killed per clear (default: the engine's ARRIVAL one).
//
// The critical path is the SHORTEST route to the cap under the parallel-lane
// ladder: one bottom lane (the three — easy/medium/hard — share XP caps and only
// differ in how much help they give, so `medium` is representative) → nightmare
// → jesus. Reaching the cap costs THREE playthroughs, not five. `--full` walks
// all five rungs in DIFFICULTY_ORDER instead (the completionist who replays
// every bottom lane), for comparison.
// `--start <easy|medium|hard>` picks which bottom lane the critical path runs
// through (default medium). The three share XP caps but differ in mob count,
// level offset, and hp, so it's worth checking each lands the tier consistently.
const startLane = opt("start", "medium");
const CRITICAL_PATH = [startLane, "nightmare", "jesus"];
const PLAYTHROUGH = args.includes("--full") ? DIFFICULTY_ORDER : CRITICAL_PATH;
const campaign = args.includes("--campaign");
// `--by-level` is `--campaign` with the intermediate detail: the hero's level
// at the START of every (difficulty × level) clear, so you can see exactly what
// level a given level is reached at on a first pass. This is the view that sizes
// a LEVEL-LOCKED world-drop gate — set the gate above the level a level is first
// cleared at and the drop can only be farmed on a RETURN (boss-run) pass.
const byLevel = args.includes("--by-level");
// `--targets` does a programmatic FULL CLEAR (every mob) of the campaign for
// EACH difficulty independently (from its tier-entry level) and prints where it
// leaves the hero against the intended finish level — the check that the level
// specs + XP tuning land the ladder (EASY→34, MEDIUM→36, HARD→38, NIGHTMARE→56,
// JESUS→70). It drives the REAL engine (see the block below), not a model.
const targetsMode = args.includes("--targets");
// What FRACTION of each map's roster a clear actually kills. `--targets` assumes
// a full clear (100%); the per-level table uses the engine's arrival share. Tune
// it with `--clear 60` (a percentage, the friendly form) or `--clear-share 0.6`.
const clearPctArg = opt("clear", "");
const clearShare = clearPctArg
  ? Math.max(0, Math.min(1, Number(clearPctArg) / 100))
  : Number(opt("clear-share", targetsMode ? "1" : "0.5"));
// The INTENDED entry level for each tier on the critical path — where a full
// clear of the tier below leaves the hero (bottom lanes ~34 → nightmare, then
// nightmare ~56 → jesus). The campaign model resets to these when a tier begins
// (instead of carrying the exact prior-tier level), so each tier is analysed
// from its intended entry regardless of which bottom lane was taken. Override
// with `--tier-entry nightmare:34,jesus:56`.
const TIER_ENTRY = { nightmare: 40, jesus: 58 };
for (const pair of (opt("tier-entry", "") || "").split(",").filter(Boolean)) {
  const [k, v] = pair.split(":");
  if (k && v) TIER_ENTRY[k] = Number(v);
}

if (!DIFFICULTY_ORDER.includes(difficulty)) {
  console.error(
    `unknown difficulty "${difficulty}" (expected: ${DIFFICULTY_ORDER.join(", ")})`,
  );
  process.exit(1);
}

// --targets drives the REAL ENGINE (src/sim/analytic.ts `simulateProgression`,
// which kills each map's actual roster through the real `killEnemy` → `grantXp`)
// — NO duplicated XP math, so a tuning change (mob bands, caps, xpBonus, the con
// system) shows up here automatically. Each rung is measured on its OWN, entered
// at its tier level (nightmare ~40, jesus ~58, via `synthesizeArrival`), full
// clear (or `--clear N%`), reported against the intended finish ladder.
if (targetsMode) {
  const { simulateProgression } = await import(
    path.join(root, "src/sim/analytic.ts")
  );
  const { synthesizeArrival } = await import(
    path.join(root, "src/sim/arrival.ts")
  );
  const { mobLevelMidpoint: midpoint } = await import(
    path.join(root, "src/game/menace.ts")
  );
  const TARGETS = { easy: 31, medium: 33, hard: 37, nightmare: 55, jesus: 69 };
  // The tier a mid-campaign rung is ENTERED from (its gear pool + entry level).
  const ENTERED_FROM = { nightmare: "hard", jesus: "nightmare" };
  const MOB_ALIGN_MARGIN = 4;
  console.log(
    `\nFull-clear finish levels (REAL engine, clearShare=${clearShare}) — target ladder in ()\n`,
  );
  console.log(
    "  " +
      "diff".padEnd(11) +
      LEVEL_ORDER.map((id) => id.slice(0, 10).padEnd(11)).join("") +
      "-> end (target)",
  );
  const alignFlags = [];
  for (const diff of DIFFICULTY_ORDER) {
    const entry = TIER_ENTRY[diff];
    const startLoadout =
      entry !== undefined
        ? synthesizeArrival({
            difficulty: ENTERED_FROM[diff] ?? diff,
            level: entry,
          })
        : undefined;
    const rep = simulateProgression({
      difficulties: [diff],
      carryLoadout: true,
      startLoadout,
      targetLevel: 1, // no grind tail — report the natural one-pass finish
      clearShare,
      includeRares: true,
    });
    const byMap = new Map(rep.levels.map((r) => [r.levelId, r]));
    const starts = LEVEL_ORDER.map(
      (id) => byMap.get(id)?.heroLevelStart ?? "?",
    );
    for (const id of LEVEL_ORDER) {
      const r = byMap.get(id);
      if (!r) continue;
      const mobMid = midpoint(LEVELS[id].mobLevels, diff);
      if (mobMid === null) continue;
      if (mobMid > r.heroLevelEnd + MOB_ALIGN_MARGIN)
        alignFlags.push(
          `  HIGH  ${diff.padEnd(10)} ${id.padEnd(11)} mobs ~${mobMid} vs hero ${r.heroLevelStart}→${r.heroLevelEnd} (too high — lower this map's band)`,
        );
      else if (mobMid < r.heroLevelStart - MOB_ALIGN_MARGIN)
        alignFlags.push(
          `  LOW   ${diff.padEnd(10)} ${id.padEnd(11)} mobs ~${mobMid} vs hero ${r.heroLevelStart}→${r.heroLevelEnd} (too low/grey — raise this map's band)`,
        );
    }
    const finish = rep.heroLevelEnd;
    const tgt = TARGETS[diff];
    const mark =
      Math.abs(finish - tgt) <= 1 ? "OK" : finish < tgt ? "LOW" : "HIGH";
    console.log(
      "  " +
        diff.padEnd(11) +
        starts.map((l) => `${l}`.padEnd(11)).join("") +
        `-> ${finish} (${tgt}) ${mark}`,
    );
  }
  if (alignFlags.length) {
    console.log(
      `\nMOB-vs-HERO band alignment (mobs should sit within ±${MOB_ALIGN_MARGIN} of the hero on each map):`,
    );
    for (const f of alignFlags) console.log(f);
  } else {
    console.log(`\nMob bands all within ±${MOB_ALIGN_MARGIN} of the hero. ✓`);
  }
  console.log("");
  process.exit(0);
}

if (campaign || byLevel) {
  // The XP a clear of a level's roster pays, computed exactly as the engine
  // does (`enemyKillXp`, loot.ts): every role pays a LEVEL-based reward
  // (`mobLevelXp` at mlvl = hero level + the difficulty's `mobLevelOffset`),
  // an ELITE/BOSS times its flat mob-multiple (`xpMobMult` or the role
  // default XP_TUNING mult). A def's flat `xp` override wins. Roster counts scale by the
  // difficulty's `mobCountMult` exactly like the spawner (`scaledMobCount`), so
  // a higher rung's bigger, higher-level horde pays proportionally more — the
  // whole reason harder lanes land the hero higher on a full clear.
  // Difficulty-gated lines the run never fielded are left out.
  const killXpOf = (e, level, diff, mobLevels) => {
    if (e.xp != null) return e.xp;
    const mult =
      e.role !== "minion"
        ? (e.xpMobMult ??
          (e.role === "boss"
            ? XP_TUNING.bossXpMobMult
            : XP_TUNING.eliteXpMobMult))
        : 1;
    // A mob's monster level is HARD-CODED in the level spec (below JESUS): the
    // authored band's midpoint for this rung (a spawn point's override, else the
    // level default). JESUS (and any level without a band) keeps the old
    // player-relative `mobLevelFor`. mobLevelXp folds in the WoW-style
    // level-difference multiplier, exactly as the engine's `enemyKillXp` does.
    const mlvl =
      (mobLevelMidpoint(mobLevels, diff) ?? mobLevelFor(level, diff)) +
      (e.levelBonus ?? 0);
    return mobLevelXp(mlvl, level) * mult;
  };
  // The roster as a flat list of [enemy def, scaled head-count] entries for the
  // difficulty (minDifficulty-gated, counts scaled by `mobCountMult`). The
  // clear is then walked kill-by-kill so the hero LEVELS UP MID-MAP — each kill
  // priced at the hero's rising level (the engine spawns mobs scaled to the
  // CURRENT level, so later kills in a big map pay more), which the old
  // whole-map-at-start-level grant under-counted.
  // Each entry is [def, headCount, mobLevelsSpec] — the spec being the spawn's
  // own hard-coded band (a spawn point's override, else the level default), so a
  // minion's kill XP is priced at the level it actually spawns with.
  const rosterEntries = (def, diff) => {
    const out = [];
    const dflt = def.mobLevels;
    for (const s of def.spawns ?? []) {
      if (!meetsMinDifficulty(diff, s.minDifficulty)) continue;
      out.push([
        enemyDef(s.enemy),
        scaledMobCount("count" in s ? s.count : 1, diff),
        dflt,
      ]);
    }
    for (const e of def.waves?.budget ?? []) {
      if (!meetsMinDifficulty(diff, e.minDifficulty)) continue;
      out.push([enemyDef(e.enemy), scaledMobCount(e.count, diff), dflt]);
    }
    // SPAWN POINTS (the finite horde most maps now use instead of waves): every
    // queued member, plus its lingering pre-placement — all of them get killed on
    // a clear. Each point may override the level default (`sp.mobLevels`).
    for (const sp of def.spawners ?? []) {
      if (!meetsMinDifficulty(diff, sp.minDifficulty)) continue;
      const spec = sp.mobLevels ?? dflt;
      for (const m of sp.members ?? []) {
        out.push([enemyDef(m.enemy), scaledMobCount(m.count, diff), spec]);
      }
    }
    // PLACED PACKS: dormant clusters woken and wiped on a full clear.
    for (const p of def.packs ?? []) {
      for (const m of p.members ?? []) {
        const count =
          typeof m.count === "number"
            ? scaledMobCount(m.count, diff)
            : (m.count[diff] ?? 0);
        if (count > 0) out.push([enemyDef(m.enemy), count, dflt]);
      }
    }
    return out;
  };
  let level = 1;
  let xp = 0;
  const advance = (diff) => {
    while (level < LEVELING.maxLevel && xp >= xpToLevelUp(level, diff)) {
      xp -= xpToLevelUp(level, diff);
      level++;
    }
  };

  console.log(
    `\nCampaign playthrough — clearShare=${clearShare} · curve=content/leveling.yaml · cap=${LEVELING.maxLevel}\n`,
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
  for (const diff of PLAYTHROUGH) {
    // Reset to the tier's INTENDED entry level (nightmare ~34, jesus ~56) so
    // each tier is measured from where the tier below leaves the hero, not from
    // the exact carried level. Only bumps UP (never demotes a further-along hero).
    if (TIER_ENTRY[diff] !== undefined && level < TIER_ENTRY[diff]) {
      level = TIER_ENTRY[diff];
      xp = 0;
    }
    const starts = [];
    for (const id of LEVEL_ORDER) {
      starts.push(level); // the hero's level as this level's clear BEGINS
      const pArrow = arrowDropProb(diff);
      const mapCap = xpLevelCap(id, diff);
      // Walk the roster kill-by-kill, leveling up as XP banks. Each kill is
      // priced at the hero's CURRENT level: `mobLevelXp` times the set-piece
      // mob-multiple where one applies; plus the golden-arrow drip (a flat
      // mob-priced bonus, `arrowXp`); all faded by the per-map XP cap
      // (`xpCapMultiplier`) exactly as `grantXp` does.
      // xpToLevelUp is keyed on the difficulty, so the per-tier leveling
      // slowdown and the endgame steepening both bite here.
      for (const [e, count, mobLevels] of rosterEntries(LEVELS[id], diff)) {
        const n = clearShare < 1 ? count * clearShare : count;
        for (let k = 0; k < n; k++) {
          const killXp = killXpOf(e, level, diff, mobLevels);
          const arrowDripXp = pArrow * arrowXp(level);
          const capMult = xpCapMultiplier(level, mapCap);
          xp += (killXp + arrowDripXp) * capMult;
          advance(diff);
        }
      }
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
    `\nafter the ${PLAYTHROUGH.join(" → ")} path: lvl ${level}  (then ${LEVELING.maxLevel - level} levels of grind to the cap)\n`,
  );
  process.exit(0);
}

// Kills to clear level L at this difficulty, from the real curve: the level's
// cost over the XP one hard-capped, level-difference-priced minion kill pays
// (`mobLevelXp` at the clamped `mobLevelFor`). autoPowerScale cancels top and
// bottom; the mob-level caps and the WoW-style diff multiplier move the count.
const killsPerLevel = (L) =>
  xpToLevelUp(L, difficulty) / mobLevelXp(mobLevelFor(L, difficulty), L);

// The same count with golden arrows folded in: each kill drips an expected
// `pArrow × arrowXp(L)` of flat mob-priced arrow XP on top of its own reward,
// so the kills actually needed fall to `k0 / (1 + pArrow × arrowXp/killXp)`.
// On JESUS pArrow is 0 and the two columns coincide.
const pArrow = arrowDropProb(difficulty);
const killsPerLevelWithArrows = (L) => {
  const k0 = killsPerLevel(L);
  const killXp = mobLevelXp(mobLevelFor(L, difficulty), L);
  return k0 / (1 + (pArrow * arrowXp(L)) / killXp);
};

const rows = [
  1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 99,
].filter((L) => L <= target);

console.log(
  `\nLeveling curve — difficulty=${difficulty}, ${killsPerHour} kills/hr × ${hoursPerDay} h/day = ${killsPerDay} kills/day`,
);
console.log(
  `knobs: curve=content/leveling.yaml (authored per-level XP) refMobHp=${LEVELING.refMobHp} · cap=${LEVELING.maxLevel}`,
);
console.log(
  `arrows: flat ${XP_TUNING.arrowXpKills} mob-kills each · slice=${XP_TUNING.arrowDropShare}×${difficultyDef(difficulty).arrowDropMult} · luck=${luck} → ~${pArrow.toFixed(3)} arrows/kill\n`,
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
      `${String(L).padStart(4)}  ${String(xpToLevelUp(L, difficulty)).padStart(11)}  ${kpl
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
