#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// UI capture harness (see the `ui-review` skill). Drives the real app in
// headless Chromium to EVERY screen, modal, popup, and toast — the title
// menu tree, character roster/creation, every in-game overlay (via forced
// engine phases through `window.__game`), and the organic bot-run surfaces
// (pickup cards, feed lines, achievement toasts) — and screenshots each one
// per viewport into website/assets-preview/ui-review/<viewport>/.
//
// Usage:
//   npm install --no-save playwright   # once per session (not a repo dep)
//   cd website && npx vite --port 5199 &
//   node website/scripts/ui-shots.mjs [--url http://localhost:5199] \
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
  // Pre-unlock the developer menu (normally the moon long-press) so the
  // DEVELOPER row, warp picker, and arsenal are reachable; mute audio.
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
  await page.getByRole("button", { name: "play", exact: true }).waitFor();
  await shot("title-main");

  // PLAY -> NEW GAME -> character create form -> difficulty ladder.
  await tryStep("character-create", async () => {
    await page.getByRole("button", { name: "play", exact: true }).click();
    await click("new-game");
    await page.getByRole("textbox", { name: "character-name" }).waitFor();
    await page.getByRole("textbox", { name: "character-name" }).fill("ADA");
    await shot("character-create");
    await click("character-create");
    await page.getByRole("button", { name: "difficulty-easy" }).waitFor();
    await shot("difficulty");
    await page.keyboard.press("Escape");
  });

  // PLAY -> LOAD GAME -> the hero roster (the just-created ADA is listed).
  await tryStep("character-roster", async () => {
    await page.getByRole("button", { name: "play", exact: true }).waitFor();
    await page.getByRole("button", { name: "play", exact: true }).click();
    await click("load-game");
    await page.locator(".hero-slots").waitFor();
    await shot("character-roster");
    await click("character-back");
  });

  await tryStep("scores", async () => {
    await click("high-scores");
    await page.getByRole("button", { name: "score-difficulty" }).waitFor();
    await shot("scores");
    await page.keyboard.press("Escape");
  });

  await tryStep("achievements", async () => {
    await click("achievements");
    await page.locator(".achievements-panel").waitFor();
    await shot("achievements");
    await page.locator(".achievements-close").click();
  });

  await tryStep("settings", async () => {
    await click("settings");
    await shot("settings");
    await click("settings-controls");
    await shot("settings-controls");
    await page.keyboard.press("Escape");
    await click("settings-display");
    await shot("settings-display");
    await page.keyboard.press("Escape");
    await click("settings-sound");
    await shot("settings-sound");
    await page.keyboard.press("Escape");
    await click("settings-data");
    await shot("settings-data");
    await page.keyboard.press("Escape");
    await click("settings-developer");
    await shot("developer");
    await click("developer-balance");
    await shot("developer-balance");
    await page.keyboard.press("Escape");
    await click("developer-arsenal");
    await page.locator(".arsenal-panel").waitFor();
    await shot("arsenal");
    await page.locator(".arsenal-close").click();
    // The warp picker: SELECT LEVEL -> difficulty (warp) -> level list.
    await click("developer-select-level");
    await page.getByRole("button", { name: "difficulty-easy" }).waitFor();
    await click("difficulty-easy");
    await page
      .getByRole("button", { name: /level-/ })
      .first()
      .waitFor();
    await shot("levels");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  // Recover to the main menu from wherever the last step left us.
  await tryStep("help", async () => {
    for (let i = 0; i < 6; i++) {
      const visible = await page
        .getByRole("button", { name: "how-to-play" })
        .isVisible()
        .catch(() => false);
      if (visible) break;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
    await click("how-to-play");
    await shot("help");
    await page.keyboard.press("Escape");
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
  // Steer the run back to `playing` no matter which scene is up.
  const ensurePlaying = async () => {
    for (let i = 0; i < 40; i++) {
      const p = await phase();
      if (p === "playing") return;
      if (p === "cutscene" || p === "intro" || p === "outro") {
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

  await tryStep("game-boot", async () => {
    await game.goto(`${url}/?debug&seed=7`);
    await game.getByRole("button", { name: "play", exact: true }).waitFor();
    await game.getByRole("button", { name: "play", exact: true }).click();
    await game.getByRole("button", { name: "new-game" }).click();
    await game.getByRole("textbox", { name: "character-name" }).fill("SEED7");
    await game.getByRole("button", { name: "character-create" }).click();
    await game.getByRole("button", { name: "difficulty-easy" }).click();
    await game.waitForFunction(() => window.__game !== undefined, null, {
      timeout: 60000,
    });
  });

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

  // Level-up chooser: pretend the ding fanfare just finished.
  await tryStep("levelup", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      g.player.pendingStatPoints = 1;
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
      g.player.pendingStatPoints = 6;
      g.phase = "respec";
    });
    await game.waitForFunction(() => window.__game?.phase === "respec");
    await gshot("respec");
    await game.evaluate(() => {
      const g = window.__game;
      g.player.pendingStatPoints = 0;
      g.phase = "playing";
    });
  });

  // Shop: mark the merchant discovered and jump to the phase. (The stall is
  // whatever the run rolled; a bot-run shop with coins reads richer.)
  await tryStep("shop", async () => {
    await ensurePlaying();
    await game.evaluate(() => {
      const g = window.__game;
      g.merchant.discovered = true;
      g.phase = "shop";
    });
    await game.waitForFunction(() => window.__game?.phase === "shop");
    await gshot("shop");
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
          pos: { x: g.player.pos.x + 20, y: g.player.pos.y },
          home: { x: g.player.pos.x + 20, y: g.player.pos.y },
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
    await game.getByRole("button", { name: "spare" }).click();
    await game.waitForTimeout(1600);
    if ((await phase()) === "dialogue") {
      await gshot("dialogue-join");
      for (let i = 0; i < 12 && (await phase()) === "dialogue"; i++) {
        await game.mouse.click(vp.width / 2, vp.height / 2);
        await game.waitForTimeout(350);
      }
    }
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
      window.__game.player.hp = 0;
    });
    await game.waitForFunction(() => window.__game?.phase === "defeat");
    await gshot("defeat");
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
    await bot.getByRole("button", { name: "play", exact: true }).waitFor();
    await bot.getByRole("button", { name: "play", exact: true }).click();
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
        if (g && g.player.hp > 0) g.player.hp = g.player.maxHp;
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
    await bot.locator(".wpn-slot").first().click();
    await bot.waitForTimeout(300);
    await bshot("weapon-switcher");
    await bot.keyboard.press("Escape");
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

  await context.close();
}

await browser.close();
console.error("done");
