#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO DESKTOP BUILDS, HELD AGAINST EACH OTHER — the parity matrix, derived
// from the trees rather than maintained beside them.
//
//   node scripts/shell-parity.mjs           # rewrite docs/desktop-parity.md
//   node scripts/shell-parity.mjs --check   # fail on drift; what CI runs
//
// WHY THIS IS A PROGRAM AND NOT A DOCUMENT
//
// Two shells wrap the same website and answer the same protocols. Everything
// that keeps them honest is a PAIR — a module and its peer, a bridge flag and
// its flag, a capability switch and its switch, a startup mark and its mark —
// and every one of those pairs is invisible when it breaks. Nothing fails to
// compile when the Electron shell grows a module the Rust one does not have;
// nothing fails at runtime when one build stamps a startup mark the other does
// not, right up until the comparison table quietly loses a column and the
// numbers underneath it are read anyway.
//
// So the five pairings below are READ OUT OF THE SOURCE on every run, and a
// drift is a red build rather than something somebody notices later. The sixth
// section — what only a human with the hardware can press — is authored here,
// because a machine cannot check that somebody installed a bundle and saw the
// game.
//
// A PARSE THAT FINDS NOTHING IS A FAILURE, never an empty section. The whole
// value of deriving these lists is lost the moment a moved constant turns the
// checker into a program that agrees with everything.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "desktop-parity.md");

const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

// ---------------------------------------------------------------------------
// 1. The module peers
// ---------------------------------------------------------------------------

/**
 * Rust modules whose peer is not a FILE — the other shell answers the same
 * question somewhere inside another one.
 *
 * A module lands here only for that reason, never because nobody has written
 * the peer yet, and the note is what keeps the table from reading as a clean
 * one-to-one pairing where there isn't one.
 */
const ANSWERED_ELSEWHERE = {
  snapshot:
    "the Electron shell transfers a MessagePort, which is an API call rather " +
    "than a module",
  steam_pump: "Electron's callback loop lives inside its own steam.ts",
  media: "Electron answers this in main.ts's permission handler",
  bridge: "Electron routes in main.ts's routeMessage",
  display:
    "Chromium refuses to start with no display and says so itself; a platform " +
    "webview lets the event-loop library unwrap it instead",
};

/** TypeScript modules with no Rust peer, same rule. */
const TS_WITHOUT_PEER = {
  "main.ts":
    "the Rust shell's process is src-tauri/src/main.rs, not a decision",
  "preload.ts": "the Rust shell's page globals are src-tauri/src/page.rs",
  "output.ts": "paired, but the Rust one is named output.rs — matched below",
};

/**
 * TypeScript modules whose Rust peer is an EFFECT rather than a decision, and
 * therefore lives in the app crate instead of the library one.
 *
 * These are the third file of the three-file platform seam — bridge → provider
 * → platform — and the third file is the only one that talks to Steam. It is
 * genuinely absent from the decision layer, so it cannot be in lib.rs's table;
 * it still has to EXIST, which is what this map checks.
 */
const EFFECTS_PEERS = {
  "cloud-steam.ts": "cloud.rs",
  "achievements-steam.ts": "achievements.rs",
};

/** The peer table in the shell crate's own doc comment IS the source of truth
 * for who pairs with whom, so it is parsed rather than restated. */
function declaredPeers() {
  const lib = read("tauri", "shell", "src", "lib.rs");
  const rows = [...lib.matchAll(/^\/\/! \| \[`(\w+)`\]\s*\| ([^|]+)\|/gm)];
  if (rows.length === 0) {
    throw new Error(
      "no peer rows found in tauri/shell/src/lib.rs — the table moved or " +
        "changed shape, and this checker was about to agree with everything.",
    );
  }
  return rows.map(([, module, peer]) => ({
    module,
    peer: peer.trim().replace(/^`|`$/g, ""),
  }));
}

