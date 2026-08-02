#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Render the INTERNAL Steam listing mock into one complete-page PNG. This is a
// visual-QA artifact, never a Steam About image or a substitute for the real
// gameplay screenshots under electron/store/screenshots/.

/* global document */

import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const positiveInt = (name, fallback) => {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const width = positiveInt("width", 2000);
const viewportHeight = positiveInt("height", 1200);
const out = path.resolve(
  option("out", path.join(here, "output", `steam-page-${width}.png`)),
);
mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
    : {}),
});

try {
  const page = await browser.newPage({
    viewport: { width, height: viewportHeight },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const failures = [];
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("requestfailed", (request) =>
    failures.push(
      `request: ${request.url()} — ${request.failure()?.errorText ?? "failed"}`,
    ),
  );

  await page.goto(pathToFileURL(path.join(here, "index.html")).href, {
    waitUntil: "load",
  });
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, fullPage: true });

  if (failures.length) throw new Error(failures.join("\n"));
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  console.log(`wrote ${out}`);
  console.log(`full page: ${size.width}x${size.height}`);
} finally {
  await browser.close();
}
