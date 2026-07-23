// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Overlays for the map-layout renderer: the --highlight / --highlight-file
// STUCK-AREA markers, the --deaths death markers (both fed by simulate-run's
// dumps), and the --seed scattered-obstacle underlay drawn from a live
// `createGame` state.

import { readFileSync } from "node:fs";

import {
  drawLine,
  fillCircle,
  fillRect,
  strokeCircle,
  strokeRect,
} from "../asset-tools/surface.mjs";

import { C } from "./palette.mjs";
import { wx, wy } from "./canvas.mjs";
import { queueLabel } from "./draw-map.mjs";
import { engine } from "./engine.mjs";

/**
 * Resolve the requested highlight markers for `levelId`: inline `x,y[:label]`
 * pairs (`;`-separated), plus a JSON file that is either a plain array of
 * {x, y, label?, count?} / [x, y] entries, or a simulate-run --json dump
 * (single-campaign {runs: […]} or matrix [{report: {runs}}]) — dump runs
 * matching this level contribute their stuck.areas, labelled by difficulty.
 */
export function parseHighlights(opts, levelId) {
  const out = [];
  const pushCoord = (e) => {
    if (Array.isArray(e)) {
      const [x, y] = e.map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
      return;
    }
    const x = Number(e?.x);
    const y = Number(e?.y);
    if (Number.isFinite(x) && Number.isFinite(y))
      out.push({ x, y, label: e.label, count: e.count });
  };
  const pushRuns = (runs) => {
    for (const run of runs ?? []) {
      if (run.levelId !== levelId) continue;
      for (const a of run.stuck?.areas ?? [])
        out.push({ x: a.x, y: a.y, count: a.count, label: run.difficulty });
    }
  };
  if (opts.highlight) {
    for (const part of String(opts.highlight).split(";")) {
      const [xy, label] = part.split(":");
      const [x, y] = (xy ?? "").split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, label });
      else console.warn(`--highlight: skipping unparsable entry "${part}"`);
    }
  }
  if (opts.highlightFile) {
    const data = JSON.parse(readFileSync(opts.highlightFile, "utf8"));
    if (Array.isArray(data)) {
      for (const e of data) {
        if (e?.report?.runs) pushRuns(e.report.runs);
        else pushCoord(e);
      }
    } else if (data?.runs) {
      pushRuns(data.runs);
    } else {
      pushCoord(data);
    }
  }
  return out;
}

/**
 * Resolve the requested DEATH markers for `levelId`: inline `x,y[:label]`
 * pairs from --deaths (the label split on the FIRST colon only, so a
 * `hazard:asteroid` cause survives intact), plus a simulate-run --json dump
 * passed via --highlight-file — matching runs contribute their
 * `deathLog.areas`, each labelled with the area's dominant killer (prefixed
 * by difficulty when the dump spans several).
 */
export function parseDeaths(opts, levelId) {
  const out = [];
  if (opts.deaths) {
    for (const part of String(opts.deaths).split(";")) {
      const sep = part.indexOf(":");
      const xy = sep >= 0 ? part.slice(0, sep) : part;
      const label = sep >= 0 ? part.slice(sep + 1) : undefined;
      const [x, y] = xy.split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, label });
      else console.warn(`--deaths: skipping unparsable entry "${part}"`);
    }
  }
  if (opts.highlightFile) {
    const data = JSON.parse(readFileSync(opts.highlightFile, "utf8"));
    const pushRuns = (runs) => {
      for (const run of runs ?? []) {
        if (run.levelId !== levelId) continue;
        for (const a of run.deathLog?.areas ?? []) {
          const top = Object.entries(a.causes ?? {}).sort(
            ([, m], [, n]) => n - m,
          )[0];
          out.push({
            x: a.x,
            y: a.y,
            count: a.count,
            label: [run.difficulty, top?.[0]].filter(Boolean).join(" "),
          });
        }
      }
    };
    if (Array.isArray(data)) {
      for (const e of data) if (e?.report?.runs) pushRuns(e.report.runs);
    } else if (data?.runs) {
      pushRuns(data.runs);
    }
  }
  return out;
}

/** Draw the death markers: a † (grave cross) in a translucent disc (area ∝
 * deaths in the cluster), labelled D1, D2, … with the killer — drawn at the
 * same TOP priority as highlights: when deaths are on the render, "where and
 * why does the bot die?" is the question being asked. */
export function drawDeaths(c, deaths) {
  const { surf } = c;
  deaths.forEach((d, i) => {
    const px = wx(c, d.x);
    const py = wy(c, d.y);
    const r = Math.round(
      Math.min(18, 7 + Math.sqrt(Math.max(1, d.count ?? 1)) * 1.6),
    );
    fillCircle(surf, px, py, r, [C.death[0], C.death[1], C.death[2], 56]);
    strokeCircle(surf, px, py, r, C.death, 1);
    drawLine(surf, px, py - 5, px, py + 5, C.death, 2);
    drawLine(surf, px - 3, py - 2, px + 3, py - 2, C.death, 2);
    const name = d.label ? `D${i + 1} ${d.label}` : `D${i + 1}`;
    queueLabel(c, px, py, name, C.death, 6, r, d);
  });
}

/** Draw the highlight markers: an X in a translucent disc (area ∝ count, like
 * the con discs), labelled X1, X2, … at TOP priority — when highlights are on
 * the render, they are the thing being looked at. */
export function drawHighlights(c, highlights) {
  const { surf } = c;
  highlights.forEach((h, i) => {
    const px = wx(c, h.x);
    const py = wy(c, h.y);
    const r = Math.round(
      Math.min(18, 7 + Math.sqrt(Math.max(1, h.count ?? 1)) * 1.6),
    );
    fillCircle(surf, px, py, r, [C.stuck[0], C.stuck[1], C.stuck[2], 56]);
    strokeCircle(surf, px, py, r, C.stuck, 1);
    drawLine(surf, px - 4, py - 4, px + 4, py + 4, C.stuck, 2);
    drawLine(surf, px - 4, py + 4, px + 4, py - 4, C.stuck, 2);
    const name = h.label ? `X${i + 1} ${h.label}` : `X${i + 1}`;
    queueLabel(c, px, py, name, C.stuck, 6, r, h);
  });
}

export async function drawObstacles(c, seed, difficulty) {
  const { createGame } = await import(engine("src/index.ts"));
  const state = createGame(seed, c.def.id, difficulty);
  const { surf } = c;
  for (const o of state.obstacles) {
    const cx = wx(c, o.pos.x);
    const cy = wy(c, o.pos.y);
    const hw = Math.max(1.5, (o.half ? o.half.x : o.radius) * c.S);
    const hh = Math.max(1.5, (o.half ? o.half.y : o.radius) * c.S);
    if (o.chest) continue;
    if (o.jumpable)
      strokeRect(
        surf,
        cx - hw,
        cy - hh,
        hw * 2,
        hh * 2,
        [150, 150, 128, 200],
        1,
      );
    else fillRect(surf, cx - hw, cy - hh, hw * 2, hh * 2, [120, 118, 132, 255]);
  }
}
