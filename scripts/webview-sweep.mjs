#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WEBVIEW-QUIRK SWEEP, as far as a machine can take it.
//
//   npm run webview:sweep                  every installed engine, diffed
//   node scripts/webview-sweep.mjs --json  the report, for a script
//
// THE RISK THIS IS AGAINST. The game has only ever shipped on Chromium — a
// browser, and a desktop build that carries one. A shell that uses the
// PLATFORM's webview runs the identical bundle on WebKit and on WebView2, and
// what that buys is not "it will not start": it is that one surface out of
// forty behaves differently and nobody notices until a player does.
//
// WHAT THIS CAN AND CANNOT SETTLE, said plainly because the gap is the whole
// honesty of the exercise:
//
//   Chromium   the BASELINE. Whatever this engine says is what the game has
//              always been tested against.
//   WebKit     Playwright's build of the same engine family that is WKWebView
//              on macOS and WebKitGTK on Linux. Not the same VERSION as either,
//              and not the same embedding — but it is a real WebKit, and a
//              feature it lacks is one both of those very likely lack too.
//   WebView2   NOT AVAILABLE HERE AT ALL. Playwright has no build of it, so
//              Windows is checked by opening the probe page in the real shell:
//              `GIS_WEBROOT=scripts/webview-probe npm run tauri`.
//
// So a green sweep is a NECESSARY condition and never a sufficient one, and
// this script says so in its own output rather than leaving somebody to
// conclude the sweep was done.
//
// Engines that are not installed are reported as not installed, never skipped
// silently: a sweep that quietly checked one engine and printed a tick is worse
// than one that did not run.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE_DIR = join(ROOT, "scripts", "webview-probe");
const OUT_DIR = join(ROOT, "measurements");

/** The engines, and what each one stands in for. */
const ENGINES = [
  ["chromium", "the baseline — what the game has always been tested against"],
  ["webkit", "stands in for WKWebView (macOS) and WebKitGTK (Linux)"],
  ["firefox", "no shell uses Gecko; a free second opinion on the standards"],
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/**
 * Serve the probe directory over loopback.
 *
 * A `file://` URL would be simpler and does not work: a module script loaded
 * from one is refused by Chromium's own origin rules, so the page would report
 * nothing at all and the sweep would look like an engine failure. Serving it is
 * also the closer match to how a shell serves it — over a scheme, from a
 * directory.
 */
function serve() {
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    const file = join(
      PROBE_DIR,
      path === "/" ? "index.html" : path.replace(/^\/+/, ""),
    );
    if (!file.startsWith(PROBE_DIR)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(file);
      response.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => done(server));
  });
}

async function probe(playwright, engine, url) {
  const browser = await playwright[engine].launch();
  try {
    const page = await browser.newPage();
    const failures = [];
    page.on("pageerror", (err) => failures.push(String(err)));
    await page.goto(url, { waitUntil: "load" });
    // The probe parks its report on the window as its last act, so waiting for
    // the property is waiting for the whole inventory rather than for a timer.
    //
    // Both of these are passed as STRINGS rather than closures, which
    // Playwright evaluates in the page. A closure here would read as Node code
    // to every linter and every reader of this file, while in fact running in
    // whichever engine is under test — the one place in the repo where those
    // two are the same source line.
    await page.waitForFunction('"__gisProbe" in window', null, {
      timeout: 15_000,
    });
    const report = await page.evaluate("window.__gisProbe");
    return { ...report, pageErrors: failures };
  } finally {
    await browser.close();
  }
}

function table(rows) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? "").length)),
  );
  return rows
    .map((row) =>
      row.map((cell, at) => String(cell ?? "").padEnd(widths[at])).join("  "),
    )
    .join("\n");
}

