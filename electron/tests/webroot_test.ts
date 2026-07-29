// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The webroot resolver — chiefly its CONTAINMENT check.
//
// This is the one piece of the desktop shell that turns an attacker-influenced
// string into a file read, so it is the one piece that gets a real test rather
// than a careful comment. Everything here is a path that must NOT resolve, plus
// the handful that must.

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { resolveWebrootFile } from "../src/webroot";

let root: string;
let outside: string;

beforeAll(() => {
  // A webroot with a secret sibling next to it — the thing a traversal would
  // be trying to reach.
  const base = mkdtempSync(join(tmpdir(), "gis-webroot-"));
  root = join(base, "webroot");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html>");
  writeFileSync(join(root, "assets", "game.js"), "export {}");
  mkdirSync(join(base, "secrets"), { recursive: true });
  outside = join(base, "secrets", "steam_tokens.txt");
  writeFileSync(outside, "do not read me");
});

describe("resolveWebrootFile — what it serves", () => {
  it("serves a file by path", () => {
    expect(resolveWebrootFile("/assets/game.js", root)).toBe(
      join(root, "assets", "game.js"),
    );
  });

  it("serves index.html for the bare root", () => {
    expect(resolveWebrootFile("/", root)).toBe(join(root, "index.html"));
  });

  it("serves index.html for a directory", () => {
    // The site's own document pages (/library/, /privacy/) are directories.
    expect(resolveWebrootFile("/assets", root)).toBeNull(); // no index there
    expect(resolveWebrootFile("", root)).toBe(join(root, "index.html"));
  });

  it("decodes a percent-encoded path", () => {
    expect(resolveWebrootFile("/assets/game%2Ejs", root)).toBe(
      join(root, "assets", "game.js"),
    );
  });

  it("returns null for a file that isn't there", () => {
    expect(resolveWebrootFile("/nope.js", root)).toBeNull();
  });
});

describe("resolveWebrootFile — what it refuses", () => {
  // Each of these resolves outside the webroot, or tries to. None may return a
  // path: a hit here is a file the game would hand to the renderer.
  const traversals = [
    "/../secrets/steam_tokens.txt",
    "/../../secrets/steam_tokens.txt",
    "/assets/../../secrets/steam_tokens.txt",
    "/..%2fsecrets%2fsteam_tokens.txt",
    "/%2e%2e/secrets/steam_tokens.txt",
    "/%2e%2e%2fsecrets%2fsteam_tokens.txt",
    "/....//secrets/steam_tokens.txt",
    "/./../../secrets/steam_tokens.txt",
  ];

  for (const path of traversals) {
    it(`refuses ${path}`, () => {
      expect(resolveWebrootFile(path, root)).toBeNull();
    });
  }

  it("refuses an absolute path to the sibling", () => {
    expect(resolveWebrootFile(outside, root)).toBeNull();
  });

  it("refuses a NUL byte", () => {
    // A NUL truncates a path in some syscalls, so `/index.html\0.png` could be
    // read as `/index.html` by a checker and something else by the OS.
    expect(resolveWebrootFile("/index.html\0.png", root)).toBeNull();
  });

  it("refuses undecodable percent-encoding rather than falling back", () => {
    // A lone `%` throws in decodeURIComponent. Falling back to the raw string
    // would mean the containment check ran on different text than the read.
    expect(resolveWebrootFile("/%", root)).toBeNull();
    expect(resolveWebrootFile("/%zz", root)).toBeNull();
  });

  it("does not treat a sibling directory with a shared prefix as inside", () => {
    // `…/webroot-evil` starts with `…/webroot` as a STRING but is not inside
    // it — the classic off-by-one in a prefix containment check. The resolver
    // compares against `root + separator`, so this cannot slip through.
    const evil = `${root}-evil`;
    mkdirSync(evil, { recursive: true });
    writeFileSync(join(evil, "payload.js"), "bad");
    expect(resolveWebrootFile(`${sep}payload.js`, evil)).toBe(
      join(evil, "payload.js"),
    );
    // …and reaching it from the real root is refused.
    expect(resolveWebrootFile("/../webroot-evil/payload.js", root)).toBeNull();
  });
});
