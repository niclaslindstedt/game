// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW LONG THE SHELL TOOK TO GET OUT OF THE WAY — the peer of
// `tauri/shell/src/metrics.rs`, and the one module here that exists for the
// people measuring the shell rather than for the game.
//
// A desktop wrapper is judged on two numbers, and only one of them can be
// weighed from outside. Install size a packager reads off a directory. COLD
// START cannot be measured from the outside at all: a stopwatch on the process
// gives you the moment one build's window appeared and the moment another
// build's splash did, and the two are not the same event. So the shell writes
// down five moments itself, in a vocabulary both desktop builds share, into the
// same shape of file — and `scripts/shell-bench.mjs` reads them side by side.
//
// THE MARKS ARE SHELL-SIDE ONLY, and the ceiling that puts on the number is the
// honest part. The last one is the webview reporting the document finished
// loading, which is NOT the moment the player sees the title screen — the game
// boots, hydrates its catalogs and renders after that, and no shell can see any
// of it without the page telling it. Both desktop builds stop at the same
// place, so the COMPARISON is sound even though neither number is the whole
// wait; a mark only one of them could produce would be worse than no mark.
//
// One line of JSON per launch, appended to `startup.jsonl` in the app's own
// user-data directory, newest last and the oldest dropped past KEEP_LAUNCHES. A
// line rather than a document because the bench harness launches the same build
// several times and takes the median: a file that overwrote itself would make
// that five reads racing four writes.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { output } from "./output";

/** The file, in the app's user-data directory beside `launch.log`. */
export const STARTUP_FILE = "startup.jsonl";

/** How many launches are kept. Twenty is more than any bench run takes and
 * small enough that the file stays a thing a human can read in a bug report. */
export const KEEP_LAUNCHES = 20;

/**
 * A moment worth stamping, and what it means.
 *
 * THE LIST IS THE CONTRACT BETWEEN THE TWO DESKTOP BUILDS, which is why it is a
 * table with prose beside it rather than five string literals scattered through
 * a startup path. `scripts/shell-parity.mjs` reads this list and
 * `tauri/shell/src/metrics.rs`'s and refuses a build where they disagree — a
 * mark only one shell records is a column the comparison silently loses.
 */
export const MARKS: readonly (readonly [string, string])[] = [
  [
    "process",
    "the earliest instant the shell can stamp — always 0, and the thing every " +
      "other mark is measured from",
  ],
  [
    "shell-resolved",
    "capabilities parsed, the user-data directory adopted, the launch log " +
      "open, and the platform seams asked for (which is where a Steam " +
      "handshake is paid for)",
  ],
  [
    "window-created",
    "the window object exists and the webview has been pointed at the game",
  ],
  [
    "window-shown",
    "the window is on screen. Both shells hold it hidden until here so the " +
      "player never watches a white rectangle fill in",
  ],
  [
    "page-loaded",
    "the webview says the document finished loading. NOT the title screen — " +
      "see the module header for what this number does not contain",
  ],
] as const;

/** The mark every measurement is relative to. */
export const FIRST_MARK = "process";
/** The mark the headline number ends at. */
export const LAST_MARK = "page-loaded";

/** Is this a mark both shells know about? */
export function knownMark(name: string): boolean {
  return MARKS.some(([mark]) => mark === name);
}

/** One launch's stamps, in the order they were taken. */
export type StartupMetrics = {
  mark(name: string, millis: number): void;
  note(note: string): void;
  at(name: string): number | undefined;
  marks(): readonly (readonly [string, number])[];
  coldStartMs(): number | null;
  complete(): boolean;
  summary(): string;
  document(shell: string, version: string, stampSeconds: number): unknown;
};

