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

export const SETTINGS_KEY = `${identity.storagePrefix}:settings`;

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

async function trainMagic(page) {
  for (const id of MAGIC_TALENTS) {
    await page.evaluate((t) => window.__talent?.(t, 5), id);
  }
}

const slow = (f) => async (page) => {
  await page.evaluate((v) => window.__timeScale?.(v), f);
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
 */
function surround(enemy, count, { from = 32, to = 150, bands = 3 } = {}) {
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
  }));
}

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
//   trigger(page)  the instant the clock starts from: a nuke, a level-up.
//                  Optional; without one the clock starts after `prepare`.
//   captureAtMs    ms after the trigger to take the real screenshot. THIS is
//                  the number the sweep exists to find.
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
    scenario: {
      level: 90,
      stats: ENDGAME_STATS,
      weapon: "the_reckoning",
      spawns: [
        ...surround("voidling", 34),
        ...surround("graviton", 16, { from: 48, to: 165 }),
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
    // Swept: 0 ms is a full white-out, the ring peaks 60-130 ms, gone by 400.
    captureAtMs: 90,
    sweepMs: [0, 30, 60, 90, 130, 180, 240, 320, 420, 560, 720, 900],
  },
  {
    id: "nightmare",
    caption: "NIGHTMARE FIGHTS BACK",
    // MARS, not the bunker. Swept on the bunker this frame was weak at EVERY
    // timestamp — a pale pink floor with mobs scattered to the edges — which no
    // capture delay can fix. Mars gives the set a red palette against the
    // rift's purple, and the horde reads against it.
    level: "mars",
    difficulty: "nightmare",
    seed: 33,
    scenario: {
      level: 88,
      stats: ENDGAME_STATS,
      weapon: "mjolnir",
      // Hellborn mobs — the rampage-only spawn (`EnemyDef.hellborn`) a calm run
      // never meets — packed in tight so the frame is a fight, not a floor.
      spawns: [
        ...surround("phobos_shepherd", 8, { from: 34, to: 110, bands: 2 }),
        ...surround("olympus_engine", 6, { from: 48, to: 130, bands: 2 }),
        ...surround("servo_bot", 40),
      ],
    },
    prepare: slow(0.2),
    // Swept: the horde is closed around the hero with crits up at ~260 ms.
    captureAtMs: 260,
    sweepMs: [0, 80, 160, 260, 400, 560, 760, 1000, 1300, 1700],
  },
  {
    id: "talents",
    caption: "TALENTS THAT NEVER SWITCH OFF",
    level: "the_rift",
    difficulty: "nightmare",
    seed: 7,
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
    level: "the_rift",
    difficulty: "nightmare",
    seed: 12,
    scenario: {
      level: 90,
      stats: ENDGAME_STATS,
      weapon: "the_reckoning",
      // At the hero's feet, so they are scooped the moment the run starts and
      // the legendary pickup card fires.
      drops: [
        { item: "skybreaker", minDistance: 8, maxDistance: 16 },
        { item: "kingsbane", minDistance: 8, maxDistance: 16 },
        { item: "sunwreath", minDistance: 8, maxDistance: 16 },
        { item: "the_stillward", minDistance: 8, maxDistance: 16 },
      ],
      clearEnemies: true,
    },
    captureAtMs: 1400,
    sweepMs: [200, 500, 800, 1100, 1400, 1700, 2000, 2400, 2800, 3200],
  },
  {
    id: "boss",
    caption: "HUNT WHAT TOOK HER",
    level: "the_rift",
    difficulty: "nightmare",
    seed: 9,
    scenario: {
      place: "boss",
      level: 90,
      stats: ENDGAME_STATS,
      weapon: "the_reckoning",
      // The boss alone across an empty floor reads as a duel; the escort makes
      // it a last stand. `spawns` ring the hero after `place`, so these close
      // in around him with the boss still in frame.
      spawns: [...surround("voidling", 22, { from: 40 })],
    },
    prepare: slow(0.2),
    captureAtMs: 1200,
  },
  {
    id: "powers",
    caption: "STACK THE POWERS YOU FIND",
    // EASTWORLD — the knockoff western — so the set isn't four purple fields.
    // The bunker staging swept weak for the same reason `nightmare` did.
    level: "eastworld",
    difficulty: "nightmare",
    seed: 44,
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
    JSON.stringify({ ...DISPLAY_CASE, ...shot.scenario }),
  );
  await page.goto(
    `${url}/?debug&bot=off&level=${shot.level}&difficulty=${shot.difficulty}` +
      `&seed=${shot.seed}&scenario=${scenario}`,
  );

  // Make a hero first (the warp picker still needs one to run as).
  await page
    .getByRole("button", { name: "play", exact: true })
    .waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "play", exact: true }).click();
  await page.getByRole("button", { name: "new-game" }).click();
  await page.getByRole("textbox", { name: "character-name" }).fill("ADA");
  await page.getByRole("button", { name: "character-create" }).click();

  // Then take the DEVELOPER WARP rather than the normal difficulty picker.
  // These recipes stage NIGHTMARE on late maps, and both are unlock-gated for a
  // fresh hero — the normal rows render LOCKED and a click on one does nothing,
  // so the run never starts and every shot times out. Warp mode opens every
  // rung and every mission and skips the intro.
  await page.getByRole("button", { name: "menu-back" }).first().click();
  await page.getByRole("button", { name: "settings" }).click();
  await page.getByRole("button", { name: "settings-developer" }).click();
  await page.getByRole("button", { name: "developer-select-level" }).click();
  await page
    .getByRole("button", { name: `difficulty-${shot.difficulty}` })
    .click();
  await page.getByRole("button", { name: `level-${shot.level}` }).click();

  await page.waitForFunction(() => window.__game?.phase === "playing", {
    timeout: 30000,
  });
  // Let the fog reveal and the first frame of effects settle.
  await page.waitForTimeout(700);

  // `?debug` is how the harness reaches `window.__game` to know the run is
  // live — but it also forces the FPS meter on, and a frame-rate counter in a
  // store screenshot reads as a debug build.
  await page.addStyleTag({
    content: ".game-fps { display: none !important; }",
  });

  if (shot.prepare) await shot.prepare(page);
}
