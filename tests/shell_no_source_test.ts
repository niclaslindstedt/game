// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A STORE BUILD NAMES NO SOURCE — by owner decision, strictly.
//
// The phone and desktop apps carry no repository, author or web-edition
// address, in any file. Three pieces make that true and each is pinned here:
// `shellIdentity` clears the addresses the client bundle would inline from
// `game.config.json`, `fillIdentityTokens` drops the share tags that are
// nothing but such an address, and `scripts/shell-bundle-guard.mjs` is what
// both bundle scripts run to REFUSE a webroot that still names the owner.
// The website keeps every one of them, so the other half of each test is
// that a plain build is untouched.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import config from "../game.config.json" with { type: "json" };
import { fillIdentityTokens, shellIdentity } from "../pwa/pwa-plugin.ts";
import {
  FORBIDDEN,
  offendingFiles,
  offendingFilesIn,
} from "../scripts/shell-bundle-guard.mjs";

describe("shellIdentity", () => {
  const shell = shellIdentity(config);

  it("clears every address that points at the web edition or the source", () => {
    expect(shell.siteUrl).toBe("");
    expect(shell.repoUrl).toBe("");
    expect(shell.author.url).toBe("");
  });

  it("leaves nothing in the serialised config that names the owner", () => {
    // The client bundle inlines the WHOLE object, so this is the real test.
    expect(JSON.stringify(shell)).not.toContain(FORBIDDEN);
  });

  it("keeps everything else, and does not touch the website's copy", () => {
    expect(shell.title).toBe(config.title);
    expect(shell.author.name).toBe(config.author.name);
    expect(config.siteUrl).not.toBe("");
    expect(config.repoUrl).not.toBe("");
  });
});

describe("fillIdentityTokens", () => {
  const HEAD = `<head>
    <title>{{TITLE}}</title>
    <meta property="og:title" content="{{SOCIAL_TITLE}}" />
    <meta property="og:url" content="{{SITE_URL}}/" />
    <meta property="og:image" content="{{SITE_URL}}/og-default.png" />
    <meta name="twitter:image" content="{{SITE_URL}}/og-default.png" />
  </head>`;

  it("drops the web-address share tags from a store build", () => {
    const shell = fillIdentityTokens(HEAD, true);
    expect(shell).not.toContain("og:url");
    expect(shell).not.toContain("og:image");
    expect(shell).not.toContain("twitter:image");
    expect(shell).not.toContain(FORBIDDEN);
    expect(shell).not.toContain("{{");
    // The tags that are not an address stay.
    expect(shell).toContain("<title>");
    expect(shell).toContain("og:title");
  });

  it("keeps them, filled, on the website", () => {
    const web = fillIdentityTokens(HEAD);
    expect(web).toContain(
      `<meta property="og:url" content="${config.siteUrl}/" />`,
    );
    expect(web).toContain(`${config.siteUrl}/og-default.png`);
  });
});

describe("shell-bundle-guard", () => {
  const dir = mkdtempSync(join(tmpdir(), "shell-guard-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("finds the owner's name in any file, binary included", () => {
    const bytes = (s: string) => new Uint8Array(Buffer.from(s));
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0,
      0,
      ...Buffer.from(FORBIDDEN),
    ]);
    expect(
      offendingFiles({
        "index.html": bytes("<p>clean</p>"),
        "assets/index.js": bytes(`x="https://github.com/${FORBIDDEN}/game"`),
        "icon.png": png,
      }),
    ).toEqual(["assets/index.js", "icon.png"]);
  });

  it("walks a directory on disk the same way", () => {
    mkdirSync(join(dir, "library", "a"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<p>clean</p>");
    writeFileSync(
      join(dir, "library", "a", "index.html"),
      `https://game.${FORBIDDEN}.se/`,
    );
    expect(offendingFilesIn(dir)).toEqual(["library/a/index.html"]);
  });

  it("passes a clean webroot", () => {
    expect(
      offendingFiles({
        "index.html": new Uint8Array(Buffer.from("<p>ok</p>")),
      }),
    ).toEqual([]);
  });
});
