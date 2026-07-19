// Capture clean, frozen in-game screenshots of the EASTWORLD Main Street at a
// series of x-positions, so the town composition can be eyeballed the way a
// player sees it (phone-landscape viewport). Enemies cleared + world frozen;
// the hero is re-placed via the live __scenario dev hook between shots.
// Requires the dev server on :5199. Run: node website/scripts/town-shots.mjs
//
// `window` below only appears inside page.evaluate callbacks, which execute in
// the browser page context, not in Node — tell eslint about the browser global.
/* global window */
import { chromium } from "playwright";

const URL = "http://localhost:5199";
const OUT = "website/assets-preview/town";
const XS = [980, 1300, 1660, 2000, 2360];

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

const scenario = JSON.stringify({
  place: { x: 980, y: 800 },
  freeze: true,
  clearEnemies: true,
});
// ?bot dismisses the intro/cutscene for us; ?level forces eastworld; the
// scenario (freeze) applies the instant the run is built.
await page.goto(
  `${URL}/?debug&bot=balanced&level=eastworld&difficulty=easy&seed=7` +
    `&scenario=${encodeURIComponent(scenario)}`,
);

// Menu flow (mirrors playtest.mjs): play → new-game → name → create → easy.
await page.getByRole("button", { name: "play", exact: true }).waitFor();
await page.getByRole("button", { name: "play", exact: true }).click();
await page.getByRole("button", { name: "new-game" }).click();
await page.getByRole("textbox", { name: "character-name" }).fill("BOT");
await page.getByRole("button", { name: "character-create" }).click();
await page.getByRole("button", { name: "difficulty-easy" }).waitFor();
await page.getByRole("button", { name: "difficulty-easy" }).click();
await page.waitForFunction(() => window.__game !== undefined, {
  timeout: 15000,
});
// Let the bot tap through the opening, then confirm we're in the run.
await page.waitForFunction(() => window.__game?.phase === "playing", {
  timeout: 20000,
});

for (const x of XS) {
  await page.evaluate((wx) => {
    window.__scenario({
      place: { x: wx, y: 800 },
      freeze: true,
      clearEnemies: true,
    });
  }, x);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/town_${x}.png` });
  console.log(`shot town_${x}.png`);
}

// A combat pose: the horde filling the street (the gauntlet in action).
await page.evaluate(() => {
  window.__scenario({
    place: { x: 1300, y: 800 },
    freeze: true,
    clearEnemies: true,
    spawns: [
      { enemy: "cowbot", count: 16, minDistance: 40, maxDistance: 200 },
      { enemy: "saloon_brawler", count: 6, minDistance: 70, maxDistance: 210 },
      { enemy: "tin_outlaw", count: 3, minDistance: 90, maxDistance: 210 },
    ],
  });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/town_combat.png` });
console.log("shot town_combat.png");
await browser.close();
