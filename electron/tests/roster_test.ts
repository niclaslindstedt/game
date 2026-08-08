// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROSTER CHECK — "the cloud holds the roster that went into it", reduced to
// one command per desktop build.
//
// Two failure modes are worth more than the rest of this file put together, and
// both are the kind that PASS:
//
//  1. A check that clears because it compared a build against itself. Both
//     invocations look identical in a terminal history, and the digests match
//     for the least interesting reason there is.
//  2. A restore that flattens the roster it was called to verify. A
//     verification tool with a destructive door has to refuse that door by
//     default, or the first bad evening costs a real player's heroes.
//
// The digest is also asserted against the value the Rust peer computes for the
// same bytes, because the whole point of the two reports is that one build's
// file is compared with the other's.

import { describe, expect, it } from "vitest";

import {
  blobOf,
  compare,
  describeReport,
  digest,
  envelope,
  refuseRestore,
  reportDocument,
  rosterMode,
  type CloudRead,
  type RosterReport,
} from "../src/roster";

/** A save envelope the way `pwa/src/game/cloud-save.ts` writes one. */
const save = (heroes: string[], writtenBy: string) =>
  JSON.stringify({
    format: "adas-trail/cloud-save",
    version: 1,
    writtenAt: 1700000000000,
    writtenBy,
    characters: heroes.map((name) => ({ id: `h-${name}`, name })),
    tombstones: { "h-old": 1 },
    coins: {},
    scores: {},
    driveScores: [],
  });

const report = (shell: string, read: CloudRead): RosterReport => ({
  shell,
  provider: "steam-cloud",
  available: true,
  player: { id: "76561", name: "Ada" },
  read,
});

const argv = (line: string) => line.split(" ");

describe("reading the mode off a command line", () => {
  it("recognises each mode", () => {
    expect(rosterMode(argv("--fullscreen"))).toBeNull();
    expect(rosterMode(argv("--roster-check"))).toEqual({
      kind: "check",
      out: undefined,
      against: undefined,
    });
    expect(
      rosterMode(argv("--roster-check --out a.json --against b.json")),
    ).toEqual({ kind: "check", out: "a.json", against: "b.json" });
    expect(rosterMode(argv("--roster-restore a.json --overwrite"))).toEqual({
      kind: "restore",
      file: "a.json",
      overwrite: true,
    });
  });

  it("does not let a flag with a missing value swallow the next flag", () => {
    // `--out --against b.json` is a typo somebody makes at the end of a long
    // evening, and reading `--against` as a FILE NAME would write the report to
    // a file called `--against` and then compare against nothing.
    expect(rosterMode(argv("--roster-check --out --against b.json"))).toEqual({
      kind: "check",
      out: undefined,
      against: "b.json",
    });
  });
});

describe("the envelope census", () => {
  it("reads what the game stamps", () => {
    const found = envelope(save(["Ada", "Bex"], "steam-deck"));
    expect(found).toEqual({
      format: "adas-trail/cloud-save",
      version: 1,
      heroes: ["Ada", "Bex"],
      tombstones: 1,
      writtenAt: 1700000000000,
      writtenBy: "steam-deck",
    });
  });

  it("reports a format this build does not know rather than refusing it", () => {
    // "the other build wrote something this one cannot parse" is a FINDING.
    expect(
      envelope('{"format":"adas-trail/cloud-save","version":9}')?.version,
    ).toBe(9);
    expect(envelope("not json at all")).toBeNull();
    expect(envelope("[1,2,3]")).toBeNull();
  });
});

describe("the fingerprint", () => {
  it("carries the length in front of the hash", () => {
    const blob = save(["Ada"], "desktop");
    expect(digest(blob)).toBe(digest(blob));
    expect(digest(blob)).not.toBe(digest(save(["Ada", "Bex"], "desktop")));
  });

  it("computes what the Rust peer computes for the same bytes", () => {
    // The two builds' reports are compared BY DIGEST, so a divergence here
    // would report every successful handover as a failed one. FNV-1a 64 over
    // the UTF-8 bytes, length-prefixed.
    expect(digest("abc")).toBe("3-e71fa2190541574b");
    expect(digest("")).toBe("0-cbf29ce484222325");
  });
});