function modulePeers() {
  const problems = [];
  const declared = declaredPeers();
  const byModule = new Map(declared.map((row) => [row.module, row.peer]));

  const rustModules = readdirSync(join(ROOT, "tauri", "shell", "src"))
    .filter((file) => file.endsWith(".rs") && file !== "lib.rs")
    .map((file) => file.replace(/\.rs$/, ""))
    .sort();
  const tsModules = readdirSync(join(ROOT, "electron", "src"))
    .filter((file) => file.endsWith(".ts"))
    .sort();

  for (const module of rustModules) {
    if (!byModule.has(module)) {
      problems.push(
        `tauri/shell/src/${module}.rs has no row in the peer table in lib.rs — ` +
          "add one saying which question it answers, and which file answers it " +
          "on the other shell.",
      );
    }
  }
  for (const { module } of declared) {
    if (!rustModules.includes(module)) {
      problems.push(
        `the peer table in lib.rs lists \`${module}\`, but ` +
          `tauri/shell/src/${module}.rs does not exist.`,
      );
    }
  }

  // The pairing, in the direction that actually catches a drift: a decision
  // that grew a file on one side and not the other.
  const rows = [];
  for (const module of rustModules) {
    const peer = byModule.get(module) ?? "";
    const named = peer.match(/([\w-]+\.ts)/)?.[1];
    const elsewhere = ANSWERED_ELSEWHERE[module];
    if (named && !tsModules.includes(named)) {
      problems.push(
        `tauri/shell/src/${module}.rs names \`${named}\` as its peer, but ` +
          "electron/src/ has no such file.",
      );
    }
    if (!named && !elsewhere) {
      problems.push(
        `tauri/shell/src/${module}.rs names no peer file. If that is correct, ` +
          "say why in ANSWERED_ELSEWHERE in scripts/shell-parity.mjs.",
      );
    }
    rows.push({
      module: `${module}.rs`,
      peer: named ?? "—",
      note: elsewhere ?? "",
    });
  }

  const pairedTs = new Set(
    declared.flatMap(({ peer }) => peer.match(/([\w-]+\.ts)/g) ?? []),
  );
  const effectsModules = readdirSync(join(ROOT, "tauri", "src-tauri", "src"));
  for (const file of tsModules) {
    const effects = EFFECTS_PEERS[file];
    if (effects) {
      if (!effectsModules.includes(effects)) {
        problems.push(
          `electron/src/${file} names tauri/src-tauri/src/${effects} as its ` +
            "peer, and that file does not exist.",
        );
      } else {
        rows.push({
          module: `src-tauri/${effects}`,
          peer: file,
          note: "an EFFECT — the one file of the seam that talks to Steam",
        });
      }
      continue;
    }
    if (!pairedTs.has(file) && !TS_WITHOUT_PEER[file]) {
      problems.push(
        `electron/src/${file} has no Rust peer and no entry in TS_WITHOUT_PEER ` +
          "in scripts/shell-parity.mjs. A decision that exists on one shell and " +
          "not the other is the drift this whole file is here to catch.",
      );
    }
  }
  return { rows, problems };
}

// ---------------------------------------------------------------------------
// 2. The bridge protocols
// ---------------------------------------------------------------------------

