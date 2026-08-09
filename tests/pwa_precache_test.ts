// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PRECACHE IS PER BUILD, AND THE REASON IS A BUG THAT SHIPPED.
//
// The worker used to name its cache after the deploy slot alone
// (`<cacheId>-precache`), which meant the worker SERVING the game and the
// worker quietly INSTALLING the next build shared one box — and
// `${base}index.html` is the same key in both. So the moment an upgrade
// finished downloading, the running worker started answering navigations with
// the INCOMING build's shell, which asks for the incoming build's hashed
// bundle: paths that are not in the running worker's precache, and so are not
// served from it. Online that is an invisible extra round trip. Offline — an
// installed PWA on a phone, which is what this game is — the module script
// never arrives, nothing mounts, and the player is left looking at the
// prerendered SEO document with "BOOTING…" blinking under it. Force-quitting
// fixes it, which is the tell: closing the last client is what finally lets the
// new worker activate and make the cache coherent again.
//
// These tests run the REAL emitted `sw.js` — the plugin's own output, evaluated
// in a sandbox with a fake Cache Storage — because the failure was never in a
// helper. It was in which cache the install wrote into and which entries the
// activation swept, and only the generated worker says that.

import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { buildIdFor, gamePwa, isStalePrecache } from "../pwa/pwa-plugin.ts";

const INDEX = `<!doctype html>
<html lang="en">
  <head><title>Ada's Trail</title></head>
  <body>
    <div id="root"><main class="prelaunch"><p class="prelaunch-status">BOOTING</p></main></div>
    <script type="module" src="/assets/index-abc123.js"></script>
  </body>
</html>
`;

/** Emit a slot's `sw.js` from the real plugin over a one-file bundle. */
function emitWorker(options: {
  base?: string;
  version?: string;
  entry?: string;
}): string {
  const base = options.base ?? "/";
  const plugin = gamePwa({
    base,
    version: options.version ?? "v0.0.0 · test",
    appVersion: "0.0.0",
  });
  const bundle: Record<string, { type: "asset"; source: string }> = {
    "index.html": { type: "asset", source: INDEX },
    [options.entry ?? "assets/index-abc123.js"]: {
      type: "asset",
      source: "console.log(1)",
    },
  };
  const emitted = new Map<string, string>();
  const hooks = plugin as unknown as {
    configResolved: (c: { publicDir: string | false }) => void;
    generateBundle: (o: unknown, b: typeof bundle) => void;
  };
  hooks.configResolved({ publicDir: false });
  hooks.generateBundle.call(
    {
      emitFile: (f: { fileName: string; source: string }) =>
        emitted.set(f.fileName, String(f.source)),
    },
    {},
    bundle,
  );
  return emitted.get("sw.js") ?? "";
}

/** A Cache Storage stand-in: enough of it for install and activate. */
function fakeCaches(fail: (url: string) => boolean = () => false) {
  const boxes = new Map<string, Set<string>>();
  return {
    boxes,
    api: {
      open: (name: string) =>
        Promise.resolve({
          add: (req: { url: string }) => {
            if (fail(req.url))
              return Promise.reject(new Error(`404 ${req.url}`));
            const box = boxes.get(name) ?? new Set<string>();
            box.add(req.url);
            boxes.set(name, box);
            return Promise.resolve();
          },
        }),
      keys: () => Promise.resolve([...boxes.keys()]),
      delete: (name: string) => Promise.resolve(boxes.delete(name)),
    },
  };
}

type Handlers = Map<
  string,
  (event: { waitUntil: (p: Promise<unknown>) => void }) => void
>;

/**
 * Evaluate an emitted worker and return its event handlers plus the fake
 * Cache Storage it will operate on.
 */
function runWorker(source: string, cachesApi: unknown) {
  const handlers: Handlers = new Map();
  const claimed: boolean[] = [];
  const sandbox = {
    self: {
      addEventListener: (type: string, fn: never) => handlers.set(type, fn),
      location: { href: "https://example.test/sw.js" },
      clients: {
        claim: () => {
          claimed.push(true);
          return Promise.resolve();
        },
      },
      skipWaiting: () => undefined,
    },
    caches: cachesApi,
    // The worker builds one per precache entry; only the url is ever read.
    Request: class {
      url: string;
      constructor(url: string) {
        this.url = url;
      }
    },
    URL,
  };
  runInContext(source, createContext(sandbox));
  return { handlers, claimed };
}

/** Fire a lifecycle handler and await whatever it passed to `waitUntil`. */
async function fire(handlers: Handlers, type: string): Promise<void> {
  const handler = handlers.get(type);
  if (!handler) throw new Error(`worker registered no ${type} handler`);
  let pending: Promise<unknown> = Promise.resolve();
  handler({ waitUntil: (p) => (pending = p) });
  await pending;
}

const cacheNameIn = (source: string): string => {
  const build = /const BUILD = "([^"]+)"/.exec(source)?.[1];
  const prefix = /const CACHE_PREFIX = "([^"]+)"/.exec(source)?.[1];
  return `${prefix}-${build}`;
};

