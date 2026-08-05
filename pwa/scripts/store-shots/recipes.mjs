// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The store screenshot RECIPES — what each frame stages, and the machinery for
// getting the real game into that situation. Shared by the two drivers so a
// recipe is tuned in ONE place:
//
//   store-shots.mjs       captures each recipe at its chosen `captureAtMs`
//   store-shot-sweep.mjs  captures a MATRIX of times around it and contact-sheets
//                         them, so the chosen moment is picked by eye instead of
//                         guessed
//
// The workflow the two form is the point (see the `store-shots` skill): sweep
// coarsely over a couple of seconds, look at the sheet, sweep finely around the
// best frame, look again, then write the winning delay into `captureAtMs` here.
// A screenshot of a 200 ms explosion is otherwise pure luck.
//
// `window` below only appears inside page.evaluate callbacks, which execute in
// the browser page, not in Node.
/* global window */

import { readFileSync } from "node:fs";

const identity = JSON.parse(
  readFileSync(new URL("../../../game.config.json", import.meta.url), "utf8"),
);

const SETTINGS_KEY = `${identity.storagePrefix}:settings`;

// ---------------------------------------------------------------------------
// SAFE MODE — the same switch a guardian throws, thrown by the harness.
//
// Some storefronts want a screenshot set with no blood in it: an age rating
// below the one the shipped gore earns, a family programme, a regional
// listing, a press kit for a publication that will not print viscera. The
// answer is NOT a second set of recipes with the gore staged out of them,
// because a hand-kept "safe" staging drifts from the real one and eventually
// advertises a game that does not exist.
//
// Instead the capture flips the game's OWN umbrella gate. `nsfwAllowed()`
// (pwa/src/app/device-policy.ts) is the one question every mature feature is
// asked — the blood, the floor it soaks, the hero's coat, cleaves, gibs, the
// nuke's burning dead — and the native shell answers it by stamping
// `window.__GIS_POLICY__` on the page before the first module evaluates. This
// stamps exactly the same flag, so a safe capture is the game a parent with
// MATURE CONTENT switched off actually plays: every frame is still the real
// fight at the real moment, with the gore gate shut at the point each effect
// is DECIDED rather than painted over afterwards.
//
// It follows that a new mature feature needs nothing here — that is the whole
// reason the gate is an umbrella (see the `gore-system` skill).
// ---------------------------------------------------------------------------
const SAFE_POLICY = { nsfw: false, store: true };

/**
 * Boot a capture context: mute the audio, pre-unlock the developer menu
 * (normally seven taps on the title sun — the recipes reach NIGHTMARE and the
 * late maps through the developer warp, both unlock-gated for a fresh hero),
 * and in `safe` mode shut the mature-content gate.
 *
 * Shared by the two drivers so a sweep and the capture it tunes boot the page
 * identically — a delay chosen against bloodied frames is not the delay a safe
 * capture wants, and the sweep can only tell you that if it can shoot safe too.
 */
export async function prepareContext(context, { safe = false } = {}) {
  await context.addInitScript(
    ([key]) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          developerUnlocked: true,
          musicVolume: 0,
          sfxVolume: 0,
        }),
      );
    },
    [SETTINGS_KEY],
  );
  if (!safe) return;
  await context.addInitScript((policy) => {
    window.__GIS_POLICY__ = policy;
  }, SAFE_POLICY);
}

// ---------------------------------------------------------------------------
// The rasters the three storefronts require. Apple scales a 6.9" iPhone set
// down to every smaller iPhone and a 13" iPad set to every smaller iPad, so
// those two cover the whole App Store submission; Steam wants 1920×1080.
//
// `css` × `scale` MUST equal `raster` — a mismatch is silently accepted by
// Chromium and rejected by Apple. `assertRasters` enforces it.
//
// Three fields exist for the Steam entry, and each of them is the desktop
// answering differently from a phone rather than a preference:
//
//   `out`     where the set is written. Steam's frames must NOT land in
//             native/store/screenshots — `stage-store-screenshots.mjs` ships
//             everything it finds there to App Store Connect, and a 16:9
//             desktop frame is not a valid iPhone screenshot.
//   `touch`   false. The menu cursor is pointer-type-dependent (the wisp for a
//             mouse, per-row icons for a finger), so a Steam shot taken with
//             `hasTouch` on advertises the phone build's menus.
//   `layout`  bleed. `framed` insets the capture under a caption band, which
//             is a mobile store card's shape; Valve's own guidance is that a
//             screenshot is gameplay, and bleed keeps every pixel 1:1.
// ---------------------------------------------------------------------------
export const DEVICES = [
  {
    name: "iphone-6.9",
    label: 'iPhone 6.9" (16 Pro Max class)',
    css: { width: 956, height: 440 },
    scale: 3,
    raster: { width: 2868, height: 1320 },
  },
  {
    name: "ipad-13",
    label: 'iPad 13" (M4 class)',
    css: { width: 1376, height: 1032 },
    scale: 2,
    raster: { width: 2752, height: 2064 },
  },
  {
    name: "steam-1080",
    label: "Steam 1920×1080",
    css: { width: 1920, height: 1080 },
    scale: 1,
    raster: { width: 1920, height: 1080 },
    out: "electron/store/screenshots",
    touch: false,
    layout: "bleed",
  },
];

