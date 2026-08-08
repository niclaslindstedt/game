// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A STORE BUILD SHIPS NO PRERENDERED BOOT SHELL — `stripBootShell`
// (`pwa/pwa-plugin.ts`), applied to `index.html` when `VITE_SHELL_BUILD=on`.
//
// Two things are worth a test here and they pull in opposite directions.
//
// The strip has to be COMPLETE: what it exists to remove is a flash of an SEO
// document — a "SYSTEM ONLINE" console, four library links, a FAQ — between the
// platform splash lifting and the game's own studio card, in a build nothing
// can crawl and where JavaScript is never off. Half a strip is still a flash.
//
// And it has to be NARROW: `/privacy/` and `/contact/` wear the very same
// `.prelaunch` classes, are derived from this same `index.html`, and are
// REQUIRED by both app stores — a store build that ships them empty is a store
// build that gets rejected. The generator's ordering is what protects them (the
// doc pages are rendered before the strip runs); this file pins the half that
// is a pure function.

import { describe, expect, it } from "vitest";

import { gamePwa, stripBootShell } from "../pwa/pwa-plugin.ts";

/** The shape `index.html` has by the time the strip sees it: a `#root` holding
 * an explanatory comment and the prerendered shell, with the module script
 * after it. */
const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <title>Ada's Trail</title>
  </head>
  <body>
    <div id="root">
      <!-- Prerendered shell (§11.3.1): real content crawlers can index
           without running JavaScript, and it doubles as the no-JS fallback. -->
      <main class="prelaunch">
        <div class="prelaunch-sky" aria-hidden="true"></div>
        <div class="prelaunch-console">
          <h1 class="prelaunch-title">ADA'S TRAIL</h1>
          <nav class="prelaunch-links"><a href="library/">the library</a></nav>
        </div>
        <div class="prelaunch-more"><section><h2>What kind of game it is</h2></section></div>
      </main>
    </div>
    <script type="module" src="/assets/index-abc123.js"></script>
  </body>
</html>
`;

describe("stripBootShell", () => {
  const stripped = stripBootShell(INDEX);

  it("leaves an empty #root for the app to mount into", () => {
    expect(stripped).toContain(`<div id="root"></div>`);
  });

  it("takes the whole shell, not the outer element", () => {
    // Every layer of it — a leftover console or link list is still a flash.
    for (const gone of [
      "prelaunch",
      "SYSTEM ONLINE",
      "ADA'S TRAIL",
      "the library",
      "What kind of game it is",
    ]) {
      expect(stripped).not.toContain(gone);
    }
  });

  it("takes the comment that introduced it with it", () => {
    // It describes an element that is no longer there, and it is the one
    // paragraph of developer prose left in the shipped HTML.
    expect(stripped).not.toContain("Prerendered shell");
    expect(stripped).not.toContain("<!--");
  });

  it("leaves the head and the bundle alone", () => {
    expect(stripped).toContain("<title>Ada's Trail</title>");
    expect(stripped).toContain(`src="/assets/index-abc123.js"`);
  });

  it("is idempotent, so a second pass cannot eat the empty root", () => {
    expect(stripBootShell(stripped)).toBe(stripped);
  });
});

describe("a shell build's emitted bundle", () => {
  // Drive the real `generateBundle` hook over a one-file bundle. What is being
  // proved is the ORDER inside it: the document pages are rendered from
  // `index.html` while the shell is still on it, and only then is the shell
  // taken off. Invert those two statements and `/privacy/` and `/contact/` —
  // which BOTH app stores require, and which only a store build ever serves
  // from inside the app — ship with no body at all.
  const run = (shellBuild: boolean) => {
    const plugin = gamePwa({
      base: "/",
      version: "v0.0.0 · test",
      appVersion: "0.0.0",
      shellBuild,
    });
    const bundle: Record<string, { type: "asset"; source: string }> = {
      "index.html": { type: "asset", source: INDEX },
    };
    const emitted = new Map<string, string>();
    const ctx = {
      emitFile: (file: { fileName: string; source: string }) =>
        emitted.set(file.fileName, String(file.source)),
    };
    // The hook shapes are Rollup's; a test supplies the two pieces it reads.
    const hooks = plugin as unknown as {
      configResolved: (c: { publicDir: string | false }) => void;
      generateBundle: (o: unknown, b: typeof bundle) => void;
    };
    hooks.configResolved({ publicDir: false });
    hooks.generateBundle.call(ctx, {}, bundle);
    return { index: bundle["index.html"]?.source ?? "", emitted };
  };

  it("keeps the boot shell out of index.html", () => {
    const { index } = run(true);
    expect(index).toContain(`<div id="root"></div>`);
    expect(index).not.toContain("prelaunch");
  });

  it("still emits both store-required document pages, with a body", () => {
    const { emitted } = run(true);
    for (const [slug, heading] of [
      ["privacy", "Privacy policy"],
      ["contact", "Contact and support"],
    ]) {
      const page = emitted.get(`${slug}/index.html`);
      expect(page, `${slug}/index.html was not emitted`).toBeTruthy();
      expect(page).toContain("prelaunch-console");
      expect(page).toContain(heading);
    }
  });

  it("leaves the web build's shell exactly where it was", () => {
    const { index, emitted } = run(false);
    expect(index).toContain(`<main class="prelaunch">`);
    expect(index).toContain("ADA'S TRAIL");
    expect(emitted.get("privacy/index.html")).toContain("Privacy policy");
  });
});
