// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENGRAVED GEOMETRY, MEASURED — every notehead of every shipped score,
// checked against the rules an engraver works to.
//
// WHY MEASURED AND NOT LOOKED AT. `notation_test.ts` beside this one checks that
// the right things get DRAWN; this checks that they are drawn in the right
// PLACE, and place is not a thing an eye can audit at this volume. There are
// eight and a half thousand noteheads in the shipped catalogue. A stem attached
// a pixel off centre, a ledger line that is not centred on its own head, one
// voice's bar a fraction wider than another's — all of them read as "slightly
// wrong somehow" and none of them can be found by looking.
//
// The page is TAGGED for exactly this: every drawn element carries a class and
// the data it was placed from (`class="head" data-note data-at data-cx data-cy`),
// so the test reads the real output rather than a log the renderer kept about
// itself.
//
// EVERY CHECK HERE IS A BUG THAT HAPPENED:
//
//   TWO STEMS ON ONE NOTE. A beam takes ONE direction for its whole group, and
//   the note pass was drawing a stem too — so any note whose own preference
//   disagreed grew a second stem out the other side of its head. An
//   octave-pumping bass had a leg hanging off every other note, and it survived
//   three rounds of me looking straight at it.
//
//   A GRID THAT IS NOT A GRID. Voices are readable against each other only if a
//   given step is the same x on every staff. It is easy to break and invisible
//   until you try to read two lines at once.
//
//   A NOTE OFF ITS PITCH. A head has to sit where its letter and the staff's
//   clef put it, on a line or in a space and never between.

import { describe, expect, it } from "vitest";

import { engraveTrack } from "../../scripts/asset-tools/notation.mjs";
import {
  cookTrack,
  loadMusic,
  type CookedTrack,
} from "../../scripts/music-data/load-yaml.mjs";

const { entries } = loadMusic();
const TRACKS: [string, CookedTrack][] = entries.map((e) => [
  e.id,
  cookTrack(e.doc),
]);

/** One staff space, and the stem's attachment offset — the two constants the
 * page is built on (`notation.mjs`). Restated rather than imported because a
 * measurement that reads its expectations out of the thing it is measuring is
 * not a measurement. */
const SPACE = 8;
const ATTACH = 4.36;
const STEM_LEN = 27.2;

/** Every element of one class, with its attributes. */
function elements(svg: string, cls: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const found =
    svg.match(new RegExp(`<[a-z]+ class="${cls}"[^>]*>`, "g")) ?? [];
  for (const tag of found) {
    const attrs: Record<string, string> = {};
    for (const [, k, v] of tag.matchAll(/([a-z0-9-]+)="([^"]*)"/g))
      attrs[k] = v;
    out.push(attrs);
  }
  return out;
}