export function assertRasters(devices) {
  for (const d of devices) {
    if (
      d.css.width * d.scale !== d.raster.width ||
      d.css.height * d.scale !== d.raster.height
    ) {
      throw new Error(
        `${d.name}: ${d.css.width}×${d.css.height} @${d.scale}× is not ` +
          `${d.raster.width}×${d.raster.height}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Staging rules shared by every recipe.
// ---------------------------------------------------------------------------

// Lift the fog, silence the in-world scenes that would park the run in a
// dialogue phase, and never let a field without a live boss read as cleared.
//
// NOTE what is NOT here: `freeze` and `disarmed`. The effects gallery uses both
// to hold an exhibit still, but a frozen, holstered hero is exactly the
// "nothing is happening" screenshot — no swing, no muzzle flash, no slash cone.
// These runs are LIVE and are slowed with `window.__timeScale` instead.
export const DISPLAY_CASE = {
  reveal: true,
  muteDialogue: true,
  noVictory: true,
  stopWaves: true,
};

// A max-ish endgame build. Absolute allocations, so this IS the hero's spread.
const ENDGAME_STATS = {
  strength: 60,
  dexterity: 40,
  intelligence: 60,
  stamina: 40,
};

// The magic tree trained to the top — the always-on FX (orbiting flames, the
// storm, seeker orbs, the immolation aura) that make a late build look like a
// late build even in a still frame. See the `talent-fx` skill.
const MAGIC_TALENTS = [
  "orbiting_flames",
  "storm_call",
  "seeker_orbs",
  "immolation_aura",
  "arcane_singularity",
];

/**
 * The CLOSE half of that tree — the two effects that burn where the hero is
 * standing, without the three that reach across the whole screen.
 *
 * It exists for the horde frame, and the reason is the damage numbers rather
 * than the light. Every landed blow floats its own figure, so a build that
 * strikes thirty bodies at once at endgame damage stacks thirty five-digit
 * numbers into a slab that covers the fight it is describing. Keeping the
 * reach short means the kills happen where the eye already is, and the numbers
 * stay part of the picture instead of hiding it.
 */
const CLOSE_MAGIC_TALENTS = ["orbiting_flames", "immolation_aura"];

const trainTalents = (ids) =>
  async function trainTalentsOnLiveRun(page) {
    for (const id of ids) {
      await page.evaluate((t) => window.__talent?.(t, 5), id);
    }
  };

const trainMagic = trainTalents(MAGIC_TALENTS);

const slow = (f) => async (page) => {
  await page.evaluate((v) => window.__timeScale?.(v), f);
};

/** How long a recipe may wait for something it staged to actually happen — a
 * boss winding up, a boss falling. Generous because these runs are slowed. */
const STAGED_EVENT_TIMEOUT_MS = 40_000;

/**
 * Wait for the level's boss to TELL.
 *
 * Every set-piece move opens with a fixed, never-rolled windup in which the
 * boss strikes its cast pose (the three-beat contract in
 * `defs/enemies/abilities.ts`: TELL → CAST → RESOLVE). That pose is the only
 * moment in the fight a screenshot can be TIMED off, and it is on the state as
 * `enemy.mech.telegraph`, so the harness reads it rather than sweeping a
 * two-second window hoping the boss felt like casting inside it.
 *
 * Used as a recipe's `trigger`, which makes `captureAtMs` "ms after the tell
 * began" — so the number is the move's own windup plus however far into the
 * CAST the frame should land, stretched by whatever `prepare` slowed the sim
 * to. Only elites and bosses telegraph at all (`stepEnemyMechanics` turns
 * minions away), so the staged horde can never be what this catches.
 */
const awaitBossTell = () => async (page) => {
  // The `null` is the page function's ARGUMENT, and it is load-bearing:
  // `waitForFunction(fn, arg, options)` takes three, so passing the options as
  // the second silently hands them over as the argument and leaves the wait on
  // Playwright's default 30 s — which is shorter than some of these stagings.
  await page.waitForFunction(
    () => !!window.__game?.enemies?.some((e) => e.mech?.telegraph),
    null,
    { timeout: STAGED_EVENT_TIMEOUT_MS },
  );
};

/**
 * Wait for the staged boss to actually FALL, then lay its named legendaries
 * out around the body.
 *
 * The boss is staged on the last sliver of its bar (`bossHpFrac`) and killed
 * for real by the hero standing over it, which is the only way to get the
 * thing this frame is about: a genuine corpse. The remains a kill leaves are
 * the app's own presentation of the `enemyKilled` event — an epic body persists
 * for the rest of the level — and nothing but a real death emits one, so a
 * scenario cannot pose it. The kill also lays down `state.bossCorpse`, which is
 * how the harness knows it happened.
 *
 * The drops are laid AFTERWARDS and around the CORPSE rather than around the
 * hero, because that is the picture: the fan is the boss's payout lying where
 * the boss did. `dropRing` rings the hero, so each piece takes its own exact
 * `at` — a ring of `at`s, computed here against the body's real position.
 *
 * AND THE HERO IS STOOD BACK OFF THE BODY, which is the half that makes the
 * frame hold still. Ground items are scooped by walking over them, so a hero
 * left standing where he landed the finisher has the whole fan in his pockets
 * within a second and the shot becomes an empty floor under a stack of pickup
 * toasts. Backed off, he is looking at it — which is also the more honest
 * picture of what a boss kill hands you.
 */
const awaitBossKill = (uniques, { ring = 44, standoff = 76 } = {}) =>
  async function layBossDrops(page) {
    // `null` is the page function's argument — see `awaitBossTell`.
    await page.waitForFunction(() => !!window.__game?.bossCorpse, null, {
      timeout: STAGED_EVENT_TIMEOUT_MS,
    });
    await page.evaluate(
      ({ items, radius, back }) => {
        const state = window.__game;
        const at = state?.bossCorpse?.pos;
        if (!at) return;
        const hero = state.players[0].pos;
        const away = Math.hypot(hero.x - at.x, hero.y - at.y) || 1;
        window.__scenario?.({
          // Both halves in ONE call: `applyScenario` moves the hero before it
          // lays ground items, and `place` is the only way to move him at all.
          place: {
            x: at.x + ((hero.x - at.x) / away) * back,
            y: at.y + ((hero.y - at.y) / away) * back,
          },
          drops: items.map((item, i) => {
            const angle = (i / items.length) * Math.PI * 2 + Math.PI / 5;
            return {
              item,
              // Squashed vertically: the world is drawn at a shallow angle, so
              // a round ring reads as an oval and a wide fan reads as a ring.
              at: {
                x: at.x + Math.cos(angle) * radius,
                y: at.y + Math.sin(angle) * radius * 0.55,
              },
            };
          }),
        });
      },
      { items: uniques, radius: ring, back: standoff },
    );
  };

/**
 * Walk the hero to within arm's reach of the boss he is about to fell.
 *
 * `place: "boss"` sets him down a deliberate STAND-OFF away — the distance a
 * fight opens at, which is the right staging for a fight and the wrong one for
 * a finish. These runs have the autopilot off, so a melee build parked out
 * there would swing at nothing for as long as you watched it.
 *
 * The boss is named rather than guessed at (the biggest health bar on the field
 * is an escort as often as the objective), so a content move that retires the
 * id leaves the hero standing still — visible in the very first sweep — instead
 * of quietly picking a different mob.
 */
const closeOnBoss = (defId, reach = 30) =>
  async function stepInsideBossReach(page) {
    await page.evaluate(
      ({ id, gap }) => {
        const state = window.__game;
        const boss = state?.enemies?.find((e) => e.defId === id);
        if (!boss) return;
        const hero = state.players[0].pos;
        const away = Math.hypot(hero.x - boss.pos.x, hero.y - boss.pos.y) || 1;
        window.__scenario?.({
          place: {
            x: boss.pos.x + ((hero.x - boss.pos.x) / away) * gap,
            y: boss.pos.y + ((hero.y - boss.pos.y) / away) * gap,
          },
        });
      },
      { id: defId, gap: reach },
    );
  };

/** Run several `prepare`/`trigger` steps in order, as one. */
const inOrder =
  (...steps) =>
  async (page) => {
    for (const step of steps) await step(page);
  };

/**
 * SURROUND the hero with a mob, evenly.
 *
 * A single `spawns` entry scatters its whole count at random distances across
 * one wide `[minDistance, maxDistance]` band, which clumps: most of the horde
 * lands in the same arc and the frame reads as a crowd off to one side rather
 * than a hero hemmed in. This splits the count into concentric BANDS — near,
 * middle, far — each its own ring entry, so the density is even from the
 * hero's shoulders out to the screen edge.
 *
 * Distances are world units; the phone viewport is ≈422×195 of them, so a
 * ring past ~160 is off-screen and wasted.
 *
 * @param enemy  enemy def id
 * @param count  total mobs to place
 * @param from   inner radius (default 32 — just past melee reach)
 * @param to     outer radius (default 150 — the screen edge)
 * @param bands  how many concentric rings to split across
 * @param rest   any other `ScenarioSpawn` field (`hpMult`, `hpFrac`, `mlvl`),
 *               copied onto every band — see `GLASS_HORDE`
 */
function surround(
  enemy,
  count,
  { from = 32, to = 150, bands = 3, ...rest } = {},
) {
  const step = (to - from) / bands;
  // Outer bands cover more area, so give them proportionally more mobs — an
  // even split per band would leave the outside looking sparse.
  const weights = Array.from({ length: bands }, (_, i) => i + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, i) => ({
    enemy,
    count: Math.max(1, Math.round((count * w) / total)),
    minDistance: Math.round(from + i * step),
    maxDistance: Math.round(from + (i + 1) * step),
    ...rest,
  }));
}

/**
 * A horde staged to COME APART rather than merely to die.
 *
 * Whether a body bursts is not a roll and not a setting: `overkill.ts` prices
 * it on the health the killing blow spent PAST zero, measured in the victim's
 * own bar (QuakeWorld's `health < -40`, carried over into healthbars). Four
 * tenths of a bar past dead gibs, a quarter cleaves. So the way to stage a
 * horde being torn apart is not to ask for gore — it is to stage the situation
 * that earns it: a build whose damage has outgrown the horde's health several
 * times over, which is exactly what the endgame looks like from the inside.
 *
 * `hpMult` is the lever, and it is the honest one: it shrinks the BAR the blow
 * is measured against, so an ordinary swing lands several bars past dead.
 *
 * THE NUMBER IS A PACE, NOT A LETHALITY. This was first staged at 0.03, on the
 * reasoning that thinner glass breaks harder — and it produced the one frame a
 * massacre should never produce: at every sampled delay from zero onward the
 * whole ring was ALREADY DOWN, the screen a flat grey carpet of remains and
 * smoke with nothing left standing to be killed. Past a certain point more
 * overkill buys no more spectacle (a blow twenty bars past dead looks exactly
 * like one two bars past dead) and costs the only thing that makes the frame
 * read as a fight: bodies still coming. So it is set where the horde dies over
 * a couple of seconds instead of in one tick — a rolling collapse the shutter
 * can be aimed into, with a wall of mobs behind it.
 *
 * In SAFE MODE none of this comes apart — `nsfwAllowed()` is false, so every
 * one of these deaths falls back to the plain splash and the ordinary topple.
 * The staging is unchanged on purpose: same fight, same instant, same
 * screenful of damage numbers, with the mess switched off at the gate.
 */
const GLASS_HORDE = { hpMult: 0.4 };

// ---------------------------------------------------------------------------
// The recipes.
//
// The rule every one obeys: STAGE THE ENDGAME, MID-FIGHT. A freshly spawned
// hero on an empty floor is what the game looks like for its first ten minutes
// and it sells nothing; what sells is a level-90 build on NIGHTMARE with a
// named legendary in hand and the screen on fire.
//
// Shape of a recipe:
//   prepare(page)  runs once the run is live — train talents, set the time
//                  scale, walk somewhere. Not timed.
//   trigger(page)  the instant the clock starts from. Either something the
//                  harness DOES (a nuke) or something it WAITS FOR (the boss's
//                  windup, the boss falling) — the clock starts when it
//                  RETURNS either way, so a trigger may take as long as the
//                  staged event needs without eating the capture delay.
//                  Optional; without one the clock starts after `prepare`.
//   captureAtMs    ms after the trigger to take the real screenshot. THIS is
//                  the number the sweep exists to find.
//   showAchievements
//                  opt in to achievement recording and toasts when the
//                  achievement itself is the subject. Store captures suppress
//                  them by default so a deterministic scene cannot mutate the
//                  developer's real trophy shelf or cover the action.
//   sweepMs        the coarse schedule the sweep samples when exploring this
//                  recipe (defaults to COARSE_MS).
// ---------------------------------------------------------------------------

/** The default coarse schedule: a couple of seconds, log-ish spacing. */
export const COARSE_MS = [
  0, 80, 160, 260, 380, 520, 700, 900, 1150, 1450, 1800, 2200,
];

export const SHOTS = [
  {
    id: "nuke",
    caption: "POWERS THAT CLEAR THE ROOM",
    level: "the_rift",
    difficulty: "nightmare",
    seed: 21,
    interior: 0.68,
    scenario: {
      level: 90,
      stats: ENDGAME_STATS,
      weapon: "the_reckoning",
      // A NUKE clears the room, so the room has to be full: what the frame is
      // selling is the difference between the instant before and the instant
      // after, and a thin ring cannot show it. The horde is glass (see
      // GLASS_HORDE) so the blast does not merely kill it — it takes it apart.
      spawns: [
        ...surround("voidling", 52, { ...GLASS_HORDE }),
        ...surround("graviton", 22, { from: 48, to: 165, ...GLASS_HORDE }),
      ],
    },
    // The detonation is BRUTALLY fast in wall-clock: swept at full speed its
    // shockwave ring peaks around 15 ms and is gone by 30. That is not a target
    // a screenshot can hit reliably, so the sim is slowed first — the ring,
    // the fire columns and the damage numbers are all sim-driven, so 0.25×
    // stretches the whole spectacle into a window wide enough to aim at.
    prepare: slow(0.25),
    trigger: async (page) => {
      await page.evaluate(() => window.__nuke?.());
    },
    // Swept honestly (see the sweep's per-sample restaging): the whole first
    // SECOND is a wall of fire columns under a slab of five-digit numbers, which
    // is loud and unreadable — every frame in it looks like every other. What
    // says "clear the room" is the aftermath, and at 0.25x sim it arrives around
    // 3.5-5 s of wall clock: the fire has burned down and what is left is a
    // whole screenful of charred skeletons over a kill counter in the sixties.
    // The field thins from there and is bare past 7 s.
    captureAtMs: 3600,
    sweepMs: [0, 600, 1500, 2600, 3600, 4200, 4800, 5400, 6000, 7000, 8000],
  },
  {
    id: "horde",
    caption: "TEAR THE HORDE APART",
    // MARS, not the bunker. Swept on the bunker this frame was weak at EVERY
    // timestamp — a pale pink floor with mobs scattered to the edges — which no
    // capture delay can fix. Mars gives the set a red palette against the
    // rift's purple, and the horde reads against it.
    level: "mars",
    difficulty: "nightmare",
    seed: 33,
    interior: 0.54,
    scenario: {
      level: 88,
      stats: ENDGAME_STATS,
      // A HAMMER, deliberately. Whether a body bursts or is cut in half is the
      // weapon's business (an edge cleaves, a mass gibs), and a ring of bodies
      // coming apart at once is what this frame is.
      weapon: "mjolnir",
      // Hellborn mobs — the rampage-only spawn (`EnemyDef.hellborn`) a calm run
      // never meets — packed in tight so the frame is a fight, not a floor.
      //
      // COUNTED DOWN FROM SEVENTY-FOUR, not up. A ring that big is not a denser
      // frame, it is an unreadable one: every blow floats its own damage number,
      // so seventy simultaneous hits stack into a solid slab of yellow across
      // the top of the screen with the hero somewhere underneath it. Roughly
      // forty bodies fills the same floor and leaves the numbers legible, which
      // is what makes the hit sizes part of the picture instead of noise.
      spawns: [
        ...surround("phobos_shepherd", 7, {
          from: 34,
          to: 110,
          bands: 2,
          ...GLASS_HORDE,
        }),
        ...surround("olympus_engine", 5, {
          from: 48,
          to: 130,
          bands: 2,
          ...GLASS_HORDE,
        }),
        ...surround("servo_bot", 30, { from: 30, to: 140, ...GLASS_HORDE }),
      ],
    },
    // The trained talents are what make this a MASSACRE rather than a duel: the
    // aura and the orbiting flames land on bodies the hammer is nowhere near,
    // so a whole arc comes apart at once instead of one mob at a time in front
    // of the hero. The tree's LONG-REACH half is deliberately left untrained —
    // see CLOSE_MAGIC_TALENTS.
    //
    // SLOWED BEFORE TRAINED, and the order is load-bearing: training is a round
    // trip into the page per talent, and at full speed the aura those talents
    // switch on has already eaten half the ring before the last one lands.
    prepare: inOrder(slow(0.2), trainTalents(CLOSE_MAGIC_TALENTS)),
    // Swept: the ring is closed and the first bodies are coming apart at 80 ms.
    // Later reads WORSE rather than bigger — the numbers pile up faster than
    // the kills do, and by 260 ms the slab is back.
    captureAtMs: 80,
    sweepMs: [0, 40, 80, 120, 160, 220, 300, 400, 560, 760],
  },
  {
    id: "talents",
    caption: "TALENTS THAT NEVER SWITCH OFF",
    level: "the_rift",
    difficulty: "nightmare",
    seed: 7,
    interior: 0.76,
    scenario: {
      level: 92,
      stats: ENDGAME_STATS,
      weapon: "starfall",
      spawns: [
        ...surround("unraveler", 26),
        ...surround("star_jelly", 22, { from: 45, to: 155 }),
      ],
    },
    prepare: async (page) => {
      await trainMagic(page);
      await slow(0.25)(page);
    },
    // Swept: the singularity's lightning strike lands ~160 ms. The old 1200 ms
    // was long past every talent FX in the set.
    captureAtMs: 160,
  },
  {
    id: "loot",
    caption: "LOOT WORTH THE GRIND",
    // GOODCO HQ, and the venue is chosen by ITS BOSS'S COMPANY. This frame
    // needs a boss that dies where it stands and does it alone, and only one
    // map offers both. MARS's and the RIFT's own bosses FLEE at a sliver
    // (`EnemyDef.flees`) and leave no body to lay loot on. BOOT HILL's dies,
    // but it is escorted by four more bosses — and `clearEnemies` keeps every
    // boss on purpose, so the hero is left standing inside a ring of five apex
    // mobs and is killed long before he lands the finisher. PAYLOAD-1 stands by
    // itself. The plant's pale deck is a fourth floor colour besides.
    level: "goodco_hq",
    difficulty: "nightmare",
    seed: 12,
    scenario: {
      place: "boss",
      level: 90,
      stats: ENDGAME_STATS,
      weapon: "the_reckoning",
      // On its last sliver. The hero finishes it FOR REAL a moment later, which
      // is the entire staging: the persistent body an epic kill leaves behind
      // is the app's presentation of a real `enemyKilled`, and no scenario can
      // pose one. Everything this frame shows — the corpse, the kill's own FX,
      // the STAY marker — arrives because the boss was actually killed.
      bossHpFrac: 0.02,
      // The staff, kept back: close enough to say the floor is still hostile,
      // far enough that they are not chewing on the hero while he finishes.
      spawns: [...surround("guard", 12, { from: 95, to: 160, bands: 2 })],
    },
    // Step inside reach first: `place: "boss"` sets the hero down at the
    // distance a fight OPENS at, and with the autopilot off he would swing at
    // air out there forever.
    prepare: closeOnBoss("payload_1", 26),
    // The clock starts when the boss goes down and its legendaries hit the
    // ground around the body — so the delay below is "how long after the kill",
    // however long the kill itself took.
    trigger: awaitBossKill([
      "skybreaker",
      "kingsbane",
      "sunwreath",
      "the_stillward",
      "meteorfall",
    ]),
    // Swept: the fan's beams are up and the floor's staff are closing at 400 ms.
    // Later the hero starts taking hits and the screen washes red.
    captureAtMs: 400,
    sweepMs: [60, 200, 400, 600, 800, 1100, 1500, 2000, 2600, 3400],
  },
  {
    id: "boss",
    caption: "READ THE TELL, OR DIE",
    // THE FLAGBEARER, for his BEAM. Every boss has a set piece, but they do not
    // photograph equally: THE FOUNDER's airstrike is four pods falling over a
    // second and a half, which is a frame of markers on the floor and then a
    // frame of smoke with the hero somewhere inside it. A sweeping laser is a
    // single unmistakable object in the middle of the picture, and the grey
    // lunar dust it is drawn over gives the set a fourth palette.
    level: "moon",
    difficulty: "nightmare",
    seed: 9,
    scenario: {
      place: "boss",
      level: 90,
      stats: ENDGAME_STATS,
      weapon: "the_reckoning",
      // CORNERED: below his phase threshold, so the fight on screen is his
      // second one — the hotter, wider beam, plus the flag going back into the
      // ground, which is gated to NIGHTMARE and above. It also swaps his wound
      // sprite in, so he is visibly a boss being beaten rather than one just met.
      bossHpFrac: 0.3,
      // The boss alone across an empty floor reads as a duel; the escort makes
      // it a last stand. `spawns` ring the hero after `place`, so these close
      // in around him with the boss still in frame.
      spawns: [
        ...surround("wraith", 16, { from: 40 }),
        ...surround("ghost", 12, { from: 55, to: 155 }),
      ],
    },
    // HALF SPEED, not a fifth. A set piece is a LONG event where a detonation is
    // a short one — a tell of roughly a second and then a sweep of a second and
    // a half — so the slow-motion the nuke needs to be catchable at all would
    // push the beam past ten seconds of wall clock, with a boss standing still
    // for all of it. Half speed keeps the sweep readable and lands it inside a
    // schedule worth sweeping.
    prepare: slow(0.5),
    // The SET PIECE is the subject, so the clock starts at the boss's own tell
    // rather than at a wall-clock guess — see `awaitBossTell`. Everything after
    // it is authored and fixed (a windup is never rolled), so the delay below is
    // arithmetic the sweep only has to confirm: tell, then far enough into the
    // sweep that the beam has swung somewhere.
    trigger: awaitBossTell(),
    // Swept: the beam is a full diagonal across the frame at 1400 ms, with the
    // crowd still standing in it. Later it flattens and the scorch smoke starts
    // eating the picture.
    captureAtMs: 1400,
    sweepMs: [800, 1100, 1400, 1700, 1900, 2300, 2700, 3200, 4000, 5000],
  },
  {
    id: "powers",
    caption: "STACK THE POWERS YOU FIND",
    // BOOT HILL — the knockoff western — so the set isn't four purple fields.
    // The bunker staging swept weak for the same reason `nightmare` did.
    level: "boot_hill",
    difficulty: "nightmare",
    seed: 44,
    interior: 0.62,
    scenario: {
      level: 90,
      stats: ENDGAME_STATS,
      weapon: "mjolnir",
      runAbilities: ["fire_orbs", "storm_cell", "ion_wake", "blast_shield"],
      spawns: [
        ...surround("tin_outlaw", 34),
        ...surround("cowbot", 22, { from: 42, to: 150 }),
      ],
    },
    prepare: slow(0.25),
    // Swept: the storm cell's strike lands ~260 ms, with the fire orbs lit.
    captureAtMs: 260,
    sweepMs: [0, 80, 160, 260, 400, 560, 760, 1000, 1300, 1700],
  },
];

/**
 * Walk the menus and stage one recipe's run. Leaves the page in `playing` with
 * the scenario applied, the FPS meter hidden, and `prepare` done — i.e. at the
 * instant the capture clock should start.
 */
export async function stageRun(page, shot, url) {
  const scenario = encodeURIComponent(
    JSON.stringify({ ...DISPLAY_CASE, clearDrops: true }),
  );
  await page.goto(
    `${url}/?debug&bot=off&level=${shot.level}&difficulty=${shot.difficulty}` +
      `&seed=${shot.seed}&scenario=${scenario}` +
      (shot.showAchievements ? "" : "&noachievements"),
  );

  // Make a hero first (the warp picker still needs one to run as).
  await page
    .getByRole("button", { name: "main-new-game" })
    .waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "main-new-game" }).click();
  await page.getByRole("textbox", { name: "character-name" }).fill("ADA");
  await page.getByRole("button", { name: "character-create" }).click();

  // Then take the DEVELOPER WARP rather than the normal difficulty picker.
  // These recipes stage NIGHTMARE on late maps, and both are unlock-gated for a
  // fresh hero — the normal rows render LOCKED and a click on one does nothing,
  // so the run never starts and every shot times out. Warp mode opens every
  // rung and every mission and skips the intro.
  await page.getByRole("button", { name: "difficulty-back" }).click();
  await page.getByRole("button", { name: "main-settings" }).click();
  await page.getByRole("button", { name: "settings-developer" }).click();
  // DEVELOPER → PLAYGROUND → SELECT LEVEL. The warp used to hang directly off
  // the developer page; it now sits under PLAYGROUND, where the rest of the
  // "a run, and the terms it is built on" rows live (content/mainmenu.yaml).
  await page.getByRole("button", { name: "developer-playground" }).click();
  await page.getByRole("button", { name: "playground-select-level" }).click();
  await page
    .getByRole("button", { name: `difficulty-${shot.difficulty}` })
    .click();
  await page.getByRole("button", { name: `levels-${shot.level}` }).click();

  await page.waitForFunction(() => window.__game?.phase === "playing", {
    timeout: 30000,
  });
  // Let the renderer mount before moving the staged encounter away from the
  // mission entrance. Keep the map's initial population until the interior
  // anchor is chosen: those actors were already placed on reachable ground by
  // the map generator, making them better anchors than a guessed coordinate.
  await page.waitForTimeout(700);

  // Store shots should look like play, not six dioramas built on the spawn
  // tile. Choose a stable position from the generated map's own enemy
  // population, excluding both the entrance and the merchant. Those actors
  // already stand on reachable interior ground. The authored path is a second
  // choice for unusually empty maps; the boss recipe keeps `place: "boss"`.
  // Apply the actual recipe only AFTER the move, so enemies and drops are laid
  // around the interior position rather than around an entrance encounter.
  const place =
    shot.scenario.place ??
    (await page.evaluate((fraction) => {
      const state = window.__game;
      const start = state?.players?.[0]?.pos;
      const merchant = state?.merchant?.pos;
      const farEnough = Math.max(
        180,
        Math.min(state?.level?.width ?? 900, state?.level?.height ?? 900) * 0.2,
      );
      const candidates = (state?.enemies ?? [])
        .map((enemy) => enemy.pos)
        .filter((pos) => {
          const fromStart = Math.hypot(
            pos.x - (start?.x ?? 0),
            pos.y - (start?.y ?? 0),
          );
          const fromMerchant = Math.hypot(
            pos.x - (merchant?.x ?? -10_000),
            pos.y - (merchant?.y ?? -10_000),
          );
          return fromStart >= farEnough && fromMerchant >= 180;
        })
        .sort((a, b) => a.x - b.x || a.y - b.y);
      if (candidates.length) {
        const at = Math.min(
          candidates.length - 1,
          Math.max(0, Math.round((candidates.length - 1) * fraction)),
        );
        return candidates[at];
      }
      const path = state?.carvedLevel?.path ?? [];
      if (path.length) {
        const at = Math.min(
          path.length - 1,
          Math.max(0, Math.round((path.length - 1) * fraction)),
        );
        return path[at];
      }
      return {
        x: (state?.level?.width ?? 0) * (0.35 + fraction * 0.3),
        y: (state?.level?.height ?? 0) * (0.65 - fraction * 0.3),
      };
    }, shot.interior ?? 0.5));
  await page.evaluate(
    ({ spec, destination }) => {
      window.__scenario?.({
        ...spec,
        clearEnemies: true,
        clearDrops: true,
        place: destination,
      });
    },
    {
      spec: { ...DISPLAY_CASE, ...shot.scenario },
      destination: place,
    },
  );

  // `?debug` is how the harness reaches `window.__game` to know the run is
  // live — but it also forces the FPS meter on, and a frame-rate counter in a
  // store screenshot reads as a debug build.
  await page.addStyleTag({
    content: ".game-fps { display: none !important; }",
  });

  if (shot.prepare) await shot.prepare(page);
  // One render beat lets the camera adopt the new interior anchor. Kept short
  // so the live combat composition still starts at the recipe's chosen clock.
  await page.waitForTimeout(100);
}
