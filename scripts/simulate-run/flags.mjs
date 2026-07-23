// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Flag parsing for the campaign simulator CLI (scripts/simulate-run.mjs):
// --help, the list/balance/view parsers, validation, and the resolved run
// configuration (specs, pacing, mortality, camera, arrival loadouts). The
// engine catalogs everything is validated against are threaded in from the
// entry script (which registers the @game/lib alias loader before importing
// the engine, so this module stays engine-import-free).

export function parseFlags(args, deps) {
  const {
    synthesizeArrival,
    DIFFICULTY_ORDER,
    LEVEL_ORDER,
    levelDef,
    BALANCE_TUNING_DEFAULTS,
    BOT_STRATEGIES,
    BOT_PROFILES,
    BOT_POSTURES,
    STAT_BUILDS,
    metaLane,
  } = deps;

  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const flag = (name) => args.includes(`--${name}`);

  if (flag("help")) {
    console.log(
      "usage: node scripts/simulate-run.mjs [--difficulty all|easy[,medium,…]] " +
        "[--level all|spacez_hq[,…]] [--rerun N] [--seed N] " +
        "[--strategy all|aggro,balanced,flee|survivor|rush|kite|boss] " +
        "[--class all|melee,ranged,magic,balanced|auto] " +
        "[--max-minutes N] [--fresh] [--full] [--verdict] [--farm] [--no-shop] [--no-arrow-xp] " +
        "[--start-level N] [--gear-tier regular|magic|rare|legendary] " +
        "[--stuck-limit N] [--view WxH|off] [--mortal] [--max-deaths N] " +
        "[--balance xpGain=0.8,mobHp=1.5] [--compare baseline.json] [--json out.json]\n\n" +
        "camera (--view WxH, default 422x195 — the horizontal-phone baseline in world px):\n" +
        "                 every run watches through a real camera rect (player-centred,\n" +
        "                 clamped to the level) stamped into the input each tick, so the\n" +
        "                 view-aware rules — enemy targeting, spawner summon-in, the bot's\n" +
        "                 wall-end sense — run exactly as on a device screen. Override with\n" +
        "                 e.g. --view 195x422 (portrait phone) or --view off (no camera,\n" +
        "                 the legacy blind-headless read).\n\n" +
        "stuck cancellation (--stuck-limit N, default 20; 0 = off): every no-progress\n" +
        "                 moment (a wedge on geometry, or loitering in one small patch without\n" +
        "                 landing damage) books a penalty at the bot's coordinates — repeats in\n" +
        "                 the same area weigh double. A run whose penalty reaches the limit is\n" +
        "                 CANCELLED (outcome `stuck`) and the STUCK AREAS table prints the\n" +
        "                 clustered coordinates plus a ready map-layout --highlight command, so\n" +
        "                 the failure spots can be SEEN on the map and iterated on.\n\n" +
        "mortality (--mortal, --max-deaths N): the hero is IMMORTAL by default (a death\n" +
        "                 revives him in place — the calibration read); every death is still\n" +
        "                 booked with its CAUSE (killer defId / hazard) and WORLD COORDINATES,\n" +
        "                 printed in the DEATHS table with a ready map-layout command. --mortal\n" +
        "                 makes a death START THE LEVEL OVER (fresh map, new attempt seed, the\n" +
        "                 walk-in loadout) — the survival read. --max-deaths N aborts a run\n" +
        "                 (outcome `dead`) once it books N deaths (default 10 under --mortal,\n" +
        "                 0 = never otherwise): if the bot keeps dying at the same place to the\n" +
        "                 same cause, the spot is too hard — stop measuring and go fix it.\n\n" +
        "specs (--strategy × --class): STRATEGY is the positioning posture — `aggro` (close\n" +
        "                 and hold tight, tolerate a denser ring), `balanced`/`survivor` (the\n" +
        "                 adaptive edge-hug), `flee` (hold far, disengage early). CLASS is the\n" +
        "                 stat-distribution build — how the hero spends level-up points, which\n" +
        "                 through the stat-aware auto-equip also picks the weapon and gear:\n" +
        "                 `melee`/`ranged`/`magic` focus a weapon lane, `balanced` spreads across\n" +
        "                 every stat, `auto` = the emergent lane. (`--profile` is the historical\n" +
        "                 alias for --class.) Either flag takes a comma list or `all` (class `all`\n" +
        "                 = melee,ranged,magic,balanced); more than one spec runs a MATRIX (one\n" +
        "                 campaign per strategy×class) and compares — the read for whether one\n" +
        "                 build is overpowered, and where each is strongest.\n\n" +
        "arrival (--start-level N): drop a REALISTIC leveled + geared hero into the first swept\n" +
        "                 rung instead of a fresh level-1 rookie — the campaign's intended entry\n" +
        "                 state, since the game scales to hero level. e.g. `--difficulty jesus\n" +
        "                 --start-level 50` measures a nightmare-geared L50 hero on JESUS. Pair\n" +
        "                 with --gear-tier (default rare) to set the rolled kit's tier. On\n" +
        "                 NIGHTMARE and JESUS --start-level DEFAULTS to the first swept level's\n" +
        "                 ladder hero level (nightmare ~40+; those rungs are never played from\n" +
        "                 L1) — pass --start-level 1 to force a fresh rookie there anyway.\n\n" +
        "shopping (DEFAULT on): a weapon-starved hero is walked to the merchant to sell →\n" +
        "                 repair → buy → equip, the way a real player recovers a broken weapon.\n" +
        "                 --no-shop turns it off (the bot-never-shops read) to A/B how much a\n" +
        "                 high-difficulty stall is the bot vs real balance.\n\n" +
        "arrow xp (DEFAULT on): --no-arrow-xp switches the golden-arrow XP faucet off for\n" +
        "                 the sweep, so pacing graphs read the pure kill grind — the isolation\n" +
        "                 view for tuning the arrowXpKills/arrowDropShare levers in\n" +
        "                 content/leveling.yaml.\n\n" +
        "pacing (DEFAULT realistic): each run ends when the hero reaches the map's intended\n" +
        "                 exit level (arrowCapByDifficulty), so he carries a real-player level\n" +
        "                 forward. --farm turns that off and farms to the cap (the endgame /\n" +
        "                 L99 / artifact-chase read; pair with a big --max-minutes / --rerun).\n\n" +
        `--balance knobs (same ten as the DEVELOPER → BALANCE page, 0..100, 1 = shipped):\n  ${Object.keys(
          BALANCE_TUNING_DEFAULTS,
        ).join(", ")}`,
    );
    process.exit(0);
  }

  // --balance xpGain=0.8,mobHp=1.5 → { xpGain: 0.8, mobHp: 1.5 }. Keys must match
  // the shipped BalanceTuning knobs exactly; values are the ×multipliers the
  // BALANCE subpage's sliders set (0 = system off, 1 = baseline).
  function parseBalance(spec) {
    if (!spec) return undefined;
    const out = {};
    for (const pair of spec.split(",")) {
      const [rawKey, rawVal] = pair.split("=");
      const key = (rawKey ?? "").trim();
      if (!(key in BALANCE_TUNING_DEFAULTS)) {
        console.error(
          `unknown balance knob "${rawKey}" — expected one of ${Object.keys(
            BALANCE_TUNING_DEFAULTS,
          ).join(", ")}`,
        );
        process.exit(1);
      }
      const value = Number(rawVal);
      if (!Number.isFinite(value) || value < 0) {
        console.error(
          `balance knob "${key}" needs a number ≥ 0, got "${rawVal}"`,
        );
        process.exit(1);
      }
      out[key] = value;
    }
    return out;
  }

  const parseList = (value, all) =>
    !value || value === "all"
      ? [...all]
      : value.split(",").map((s) => s.trim());

  const difficulties = parseList(opt("difficulty"), DIFFICULTY_ORDER);
  const levelsOnce = parseList(opt("level"), LEVEL_ORDER);
  // --rerun N: repeat each map N times per rung — the XP-cap / farm probe.
  const rerun = Math.max(1, Number(opt("rerun", "1")));
  const levels = levelsOnce.flatMap((id) => Array(rerun).fill(id));
  const seed = Number(opt("seed", "1"));
  // SPECS: the positioning strategy × the weapon-lane profile. Either flag takes a
  // comma list or `all` (strategy `all` = the three postures aggro/balanced/flee;
  // profile `all` = melee/ranged/magic). More than one combo runs a MATRIX.
  const strategies = parseList(opt("strategy", "survivor"), BOT_POSTURES);
  // --class is the primary name for the stat-distribution BUILD (melee/ranged/
  // magic/balanced — how the hero spends level-up points, which through the
  // stat-aware auto-equip also picks the weapon and gear). `--profile` is the
  // historical alias for the same axis (and also takes `auto`, the emergent lane,
  // and `meta`, the DEFAULT level-band melee → magic → melee strategy). `--class
  // all` sweeps the four real builds; `--profile all` also includes `auto`/`meta`.
  const classArg = opt("class");
  const profiles =
    classArg !== undefined
      ? parseList(classArg, STAT_BUILDS)
      : parseList(opt("profile", "meta"), BOT_PROFILES);
  const validate = (names, allowed, what) => {
    for (const n of names) {
      if (!allowed.includes(n)) {
        console.error(
          `unknown ${what} "${n}" — expected one of ${allowed.join(", ")}` +
            ` (or "all")`,
        );
        process.exit(1);
      }
    }
  };
  validate(strategies, BOT_STRATEGIES, "strategy");
  validate(profiles, BOT_PROFILES, "profile");
  const combos = strategies.flatMap((strategy) =>
    profiles.map((profile) => ({ strategy, profile })),
  );
  const maxMinutes = Number(opt("max-minutes", "15"));
  const carryLoadout = !flag("fresh");
  const full = flag("full");
  const verdict = flag("verdict");
  const balance = parseBalance(opt("balance"));
  const comparePath = opt("compare");
  const jsonPath = opt("json");
  // PACING. The DEFAULT is realistic: each run ends the moment the hero reaches
  // the map's intended exit level (its arrowCapByDifficulty), so he moves on with
  // a real-player level and every level-relative read stays trustworthy. `--farm`
  // opts OUT — the bot farms to the cap for the whole run, the endgame read (farm
  // toward L99 / full artifact gear); pair it with a big `--max-minutes`/`--rerun`
  // to farm deeper.
  const realisticPacing = !flag("farm");
  // SHOPPING is ON by default, because a real player shops: when the hero is
  // weapon-starved (a broken weapon, empty bag → the sidearm), the sim runs him
  // to the merchant to sell → repair → buy → equip. Without it a stranded hero
  // death-spirals on the sidearm, overstating high-difficulty pressure. `--no-shop`
  // turns it off — the bot-never-shops read, to A/B how much a stall is the bot
  // vs real balance.
  const autoShop = !flag("no-shop");
  // ARROW XP is ON by default (the real game). `--no-arrow-xp` switches the
  // golden-arrow faucet off for the sweep (engine `setArrowXpEnabled`) so a
  // pacing graph reads the pure kill grind — the isolation view for tuning
  // the `arrowXpKills` / `arrowDropShare` levers in content/leveling.yaml.
  const arrowXp = !flag("no-arrow-xp");
  // ARRIVAL. --start-level N drops a REALISTIC leveled + geared hero into the
  // first swept rung instead of a fresh level-1 rookie — the campaign's intended
  // entry state (a hero who cleared the rungs below and carried his kit forward).
  // The whole game scales to hero level, so this is the ONLY way a top rung reads
  // as it's actually played: e.g. `--difficulty jesus --start-level 50` measures a
  // nightmare-geared L50 hero on JESUS, not a naked rookie. --gear-tier sets the
  // rolled kit's tier (default rare — a solid nightmare-cleared loadout).
  const startLevel = opt("start-level");
  const gearTier = opt("gear-tier", "rare");
  // STUCK CANCELLATION. Every no-progress moment books a penalty at the bot's
  // world position (see SimulateLevelOptions.stuckLimit); a run whose penalty
  // reaches the limit is cancelled (outcome `stuck`) instead of grinding out the
  // clock — a stuck run's numbers are garbage data anyway, and the cancelled
  // run's STUCK AREAS coordinates are the actual deliverable: feed them to
  // `map-layout.mjs --highlight` to SEE where navigation failed. 0 disables
  // cancellation (penalties are still recorded and reported).
  const stuckLimit = Math.max(0, Number(opt("stuck-limit", "20")));
  // MORTALITY. --mortal makes a death START THE LEVEL OVER (fresh map, new
  // attempt seed, the walk-in loadout) instead of the immortal in-place revive —
  // the survival read. --max-deaths N aborts a run (outcome `dead`) once it
  // books N deaths; it defaults to 10 under --mortal (a bot that dies ten times
  // on one map has answered the question) and to 0 (never) otherwise. Every
  // death — mortal or not — lands in the DEATHS table with its cause and
  // coordinates, ready for map-layout's death overlay.
  const mortal = flag("mortal");
  const maxDeaths = Math.max(0, Number(opt("max-deaths", mortal ? "10" : "0")));
  // THE CAMERA. Every run watches through a real view rect by default — the
  // horizontal-phone baseline (422×195 world px, the reference device) — so the
  // view-aware rules (enemy targeting, spawner summon-in, the bot's wall-end
  // sense) run exactly as on a device screen. `--view WxH` overrides the size
  // (e.g. 195x422 for a portrait phone); `--view off` removes the camera
  // entirely (the legacy blind-headless read).
  const viewSpec = opt("view", "422x195");
  const view = (() => {
    if (["off", "none", "0"].includes(String(viewSpec).toLowerCase())) {
      return null;
    }
    const m = /^(\d+)x(\d+)$/i.exec(String(viewSpec));
    if (!m) {
      console.error(
        `--view must be WxH (world px) or "off", got '${viewSpec}'`,
      );
      process.exit(1);
    }
    return { width: Number(m[1]), height: Number(m[2]) };
  })();
  // NIGHTMARE and JESUS are NEVER played from level 1 — the campaign ladder
  // (content/ladder.yaml, stamped onto each level as `intendedLevel`) puts
  // the hero at ~40+ by the time those rungs' mobs appear. So when --start-level is
  // omitted on those difficulties, DEFAULT the arrival to the first swept level's
  // intended hero level, so the run reproduces where the map is actually reached
  // instead of a naked L1 rookie death-spiralling on the starter weapon. easy/
  // medium/hard keep the fresh-L1 default (their realistic entry — you DO climb
  // them from a rookie). JESUS has no authored ladder level (it is player-relative,
  // so `intendedLevel` omits it) — it borrows nightmare's as the entry-from-
  // nightmare proxy. An explicit --start-level always wins.
  function defaultStartLevel(difficulty, levelId) {
    if (difficulty !== "nightmare" && difficulty !== "jesus") return undefined;
    const intended = levelDef(levelId).intendedLevel ?? [];
    const nightmareIdx = DIFFICULTY_ORDER.indexOf("nightmare");
    const idx =
      difficulty === "jesus"
        ? nightmareIdx
        : DIFFICULTY_ORDER.indexOf(difficulty);
    return intended[idx] ?? intended[nightmareIdx];
  }
  // The arrival level actually used: an explicit --start-level, else the nightmare/
  // jesus ladder default (undefined on easy/medium/hard → a fresh L1 rookie).
  const startLevelDefaulted = startLevel === undefined;
  const resolvedStartLevel =
    startLevel !== undefined
      ? Number(startLevel)
      : defaultStartLevel(difficulties[0], levels[0]);
  // The arrival hero is minted per BUILD, so a class matrix with --start-level
  // drops each spec in as its OWN leveled + geared hero (a melee arrival wields a
  // melee weapon, etc.) rather than sharing one generalist loadout. `auto` has no
  // fixed build, so it arrives as the neutral generalist.
  const startLoadoutFor = (profile) =>
    resolvedStartLevel === undefined
      ? null
      : synthesizeArrival({
          difficulty: difficulties[0],
          level: resolvedStartLevel,
          seed,
          weaponTier: gearTier,
          gearTier,
          // The fixed stat-BUILDS synthesize a biased starting kit; the level-band
          // `meta` resolves its lane from the level it's SPUN UP at (magic in the
          // nightmare mid-game, melee at the artifact cap) so its starting kit
          // matches the lane it will commit to. The emergent `auto` has no lane to
          // pre-load for, so it arrives as the neutral generalist.
          build:
            profile === "meta"
              ? metaLane(resolvedStartLevel)
              : profile === "auto"
                ? undefined
                : profile,
        });

  return {
    difficulties,
    levels,
    rerun,
    seed,
    strategies,
    profiles,
    combos,
    maxMinutes,
    carryLoadout,
    full,
    verdict,
    balance,
    comparePath,
    jsonPath,
    realisticPacing,
    autoShop,
    arrowXp,
    gearTier,
    stuckLimit,
    mortal,
    maxDeaths,
    view,
    startLevelDefaulted,
    startLoadoutFor,
  };
}
