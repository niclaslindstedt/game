// Town-layout helper: prints the `buildings:` YAML block for EASTWORLD's Main
// Street — two rows of frontier buildings lining a tight central lane, TILED
// west→east from the gate to the compound so the whole street is built up, with
// alley gaps between buildings and deliberate WIDE openings where the hero dips
// off the street (north to the SALOON/merchant, south to the CORRAL).
// Deterministic. Paste the output into eastworld.yaml.
//
// Run: `node scripts/gen-eastworld-town.mjs`

// Building footprints (must match the sprite sizes in sprites/eastworld/).
const B = {
  saloon: [60, 60],
  church: [44, 60],
  bank: [52, 44],
  hotel: [68, 48],
  general_store: [52, 40],
  sheriff_office: [44, 36],
  barn: [60, 52],
  house_3x2: [48, 32],
  house_4x3: [64, 48],
  house_5x3: [80, 48],
};

// The lane is deliberately NARROWER than the phone view is tall (~195 world px)
// so the buildings FRAME the street on both sides while the hero walks it — the
// claustrophobic Main Street read. Centred on y800.
const LANE_TOP = 745; // north edge of Main Street
const LANE_BOT = 855; // south edge of Main Street
const START_X = 940; // just past the town gate
const END_X = 2400; // up to the compound fence
const GAP = 32; // alley width between neighbouring buildings
const OPENING = 150; // width of a deliberate off-street plaza gap

// The repeating façade patterns for each side — a frontier mix, landmarks
// sprinkled through filler houses. Tiled until the row reaches END_X.
const NORTH = [
  "general_store",
  "house_3x2",
  "sheriff_office",
  "house_4x3",
  "hotel",
  "house_3x2",
  "bank",
  "house_4x3",
  "house_3x2",
  "house_5x3",
  "church",
];
const SOUTH = [
  "house_5x3",
  "house_3x2",
  "house_4x3",
  "house_3x2",
  "general_store",
  "house_5x3",
  "house_4x3",
  "house_3x2",
  "house_4x3",
  "house_5x3",
  "house_3x2",
];

// Small deterministic setback so a row isn't a ruler-straight line.
const setbacks = [0, 8, 3, 12, 5, 10];

// Lay a side's row: tile its pattern from START_X to END_X, dropping a building
// wherever it fits, but SKIP any building that would straddle the opening
// centred at `openAt` (leaving the plaza gap clear).
function row(side, pattern, openAt) {
  const out = [];
  let x = START_X;
  let i = 0;
  while (x < END_X) {
    const name = pattern[i % pattern.length];
    const [w, h] = B[name];
    const cx = x + w / 2;
    const straddlesOpening = Math.abs(cx - openAt) < OPENING / 2 + w / 2;
    if (straddlesOpening) {
      x = openAt + OPENING / 2; // jump past the plaza, resume the row
      continue;
    }
    if (cx + w / 2 > END_X) break;
    const setback = setbacks[out.length % setbacks.length];
    const y =
      side === "n" ? LANE_TOP - h / 2 - setback : LANE_BOT + h / 2 + setback;
    out.push({ sprite: name, x: Math.round(cx), y: Math.round(y), w, h });
    x = cx + w / 2 + GAP;
    i++;
  }
  return out;
}

const buildings = [];
buildings.push(...row("n", NORTH, 1660)); // opening north → SALOON
buildings.push(...row("s", SOUTH, 1980)); // opening south → CORRAL

// Landmark buildings placed by hand (off the rows):
// THE SALOON — the merchant's safe-zone anchor, set back just north off the
// street (a short dip up through the north opening for the restock).
buildings.push({ sprite: "saloon", x: 1660, y: 590, w: 60, h: 60 });
// THE BARN / livery — anchors the CORRAL chest pocket in the south.
buildings.push({ sprite: "barn", x: 1980, y: 1330, w: 60, h: 52 });

// Emit YAML.
const lines = ["buildings:"];
for (const b of buildings) {
  lines.push(`  - sprite: ${b.sprite}`);
  lines.push(`    pos: { x: ${b.x}, y: ${b.y} }`);
  lines.push(`    w: ${b.w}`);
  lines.push(`    h: ${b.h}`);
}
console.log(lines.join("\n"));
console.error(
  `# ${buildings.length} buildings (${buildings.filter((b) => b.y < LANE_TOP).length} north row)`,
);