async function main() {
  const json = process.argv.includes("--json");
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "playwright is not installed — run `npm ci` at the repo root first.",
    );
    process.exitCode = 1;
    return;
  }

  const server = await serve();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/index.html`;

  const reports = {};
  const unavailable = [];
  try {
    for (const [engine] of ENGINES) {
      try {
        reports[engine] = await probe(playwright, engine, url);
      } catch (err) {
        unavailable.push([engine, String(err).split("\n")[0]]);
      }
    }
  } finally {
    server.close();
  }

  const engines = Object.keys(reports);
  if (engines.length === 0) {
    console.error(
      "no Playwright engine could be launched. Install one with " +
        "`npx playwright install webkit` (chromium is usually already there).",
    );
    process.exitCode = 1;
    return;
  }

  const baseline = reports.chromium;
  const ids = (baseline ?? reports[engines[0]]).results.map(
    (result) => result.id,
  );
  const differences = [];
  for (const id of ids) {
    const answers = engines.map((engine) => ({
      engine,
      result: reports[engine].results.find((entry) => entry.id === id),
    }));
    const values = new Set(answers.map(({ result }) => result?.ok));
    if (values.size > 1) differences.push({ id, answers });
  }

  const document = {
    kind: "adas-trail/webview-sweep",
    engines: Object.fromEntries(
      engines.map((engine) => [
        engine,
        {
          userAgent: reports[engine].userAgent,
          missing: reports[engine].results
            .filter((result) => !result.ok && !result.optional)
            .map((result) => result.id),
          degraded: reports[engine].results
            .filter((result) => !result.ok && result.optional)
            .map((result) => result.id),
          pageErrors: reports[engine].pageErrors,
        },
      ]),
    ),
    differences: differences.map(({ id, answers }) => ({
      id,
      by: Object.fromEntries(
        answers.map(({ engine, result }) => [engine, !!result?.ok]),
      ),
    })),
    // NOT A COMPLETE SWEEP, and the report says so in its own body so a copy of
    // it pasted somewhere carries the caveat with it.
    notChecked: [
      "WebView2 (Windows) — Playwright has no build of it; open the probe page " +
        "in the real shell instead",
      "the platform webviews at their SHIPPED versions — Playwright's WebKit is " +
        "a real WebKit but not the one macOS or a given Linux has",
      "anything that is not a feature test: rendering fidelity, audio timing, " +
        "input latency",
    ],
  };

  if (json) {
    console.log(JSON.stringify(document, null, 2));
  } else {
    console.log("\nwebview sweep\n");
    console.log(
      table([
        ["engine", "stands in for", "missing", "degraded"],
        ...ENGINES.filter(([engine]) => engines.includes(engine)).map(
          ([engine, stands]) => [
            engine,
            stands,
            document.engines[engine].missing.length || "—",
            document.engines[engine].degraded.length || "—",
          ],
        ),
      ]),
    );
    for (const [engine, reason] of unavailable) {
      console.log(`\n  ${engine}: NOT INSTALLED — ${reason}`);
      console.log(`  install it with \`npx playwright install ${engine}\``);
    }
    if (differences.length === 0) {
      console.log(
        "\nno feature the game reaches for differs between the engines checked.",
      );
    } else {
      console.log(`\n${differences.length} feature(s) differ:\n`);
      console.log(
        table([
          ["feature", ...engines],
          ...document.differences.map(({ id, by }) => [
            id,
            ...engines.map((engine) => (by[engine] ? "yes" : "NO")),
          ]),
        ]),
      );
    }
    console.log("\nnot checked here:");
    for (const line of document.notChecked) console.log(`  · ${line}`);
    console.log("");
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, "webview-sweep.json");
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  if (!json) console.log(`written to ${out.replace(`${ROOT}/`, "")}\n`);

  // A REQUIRED feature missing on any engine is a failure; an optional one is
  // not, because the game degrades around each of those on purpose.
  const broken = engines.filter(
    (engine) => document.engines[engine].missing.length > 0,
  );
  if (broken.length > 0) process.exitCode = 1;
}

await main();
