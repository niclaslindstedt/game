// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native shell's URL classification (native/src/navigation.ts) — what the
// WebView keeps and what it hands to the player's own browser.
//
// This is worth a test rather than an eyeball because BOTH mistakes are silent
// and neither shows up on the website: let an off-site link through and the
// game is replaced by a page with no back button, and the player's only exit is
// to kill the app (a run in progress goes with it); cancel one navigation too
// many and the game itself never loads.
import { describe, expect, it } from "vitest";

import { isDocumentUrl, isExternalUrl } from "../native/src/navigation.ts";

const ORIGIN = "http://localhost:9006";

describe("isExternalUrl", () => {
  it("keeps the site itself in the WebView", () => {
    expect(isExternalUrl(`${ORIGIN}/`, ORIGIN)).toBe(false);
    expect(isExternalUrl(`${ORIGIN}/index.html?bot=meta`, ORIGIN)).toBe(false);
    // The LIBRARY row: same origin, just a different path — it must navigate
    // in place, which is what the document viewport rules are there for.
    expect(isExternalUrl(`${ORIGIN}/library/enemies/`, ORIGIN)).toBe(false);
  });

  it("sends an off-site link out to the browser", () => {
    // The COMMUNITY row's destination, whatever address it is given.
    expect(isExternalUrl("https://example.invalid/community", ORIGIN)).toBe(
      true,
    );
    expect(isExternalUrl("http://example.invalid/", ORIGIN)).toBe(true);
  });

  it("compares the ORIGIN, so a lookalike host cannot pass as ours", () => {
    // The prefix test this replaces said yes to both of these.
    expect(isExternalUrl(`${ORIGIN}.evil.test/`, ORIGIN)).toBe(true);
    expect(isExternalUrl(`${ORIGIN}@evil.test/`, ORIGIN)).toBe(true);
    // A different PORT on the same host is a different origin too.
    expect(isExternalUrl("http://localhost:9007/", ORIGIN)).toBe(true);
  });

  it("leaves the WebView's own non-http loads alone", () => {
    // Cancelling any of these would break a navigation the shell has no
    // opinion about — `about:blank` is part of the initial load.
    expect(isExternalUrl("about:blank", ORIGIN)).toBe(false);
    expect(isExternalUrl("data:text/html,<p>hi", ORIGIN)).toBe(false);
    expect(isExternalUrl("blob:http://localhost:9006/abc", ORIGIN)).toBe(false);
  });

  it("treats nothing as external before the source resolves", () => {
    expect(isExternalUrl("https://example.invalid/", null)).toBe(false);
  });

  it("fails CLOSED on an http URL it cannot parse", () => {
    // It claims to be the web and cannot be shown to be ours, and the WebView's
    // own parser may disagree with this one — so it is cancelled, not trusted.
    expect(isExternalUrl("http://[", ORIGIN)).toBe(true);
  });

  it("does not refuse everything when OUR origin is the broken one", () => {
    // Judging is impossible either way; a blank shell is the worse failure.
    expect(isExternalUrl(`${ORIGIN}/`, "not a url")).toBe(false);
  });
});

describe("isDocumentUrl", () => {
  it("recognises the site's long-form pages", () => {
    expect(isDocumentUrl(`${ORIGIN}/library/`)).toBe(true);
    expect(isDocumentUrl(`${ORIGIN}/library/items/blaster/`)).toBe(true);
    expect(isDocumentUrl(`${ORIGIN}/privacy`)).toBe(true);
    expect(isDocumentUrl(`${ORIGIN}/contact`)).toBe(true);
  });

  it("is not the game itself", () => {
    expect(isDocumentUrl(`${ORIGIN}/`)).toBe(false);
    expect(isDocumentUrl(`${ORIGIN}/index.html`)).toBe(false);
  });

  it("matches the PATH, so a query cannot smuggle the word past it", () => {
    expect(isDocumentUrl(`${ORIGIN}/?level=library`)).toBe(false);
    expect(isDocumentUrl(`${ORIGIN}/#library`)).toBe(false);
    expect(isDocumentUrl(`${ORIGIN}/notlibrary/`)).toBe(false);
  });
});
