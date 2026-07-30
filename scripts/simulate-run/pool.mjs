// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The campaign simulator's MATRIX worker pool.
//
// A matrix run (`--strategy all --class all`) is dozens of INDEPENDENT
// campaigns: each spec chains its own hero through its own difficulty ladder,
// and a spec's report is byte-identical whether it ran alone or beside others
// (nothing in the engine carries state between campaigns — every per-tick
// cache revalidates against the state it is handed). Running them one after
// another therefore left every core but one idle on the simulator's single
// longest workload, which is exactly the sweep a balance pass repeats all day.
//
// This spreads them over worker threads, each with a private copy of the
// engine, and hands the reports back IN COMBO ORDER so the rendered matrix is
// identical to the sequential one. Determinism is untouched: no work is
// split, only scheduled — one campaign still runs start-to-finish on one
// thread, from the same seed, as the same deterministic sequence of steps.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(here, "campaign-worker.mjs");

/**
 * Run `tasks` (each a partial campaign-options object merged over `base`)
 * across at most `jobs` worker threads. Resolves to the reports in task order.
 *
 * `onProgress(done, total)` is called as each campaign lands — a matrix sweep
 * runs for minutes, so it is worth saying so.
 *
 * `mods` are the mod folders the sweep is measuring (see
 * scripts/mod-support.mjs). They travel to every worker rather than being
 * applied here, because a worker's engine is its OWN module graph: a registry
 * merged on this thread is invisible to it, and the sweep would silently
 * measure the shipped game instead.
 */
export async function runCampaigns({ base, tasks, jobs, mods, onProgress }) {
  const total = tasks.length;
  const reports = new Array(total);
  const workerCount = Math.max(1, Math.min(jobs, total));

  let next = 0;
  let done = 0;

  return await new Promise((resolve, reject) => {
    const workers = [];
    let settled = false;

    const shutdown = () => {
      for (const worker of workers) void worker.terminate();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      shutdown();
      reject(error);
    };

    const feed = (worker) => {
      if (next >= total) {
        worker.postMessage({ kind: "stop" });
        return;
      }
      const index = next++;
      worker.postMessage({ kind: "run", index, options: tasks[index] });
    };

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(WORKER, { workerData: { base, mods } });
      workers.push(worker);
      worker.on("message", (msg) => {
        if (msg.kind === "ready") {
          feed(worker);
          return;
        }
        if (msg.kind === "failed") {
          const error = new Error(
            `simulate-run: a matrix campaign failed — ${msg.message}`,
          );
          error.stack = msg.stack ?? error.stack;
          fail(error);
          return;
        }
        reports[msg.index] = msg.report;
        done++;
        onProgress?.(done, total);
        if (done === total) {
          if (settled) return;
          settled = true;
          shutdown();
          resolve(reports);
          return;
        }
        feed(worker);
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        // A worker that exits before the sweep finishes took its task with it;
        // a clean exit after `stop` is expected and says nothing.
        if (code !== 0 && !settled) {
          fail(new Error(`simulate-run: a matrix worker exited with ${code}`));
        }
      });
    }
  });
}
