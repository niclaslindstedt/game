#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// UI capture harness (see the `ui-review` skill). Drives the real app in
// headless Chromium to EVERY screen, modal, popup, and toast — the title
// menu tree, character roster/creation, every in-game overlay (via forced
// engine phases through `window.__game`), and the organic bot-run surfaces
// (pickup cards, feed lines, achievement toasts) — and screenshots each one
// per viewport into pwa/assets-preview/ui-review/<viewport>/.
//
// Usage:
//   npx playwright install chromium    # once per machine (playwright itself
//                                      # comes with `npm install`)
//   cd pwa && npx vite --port 5199 &
//   node pwa/scripts/ui-shots.mjs [--url http://localhost:5199] \
//     [--only land|port|sel|sep|padl|padp|minil|minip|desk[,...]] \
//     [--spareable nikola_tesla]
//
// Every step is tolerant: a surface that can't be reached logs FAILED and
// the sweep continues, so one flaky capture never costs the whole pass.
// Surfaces are forced where organic triggers are slow or rare — see the
// `ui-review` skill for the map of what is forced and how.
//
// `window` below only appears inside page.evaluate callbacks, which execute
// in the browser page, not in Node.
/* global window */

import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt("url", "http://localhost:5199");
const only = opt("only", null);
// A spareable elite's def id (EnemyDef.spareable), used to force the
// SPARE-or-KILL choice and the companion panel. Content-specific; pass the
// current catalog's id when the default retires.
const spareableId = opt("spareable", "nikola_tesla");

// The persisted-settings storage key comes from the game identity, so the
// harness keeps working when a sequel renames the game.
const config = JSON.parse(
  readFileSync(new URL("../../game.config.json", import.meta.url), "utf8"),
);
const SETTINGS_KEY = `${config.storagePrefix}:settings`;
/** The roster's key — the sweep patches heroes in it (a banked vault loadout, a
 * beaten campaign) to reach rows that are otherwise earned. */
const ROSTER_KEY = `${config.storagePrefix}:characters`;

// Mobile-first: the landscape phone is the reference viewport (AGENTS.md);
// the others are the layouts every surface must also survive. The `se` pair
// is the small-phone floor (iPhone SE class) — the tightest 1× layouts. The
// iPad/iPad-mini viewports sit past the 2× UI-scale breakpoint
// (UI_SCALE_BREAKPOINT_PX) but are smaller than a desktop, so after doubling
// their *effective* space is tighter than the phone reference — the exact
// regime where big-tablet scaling bugs live; the mini (effective 566×372) is
// the harshest case of all.
const VIEWPORTS = [
  { name: "land", width: 844, height: 390 },
  { name: "port", width: 390, height: 844 },
  { name: "sel", width: 667, height: 375 },
  { name: "sep", width: 375, height: 667 },
  { name: "padl", width: 1180, height: 820 },
  { name: "padp", width: 820, height: 1180 },
  { name: "minil", width: 1133, height: 744 },
  { name: "minip", width: 744, height: 1133 },
  { name: "desk", width: 1440, height: 900 },
  // The 3× tier (UI_SCALE_3X_BREAKPOINT_PX). A 1440p monitor is the smallest
  // viewport that takes it, so it is where the tripled root font-size first
  // has to fit — the 3× regime's own version of the iPad-mini case above.
  { name: "desk3x", width: 2560, height: 1440 },
].filter((v) => !only || only.split(",").includes(v.name));

const OUT = fileURLToPath(
  new URL("../assets-preview/ui-review", import.meta.url),
);

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});