const N = (v: string | undefined) => Number(v);
const LETTER: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};
/** A note's diatonic index — what a staff position actually measures. */
function diatonic(token: string): number | null {
  const m = /^([A-G])(#?)(-?\d)$/.exec(token);
  return m ? Number(m[3]) * 7 + (LETTER[m[1] as string] as number) : null;
}

/** Engrave every score once; the checks below all read these. */
const PAGES = await Promise.all(
  TRACKS.map(
    async ([id, track]) =>
      [id, (await engraveTrack(track, { title: id })).svg] as const,
  ),
);

describe("what a note is made of", () => {
  it("attaches every stem to a notehead, at one symmetrical offset", () => {
    for (const [id, svg] of PAGES) {
      const heads = elements(svg, "head");
      const up = new Set<string>();
      const down = new Set<string>();
      for (const stem of elements(svg, "stem")) {
        const x = N(stem.x1);
        const y = N(stem.y1);
        const head = heads.find(
          (h) =>
            Math.abs(N(h["data-cy"]) - y) < 1e-9 &&
            Math.abs(Math.abs(N(h["data-cx"]) - x) - ATTACH) < 1e-9,
        );
        expect(head, `${id}: a stem hangs off no notehead`).toBeDefined();
        const off = (
          x - N((head as Record<string, string>)["data-cx"])
        ).toFixed(4);
        (stem["data-up"] === "1" ? up : down).add(off);
      }
      expect(
        [...up],
        `${id}: up-stems attach at more than one offset`,
      ).toHaveLength(up.size ? 1 : 0);
      expect([...down], `${id}: down-stems attach inconsistently`).toHaveLength(
        down.size ? 1 : 0,
      );
      if (up.size && down.size) {
        expect(
          Number([...up][0]) + Number([...down][0]),
          `${id}: the stem is not attached symmetrically`,
        ).toBeCloseTo(0, 9);
      }
    }
  });

  it("gives each stemmed note EXACTLY ONE stem", () => {
    // The leg-hanging bug, stated as arithmetic. A beam group re-stems its
    // notes, so anything that also stems them in the note pass shows up here
    // as a surplus.
    for (const [id, svg] of PAGES) {
      const stemmed = elements(svg, "head").filter(
        (h) => h["data-kind"] !== "whole",
      ).length;
      expect(elements(svg, "stem").length, `${id}`).toBe(stemmed);
    }
  });

  it("draws every unbeamed stem the same length", () => {
    for (const [id, svg] of PAGES) {
      const plain = new Set(
        elements(svg, "stem")
          .map((s) => Math.abs(N(s.y2) - N(s.y1)))
          .filter((l) => l <= STEM_LEN + 0.05)
          .map((l) => l.toFixed(3)),
      );
      expect([...plain], `${id}: unbeamed stems vary in length`).toHaveLength(
        plain.size ? 1 : 0,
      );
    }
  });

  it("centres every ledger line on its notehead, all the same width", () => {
    for (const [id, svg] of PAGES) {
      const heads = elements(svg, "head");
      const widths = new Set<string>();
      for (const led of elements(svg, "ledger")) {
        const cx = (N(led.x1) + N(led.x2)) / 2;
        widths.add((N(led.x2) - N(led.x1)).toFixed(3));
        const near = heads.reduce((best, h) =>
          Math.abs(N(h["data-cx"]) - cx) < Math.abs(N(best["data-cx"]) - cx)
            ? h
            : best,
        );
        expect(
          cx - N(near["data-cx"]),
          `${id}: a ledger line is not centred on its notehead`,
        ).toBeCloseTo(0, 9);
      }
      expect([...widths], `${id}: ledger lines vary in width`).toHaveLength(
        widths.size ? 1 : 0,
      );
    }
  });
});

describe("where a note sits", () => {
  it("puts every head on a line or a space of its own staff", () => {
    for (const [id, svg] of PAGES) {
      const tops = elements(svg, "staffline")
        .filter((l) => l["data-line"] === "0")
        .map((l) => ({ lane: l["data-lane"] as string, y: N(l.y1) }));
      for (const head of elements(svg, "head")) {
        const cy = N(head["data-cy"]);
        const staff = tops
          .filter((t) => t.lane === head["data-lane"])
          .reduce((b, t) =>
            Math.abs(t.y + 2 * SPACE - cy) < Math.abs(b.y + 2 * SPACE - cy)
              ? t
              : b,
          );
        const half = (staff.y + 4 * SPACE - cy) / (SPACE / 2);
        expect(
          half,
          `${id}: a head sits between a line and a space`,
        ).toBeCloseTo(Math.round(half), 9);
      }
    }
  });

  it("puts every head where its PITCH and its clef say", () => {
    // A percussion staff is exempt, and has to be: a kick built out of a
    // triangle carries a real pitch and is drawn on the middle line anyway,
    // because a drum staff measures rhythm rather than height.
    for (const [id, svg] of PAGES) {
      const tops = elements(svg, "staffline")
        .filter((l) => l["data-line"] === "0")
        .map((l) => ({ lane: l["data-lane"] as string, y: N(l.y1) }));
      for (const head of elements(svg, "head")) {
        if (head["data-clef"] === "percussion") continue;
        const step = diatonic(head["data-note"] as string);
        if (step === null) continue;
        const cy = N(head["data-cy"]);
        const staff = tops
          .filter((t) => t.lane === head["data-lane"])
          .reduce((b, t) =>
            Math.abs(t.y + 2 * SPACE - cy) < Math.abs(b.y + 2 * SPACE - cy)
              ? t
              : b,
          );
        const half = Math.round((staff.y + 4 * SPACE - cy) / (SPACE / 2));
        // The bottom line the position implies must be a clef we actually draw:
        // treble sits on E4, bass on G2.
        expect(
          [4 * 7 + LETTER.E, 2 * 7 + LETTER.G],
          `${id}: ${head["data-note"]} is drawn at a position no clef puts it`,
        ).toContain(step - half);
      }
    }
  });
});

describe("the spacing", () => {
  it("lays every bar out on one step grid, and every bar the same width", () => {
    for (const [id, svg] of PAGES) {
      const bySystem = new Map<string, Record<string, string>[]>();
      for (const head of elements(svg, "head")) {
        const key = head["data-sys"] as string;
        if (!bySystem.has(key)) bySystem.set(key, []);
        (bySystem.get(key) as Record<string, string>[]).push(head);
      }
      for (const [sys, heads] of bySystem) {
        const bars = new Map<number, Record<string, string>[]>();
        for (const head of heads) {
          const bar = Math.floor(N(head["data-at"]) / 16);
          if (!bars.has(bar)) bars.set(bar, []);
          (bars.get(bar) as Record<string, string>[]).push(head);
        }
        // THE STEP IS DERIVED from two heads at known positions, never guessed
        // at from the smallest gap that happens to be there: a bar whose
        // sparsest pair is six steps apart has no 16th-wide gap in it anywhere.
        let step: number | null = null;
        for (const inBar of bars.values()) {
          const seen = [
            ...new Map(inBar.map((h) => [h["data-at"], h])).values(),
          ];
          if (seen.length < 2) continue;
          seen.sort((a, b) => N(a["data-at"]) - N(b["data-at"]));
          step =
            (N(seen[1]?.["data-cx"]) - N(seen[0]?.["data-cx"])) /
            (N(seen[1]?.["data-at"]) - N(seen[0]?.["data-at"]));
          break;
        }
        if (step === null) continue;
        const starts: number[] = [];
        for (const bar of [...bars.keys()].sort((a, b) => a - b)) {
          const inBar = bars.get(bar) as Record<string, string>[];
          const first = inBar.reduce((b, h) =>
            N(h["data-at"]) < N(b["data-at"]) ? h : b,
          );
          const base =
            N(first["data-cx"]) - (N(first["data-at"]) % 16) * (step as number);
          starts.push(base);
          for (const head of inBar) {
            expect(
              N(head["data-cx"]),
              `${id} system ${sys}: a head is off the step grid`,
            ).toBeCloseTo(
              base + (N(head["data-at"]) % 16) * (step as number),
              6,
            );
          }
        }
        const widths = new Set(
          starts.slice(1).map((v, i) => (v - (starts[i] as number)).toFixed(3)),
        );
        expect(
          [...widths],
          `${id} system ${sys}: bars differ in width`,
        ).toHaveLength(widths.size ? 1 : 0);
      }
    }
  });

  it("puts the same step in the same column on every staff", () => {
    // The whole reason a score is stacked: a chord change, a kick and a melody
    // note that happen together have to be readable as one vertical moment.
    for (const [id, svg] of PAGES) {
      const columns = new Map<string, Set<string>>();
      for (const head of elements(svg, "head")) {
        const key = `${head["data-sys"]}:${head["data-at"]}`;
        if (!columns.has(key)) columns.set(key, new Set());
        (columns.get(key) as Set<string>).add(N(head["data-cx"]).toFixed(4));
      }
      for (const [key, xs] of columns) {
        expect(
          [...xs],
          `${id}: voices disagree about the column for step ${key}`,
        ).toHaveLength(1);
      }
    }
  });
});
