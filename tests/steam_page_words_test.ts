// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAM PAGE'S WORDS ARE NOT COMMITTED.
//
// The brief description, About This Game and the mature-content description
// are the Steam page's own prose, and a public copy would put it on a crawlable
// page somewhere else. So the internal page mock (tauri/store/preview/) is a
// template: its word slots hold placeholders, and it reads the words from
// tauri/store/steam.md, which is gitignored. These tests hold that shape, and
// fail if the words come back — into the mock or into any other tracked file.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const WORDS = "tauri/store/steam.md";
const MOCK = "tauri/store/preview/index.html";
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const git = (...args: string[]) =>
  spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });

interface SteamPageWords {
  SECTIONS: Record<string, string>;
  parse(markdown: string): Record<string, string[]>;
  inline(paragraph: string): { text: string; strong: boolean }[];
}

// words.js is a classic browser script that hangs its parser on globalThis.
const words = (() => {
  const context: Record<string, unknown> = {};
  context.globalThis = context;
  runInNewContext(read("tauri/store/preview/words.js"), context);
  if (!context.steamPageWords) throw new Error("words.js defined nothing");
  return context.steamPageWords as SteamPageWords;
})();

// Each element of the mock carrying data-words, and what is inside it. No slot
// nests an element of its own tag, so the first closing tag ends it.
const slots = [
  ...read(MOCK).matchAll(
    /<(\w+)\b[^>]*\sdata-words="(\w+)"[^>]*>([\s\S]*?)<\/\1>/g,
  ),
].map(([, tag, name, inner]) => ({ tag, name, inner: inner ?? "" }));

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the Steam page's words stay out of the repository", () => {
  it("keeps the words file out of git", () => {
    expect(git("check-ignore", "-q", WORDS).status).toBe(0);
    expect(git("ls-files", "--error-unmatch", WORDS).status).not.toBe(0);
  });

  it("gives every section of the words file a slot in the mock", () => {
    expect(slots.map((slot) => slot.name).sort()).toEqual(
      Object.keys(words.SECTIONS).sort(),
    );
  });

  it("commits nothing in the mock's slots but placeholders that name the words file", () => {
    for (const slot of slots) {
      const paragraphs =
        slot.tag === "p"
          ? [slot.inner]
          : [...slot.inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(
              ([, inner]) => inner ?? "",
            );
      expect(paragraphs.length, slot.name).toBeGreaterThan(0);
      for (const paragraph of paragraphs) {
        expect(text(paragraph), slot.name).toMatch(/PLACEHOLDER/);
      }
      // Nothing sits in a slot outside those paragraphs but its images.
      const rest = slot.inner
        .replace(/<p\b[^>]*>[\s\S]*?<\/p>/g, "")
        .replace(/<img\b[^>]*\/?>/g, "");
      expect(text(slot.tag === "p" ? "" : rest), slot.name).toBe("");
      expect(text(slot.inner), slot.name).toContain(WORDS);
    }
  });

  it("reads each slot from the section under its heading, and nothing else", () => {
    const parsed = words.parse(`# Title

A preamble, not shown.

## Brief description

One line
wrapped.

## About This Game

First paragraph.

**Bold lead.** Then the rest.

## Mature content description

Mature words.

## A note for whoever fills the survey

Not shown.
`);
    expect(parsed).toEqual({
      brief: ["One line wrapped."],
      about: ["First paragraph.", "**Bold lead.** Then the rest."],
      mature: ["Mature words."],
    });
    expect(words.inline("**Bold lead.** Then the rest.")).toEqual([
      { text: "Bold lead.", strong: true },
      { text: " Then the rest.", strong: false },
    ]);
  });
});

// Eight consecutive words, lower-cased, letters and digits only, one space
// between: the unit a copied passage is recognized by, whatever markup or
// line-wrapping it was pasted into.
const RUN = 8;
const wordsOf = (source: string) =>
  source
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .normalize("NFKD")
    .match(/[a-z0-9]+/g) ?? [];
const runsOf = (source: string) => {
  const all = wordsOf(source);
  return Array.from({ length: Math.max(0, all.length - RUN + 1) }, (_, i) =>
    all.slice(i, i + RUN).join(" "),
  );
};
const fingerprint = (run: string) =>
  createHash("sha256").update(run).digest("hex").slice(0, 12);

