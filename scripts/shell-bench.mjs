#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NUMBERS A DESKTOP WRAPPER IS JUDGED ON, measured rather than assumed.
//
//   node scripts/shell-bench.mjs --size            weigh the packaged builds
//   node scripts/shell-bench.mjs --startup         read the launches on this machine
//   node scripts/shell-bench.mjs                   both
//   node scripts/shell-bench.mjs --json            the report, for a script
//
// Two numbers, and they are measured completely differently:
//
//   INSTALL SIZE  weighed from the outside, off whatever each packager left in
//                 its release directory. Nothing has to run.
//   COLD START    cannot be measured from the outside at all — a stopwatch on
//                 the process gives you the moment one build's window appeared
//                 and the moment another build's splash did, and those are not
//                 the same event. So each shell stamps five marks itself
//                 (electron/src/metrics.ts, tauri/shell/src/metrics.rs) into a
//                 `startup.jsonl` in its own user-data directory, and this reads
//                 them back.
//
// WHICH MEANS THIS SCRIPT DOES NOT LAUNCH ANYTHING. Starting a desktop game
// from a harness measures the harness: a cold start is cold because the OS's
// file cache is cold, and a build launched five times in a row by a script is
// warm from the second one on. The honest procedure is to start each build the
// way a player does, a few times, over a few sittings — and then run this.
//
// A MEDIAN, never a mean: the slow launch in any set is the one that lost the
// CPU to something else, and a mean lets it move the number it is not evidence
// about.

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "measurements");

/** Where each build leaves a package, per its own packager. */
const RELEASE_DIRS = {
  electron: [
    ["depot (Windows)", join(ROOT, "electron", "release", "win-unpacked")],
    ["depot (macOS)", join(ROOT, "electron", "release", "mac")],
    ["depot (Linux)", join(ROOT, "electron", "release", "linux-unpacked")],
  ],
  tauri: [["depot", join(ROOT, "tauri", "release", "depot")]],
};

/** Where each build keeps its own things, per platform. */
function userDataDir(shell) {
  const name = shell === "tauri" ? "adastrail-tauri" : "adastrail";
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      name,
    );
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", name);
  }
  // The one place the two disagree on Linux, and it is Electron's own choice:
  // it puts userData under XDG_CONFIG_HOME, while Tauri's data_dir is
  // XDG_DATA_HOME.
  const config = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  const data = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(shell === "tauri" ? data : config, name);
}

function bytesOf(path) {
  let total = 0;
  const stack = [path];
  while (stack.length > 0) {
    const at = stack.pop();
    let stat;
    try {
      stat = statSync(at);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(at)) stack.push(join(at, entry));
    } else if (stat.isFile()) {
      // The APPARENT size rather than blocks on disk: it is what a download is
      // and what a depot uploads, and block counts differ per filesystem, which
      // would make the two builds incomparable across two machines.
      total += stat.size;
    }
  }
  return total;
}

const mib = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

function sizes() {
  const found = [];
  const absent = [];
  for (const [shell, dirs] of Object.entries(RELEASE_DIRS)) {
    for (const [label, dir] of dirs) {
      if (existsSync(dir)) {
        found.push({ shell, label, bytes: bytesOf(dir), path: dir });
      } else {
        absent.push({ shell, label, path: dir });
      }
    }
  }
  return { found, absent };
}

/** The launches a build wrote on this machine. */
function launches(shell) {
  const file = join(userDataDir(shell), "startup.jsonl");
  if (!existsSync(file)) return { file, rows: [] };
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    // A launch that never reached the page has no total, and letting one in
    // would put the FASTEST number in the table for a build that never showed
    // the game.
    .filter(
      (row) => row.complete === true && typeof row.coldStartMs === "number",
    )
    // A launch that said why it was not a fair sample is not one.
    .filter((row) => (row.notes ?? []).length === 0);
  return { file, rows };
}

const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
};

