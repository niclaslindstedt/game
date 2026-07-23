// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The map-layout palette + the WoW-style CON ramp: every colour the render
// uses, and the mob-level-vs-intended-hero-level → difficulty-colour mapping
// (grey trivial → green → yellow even → orange → red brutal).

// ---- palette ---------------------------------------------------------------
export const C = {
  bg: [16, 16, 20, 255],
  ground: [44, 42, 52, 255],
  groundZone: [58, 54, 70, 255],
  panel: [26, 26, 32, 255],
  panelEdge: [70, 70, 84, 255],
  ink: [236, 236, 240, 255],
  dim: [168, 168, 180, 255],
  faint: [120, 120, 132, 255],
  grid: [255, 255, 255, 20],
  gridMajor: [255, 255, 255, 46],
  axis: [150, 150, 165, 255],
  wall: [136, 134, 148, 255],
  wallJump: [156, 156, 110, 255],
  building: [150, 106, 66, 255], // solid town buildings (box footprints)
  buildingEdge: [92, 66, 42, 255],
  door: [230, 200, 90, 255],
  well: [186, 120, 234, 255],
  path: [90, 200, 255, 255],
  spawn: [96, 236, 130, 255], // START
  merchant: [86, 216, 220, 255],
  chest: [250, 200, 90, 255],
  landmark: [186, 190, 206, 255],
  item: [128, 236, 158, 255],
  exit: [250, 96, 96, 255],
  shape: [196, 198, 210, 255], // neutral, for legend shapes whose colour = con
  section: [236, 132, 214, 255],
  safe: [80, 210, 130, 80],
  quiet: [150, 110, 220, 80],
  zoneEdge: [220, 220, 232, 170],
  coord: [128, 132, 150, 255],
  stuck: [255, 64, 216, 255], // highlight markers (nothing else on the map is this)
  death: [255, 40, 40, 255], // death markers — hotter than the exit/brutal reds
};

// WoW-style CON ramp: mob level minus intended hero level → difficulty colour.
export const CON_STOPS = [
  [-99, [132, 134, 142], "TRIVIAL"], // grey
  [-4, [104, 202, 112], "EASY"], // green
  [-1, [228, 208, 90], "EVEN"], // yellow
  [2, [240, 152, 62], "TOUGH"], // orange
  [5, [238, 82, 82], "BRUTAL"], // red
];
export function conColor(con) {
  if (con == null) return C.shape;
  let col = CON_STOPS[0][1];
  for (const [lo, c] of CON_STOPS) if (con >= lo) col = c;
  return [...col, 255];
}

export const DIFF_IDX = { easy: 0, medium: 1, hard: 2, nightmare: 3 };
export const bandMid = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);