/** A fresh recorder. */
export function createStartupMetrics(): StartupMetrics {
  const marks: [string, number][] = [];
  const notes: string[] = [];
  const at = (name: string) => marks.find(([mark]) => mark === name)?.[1];

  return {
    // Two things are refused rather than recorded, because both make a
    // comparison lie rather than merely being untidy: a name neither shell
    // agreed to, and a mark that went BACKWARDS. The second happens for real — a
    // coarse platform clock, or a mark taken from a callback that ran out of
    // order — and a negative interval in a median is a number nobody can see is
    // wrong.
    mark(name, millis) {
      if (!knownMark(name)) {
        notes.push(`unknown mark ${name} was dropped`);
        return;
      }
      if (at(name) !== undefined) {
        notes.push(`mark ${name} was stamped twice`);
        return;
      }
      const last = marks[marks.length - 1]?.[1] ?? 0;
      marks.push([name, Math.max(Math.round(millis), last)]);
    },
    note(note) {
      notes.push(note);
    },
    at,
    marks: () => marks,
    // `null` where the last mark never landed, which is what a launch that
    // failed on the way to a window looks like — and reporting a total for one
    // of those would put a fast number in the table for a build that never
    // showed the game.
    coldStartMs: () => at(LAST_MARK) ?? null,
    complete: () => MARKS.every(([mark]) => at(mark) !== undefined),
    // The log line is INTERVALS, because the reader's question is what each step
    // cost and subtracting five numbers by hand is how they get it wrong.
    summary() {
      if (marks.length === 0) return "startup: nothing was stamped";
      let previous = 0;
      const steps = marks.slice(1).map(([mark, when]) => {
        const step = when - previous;
        previous = when;
        return `${mark} +${step}ms`;
      });
      const total = at(LAST_MARK);
      const headline = total === undefined ? "incomplete" : `${total}ms`;
      return `startup: ${headline} total — ${steps.join(", ")}`;
    },
    document(shell, version, stampSeconds) {
      return {
        shell,
        version,
        os: process.platform,
        arch: process.arch,
        at: stampSeconds,
        complete: this.complete(),
        coldStartMs: this.coldStartMs(),
        marks: Object.fromEntries(marks),
        notes,
      };
    },
  };
}

/** Where the file lives. */
export function startupPath(userData: string): string {
  return join(userData, STARTUP_FILE);
}

/**
 * The lines a file should hold once `line` is appended — the newest last, and no
 * more than KEEP_LAUNCHES of them.
 *
 * Pure so the trimming is testable without a filesystem, and separate from
 * `appendStartup` for the reason every decision in these modules is: the rule
 * ("keep the newest N, drop anything unparseable") is the part that can be
 * wrong.
 */
export function rotate(existing: string, line: string): string {
  const lines = existing
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    // A truncated write from a launch that was killed mid-append would
    // otherwise sit at the top of the file forever, and the harness reads this
    // with a JSON parser.
    .filter((entry) => {
      try {
        JSON.parse(entry);
        return true;
      } catch {
        return false;
      }
    });
  lines.push(line);
  return `${lines.slice(Math.max(0, lines.length - KEEP_LAUNCHES)).join("\n")}\n`;
}

/** Append one launch to the file. Best-effort, exactly as the launch log is: a
 * measurement that could not be written must never be the reason a game does
 * not start. */
export function appendStartup(userData: string, document: unknown): void {
  const path = startupPath(userData);
  let existing = "";
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    existing = "";
  }
  try {
    writeFileSync(path, rotate(existing, JSON.stringify(document)), "utf8");
  } catch {
    // See above.
  }
}

// ---------------------------------------------------------------------------
// The process-wide recorder
// ---------------------------------------------------------------------------

/** Which build wrote a line, so a file copied into a bug report is still
 * attributable. */
const SHELL = "electron";

const recorder = createStartupMetrics();

/**
 * When this process actually began.
 *
 * `process.getCreationTime()` is Electron's own, and it is the honest zero:
 * module-load time would start the clock AFTER Chromium's bootstrap, which is
 * precisely the part of a launch worth measuring. It returns null on a runtime
 * that has no such notion, where module load is the best available answer and
 * the number is understated rather than absent.
 */
const startedAt: number = (() => {
  const created = (
    process as NodeJS.Process & { getCreationTime?: () => number | null }
  ).getCreationTime?.();
  return typeof created === "number" && created > 0 ? created : Date.now();
})();

/** Stamp the beginning. Called first thing in `main.ts`. */
export function start(): void {
  recorder.mark(FIRST_MARK, 0);
}

/** Stamp a mark now. */
export function mark(name: string): void {
  recorder.mark(name, Date.now() - startedAt);
}

/** Say why this launch is not a fair sample of a cold start. */
export function note(note: string): void {
  recorder.note(note);
}

let written = false;

/**
 * Write the launch down: one line in the launch log, one line in
 * `startup.jsonl`.
 *
 * ONCE PER PROCESS, and the guard is load-bearing rather than defensive: the
 * caller is `did-finish-load`, which fires again for every in-site navigation
 * the player makes (the library, the privacy page). Without it, `startup.jsonl`
 * would fill with rows that are not launches and the bench harness's median
 * would be a median of page loads.
 */
export function finish(userData: string, version: string): void {
  if (written) return;
  written = true;
  output.info(recorder.summary());
  appendStartup(
    userData,
    recorder.document(SHELL, version, Math.floor(Date.now() / 1000)),
  );
}
