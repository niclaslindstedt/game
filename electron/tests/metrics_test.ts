// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COLD-START RECORDER — the module whose bugs are invisible by
// construction: a startup number that is quietly wrong still looks like a
// startup number, and it is read once, in a table, next to another build's.
//
// So what is asserted here is not "it records a number" but the three ways a
// recorded number could lie: a mark that went backwards, a mark neither desktop
// build agreed to, and a launch that never reached the page reporting a fast
// total.

import { describe, expect, it } from "vitest";

import {
  createStartupMetrics,
  FIRST_MARK,
  KEEP_LAUNCHES,
  knownMark,
  LAST_MARK,
  MARKS,
  rotate,
} from "../src/metrics";

type Document = {
  complete: boolean;
  coldStartMs: number | null;
  marks: Record<string, number>;
  notes: string[];
  shell: string;
  version: string;
};

const full = () => {
  const metrics = createStartupMetrics();
  metrics.mark("process", 0);
  metrics.mark("shell-resolved", 120);
  metrics.mark("window-created", 180);
  metrics.mark("window-shown", 210);
  metrics.mark("page-loaded", 640);
  return metrics;
};

describe("the mark vocabulary", () => {
  it("is ordered and starts where it says", () => {
    // The list IS the contract with `tauri/shell/src/metrics.rs`, and
    // `scripts/shell-parity.mjs` reads both. These two are what the rest of the
    // module indexes by name.
    expect(MARKS[0]?.[0]).toBe(FIRST_MARK);
    expect(MARKS[MARKS.length - 1]?.[0]).toBe(LAST_MARK);
    expect(knownMark("window-shown")).toBe(true);
    expect(knownMark("first-frame")).toBe(false);
  });

  it("says what every mark means", () => {
    // A mark with no prose beside it is one the next reader guesses at, and a
    // guessed mark is a comparison between two different events.
    for (const [mark, meaning] of MARKS) {
      expect(meaning, `${mark} has no explanation`).not.toBe("");
    }
  });
});

describe("recording a launch", () => {
  it("reports its total and its steps", () => {
    const metrics = full();
    expect(metrics.complete()).toBe(true);
    expect(metrics.coldStartMs()).toBe(640);
    // The log line is INTERVALS, because the reader's question is what each
    // step cost and subtracting five numbers by hand is how they get it wrong.
    expect(metrics.summary()).toContain("640ms total");
    expect(metrics.summary()).toContain("shell-resolved +120ms");
    expect(metrics.summary()).toContain("page-loaded +430ms");
  });

  it("reports no total for a launch that never reached the page", () => {
    // The failure this prevents: a build that dies before the window appears
    // lands in the bench table as the FASTEST one in the run.
    const metrics = createStartupMetrics();
    metrics.mark("process", 0);
    metrics.mark("shell-resolved", 90);

    expect(metrics.complete()).toBe(false);
    expect(metrics.coldStartMs()).toBeNull();
    expect(metrics.summary()).toContain("incomplete");
    const document = metrics.document("electron", "1.2.3", 0) as Document;
    expect(document.complete).toBe(false);
    expect(document.coldStartMs).toBeNull();
  });

  it("flattens a mark that went backwards rather than recording it", () => {
    // Real cause: a coarse platform clock, or a mark taken from a callback that
    // ran out of order. A negative interval inside a median is a number nobody
    // can see is wrong.
    const metrics = createStartupMetrics();
    metrics.mark("process", 0);
    metrics.mark("shell-resolved", 300);
    metrics.mark("window-created", 250);

    expect(metrics.at("window-created")).toBe(300);
    expect(metrics.summary()).toContain("window-created +0ms");
    expect(metrics.summary()).not.toContain("+-");
  });

  it("drops a mark neither desktop build agreed to, and says so", () => {
    const metrics = createStartupMetrics();
    metrics.mark("process", 0);
    metrics.mark("splash-gone", 10);

    expect(metrics.at("splash-gone")).toBeUndefined();
    expect(metrics.marks()).toHaveLength(1);
    const document = metrics.document("electron", "1.2.3", 0) as Document;
    expect(document.notes.join(" ")).toContain("splash-gone");
  });

  it("keeps the first of two stamps of the same mark", () => {
    // The second stamp is always the later one, so taking it would quietly
    // inflate the step before it.
    const metrics = createStartupMetrics();
    metrics.mark("process", 0);
    metrics.mark("window-shown", 200);
    metrics.mark("window-shown", 900);

    expect(metrics.at("window-shown")).toBe(200);
  });

  it("says why a launch is not a fair sample", () => {
    const metrics = createStartupMetrics();
    metrics.mark("process", 0);
    metrics.note("GIS_GAME_URL was set — this launch loaded a remote site");
    const document = metrics.document("electron", "1.2.3", 0) as Document;
    expect(document.notes.join(" ")).toContain("remote site");
  });

  it("names the shell that wrote it", () => {
    // Both builds append to a file of the same name in folders a bench harness
    // is told about separately; a line that did not say which build wrote it
    // would be unattributable the moment one is copied into a bug report.
    const document = full().document(
      "electron",
      "0.9.0",
      1700000000,
    ) as Document;
    expect(document.shell).toBe("electron");
    expect(document.version).toBe("0.9.0");
    expect(document.coldStartMs).toBe(640);
    expect(document.marks["window-shown"]).toBe(210);
  });
});

describe("the file", () => {
  it("keeps the newest launches and drops the oldest", () => {
    let file = "";
    for (let launch = 0; launch < KEEP_LAUNCHES + 5; launch += 1) {
      file = rotate(file, JSON.stringify({ n: launch }));
    }
    const lines = file.trim().split("\n");
    expect(lines).toHaveLength(KEEP_LAUNCHES);
    expect(lines[0]).toBe(JSON.stringify({ n: 5 }));
    expect(lines[lines.length - 1]).toBe(
      JSON.stringify({ n: KEEP_LAUNCHES + 4 }),
    );
  });

  it("throws away a half-written line from a killed launch", () => {
    // The harness reads this file with a JSON parser, and a process killed
    // mid-append would otherwise leave a fragment at the top of it forever.
    const file = rotate('{"n":1}\n{"n":2,"marks":{"pro', '{"n":3}');
    expect(file).toBe('{"n":1}\n{"n":3}\n');
    for (const line of file.trim().split("\n")) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