describe("what a report says", () => {
  it("never reports a failed read as an empty cloud", () => {
    // The distinction the whole seam is built around. A verification that
    // called an unreachable cloud "empty" sends somebody hunting a sync bug
    // that is not there.
    const failed = describeReport(report("electron", undefined));
    expect(failed).toContain("THE READ FAILED");
    expect(failed).toContain("not the same as an empty cloud");
    expect(describeReport(report("electron", null))).toContain(
      "nothing stored",
    );
  });

  it("names the heroes it found", () => {
    const described = describeReport(
      report("electron", save(["Ada", "Bex"], "desktop")),
    );
    expect(described).toContain("the electron shell");
    expect(described).toContain("Ada, Bex");
    expect(described).toContain("written by desktop");
  });

  it("calls bytes that are not a save unreadable rather than empty", () => {
    const described = describeReport(report("electron", "garbage"));
    expect(described).toContain("UNREADABLE");
    // …and the size and fingerprint are still there, because "there IS
    // something under the key and it is 7 bytes" is the useful half.
    expect(described).toContain("7 bytes");
  });

  it("says which three things mean there is no cloud at all", () => {
    const described = describeReport({
      shell: "electron",
      provider: null,
      available: false,
      player: null,
      read: undefined,
    });
    expect(described).toContain("GIS_STEAM=off");
  });

  it("carries the blob so the same file can restore it", () => {
    const blob = save(["Ada"], "desktop");
    const document = reportDocument(report("electron", blob));
    expect(blobOf(document)).toBe(blob);
    expect(document.kind).toBe("adas-trail/roster-report");
    expect(blobOf(reportDocument(report("electron", null)))).toBeNull();
  });
});

describe("comparing two reports", () => {
  it("clears a handover when both read the same roster", () => {
    const blob = save(["Ada"], "desktop");
    const result = compare(
      reportDocument(report("electron", blob)),
      reportDocument(report("tauri", blob)),
    );
    expect(result.verdict).toBe("same");
    expect(result.lines.join(" ")).toContain("SAME roster");
  });

  it("proves nothing when a build is compared against itself, and says so", () => {
    const blob = save(["Ada"], "desktop");
    const result = compare(
      reportDocument(report("electron", blob)),
      reportDocument(report("electron", blob)),
    );
    expect(result.verdict).toBe("inconclusive");
    expect(result.lines.join(" ")).toContain("one report from each");
  });

  it("points at the two reasons two rosters can differ", () => {
    const result = compare(
      reportDocument(report("electron", save(["Ada"], "desktop"))),
      reportDocument(report("tauri", save(["Bex"], "steam-deck"))),
    );
    expect(result.verdict).toBe("different");
    expect(result.lines.join(" ")).toContain("write half");
    expect(result.lines.join(" ")).toContain("Steam account");
  });

  it("is inconclusive rather than failing when either side had no roster", () => {
    // "the test did not run" and "the test failed" are different answers, and
    // conflating them is how a precondition gets signed off on a laptop with
    // Steam closed.
    const result = compare(
      reportDocument(report("electron", save(["Ada"], "desktop"))),
      reportDocument(report("tauri", undefined)),
    );
    expect(result.verdict).toBe("inconclusive");
    expect(result.lines.join(" ")).toContain("no roster to compare");
  });

  it("refuses a file that is not a roster report", () => {
    const result = compare(
      reportDocument(report("electron", save(["Ada"], "desktop"))),
      { shell: "tauri" },
    );
    expect(result.verdict).toBe("inconclusive");
    expect(result.lines.join(" ")).toContain("not a roster report");
  });
});

describe("the destructive door", () => {
  it("will not flatten a different roster without being told to", () => {
    const incoming = save(["Ada"], "desktop");
    const existing = save(["Bex", "Cyd"], "steam-deck");
    const refusal = refuseRestore(incoming, existing, false);
    expect(refusal).toContain("--overwrite");
    expect(refusal).toContain("2 hero(es)");
    expect(refuseRestore(incoming, existing, true)).toBeNull();
  });

  it("needs no ceremony to write the identical bytes back", () => {
    // Refusing the harmless case is how somebody learns to type --overwrite
    // without reading the line above it.
    const blob = save(["Ada"], "desktop");
    expect(refuseRestore(blob, blob, false)).toBeNull();
  });

  it("takes an empty cloud and refuses an unreadable one", () => {
    const blob = save(["Ada"], "desktop");
    expect(refuseRestore(blob, null, false)).toBeNull();
    expect(refuseRestore(blob, undefined, true)).toContain(
      "no telling what this would replace",
    );
  });
});