function bridgeProtocols() {
  const problems = [];
  const rust = read("tauri", "shell", "src", "bridge.rs");
  const table = rust.match(/const PROTOCOLS:[^=]+=\s*&\[([\s\S]*?)\n\];/);
  const rustFlags = [...(table?.[1] ?? "").matchAll(/\("(__gis\w+)"/g)].map(
    ([, flag]) => flag,
  );
  // QUIT is routed before the table, because it is the one protocol with no
  // platform behind it.
  if (rust.includes('flagged("__gisQuit")')) rustFlags.push("__gisQuit");

  const main = read("electron", "src", "main.ts");
  const message = main.match(/type BridgeMessage = \{([\s\S]*?)\n\};/);
  const tsFlags = [...(message?.[1] ?? "").matchAll(/(__gis\w+)\?/g)].map(
    ([, flag]) => flag,
  );

  if (rustFlags.length === 0 || tsFlags.length === 0) {
    throw new Error(
      "could not read the bridge protocol list from one of the two shells — " +
        "PROTOCOLS in bridge.rs or BridgeMessage in main.ts moved.",
    );
  }
  for (const flag of rustFlags) {
    if (!tsFlags.includes(flag)) {
      problems.push(
        `${flag} is routed by the Rust shell but not by the Electron one.`,
      );
    }
  }
  for (const flag of tsFlags) {
    if (!rustFlags.includes(flag)) {
      problems.push(
        `${flag} is routed by the Electron shell but not by the Rust one.`,
      );
    }
  }
  return { flags: [...new Set([...rustFlags, ...tsFlags])].sort(), problems };
}

// ---------------------------------------------------------------------------
// 3. The capability switches
// ---------------------------------------------------------------------------

function capabilitySwitches() {
  const problems = [];
  const buildRs = read("tauri", "src-tauri", "build.rs");
  const rust = [...buildRs.matchAll(/"(GIS_ENABLE_\w+)"/g)].map(
    ([, name]) => name,
  );

  const builder = read("electron", "electron-builder.config.cjs");
  const ts = [...builder.matchAll(/enabled\("(\w+)"\)/g)].map(
    ([, name]) => `GIS_ENABLE_${name}`,
  );

  if (rust.length === 0 || ts.length === 0) {
    throw new Error(
      "could not read the capability switches from one of the two packagers.",
    );
  }
  for (const name of new Set([...rust, ...ts])) {
    if (!rust.includes(name)) {
      problems.push(
        `${name} is read by the Electron packager and not by the Rust one.`,
      );
    }
    if (!ts.includes(name)) {
      problems.push(
        `${name} is read by the Rust packager and not by the Electron one.`,
      );
    }
  }
  return { names: [...new Set([...rust, ...ts])].sort(), problems };
}

// ---------------------------------------------------------------------------
// 4. The startup marks
// ---------------------------------------------------------------------------

function startupMarks() {
  const problems = [];
  const rustSource = read("tauri", "shell", "src", "metrics.rs");
  const rustTable = rustSource.match(
    /pub const MARKS:[^=]+=\s*&\[([\s\S]*?)\n\];/,
  );
  // Anchored on the tuple's own opening paren rather than on indentation, so a
  // reformat of either file cannot turn this into a parse that finds nothing.
  const rust = [...(rustTable?.[1] ?? "").matchAll(/\(\s*"([\w-]+)",/g)].map(
    ([, mark]) => mark,
  );

  const tsSource = read("electron", "src", "metrics.ts");
  const tsTable = tsSource.match(
    /export const MARKS[^=]*=\s*\[([\s\S]*?)\n\] as const;/,
  );
  const ts = [...(tsTable?.[1] ?? "").matchAll(/\[\s*"([\w-]+)",/g)].map(
    ([, mark]) => mark,
  );

  if (rust.length === 0 || ts.length === 0) {
    throw new Error(
      "could not read the startup mark vocabulary from one of the two shells.",
    );
  }
  // ORDER matters here as well as membership: the marks are stamped in
  // sequence and a recorder flattens anything that arrives out of it, so two
  // shells that agreed on the set but not the order would silently record
  // different intervals under the same names.
  if (rust.join(",") !== ts.join(",")) {
    problems.push(
      "the startup marks differ between the shells — a mark only one of them " +
        `records is a column the comparison silently loses.\n      tauri:    ${rust.join(", ")}\n      electron: ${ts.join(", ")}`,
    );
  }
  return { marks: rust, problems };
}

// ---------------------------------------------------------------------------
// 5. The roster check's command line
// ---------------------------------------------------------------------------

function rosterFlags() {
  const problems = [];
  const rust = read("tauri", "shell", "src", "roster.rs");
  const ts = read("electron", "src", "roster.ts");
  const flags = ["CHECK_FLAG", "RESTORE_FLAG"];
  const values = {};
  for (const flag of flags) {
    const inRust = rust.match(new RegExp(`${flag}: &str = "(--[\\w-]+)"`))?.[1];
    const inTs = ts.match(new RegExp(`${flag} = "(--[\\w-]+)"`))?.[1];
    if (!inRust || !inTs) {
      throw new Error(`could not read ${flag} from both roster modules.`);
    }
    if (inRust !== inTs) {
      problems.push(
        `${flag} is \`${inRust}\` on the Rust shell and \`${inTs}\` on the ` +
          "Electron one. The whole point is one command spelled the same way on " +
          "both.",
      );
    }
    values[flag] = inRust;
  }
  return { values, problems };
}

// ---------------------------------------------------------------------------
// 6. What only a human can press
// ---------------------------------------------------------------------------

/**
 * The checks a test suite cannot make, and what each one would catch.
 *
 * Authored, because a machine cannot install a bundle and look at it. Each row
 * names the thing that is UNPROVEN without it — a checklist of chores nobody
 * does, a checklist of consequences somebody does.
 */
const BY_HAND = [
  [
    "Install a real bundle and see the game",
    "all three",
    "the packaged resource branch, the macOS dylib in Contents/Frameworks, and " +
      "the nested signature on the bundled Node runtime. CI builds the bundle " +
      "on every dispatch; the one thing a workflow cannot do is press the icon.",
  ],
  [
    "A four-player session at the reference frame budget",
    "all three",
    "the snapshot channel's own measurement. The argument that it costs nothing " +
      'is structural — no shell in the path, no header change — and "it works ' +
      'at 20 Hz with 200 mobs and four players" is a claim only a played ' +
      "session settles.",
  ],
  [
    "A Workshop publish and a subscription",
    "all three",
    "the UGC round trip end to end: a mod compiled by a spawned child, uploaded, " +
      "subscribed to from another account, and loaded into a run.",
  ],
  [
    "Shift+Tab over a Steam-launched build",
    "Windows",
    "the overlay's decoy surface end to end — that Steam's hook finds the swap " +
      "chain, that the sheet is transparent everywhere the overlay does not " +
      "draw, and that closing it gives the keyboard back to the game. The " +
      "decision layer proves only WHETHER the surface is raised; a GPU " +
      "compositing the wrong thing is a thing to look at.",
  ],
  [
    "The microphone gate on WKWebView and WebView2",
    "macOS, Windows",
    "the page-side lockout, which is the whole floor on two of the three " +
      "desktops — WebKitGTK refuses in the platform, the other two remove " +
      "navigator.mediaDevices in the initialization script.",
  ],
  [
    "Cloud save, both ways, with a real roster",
    "all three",
    "that a player switching between the two desktop builds keeps their heroes. " +
      "localStorage belongs to the webview and one engine's store is not " +
      "another's, so the platform cloud is the only bridge. `--roster-check` " +
      "reduces this to one command per build — see docs/desktop-shells.md.",
  ],
  [
    "The webview-quirk sweep",
    "macOS, Windows, Linux",
    "every rendering, audio and input surface the game uses, on an engine that " +
      "is not Chromium. `npm run webview:sweep` runs the same probe headlessly " +
      "wherever a Playwright engine is installed; the rest is the real webview.",
  ],
  [
    "Battery on a handheld",
    "Steam Deck",
    "the one number a desktop cannot stand in for, and the one a smaller idle " +
      "footprint is supposed to buy.",
  ],
];

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function render(sections) {
  const { modules, bridge, capabilities, marks, roster } = sections;
  const table = (head, rows) =>
    [
      `| ${head.join(" | ")} |`,
      `| ${head.map(() => "---").join(" | ")} |`,
      ...rows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");

  return `<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->
<!-- GENERATED by scripts/shell-parity.mjs — do not edit. Run \`npm run parity\`. -->

# Desktop parity

The two desktop builds wrap the same website and answer the same protocols.
Everything that keeps them honest is a PAIR, and every one of those pairs is
invisible when it breaks — nothing fails to compile when one shell grows a
module the other does not have. So the five tables below are **read out of the
source** by [\`scripts/shell-parity.mjs\`](../scripts/shell-parity.mjs) on every
run, and drift is a red build. The last section is authored, because a machine
cannot install a bundle and look at it.

Run \`npm run parity\` to rewrite this file, \`npm run parity:check\` to fail on
drift.

## The decision layer, module by module

${table(
  ["Decision (Rust)", "Peer (TypeScript)", "Note"],
  modules.rows.map((row) => [
    row.module,
    row.peer === "—" ? "—" : row.peer,
    row.note || "",
  ]),
)}

## The bridge protocols

Every flag below is routed by both shells. A protocol added to one and not the
other is a page waiting out a timeout with nothing in the log to explain it.

${bridge.flags.map((flag) => `- \`${flag}\``).join("\n")}

## The capability switches

One vocabulary, two packagers. Both read exactly these, and a build carries only
what something deliberately gave it.

${capabilities.names.map((name) => `- \`${name}\``).join("\n")}

## The cold-start marks

Both shells stamp these, in this order, into \`startup.jsonl\` in their own
user-data directory. The order is part of the contract: a recorder flattens a
mark that arrives out of sequence, so two shells agreeing on the set but not the
order would record different intervals under the same names.

${marks.marks.map((mark, at) => `${at + 1}. \`${mark}\``).join("\n")}

## The roster check

${Object.entries(roster.values)
  .map(([flag, value]) => `- \`${value}\` (${flag})`)
  .join("\n")}

## What only a human with the hardware can press

${table(
  ["Check", "Where", "What is unproven without it"],
  BY_HAND.map(([check, where, why]) => [check, where, why]),
)}
`;
}

/**
 * Run the rendered document through Prettier before anything compares it.
 *
 * NOT a nicety: `make fmt-check` runs Prettier over the whole repo and this
 * file is committed, so a generator that emitted its own idea of a markdown
 * table would put `npm run parity` and `make fmt-check` permanently at odds —
 * running either one would break the other, forever. Formatting here makes the
 * two agree by construction, and it means the column padding of every table
 * below is Prettier's problem rather than this file's.
 */
async function formatted(markdown) {
  return prettier.format(markdown, { parser: "markdown" });
}

async function main() {
  const check = process.argv.includes("--check");
  const sections = {
    modules: modulePeers(),
    bridge: bridgeProtocols(),
    capabilities: capabilitySwitches(),
    marks: startupMarks(),
    roster: rosterFlags(),
  };
  const problems = Object.values(sections).flatMap(
    (section) => section.problems,
  );
  const rendered = await formatted(render(sections));

  if (check) {
    const current = (() => {
      try {
        return read("docs", "desktop-parity.md");
      } catch {
        return "";
      }
    })();
    if (current !== rendered) {
      problems.push(
        "docs/desktop-parity.md is out of date — run `npm run parity`.",
      );
    }
    if (problems.length > 0) {
      console.error(`\n${problems.length} parity problem(s):\n`);
      for (const problem of problems) console.error(`  ✗ ${problem}`);
      console.error("");
      process.exitCode = 1;
      return;
    }
    console.log(
      `✓ desktop parity — ${sections.modules.rows.length} decisions, ` +
        `${sections.bridge.flags.length} protocols, ` +
        `${sections.capabilities.names.length} switches, ` +
        `${sections.marks.marks.length} marks`,
    );
    return;
  }

  writeFileSync(OUT, rendered, "utf8");
  console.log(`✓ docs/desktop-parity.md`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
}

await main();
