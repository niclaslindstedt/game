// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One worker thread of the campaign simulator's MATRIX pool (see pool.mjs).
// It owns a private copy of the engine — its own module graph, its own
// per-tick caches, its own balance tuning — and simulates whole campaigns on
// demand, posting each finished report back to the parent.
//
// Matrix combos are independent by construction (a spec's report is
// byte-identical whether it ran alone or beside others), which is what makes
// this safe: nothing here coordinates with the other workers, and each
// campaign is deterministic in its own options.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

// The engine uses the @game/lib alias at runtime — map it before importing,
// exactly as the entry script does on the main thread.
register("../game-alias-loader.mjs", import.meta.url);

// The MODS this sweep is measuring, compiled and registered into THIS thread's
// engine before any campaign runs (see the note in pool.mjs — each worker owns
// its own module graph, so each one has to load them for itself).
const { applyMods } = await import(path.join(root, "scripts/mod-support.mjs"));
await applyMods(workerData.mods, { quiet: true });

const { simulateCampaign } = await import(
  path.join(root, "engine/sim/simulate.ts")
);

const port = parentPort;
if (!port) throw new Error("campaign-worker: no parent port");

// Loading the engine costs a beat; tell the pool we are ready for work only
// once the catalogs are in.
port.postMessage({ kind: "ready" });

port.on("message", (msg) => {
  if (msg.kind === "stop") {
    port.close();
    return;
  }
  try {
    const report = simulateCampaign({ ...workerData.base, ...msg.options });
    port.postMessage({ kind: "done", index: msg.index, report });
  } catch (error) {
    port.postMessage({
      kind: "failed",
      index: msg.index,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
});
