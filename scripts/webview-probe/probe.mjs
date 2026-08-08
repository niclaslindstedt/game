// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RUNNING THE INVENTORY, wherever this page happens to be open.
//
// The same module answers both readers: it renders a grid for a human holding a
// real shell on a real machine, and it parks the result on `window.__gisProbe`
// for `../webview-sweep.mjs` to read out of a headless engine. One
// implementation, because a probe that ran differently in the two would make
// the automated half worthless.

import { APIS } from "./apis.mjs";

/** Run one probe. A probe that THROWS is a probe that failed — the game would
 * have thrown in the same place, and an engine that raises on a feature test is
 * exactly the kind of difference this page exists to find. */
function run(api) {
  try {
    return {
      id: api.id,
      group: api.group,
      optional: !!api.optional,
      ok: api.probe() === true,
    };
  } catch (err) {
    return {
      id: api.id,
      group: api.group,
      optional: !!api.optional,
      ok: false,
      threw: String(err && err.message ? err.message : err),
    };
  }
}

const results = APIS.map(run);
const missing = results.filter((result) => !result.ok && !result.optional);
const degraded = results.filter((result) => !result.ok && result.optional);

const report = {
  kind: "adas-trail/webview-probe",
  userAgent: navigator.userAgent,
  results,
  missingCount: missing.length,
  degradedCount: degraded.length,
};

window.__gisProbe = report;

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

const why = new Map(APIS.map((api) => [api.id, api.why]));
const groups = [...new Set(APIS.map((api) => api.group))];

const verdict = document.querySelector("#verdict");
verdict.className =
  missing.length > 0 ? "bad" : degraded.length > 0 ? "warn" : "good";
verdict.textContent =
  missing.length > 0
    ? `${missing.length} REQUIRED feature(s) missing — this engine cannot run the game as built`
    : degraded.length > 0
      ? `everything required is here; ${degraded.length} optional feature(s) absent (the game degrades around each)`
      : "every feature the game reaches for is here";

document.querySelector("#agent").textContent = navigator.userAgent;

const body = document.querySelector("#rows");
for (const group of groups) {
  const heading = document.createElement("tr");
  heading.innerHTML = `<th colspan="3">${group}</th>`;
  body.append(heading);
  for (const result of results.filter((entry) => entry.group === group)) {
    const row = document.createElement("tr");
    const state = result.ok ? "ok" : result.optional ? "warn" : "bad";
    const label = result.ok ? "yes" : result.optional ? "absent" : "MISSING";
    row.innerHTML =
      `<td class="${state}">${label}</td>` +
      `<td><code>${result.id}</code></td>` +
      `<td>${why.get(result.id) ?? ""}${
        result.threw ? `<br><em>threw: ${result.threw}</em>` : ""
      }</td>`;
    body.append(row);
  }
}

// A photograph of this page is how the result leaves a machine that is running
// a real shell, so the headline goes in the title too — a screenshot with the
// window chrome in it then carries the verdict even if the page is scrolled.
document.title = `webview probe — ${missing.length} missing, ${degraded.length} degraded`;