describe("isStalePrecache", () => {
  const PREFIX = "game-precache";
  const CURRENT = "game-precache-abc123def456";

  it("keeps the cache this build is serving from", () => {
    expect(isStalePrecache(CURRENT, PREFIX, CURRENT)).toBe(false);
  });

  it("sweeps an earlier build's cache", () => {
    expect(isStalePrecache("game-precache-0011223344", PREFIX, CURRENT)).toBe(
      true,
    );
  });

  it("sweeps the unversioned cache from before this scheme", () => {
    // Every player who installed the old worker is carrying one of these; the
    // first build that activates under the new scheme has to clear it, or its
    // stale index.html sits in Cache Storage forever.
    expect(isStalePrecache("game-precache", PREFIX, CURRENT)).toBe(true);
  });

  it("never touches a sibling deploy slot", () => {
    // THE REASON THE CHECK IS EXACT RATHER THAN A BARE startsWith. The three
    // slots share one origin and one Cache Storage, and the release slot's
    // worker is scoped over both of the others — deleting their caches here
    // would take out `/preview/`'s offline copy on every release.
    for (const name of [
      "game-preview-precache",
      "game-preview-precache-abc123def456",
      "game-branch-precache-999",
    ]) {
      expect(isStalePrecache(name, PREFIX, CURRENT), name).toBe(false);
    }
  });

  it("never touches a cache that merely starts with the same letters", () => {
    expect(isStalePrecache("game-precacheable", PREFIX, CURRENT)).toBe(false);
    expect(isStalePrecache("other-cache", PREFIX, CURRENT)).toBe(false);
  });
});

describe("buildIdFor", () => {
  const ASSETS = { "/index.html": 100, "/assets/a-1.js": 200 };

  it("is stable for a build that would serve the same bytes", () => {
    // Rebuilding an unchanged tree must not orphan the offline copy a player
    // already downloaded.
    expect(buildIdFor("v1", ASSETS)).toBe(buildIdFor("v1", { ...ASSETS }));
  });

  it("moves when the asset set moves", () => {
    const rehashed = { "/index.html": 100, "/assets/a-2.js": 200 };
    const resized = { "/index.html": 100, "/assets/a-1.js": 201 };
    expect(buildIdFor("v1", rehashed)).not.toBe(buildIdFor("v1", ASSETS));
    expect(buildIdFor("v1", resized)).not.toBe(buildIdFor("v1", ASSETS));
  });

  it("moves when the build label moves", () => {
    expect(buildIdFor("v2", ASSETS)).not.toBe(buildIdFor("v1", ASSETS));
  });
});

describe("the emitted worker's precache", () => {
  it("names its cache after the build, under the slot's prefix", () => {
    const source = emitWorker({});
    expect(source).toContain(`const CACHE_PREFIX = "game-precache"`);
    expect(source).toContain(`const CACHE = CACHE_PREFIX + "-" + BUILD;`);
    expect(/const BUILD = "[0-9a-f]{12}"/.test(source)).toBe(true);
  });

  it("gives each slot its own prefix", () => {
    expect(emitWorker({ base: "/preview/" })).toContain(
      `const CACHE_PREFIX = "game-preview-precache"`,
    );
  });

  it("gives two builds two different caches", () => {
    // THE REGRESSION, stated as a name: if these are equal, the installing
    // worker is writing into the box the running one is serving from.
    const before = emitWorker({ entry: "assets/index-abc123.js" });
    const after = emitWorker({ entry: "assets/index-def456.js" });
    expect(cacheNameIn(after)).not.toBe(cacheNameIn(before));
  });

  it("installs into its own cache and leaves the running build's alone", async () => {
    const before = emitWorker({ entry: "assets/index-abc123.js" });
    const after = emitWorker({ entry: "assets/index-def456.js" });
    const storage = fakeCaches();

    // The build a player is running, fully installed.
    await fire(runWorker(before, storage.api).handlers, "install");
    const running = cacheNameIn(before);
    const servedBefore = new Set(storage.boxes.get(running));
    expect(servedBefore.has("/index.html")).toBe(true);

    // The upgrade downloads while that build is still the one in control.
    await fire(runWorker(after, storage.api).handlers, "install");

    // The running build's shell is untouched — it still points at the bundle
    // the running build actually has.
    expect(storage.boxes.get(running)).toEqual(servedBefore);
    expect([...storage.boxes.keys()]).toContain(cacheNameIn(after));
  });

  it("sweeps the older caches only once it is in control", async () => {
    const before = emitWorker({ entry: "assets/index-abc123.js" });
    const after = emitWorker({ entry: "assets/index-def456.js" });
    const storage = fakeCaches();
    // A cache from the previous scheme and a sibling slot's, both present.
    storage.boxes.set("game-precache", new Set(["/index.html"]));
    storage.boxes.set(
      "game-preview-precache-1234",
      new Set(["/preview/index.html"]),
    );

    await fire(runWorker(before, storage.api).handlers, "install");
    const upgrade = runWorker(after, storage.api);
    await fire(upgrade.handlers, "install");
    await fire(upgrade.handlers, "activate");

    expect(upgrade.claimed).toEqual([true]);
    expect([...storage.boxes.keys()]).toEqual([
      "game-preview-precache-1234",
      cacheNameIn(after),
    ]);
  });

  it("refuses to activate over a build asset it could not cache", async () => {
    // The other road to the same dead end: a worker that installs happily with
    // a hole in it, then activates and answers the shell's request for a chunk
    // it never got. Failing the install leaves the running build serving from
    // its own intact cache, and the browser retries on the next update check —
    // which is what a deploy still propagating across a CDN needs.
    const source = emitWorker({});
    const storage = fakeCaches((url) => url.endsWith("index-abc123.js"));
    await expect(
      fire(runWorker(source, storage.api).handlers, "install"),
    ).rejects.toThrow();
  });
});