function startup() {
  const report = {};
  for (const shell of ["electron", "tauri"]) {
    const { file, rows } = launches(shell);
    if (rows.length === 0) {
      report[shell] = { file, launches: 0 };
      continue;
    }
    // BY TIME, never by key order. One shell serializes the marks through a
    // sorted map and the other through an object literal, so `Object.keys`
    // hands back alphabetical order on one of them — and subtracting
    // alphabetical neighbours produced a first step of minus the whole launch.
    const marks = Object.entries(rows[0].marks ?? {})
      .sort(([, a], [, b]) => a - b)
      .map(([mark]) => mark);
    report[shell] = {
      file,
      launches: rows.length,
      version: rows[rows.length - 1].version,
      coldStartMs: median(rows.map((row) => row.coldStartMs)),
      fastestMs: Math.min(...rows.map((row) => row.coldStartMs)),
      slowestMs: Math.max(...rows.map((row) => row.coldStartMs)),
      steps: Object.fromEntries(
        marks
          .slice(1)
          .map((mark, at) => [
            mark,
            median(rows.map((row) => row.marks[mark] - row.marks[marks[at]])),
          ]),
      ),
    };
  }
  return report;
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

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const wantSize =
    argv.includes("--size") || !argv.some((arg) => arg === "--startup");
  const wantStartup =
    argv.includes("--startup") || !argv.some((arg) => arg === "--size");

  const document = {
    kind: "adas-trail/shell-bench",
    platform: process.platform,
  };
  if (wantSize) document.size = sizes();
  if (wantStartup) document.startup = startup();

  if (json) {
    console.log(JSON.stringify(document, null, 2));
  } else {
    if (document.size) {
      console.log("\ninstall size\n");
      if (document.size.found.length === 0) {
        console.log("  nothing packaged on this machine yet.");
      } else {
        console.log(
          table([
            ["build", "package", "MiB"],
            ...document.size.found.map((row) => [
              row.shell,
              row.label,
              mib(row.bytes),
            ]),
          ]),
        );
      }
      for (const row of document.size.absent) {
        // Named rather than skipped: a table with one build in it reads as a
        // comparison unless it says what is missing.
        console.log(`  · ${row.shell} ${row.label}: not packaged here`);
      }
      console.log(
        "\n  package with `make desktop-steam` / `make desktop-tauri-steam` " +
          "(or the `-dist` pair).",
      );
    }
    if (document.startup) {
      console.log("\ncold start — the median of this machine's own launches\n");
      const measured = Object.entries(document.startup).filter(
        ([, row]) => row.launches > 0,
      );
      if (measured.length === 0) {
        console.log("  neither build has been launched on this machine yet.");
      } else {
        console.log(
          table([
            ["build", "launches", "median ms", "fastest", "slowest"],
            ...measured.map(([shell, row]) => [
              shell,
              row.launches,
              row.coldStartMs,
              row.fastestMs,
              row.slowestMs,
            ]),
          ]),
        );
        for (const [shell, row] of measured) {
          console.log(
            `\n  ${shell}  ` +
              Object.entries(row.steps)
                .map(([mark, ms]) => `${mark} +${ms}ms`)
                .join(", "),
          );
        }
      }
      for (const [shell, row] of Object.entries(document.startup)) {
        if (row.launches === 0)
          console.log(`  · ${shell}: no launches recorded (${row.file})`);
      }
      console.log(
        "\n  START EACH BUILD THE WAY A PLAYER DOES, a few times, over a few\n" +
          "  sittings, and run this again. A build launched five times in a row\n" +
          "  by a script is warm from the second one on, and a warm start is not\n" +
          "  the number anybody cares about.\n" +
          "\n  The last mark is the webview reporting the document loaded — NOT\n" +
          "  the title screen. Both builds stop in the same place, so the\n" +
          "  comparison holds even though neither number is the whole wait.",
      );
    }
    console.log("");
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, "shell-bench.json");
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  if (!json) console.log(`written to ${out.replace(`${ROOT}/`, "")}\n`);
}

main();