for (const vp of VIEWPORTS) {
  const dir = `${OUT}/${vp.name}`;
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: true,
  });
  // Pre-unlock the developer menu (normally sixteen quick taps on the title
  // sun) so the DEVELOPER row, warp picker, and arsenal are reachable; mute
  // audio.
  await context.addInitScript(
    ([key]) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          developerUnlocked: true,
          musicVolume: 0,
          sfxVolume: 0,
          // FORCE STORE: a browser build has no platform store, so without
          // this the title STORE row, the AUTO PILOT picker's STORE button,
          // and the in-run COIN STORE are all unreachable — three modals no
          // sweep would ever look at.
          storeForce: "on",
        }),
      );
    },
    [SETTINGS_KEY],
  );
  const page = await context.newPage();
  page.on("pageerror", (e) =>
    console.error(`[${vp.name}] PAGE ERROR:`, e.message),
  );

  const shot = async (name) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${dir}/${name}.png` });
    console.error(`[${vp.name}] shot ${name}`);
  };
  const click = (aria) => page.getByRole("button", { name: aria }).click();
  const tryStep = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      console.error(
        `[${vp.name}] FAILED ${label}: ${e.message.split("\n")[0]}`,
      );
    }
  };

  // ---- Title & menu surfaces ----
  await page.goto(`${url}/?debug`);
  await page.getByRole("button", { name: "main-new-game" }).waitFor();
  await shot("title-main");

  // NEW GAME -> character create form -> difficulty ladder.
  await tryStep("character-create", async () => {
    await click("main-new-game");
    await page.getByRole("textbox", { name: "character-name" }).waitFor();
    await page.getByRole("textbox", { name: "character-name" }).fill("ADA");
    await shot("character-create");
    await click("character-create");
    await page.getByRole("button", { name: "difficulty-easy" }).waitFor();
    await shot("difficulty");
    await page.keyboard.press("Escape");
  });

  // LOAD GAME -> the hero roster (the just-created ADA is listed).
  await tryStep("character-roster", async () => {
    await page.getByRole("button", { name: "main-load-game" }).waitFor();
    await click("main-load-game");
    await page.locator(".hero-slots").waitFor();
    await shot("character-roster");
    // The roster leaves through the shared title-menu BACK row (MenuList).
    await click("roster-back");
  });

  // EXTRAS — the shelf: the badges, the boards, the buy-back, the field guide.
  await tryStep("extras", async () => {
    await click("main-extras");
    await shot("extras");
    await page.keyboard.press("Escape");
  });

  // MINIGAMES — the arcade shelf. It is what BEATING the game buys, and no
  // sweep is going to beat it, so the hero the roster step just created is
  // handed a finished campaign and the title reloaded onto a build that has the
  // row. PUT BACK afterwards: a beaten hero opens the mission picker instead of
  // walking out of the garage, which is not the campaign flow the later steps
  // photograph.
  //
  // The cabinet itself is a minute of driving, so this photographs the SHELF and
  // stops there; the road's own surfaces have their own harness (`?drive`).
  const beatCampaign = (won) =>
    page.evaluate(
      ([key, beaten]) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const roster = JSON.parse(raw);
        const hero = roster[roster.length - 1];
        if (!hero) return false;
        hero.beaten = beaten ? ["medium"] : [];
        window.localStorage.setItem(key, JSON.stringify(roster));
        return true;
      },
      [ROSTER_KEY, won],
    );
  await tryStep("minigames", async () => {
    if (!(await beatCampaign(true))) {
      throw new Error("no roster hero to beat a campaign with");
    }
    try {
      await page.goto(`${url}/?debug`);
      await click("main-minigames");
      await page.getByRole("button", { name: "minigames-drive" }).waitFor();
      await shot("minigames");
    } finally {
      await beatCampaign(false);
      await page.goto(`${url}/?debug`);
    }
  });

  await tryStep("scores", async () => {
    await click("main-extras");
    // HIGH SCORES is hardcore-only: the row only exists once a hardcore hero
    // has played a campaign to its end. Skip rather than spend the locator
    // timeout waiting for a row that cannot be there.
    const row = page.getByRole("button", { name: "extras-high-scores" });
    if (!(await row.isVisible().catch(() => false))) {
      console.error(`[${vp.name}] SKIP scores: no hardcore campaign score yet`);
      await page.keyboard.press("Escape");
      return;
    }
    await click("extras-high-scores");
    await page.getByRole("button", { name: "score-difficulty" }).waitFor();
    await shot("scores");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  await tryStep("achievements", async () => {
    await click("main-extras");
    await click("extras-achievements");
    await page.locator(".achievements-panel").waitFor();
    await shot("achievements");
    await page.locator(".achievements-close").click();
    await page.keyboard.press("Escape");
  });

  // The title-menu COIN STORE (its row exists because the context seeds FORCE
  // STORE) and its CONFIRM step — the money surfaces.
  await tryStep("store", async () => {
    await click("main-store");
    await page
      .getByRole("button", { name: /^store-/ })
      .first()
      .waitFor();
    await shot("store");
    // The first row is a coin pack; tapping it opens the CONFIRM screen.
    await page
      .getByRole("button", { name: /^store-/ })
      .first()
      .click();
    await page.getByRole("button", { name: "storeconfirm-buy" }).waitFor();
    await shot("store-confirm");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  // The LOST & FOUND (VaultScreen) is captured after the in-game sweep — its
  // row only appears once a hero has a BANKED loadout carrying a discarded
  // piece, and a live run is where a real Equipment object can be had (see the
  // `vault` step below the game page).

  await tryStep("settings", async () => {
    await click("main-settings");
    await shot("settings");
    for (const page_ of [
      "gameplay",
      "controls",
      "interface",
      "audio",
      "data",
    ]) {
      await click(`settings-${page_}`);
      await shot(`settings-${page_}`);
      await page.keyboard.press("Escape");
    }
    // The GORE page. Eight switches and a reset make it the longest settings
    // page in the game, so it is the one most likely to overflow a short
    // viewport — which is exactly why it is swept.
    await click("settings-gore");
    await shot("settings-gore");
    await page.keyboard.press("Escape");
    await click("settings-developer");
    await shot("developer");
    await click("developer-balance");
    await shot("developer-balance");
    await page.keyboard.press("Escape");
    // VISUALS: nine sliders and a switch make it the longest developer page,
    // so it is the other one that has to be watched for overflow.
    await click("developer-visuals");
    await shot("developer-visuals");
    await page.keyboard.press("Escape");
    // The three category pages the index files its rows onto.
    await click("developer-cheats");
    await shot("developer-cheats");
    await page.keyboard.press("Escape");
    await click("developer-galleries");
    await shot("developer-galleries");
    await click("galleries-arsenal");
    await page.locator(".arsenal-panel").waitFor();
    await shot("arsenal");
    await page.locator(".arsenal-close").click();
    await page.keyboard.press("Escape");
    await click("developer-playground");
    await shot("developer-playground");
    // The warp picker: SELECT LEVEL -> difficulty (warp) -> level list. The
    // difficulty list is built from what the ROSTER has unlocked, and this
    // sweep's profile is a hero created two steps ago who has never finished a
    // run — so on a clean machine the page comes up holding nothing but BACK.
    // Skip rather than spend the locator's full timeout on a row that cannot
    // be there: the throw would otherwise abort the whole settings step, and
    // every capture after this line with it.
    await click("playground-select-level");
    const warpEasy = page.getByRole("button", { name: "difficulty-easy" });
    const warpLevel = page.getByRole("button", { name: /level-/ }).first();
    if (await warpEasy.isVisible().catch(() => false)) {
      await click("difficulty-easy");
      // Same reason as the difficulty list above: a hero who has cleared
      // nothing has nowhere to warp TO, so the level list can be empty even
      // when the difficulty list was not.
      if (await warpLevel.isVisible().catch(() => false)) {
        await shot("levels");
      } else {
        console.error(`[${vp.name}] SKIP levels: the level list is empty`);
      }
      await page.keyboard.press("Escape");
    } else {
      console.error(`[${vp.name}] SKIP levels: no difficulty unlocked to warp`);
    }
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  // Recover to the main menu from wherever the last step left us. (HOW TO PLAY
  // no longer opens a text screen — it launches the self-playing demo run — so
  // there is no static help surface to capture here.)
  for (let i = 0; i < 6; i++) {
    const onMenu = await page
      .getByRole("button", { name: "how-to-play" })
      .isVisible()
      .catch(() => false);
    if (onMenu) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }

  // HOW TO PLAY runs a self-playing demo the newcomer only WATCHES; its only
  // modal is the exit confirm a tap anywhere raises (DemoExitOverlay).
  await tryStep("demo-exit", async () => {
    await click("main-how-to-play");
    await page.locator("canvas.game-canvas").waitFor();
    await page.waitForTimeout(5000);
    // A tap while a teaching tooltip is up dismisses THAT and keeps the demo
    // playing (see ScreenChrome `openDemoExit`), so tap until the confirm is up.
    for (let i = 0; i < 6; i++) {
      const up = await page
        .getByRole("button", { name: "demo-keep-watching" })
        .isVisible()
        .catch(() => false);
      if (up) break;
      await page.mouse.click(vp.width / 2, vp.height - 30);
      await page.waitForTimeout(900);
    }
    await page.getByRole("button", { name: "demo-keep-watching" }).waitFor();
    await shot("demo-exit");
    await page.getByRole("button", { name: "demo-exit-menu" }).click();
  });

  await page.close();

  // ---- Cutscene (the standalone workbench keeps it deterministic) ----
  const cutPage = await context.newPage();
  await tryStep("cutscene", async () => {
    await cutPage.goto(`${url}/?cutscene=prelude&debug`);
    await cutPage.locator(".cutscene-canvas").waitFor();
    await cutPage.waitForTimeout(4500);
    await cutPage.screenshot({ path: `${dir}/cutscene.png` });
    console.error(`[${vp.name}] shot cutscene`);
  });
  await cutPage.close();

  // ---- In-game, no bot: forced phases via window.__game ----
  const game = await context.newPage();
  game.on("pageerror", (e) =>
    console.error(`[${vp.name}] PAGE ERROR:`, e.message),
  );
  const gshot = async (name) => {
    await game.waitForTimeout(350);
    await game.screenshot({ path: `${dir}/${name}.png` });
    console.error(`[${vp.name}] shot ${name}`);
  };
  const phase = () => game.evaluate(() => window.__game?.phase);
  // Boot a fresh run on the game page (also the recovery path — see below).
  const bootRun = async () => {
    await game.goto(`${url}/?debug&seed=7`);
    await game.getByRole("button", { name: "new-game" }).waitFor();
    await game.getByRole("button", { name: "new-game" }).click();
    await game
      .getByRole("textbox", { name: "character-name" })
      .fill(`SEED7${Date.now() % 1000}`);
    await game.getByRole("button", { name: "character-create" }).click();
    await game.getByRole("button", { name: "difficulty-easy" }).click();
    await game.waitForFunction(() => window.__game !== undefined, null, {
      timeout: 60000,
    });
  };
  // Steer the run back to `playing` no matter which scene is up.
  const ensurePlaying = async () => {
    for (let i = 0; i < 40; i++) {
      const p = await phase();
      if (p === "playing") return;
      if (p === undefined) {
        // The run is GONE — a forced phase (or a level advance behind one)
        // unmounted the game and took `window.__game` with it. Boot a fresh
        // one instead of failing every remaining in-game capture.
        console.error(`[${vp.name}] REBOOT: the run went away, starting over`);
        await bootRun();
      } else if (p === "cutscene" || p === "intro" || p === "outro") {
        await game.keyboard.press("Escape");
      } else if (p === "dialogue" || p === "title") {
        await game.mouse.click(vp.width / 2, vp.height / 2);
      } else if (p === "levelup") {
        await game.locator(".stat-button").first().click();
      } else if (p === "companion") {
        // The companion panel has no Escape binding — use its CLOSE button.
        await game.getByRole("button", { name: "close-companion" }).click();
      } else {
        await game.keyboard.press("Escape");
      }
      await game.waitForTimeout(400);
    }
    throw new Error(`stuck in phase ${await phase()}`);
  };

  await tryStep("game-boot", bootRun);

  await tryStep("intro", async () => {
    if ((await phase()) === "cutscene") await game.keyboard.press("Escape");
    await game.waitForFunction(() => window.__game?.phase !== "cutscene");
    if ((await phase()) === "intro") {
      await game.waitForTimeout(1800); // let the crawl type a line
      await gshot("intro-monologue");
      await game.keyboard.press("Escape");
    }
    if ((await phase()) === "title") await gshot("title-card");
  });

  await tryStep("hud", async () => {
    await ensurePlaying();
    await game.waitForTimeout(1200);
    await gshot("hud-early");
  });

  await tryStep("pause", async () => {
    await ensurePlaying();
    await game.keyboard.press("p");
    await game.waitForFunction(() => window.__game?.phase === "paused");
    await gshot("pause");
    await game.keyboard.press("p");
  });

  // The AUTO PILOT stack, all raised from the pause menu: the START picker
  // (its rungs priced against the purse), the in-run COIN STORE that stacks
  // over it, and the LOOT history the engaged ride opens. Captured twice —
  // once with a fat purse (every rung affordable) and once broke (the greyed
  // rungs + the CAN'T AFFORD call-out), which are different layouts.
  await tryStep("autopilot", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      window.__game.players[0].coins = 250000;
    });
    await game.keyboard.press("p");
    await game.waitForFunction(() => window.__game?.phase === "paused");
    await game.getByRole("button", { name: "autopilot-start" }).click();
    await game.locator(".autopilot-start").waitFor();
    await gshot("autopilot-start");
    await game.getByRole("button", { name: "autopilot-start-store" }).click();
    await game.locator(".coin-store").waitFor();
    await gshot("autopilot-coin-store");
    await game
      .getByRole("button", { name: /^coin-store-coins_/ })
      .first()
      .click();
    await game.getByRole("button", { name: "coin-store-confirm" }).waitFor();
    await gshot("autopilot-coin-store-confirm");
    await game.getByRole("button", { name: "coin-store-back" }).click();
    await game.getByRole("button", { name: "coin-store-close" }).click();
    // Broke: every rung greys out and the modal swaps its note for the
    // CAN'T AFFORD call-out.
    await game.evaluate(() => {
      window.__game.players[0].coins = 0;
    });
    await game.waitForTimeout(400);
    await gshot("autopilot-start-broke");
    // Picking a rung raises the LAST-CALL confirm before the ride engages: a
    // new flight empties the LOST & FOUND, so the player is shown what would
    // be binned. Plant a discard in the run's vault so it has something to
    // name (with an empty vault the modal reads "nothing left to trash").
    await game.evaluate(() => {
      const g = window.__game;
      g.players[0].coins = 250000;
      g.players[0].vault = [{ ...g.players[0].equipment.weapon, id: 90002 }];
    });
    await game.waitForTimeout(400);
    // `exact` matters: without it "autopilot-speed-1" also matches the 16× rung.
    await game
      .getByRole("button", { name: "autopilot-speed-1", exact: true })
      .click();
    await game.locator(".autopilot-trash").waitFor();
    await gshot("autopilot-trash-confirm");
    // The capture is done, and there is no clean way back out of here: the
    // trash confirm offers only BUY BACK and FLY (no cancel), and it sits over
    // the start picker — so `autopilot-start-cancel` reads as visible while
    // being covered, and clicking it waits out the full locator timeout for
    // nothing. Leave the modal parked; the next step opens with
    // `ensurePlaying()`, which is built to walk a run back from any phase.
    await game.keyboard.press("Escape");
  });

  // The LOOT history — the engaged ride's session scoreboard. Forced through
  // the engine's own autopilot state so the panel's satchel chip exists.
  await tryStep("autopilot-history", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      g.players[0].coins = 250000;
      g.autopilot.active = true;
      g.autopilot.speed = 4;
    });
    await game.waitForTimeout(600);
    await game.getByRole("button", { name: "autopilot-loot" }).click();
    await game.locator(".autopilot-history").waitFor();
    await gshot("autopilot-history");
    await game.getByRole("button", { name: "autopilot-history-close" }).click();
    await game.evaluate(() => {
      window.__game.autopilot.active = false;
    });
  });

  // The TALENT PICKER — the reveal that drains the engine's talent-point
  // queue; it stacks above the level-up chooser, so it is forced on its own.
  await tryStep("talent-picker", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      // Every 10 CHOSEN points in a tree stat earns one talent point, and the
      // engine RECONCILES the queue from `spentStats` — so bank the ten points
      // rather than only pushing onto the queue, which the next reconcile
      // would wipe. The queue holds STAT names (see `reconcileTalentPoints`).
      g.players[0].spentStats.strength =
        (g.players[0].spentStats.strength ?? 0) + 10;
      g.players[0].stats.strength = (g.players[0].stats.strength ?? 0) + 10;
      g.pendingTalentPoints = ["strength"];
    });
    await game.locator(".talent-overlay").waitFor();
    await gshot("talent-picker");
    // Hand the ten points BACK, not just the queue: the engine reconciles the
    // queue from `spentStats` on every later allocation, so a leftover ten
    // re-opens this picker on top of whatever the next step is capturing.
    await game.evaluate(() => {
      const g = window.__game;
      g.players[0].spentStats.strength = Math.max(
        0,
        (g.players[0].spentStats.strength ?? 0) - 10,
      );
      g.players[0].stats.strength = Math.max(
        0,
        (g.players[0].stats.strength ?? 0) - 10,
      );
      g.pendingTalentPoints = [];
    });
  });

  await tryStep("map", async () => {
    await ensurePlaying();
    await game.keyboard.press("m");
    await game.waitForFunction(() => window.__game?.phase === "map");
    await gshot("map");
    await game.keyboard.press("Escape");
  });

  await tryStep("inventory-early", async () => {
    await ensurePlaying();
    await game.keyboard.press("i");
    await game.waitForFunction(() => window.__game?.phase === "inventory");
    await gshot("inventory-early");
    await game.keyboard.press("Escape");
  });

  // The CHARACTER sheet — the inventory's other face, reached the way a player
  // reaches it: by pressing the hero's own portrait in the HUD.
  await tryStep("character-sheet", async () => {
    await ensurePlaying();
    await game.getByRole("button", { name: "open-character" }).first().click();
    await game.waitForFunction(() => window.__game?.phase === "inventory");
    await gshot("character-sheet");
    await game.keyboard.press("Escape");
  });

  // Level-up chooser: pretend the ding fanfare just finished.
  await tryStep("levelup", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      g.players[0].pendingStatPoints = 1;
      g.levelUpFxMs = 1;
    });
    await game.waitForFunction(() => window.__game?.phase === "levelup");
    await gshot("levelup");
    await game.getByRole("button", { name: "toggle-stat-info" }).click();
    await gshot("levelup-info");
    await game.getByRole("button", { name: "toggle-stat-info" }).click();
    await game.locator(".stat-button").first().click();
    await game.waitForFunction(() => window.__game?.phase === "playing");
  });

  // Respec: hand the hero a refunded pool and jump to the phase.
  await tryStep("respec", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      g.players[0].pendingStatPoints = 6;
      g.phase = "respec";
    });
    await game.waitForFunction(() => window.__game?.phase === "respec");
    await gshot("respec");
    await game.evaluate(() => {
      const g = window.__game;
      g.players[0].pendingStatPoints = 0;
      g.phase = "playing";
    });
  });

  // Shop: stage a REAL meeting rather than flipping `discovered` by hand. The
  // stall is rolled at the meeting (`stepMerchant`), so latching the flag
  // straight to true used to shoot an empty counter — every FOR SALE row
  // missing, which is most of the surface under review. Walking the stall onto
  // the hero instead lets the engine's own tick latch discovery and roll the
  // goods; the dialogue mute keeps his greeting scene off the shot.
  await tryStep("shop", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      g.dialogueMuted = true;
      g.obstacles = []; // the meeting needs line of sight
      g.merchant.pos = { ...g.players[0].pos };
    });
    await game.waitForFunction(
      () => (window.__game?.merchant.stock.length ?? 0) > 0,
    );
    await game.evaluate(() => {
      const g = window.__game;
      // A purse fat enough that nothing on the counter greys out as unaffordable.
      g.players[0].coins = 50_000;
      // THE COUNTER IS THE SHOPPER'S OWN SCREEN, not a phase of the run (see
      // AGENTS.md — `Player.screen`). This used to force `phase = "shop"`, a
      // phase the engine no longer has: nothing rendered off it, Escape's
      // close (which reads the screen) could not clear it, and every step
      // after this one failed with "stuck in phase shop".
      g.players[0].screen = "shop";
    });
    await game.waitForFunction(
      () => window.__game?.players?.[0]?.screen === "shop",
    );
    await gshot("shop");
    // The floating DEAL CARD (ShopDealCard) — the shop's other half, and the one
    // surface that has to fit beside a cell at every viewport. Shot from a stall
    // row (a powerup or consumable card) and from a bag cell (an item card).
    await game.locator(".shop-stall-item").first().click();
    await gshot("shop-deal-stock");
    // A STACKED row's card is the widest the card's foot ever gets: the
    // quantity field beside the BUY button it reprices. The cell wearing a
    // depth chip is the one to tap.
    const stacked = game
      .locator(".shop-stall-item:has(.shop-stall-count)")
      .first();
    if ((await stacked.count()) > 0) {
      // The card already up is a portal floating BESIDE the cell — often over
      // the next one along — so put it away before reaching for another row,
      // exactly as a player's own tap-outside does.
      await game.keyboard.press("Escape");
      await stacked.click();
      await gshot("shop-deal-stack");
      await game.keyboard.press("Escape");
    }
    const bagItem = game.locator(".shop-bag-cell:not([disabled])").first();
    if ((await bagItem.count()) > 0) {
      await bagItem.click();
      await gshot("shop-deal-bag");
    }
    await game.keyboard.press("Escape");
  });

  // Dialogue: the merchant greeting is a real def on every level, so the
  // portrait and name resolve without content-specific ids.
  await tryStep("dialogue", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      g.dialogue = {
        source: { kind: "merchant", levelId: g.level.id },
        page: 0,
      };
      g.phase = "dialogue";
    });
    await game.waitForTimeout(1600); // let the crawl type
    await gshot("dialogue");
    await game.evaluate(() => {
      const g = window.__game;
      g.dialogue = null;
      g.phase = "playing";
    });
  });

  // SPARE-or-KILL choice, then the companion join scene + equip panel:
  // synthesize a beaten spareable elite on the board and SPARE it.
  await tryStep("choice", async () => {
    await ensurePlaying();
    await game.evaluate(
      ([defId]) => {
        const g = window.__game;
        g.enemies.push({
          id: 999999,
          defId,
          pos: { x: g.players[0].pos.x + 20, y: g.players[0].pos.y },
          home: { x: g.players[0].pos.x + 20, y: g.players[0].pos.y },
          hp: 0,
          maxHp: 100,
          mlvl: 3,
          speed: 0,
          contactCooldownMs: 0,
        });
        g.choice = { enemyId: 999999, defId, damage: 10, crit: false };
        g.phase = "choice";
      },
      [spareableId],
    );
    await game.waitForFunction(() => window.__game?.phase === "choice");
    await gshot("choice");
    // SPARE is what carries the sweep on to the join dialogue and the
    // companion panel. A transient overlay (a pickup card, a level-up reveal
    // mid-animation) can fail Playwright's actionability check even when the
    // button is plainly visible, so fall back to dispatching the click — the
    // handler is what matters here, not the pointer path.
    const spare = game.getByRole("button", { name: "spare" });
    await spare.click({ timeout: 8000 }).catch(async () => {
      console.error(`[${vp.name}] SPARE: falling back to a dispatched click`);
      await spare.dispatchEvent("click");
    });
    await game.waitForTimeout(1600);
    if ((await phase()) === "dialogue") {
      await gshot("dialogue-join");
      // The join scene runs several pages, each of which types itself out
      // before a click advances it — click until it is genuinely over rather
      // than for a fixed handful of tries, or the party portrait below is not
      // on screen yet and the companion panel is never captured.
      for (let i = 0; i < 40 && (await phase()) === "dialogue"; i++) {
        await game.mouse.click(vp.width / 2, vp.height / 2);
        await game.waitForTimeout(350);
      }
    }
    // The recruit takes a beat to appear in the HUD party strip.
    await game
      .locator(".companion-portrait")
      .first()
      .waitFor({ state: "visible" });
    await game.locator(".companion-portrait").first().click();
    await game.waitForFunction(() => window.__game?.phase === "companion");
    await gshot("companion");
    await game.getByRole("button", { name: "close-companion" }).click();
  });

  await tryStep("victory", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      window.__game.phase = "victory";
    });
    await gshot("victory");
    await game.evaluate(() => {
      window.__game.phase = "playing";
    });
  });

  await tryStep("defeat", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      window.__game.players[0].hp = 0;
    });
    await game.waitForFunction(() => window.__game?.phase === "defeat");
    await gshot("defeat");
  });

  // The LOST & FOUND (VaultScreen) — the title-menu row only appears once a
  // hero has a BANKED loadout whose vault holds something the AUTO PILOT threw
  // away. Bank one here off the live run (a real Equipment object, so the
  // reclaim price and the item card resolve), then walk the title to it.
  await tryStep("vault", async () => {
    const planted = await game.evaluate((key) => {
      const g = window.__game;
      const raw = window.localStorage.getItem(key);
      if (!raw || !g) return false;
      const roster = JSON.parse(raw);
      const hero = roster[roster.length - 1];
      if (!hero) return false;
      const p = g.players[0];
      hero.loadout = {
        level: p.level,
        xp: p.xp,
        stats: { ...p.stats },
        spentStats: { ...p.spentStats },
        equipment: { ...p.equipment },
        inventory: [],
        // The discarded piece: a copy of the hero's own weapon under a fresh
        // id, so the vault has exactly one reclaimable find.
        vault: [{ ...p.equipment.weapon, id: 90001 }],
        heldAbilities: [],
        coins: 500000,
        companions: [],
      };
      window.localStorage.setItem(key, JSON.stringify(roster));
      return true;
    }, ROSTER_KEY);
    if (!planted) throw new Error("no roster hero to bank a vault loadout on");
    await game.goto(`${url}/?debug`);
    // LOST & FOUND is a row on the EXTRAS shelf, not on the title root — so it
    // is `extras-lost-found` (rowAria is `${screen}-${id}`) and it is reached
    // by opening EXTRAS first. Clicking a bare "lost-found" from the root
    // matched nothing and spent the locator's full timeout.
    await game.getByRole("button", { name: "main-extras" }).click();
    await game.getByRole("button", { name: "extras-lost-found" }).click();
    await game.locator(".vault-actions").waitFor();
    await gshot("vault");
    await game.keyboard.press("Escape");
  });

  await game.close();

  // ---- Bot run: organic surfaces — loot in the bag, pickup cards, feed
  // lines, achievement toasts, the weapon switcher, a revealed map. ----
  const bot = await context.newPage();
  const bshot = async (name) => {
    await bot.screenshot({ path: `${dir}/${name}.png` });
    console.error(`[${vp.name}] shot ${name}`);
  };
  await tryStep("bot-run", async () => {
    await bot.goto(`${url}/?debug&seed=11&bot=kite`);
    await bot.getByRole("button", { name: "new-game" }).waitFor();
    await bot.getByRole("button", { name: "new-game" }).click();
    await bot.getByRole("textbox", { name: "character-name" }).fill("KITE");
    await bot.getByRole("button", { name: "character-create" }).click();
    await bot.getByRole("button", { name: "difficulty-easy" }).click();
    await bot.waitForFunction(() => window.__game !== undefined, null, {
      timeout: 60000,
    });
    // Click through whatever opening scene is up (prelude cutscene, intro
    // monologue, level title card): a retried character usually skips them,
    // but when one does appear nothing else advances it and the whole bot
    // step starves waiting for `playing`.
    const settle = async () => {
      for (let i = 0; i < 40; i++) {
        const p = await bot.evaluate(() => window.__game?.phase);
        if (p === "playing") return;
        if (p === "cutscene" || p === "intro" || p === "outro") {
          await bot.keyboard.press("Escape");
        } else if (p === "paused") {
          await bot.keyboard.press("p");
        } else {
          await bot.mouse.click(vp.width / 2, vp.height / 2);
        }
        await bot.waitForTimeout(400);
      }
    };
    await settle();
    await bot.waitForFunction(() => window.__game?.phase === "playing", null, {
      timeout: 30000,
    });
    const t0 = Date.now();
    const got = { card: false, feed: false, toast: false, dialogue: false };
    while (Date.now() - t0 < 90000) {
      const p = await bot.evaluate(() => window.__game?.phase);
      if (p === "dialogue") {
        if (!got.dialogue) {
          await bot.waitForTimeout(900);
          await bshot("dialogue-organic");
          got.dialogue = true;
        }
        await bot.mouse.click(vp.width / 2, vp.height / 2);
        await bot.waitForTimeout(250);
        continue;
      }
      if (p !== "playing" && p !== "levelup") break;
      // Keep the bot alive: the sweep needs a living hero at the end.
      await bot.evaluate(() => {
        const g = window.__game;
        if (g && g.players[0].hp > 0) g.players[0].hp = g.players[0].maxHp;
      });
      if (!got.card && (await bot.locator(".pickup-card").count()) > 0) {
        await bshot("pickup-card");
        got.card = true;
      }
      if (!got.feed && (await bot.locator(".pickup-line").count()) > 1) {
        await bshot("pickup-feed");
        got.feed = true;
      }
      if (!got.toast && (await bot.locator(".achievement-toast").count()) > 0) {
        await bshot("achievement-toast");
        got.toast = true;
      }
      await bot.waitForTimeout(200);
    }
    await bshot("hud-late");
    // The switcher only exists once the run has a second weapon to switch TO,
    // which a short bot run may never find. Skip it rather than let a missing
    // slot take the inventory, tooltip, and map captures down with it.
    if ((await bot.locator(".wpn-slot").count()) > 0) {
      await bot.locator(".wpn-slot").first().click();
      await bot.waitForTimeout(300);
      await bshot("weapon-switcher");
      await bot.keyboard.press("Escape");
    } else {
      console.error(`[${vp.name}] SKIP weapon-switcher: no second weapon`);
    }
    // If the switcher click missed, that Escape paused the run instead —
    // settle back to `playing` so the inventory key below actually lands.
    await settle();
    await bot.keyboard.press("i");
    await bot.waitForFunction(() => window.__game?.phase === "inventory");
    await bot.waitForTimeout(400);
    await bshot("inventory-late");
    const cells = bot.locator(".inv-cell:has(.inv-item-icon)");
    if ((await cells.count()) > 0) {
      await cells.first().hover();
      await bot.waitForTimeout(400);
      await bshot("inventory-tooltip");
    }
    await bot.keyboard.press("Escape");
    await bot.keyboard.press("m");
    await bot.waitForFunction(() => window.__game?.phase === "map");
    await bot.waitForTimeout(400);
    await bshot("map-late");
  });
  await bot.close();

  // ---- The LAUNCH NOTICE: the licence acknowledgement a desktop build shows
  // INSTEAD of the title menu when its command line turned multiplayer or mods
  // on (pwa/src/game/LaunchNotice.tsx). It has no in-game trigger at all — the
  // shell stamps the fact onto `window` before the page loads — so the harness
  // stamps the same globals here. Its own page, because the notice gates the
  // whole app and nothing else could be captured behind it.
  //
  // `__GIS_NATIVE__` + `__gisShell` are what make QUIT appear (`canQuitApp`).
  // GET IT ON STEAM appears only once `game.config.json` carries a `steamUrl`,
  // so today this captures the two-button shape the game actually ships.
  const notice = await context.newPage();
  await tryStep("launch-notice", async () => {
    await notice.addInitScript(() => {
      Object.defineProperty(window, "__GIS_UNLOCKED__", { value: true });
      Object.defineProperty(window, "__GIS_NATIVE__", { value: true });
      Object.defineProperty(window, "__GIS_PLATFORM__", { value: "steam" });
      Object.defineProperty(window, "__gisShell", { value: { post() {} } });
    });
    await notice.goto(`${url}/?debug`);
    await notice.locator(".launch-notice-box").waitFor();
    await notice.waitForTimeout(350);
    await notice.screenshot({ path: `${dir}/launch-notice.png` });
    console.error(`[${vp.name}] shot launch-notice`);
  });
  await notice.close();

  await context.close();
}

await browser.close();
console.error("done");