// The Steam page's words as they stood when they left the repository,
// unreadable: the first twelve hex digits of the SHA-256 of every fourth run of
// eight words in them (and each paragraph's last run), so a copied passage of
// eleven words or more is caught. Runs the game's own public premise in
// game.config.json shares with the page are left out. Newer words are held by
// the check below it, against the words file itself, wherever one is present.
const FINGERPRINTS = new Set(
  `
  524fa85e654b 4841379db70f d60318105514 1134fd9e8c1a faa3ea46f24f
  8517e0c7f577 0862c56e8d0b 2b2fe95634d7 806908a18623 65edc6e27888
  bfa9dba15e0a a4b7b4bfd8f2 3aa16f61b945 6f3b6419cacc 21a1d79d4bff
  0c16e36e47bb 197fa0b3976f 5b6b8ed7cf68 0f0a6a0be728 aa4a76e29872
  c15711a591c4 b066aa56f70e e042c36d98e9 79ef6129e92e 9211eaeede62
  7772517fda05 405e8e1da226 7d2ad3b84f3b 87c742bc9b96 963e328e8c6e
  46122fdb9460 deca36401114 74bbdc541ef2 2ac3e8401387 85875bafeabb
  a258d4de05a8 5ac3d062846a b13a3f8d2f13 9c433c3dea9a f20e9f089dea
  faf793d1f007 904703060fa9 98dc07118b04 57e751dfeb26 e384be748a65
  a632d961391a 055b489c48d1 47a8bf4c8e9e 94f23c20cf0a 47b1bc5c290a
  8f4194dec71f 931ce2dc2e70 d50125c1c6df 988b1cb29571 9ed24ff78b60
  5134ffd5e48c 79d95e958a0b f2e2889ed878 a68361b4d470 9fb0c42f5923
  5af65d394335 d7ff66060d4a 864abcaa5fba 0801720948e5 c5411056539d
  cc4d289e5cb9 568aabea94f9 57c436416484 77c95d68951b 974e5d2c817a
  bf5c5d958122 43406ad97059 b3f41202849e 2b5e74408797 342cc742ee63
  ab0ae266da1f 92f98799f61e 0629371d0aa7 cbeedef92a4f 8376c4bec4e7
  11b60403f05f b7e0f7354ca6 fd7337388dd2 379fe8b20ecd 0ce51c7334dc
  549adc382e8a 7a5cb20533a2 18116cbfa706 00cd68dc2f5d 848add37fd9d
  7134f54c1801 7b2e79ef8f86 6779f991dc8d c41e8338e35f 3cf56d50f049
  31796333396c f48508b7bc2d 289c08a8a920 f63e0c7b5d03 d2f850f1894a
  004a0c3b56b1 ec59ddefc48f 4815762784c4 32d3c379f3e5 a2fdfea57bbd
  905a9c48d426 207783c0dd62 3f860276aacf 070104029118 ae5240fe005d
  df63f77a6356 bbb94baa4bb5 e2fbe292c853 34ac6abadc07 62d70ad5d681
  99ae2dad1e65 358f9dec28df f49871c452cf f48572365a62 64342bd3c453
  4dec64f7583d f1646fe1e84f ca370998c158 156d25df6b8c 065124a4e949
`
    .split(/\s+/)
    .filter(Boolean),
);

describe("no tracked file carries the Steam page's words", () => {
  const tracked = git("ls-files", "-z")
    .stdout.split("\0")
    .filter(Boolean)
    .flatMap((path) => {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(ROOT, path));
      } catch {
        return []; // deleted in the working tree
      }
      return bytes.length > 2_000_000 || bytes.includes(0)
        ? []
        : [{ path, runs: runsOf(bytes.toString("utf8")) }];
    });
  const publicRuns = new Set(runsOf(read("game.config.json")));

  it("matches none of the words' fingerprints", () => {
    const hits = tracked
      .filter(({ runs }) =>
        runs.some((run) => FINGERPRINTS.has(fingerprint(run))),
      )
      .map(({ path }) => path);
    expect(hits).toEqual([]);
  }, 60_000);

  it.runIf(existsSync(join(ROOT, WORDS)))(
    "shares no run of eight words with the words file present here",
    () => {
      // The words are what sits under the file's `## ` headings; its preamble
      // is a note about the file, and names the same things this repo does.
      const body = read(WORDS)
        .split(/^## .*$/m)
        .slice(1)
        .join("\n\n");
      const secret = new Set(
        runsOf(body).filter((run) => !publicRuns.has(run)),
      );
      const hits = tracked
        .filter(({ runs }) => runs.some((run) => secret.has(run)))
        .map(({ path }) => path);
      expect(hits).toEqual([]);
    },
    60_000,
  );
});
