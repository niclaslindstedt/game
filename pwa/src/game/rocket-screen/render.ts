// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PICTURE — the climb out of the night sky into space, and the drop onto
// the regolith, painted around the sim every frame.
//
// THE SKY IS THE ALTIMETER. The launch is at night (the cutscene's lawn), so
// the climb is the world going BLACK in stages, each one a height the eye can
// read: the LAWN first — the burnt house and the charred trees right below,
// because the flight opens ~100 m up and must LOOK it — then the night's
// clouds whipping past, then the stars thickening, then the planet's limb
// finally curving in near the top, and by the shell's top there is nothing
// left but space and the company's garbage. A player who never reads a dial
// still knows how high they are, which is the whole job of a background — and
// the one mistake this file must not make is showing the curve of the Earth
// to a ship that has barely cleared its own garden.
//
// EVERYTHING HERE READS THE SAME CAMERA (`SkyCamera`) the fx layer draws on,
// shaken as one — the drive's rule, for the drive's reason.

import {
  FLIGHT,
  airFrac,
  flightAltFrac,
  flightCoursePx,
  type FlightState,
} from "@game/core";

import { spriteByName, type GameAssets } from "../assets.ts";
import { drawPlume, type RocketExhaust } from "../render/rocket-exhaust.ts";
import { orbitSprite } from "./orbit-art.ts";
import { toScreen, type HullSmear, type SkyCamera } from "./rocket-fx.ts";
import { stormIntensity } from "./storm.ts";

/** Where the frame stands over the sim. The ship rides the lower third on the
 * climb (the danger is above) and the upper half on the drop (the danger is
 * below); near the regolith the camera plants itself so the ground arrives
 * instead of the frame chasing it. */
export function flightCamera(
  state: FlightState,
  viewW: number,
  viewH: number,
): SkyCamera {
  const { craft } = state;
  const halfSpan = Math.min(viewW, FLIGHT.fieldW);
  if (state.phase === "landing") {
    // The drop is a bounded stage, so its camera still respects the ground's
    // edges; the ground settles at 82% of the frame — ABOVE the console,
    // because the regolith and the marked pad are the whole game down here
    // and chrome must not be able to stand in front of the target.
    const x = Math.max(
      0,
      Math.min(FLIGHT.fieldW - halfSpan, craft.x - halfSpan / 2),
    );
    return { x, topAlt: Math.max(viewH * 0.82, craft.alt + viewH * 0.42) };
  }
  // The climb's sky has NO edges — the camera simply follows the ship, which
  // is also how the world-anchored clouds, stars and launch site get to say
  // "you are drifting off course" without a single extra drawing.
  // 0.72, not the middle: at climb speed the sky above the nose is the whole
  // of the player's warning, and every extra row of it is reaction time.
  return { x: craft.x - viewW / 2, topAlt: craft.alt + viewH * 0.72 };
}

/** The night → space ramp, sampled at one altitude fraction. */
function skyColor(frac: number): string {
  // Garage night (#0e1020) down low, void (#070911) up top, via a barely
  // bluer stratosphere band — the whole ramp stays dark on purpose: the
  // launch was at night and the stars have to be able to arrive.
  const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const t = Math.min(1, Math.max(0, frac));
  const r = mix(0x12, 0x07, t);
  const g = mix(0x16, 0x09, t);
  const b = mix(0x2c, 0x11, t);
  return `rgb(${r},${g},${b})`;
}

/** A cheap integer hash for the star scatter — the sky's dressing must not
 * spend anybody's stream. */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

const STAR_CELL = 48;

/**
 * The starfield — hashed per world cell, drifting with a light parallax, and
 * FADED IN with altitude: the low sky has weather in it, the high sky is
 * nothing else.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  cam: SkyCamera,
  viewW: number,
  viewH: number,
  altFrac: number,
): void {
  // Near the ground the night has weather in it and the scatter stays shy;
  // the high sky is nothing else.
  const alpha = 0.12 + 0.88 * altFrac;
  for (const layer of [0.35, 0.7] as const) {
    const offY = cam.topAlt * layer;
    const x0 = Math.floor(cam.x / STAR_CELL) - 1;
    const y0 = Math.floor((offY - viewH) / STAR_CELL) - 1;
    for (let cy = y0; cy < y0 + viewH / STAR_CELL + 3; cy++) {
      for (let cx = x0; cx < x0 + viewW / STAR_CELL + 3; cx++) {
        const roll = hash2(cx ^ (layer * 1000), cy);
        if (roll > 0.72) continue;
        const sx = cx * STAR_CELL + roll * STAR_CELL - cam.x;
        const sy = offY - (cy * STAR_CELL + hash2(cy, cx) * STAR_CELL);
        if (sx < -2 || sx > viewW + 2 || sy < -2 || sy > viewH + 2) continue;
        const bright = hash2(cx * 7, cy * 3);
        ctx.globalAlpha = alpha * (0.3 + bright * 0.7);
        ctx.fillStyle = bright > 0.8 ? "#f4f4f4" : "#8b93a4";
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * THE LAUNCH SITE — the lawn the cutscene just lifted off, drawn at alt 0 so
 * the first frame IS the first frame of the trip: the burnt house with its
 * garage bay hard beside the pad, the charred trees, the scorch under the
 * ship, and the night lawn going ordinary further out. It sinks off the
 * bottom of the frame inside the opening seconds, which is exactly the point
 * — the ground being RIGHT THERE and then visibly leaving is what makes 100 m
 * read as 100 m instead of as space.
 */
function drawLaunchSite(
  ctx: CanvasRenderingContext2D,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  viewW: number,
  viewH: number,
  nowMs: number,
): void {
  const groundY = cam.topAlt; // alt 0
  // Gone once even the tallest tree (2× scale) is under the frame's edge.
  if (groundY > viewH + 70) return;
  const padX = FLIGHT.fieldW / 2; // where the ship lifted from

  // The lot's soil (the cutscene lawn's own colour, so the cut lands on the
  // ground it left), then a row of lawn along the line: scorched only where
  // the ship stood, ash right around it, GREEN everywhere else — the scene's
  // rule, "the far end of the lot never had a rocket lit on it".
  ctx.fillStyle = "#20281c";
  const soilTop = Math.max(0, groundY);
  if (soilTop < viewH) ctx.fillRect(0, soilTop, viewW, viewH - soilTop);
  const firstTile = Math.floor((cam.x - 16) / 16) * 16;
  for (let wx = firstTile; wx < cam.x + viewW + 16; wx += 16) {
    const d = Math.abs(wx + 8 - padX);
    const flip = (wx / 16) & 1;
    const name =
      d < 50
        ? `grass_charred_${flip}`
        : d < 90
          ? `grass_ashen_${flip}`
          : `grass_${flip}`;
    const tile = spriteByName(sprites, name);
    if (!tile) continue;
    const s = toScreen(cam, wx, 0);
    ctx.drawImage(tile, s.x, s.y, 16, 16);
  }

  // THE ROAD the lot fronts onto — the cutscene's own two lanes, laid below
  // the lawn line so the cut keeps the whole stage: house, lawn, road.
  const roadLane = spriteByName(sprites, "road_lane");
  if (roadLane) {
    const firstLane = Math.floor((cam.x - 56) / 56) * 56;
    for (let wx = firstLane; wx < cam.x + viewW + 56; wx += 56) {
      const s = toScreen(cam, wx, 0);
      if (s.y + 22 > viewH) continue;
      ctx.drawImage(roadLane, s.x, s.y + 22);
    }
  }

  // Night over the ground: the lawn tiles are the hub's daylight art, and the
  // cutscene's lawn is dark — one wash brings the whole strip to its night.
  ctx.fillStyle = "rgba(8,10,18,0.38)";
  ctx.fillRect(0, soilTop, viewW, Math.max(0, viewH - soilTop));

  // THE TREELINE ON THE HORIZON — hashed 1× silhouettes along the whole
  // ground line beyond the lot: the same IN-LEAF trees the cutscene's first
  // launch stands among (the char is what LATER fires leave, and this climb
  // is happening while the first one burns).
  const TREES = ["garage_tree", "lawn_tree"] as const;
  const firstTree = Math.floor((cam.x - 48) / 48) * 48;
  for (let wx = firstTree; wx < cam.x + viewW + 48; wx += 48) {
    if (wx > padX - 240 && wx < padX + 180) continue; // the lot's own ground
    const cell = wx / 48;
    if (hash2(cell * 3 + 5, 11) > 0.7) continue;
    const tree = spriteByName(
      sprites,
      TREES[Math.floor(hash2(cell, 29) * TREES.length) % TREES.length]!,
    );
    if (!tree) continue;
    const s = toScreen(cam, wx + hash2(cell, 3) * 30, 0);
    ctx.drawImage(tree, s.x, s.y - tree.height + 2);
  }

  // The dressing, at 2× so the lot reads at a glance from a climbing camera —
  // the house's garage end sits beside the pad, as close as a man rolls a
  // thing he built in there.
  const props: readonly (readonly [string, number])[] = [
    ["garage_tree", padX - 184],
    ["garage_house_burnt", padX - 132],
    ["garage_tree", padX + 46],
    ["lawn_tree", padX + 124],
  ];
  for (const [name, wx] of props) {
    const sprite = spriteByName(sprites, name);
    if (!sprite) continue;
    const s = toScreen(cam, wx, 0);
    ctx.drawImage(
      sprite,
      s.x,
      s.y - sprite.height * 2 + 2,
      sprite.width * 2,
      sprite.height * 2,
    );
  }

  // THE HOUSE IS STILL BURNING — the launch just lit it, and the game takes
  // over while it burns: flames out of the garage end's roof holes, smoke off
  // the worse one, and a firelight glow the rain does not put out.
  const houseLeft = padX - 132;
  const glow = toScreen(cam, houseLeft + 70, 0);
  const flicker = 0.16 + 0.07 * Math.sin(nowMs / 90 + Math.sin(nowMs / 37));
  const fire = ctx.createRadialGradient(
    glow.x,
    glow.y - 30,
    4,
    glow.x,
    glow.y - 30,
    70,
  );
  fire.addColorStop(0, `rgba(255,150,40,${flicker.toFixed(3)})`);
  fire.addColorStop(1, "rgba(255,150,40,0)");
  ctx.fillStyle = fire;
  ctx.fillRect(glow.x - 70, glow.y - 100, 140, 110);
  const frame = Math.floor(nowMs / 140) % 2 === 0 ? "a" : "b";
  const flames: readonly (readonly [string, number, number])[] = [
    [`flame_4${frame}`, houseLeft + 62, 34],
    [`flame_2${frame}`, houseLeft + 82, 30],
  ];
  for (const [name, wx, up] of flames) {
    const flame = spriteByName(sprites, name);
    if (!flame) continue;
    const s = toScreen(cam, wx, 0);
    ctx.drawImage(
      flame,
      s.x - flame.width,
      s.y - up - flame.height * 2,
      flame.width * 2,
      flame.height * 2,
    );
  }
  // One puff at a time, living a whole little life: born over the flames,
  // rising as it turns over its three frames, gone before the next one.
  const puffPhase = (nowMs % 780) / 780;
  const smoke = spriteByName(
    sprites,
    `flame_smoke_${Math.floor(puffPhase * 3)}`,
  );
  if (smoke) {
    const s = toScreen(cam, houseLeft + 66, 0);
    ctx.globalAlpha = 0.7 * (1 - puffPhase * 0.7);
    ctx.drawImage(smoke, s.x - smoke.width, s.y - 46 - puffPhase * 26);
    ctx.globalAlpha = 1;
  }

  // The burn the ship left, still there under the climb.
  const pad = toScreen(cam, padX, 0);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(pad.x, pad.y + 3, 34, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The weather the climb punches through — the night's clouds, hashed per
 * world cell like the stars, thinning out where the troposphere does (the
 * first ~18 km of a ~100 km course). World-anchored on purpose: a cloud
 * whipping past at climb speed is the cheapest speedometer there is. */
const CLOUD_SPRITES = [
  "night_cloud_bank",
  "night_cloud_puff",
  "night_cloud_wisp",
] as const;
const CLOUD_CELL = 110;
const CLOUD_FLOOR_ALT = 220;
const CLOUD_TOP_ALT = 2400;

function drawClouds(
  ctx: CanvasRenderingContext2D,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  viewW: number,
  viewH: number,
): void {
  const lowAlt = Math.max(CLOUD_FLOOR_ALT, cam.topAlt - viewH - 40);
  const highAlt = Math.min(CLOUD_TOP_ALT, cam.topAlt + 40);
  if (lowAlt >= highAlt) return;
  const cy0 = Math.floor(lowAlt / CLOUD_CELL);
  const cy1 = Math.ceil(highAlt / CLOUD_CELL);
  const cx0 = Math.floor((cam.x - 80) / CLOUD_CELL);
  const cx1 = Math.ceil((cam.x + viewW + 80) / CLOUD_CELL);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const alt = cy * CLOUD_CELL + hash2(cy, cx * 3) * CLOUD_CELL;
      const thin =
        1 - (alt - CLOUD_FLOOR_ALT) / (CLOUD_TOP_ALT - CLOUD_FLOOR_ALT);
      if (alt < CLOUD_FLOOR_ALT || thin <= 0) continue;
      // Dense at the bottom — the deck the storm lives in — thinning to
      // stragglers where the air runs out.
      if (hash2(cx * 5 + 1, cy * 11 + 7) > 0.34 + 0.42 * thin) continue;
      const pick = CLOUD_SPRITES[Math.floor(hash2(cx, cy * 13) * 3) % 3]!;
      const sprite = spriteByName(sprites, pick);
      if (!sprite) continue;
      const wx = cx * CLOUD_CELL + hash2(cx * 7, cy) * CLOUD_CELL;
      const s = toScreen(cam, wx, alt);
      if (s.y < -30 || s.y > viewH + 30) continue;
      ctx.globalAlpha = 0.35 + 0.45 * thin;
      ctx.drawImage(
        sprite,
        s.x - sprite.width,
        s.y - sprite.height,
        sprite.width * 2,
        sprite.height * 2,
      );
    }
  }
  ctx.globalAlpha = 1;
}

/** How far up the climb the planet's curve starts to be a thing the eye can
 * see at all — nothing below this draws a limb, because a ship low enough to
 * see its own house is not high enough to see the curvature of the Earth. */
const LIMB_IN_FRAC = 0.3;

/**
 * THE PLANET'S LIMB — the curved blue rim of home, fading in near the top of
 * the climb and sinking off the bottom of the frame as the last stretch takes
 * it away. It is the launch feed's one indispensable picture, and it arrives
 * LATE on purpose: the low sky belongs to the lawn and the clouds
 * (`drawLaunchSite`, `drawClouds`), and the curve showing up is itself the
 * altimeter saying "you are leaving".
 */
function drawEarthLimb(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  altFrac: number,
): void {
  if (altFrac <= LIMB_IN_FRAC) return;
  const sink = (altFrac - LIMB_IN_FRAC) / (0.9 - LIMB_IN_FRAC);
  // Fades in over its first stretch, then walks down the screen and keeps
  // going — fully gone a little past the shell's top.
  const appear = Math.min(1, sink / 0.2);
  const top = viewH * (0.82 + 0.6 * sink);
  if (top > viewH + 80) return;
  const r = viewW * 2.2;
  const cx = viewW / 2;
  const cy = top + r;
  // The atmosphere's haze, then the limb, then the dark ground of home.
  ctx.save();
  ctx.globalAlpha = appear;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.985, cx, cy, r * 1.035);
  glow.addColorStop(0, "rgba(64,84,188,0.55)");
  glow.addColorStop(0.55, "rgba(64,84,188,0.18)");
  glow.addColorStop(1, "rgba(64,84,188,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, Math.max(0, top - viewH * 0.25), viewW, viewH);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#101a38";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(140,205,215,0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** THE NIGHT MOON the launch cutscene hung over the lot — in the same corner
 * of the sky from the minigame's first frame, BEHIND the storm deck, so the
 * cut changes nothing about the sky. It washes out as the climb darkens and
 * returns as the destination (`drawMoonAhead`) — the same rock, twice. */
function drawNightMoon(
  ctx: CanvasRenderingContext2D,
  sprites: GameAssets["sprites"],
  viewW: number,
  altFrac: number,
): void {
  if (altFrac >= 0.32) return;
  const night = spriteByName(sprites, "night_moon");
  if (!night) return;
  ctx.globalAlpha = 1 - altFrac / 0.32;
  ctx.drawImage(
    night,
    viewW * 0.72 - night.width,
    12,
    night.width * 2,
    night.height * 2,
  );
  ctx.globalAlpha = 1;
}

/** The destination, arriving: the moon grows through the top of the climb and
 * hangs over the drop. */
function drawMoonAhead(
  ctx: CanvasRenderingContext2D,
  sprites: GameAssets["sprites"],
  viewW: number,
  altFrac: number,
  landing: boolean,
): void {
  const moon = spriteByName(sprites, "sky_moon");
  if (!moon) return;
  if (landing) {
    // Home, small and high — the thing the module comes back for.
    const earth = spriteByName(sprites, "sky_earth");
    if (earth) ctx.drawImage(earth, viewW - 34, 16);
    return;
  }
  if (altFrac < 0.5) return;
  const t = (altFrac - 0.5) / 0.5;
  const scale = 1 + t * 2.4;
  const w = moon.width * scale;
  ctx.globalAlpha = Math.min(1, t * 2);
  ctx.drawImage(moon, viewW * 0.72 - w / 2, 14, w, moon.height * scale);
  ctx.globalAlpha = 1;
}

/** Everything adrift — each piece its own art, tumbling on its own angle, the
 * satellites and drones blinking their lights because somebody still pays for
 * them, the birds flapping between their two poses, everything that flies
 * with a nose FACING the way it flies. */
function drawField(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  viewW: number,
  viewH: number,
  nowMs: number,
): void {
  for (const o of state.field) {
    const s = toScreen(cam, o.x, o.alt);
    if (s.x < -60 || s.x > viewW + 60 || s.y < -60 || s.y > viewH + 60) {
      continue;
    }
    // A bird's two variants are its two wingbeats — the flap is the pair
    // alternated on the clock, offset by id so a flock never rows in unison.
    const variant =
      o.kind === "bird"
        ? (o.variant + Math.floor(nowMs / 150) + o.id) % 2
        : o.variant;
    const sprite = spriteByName(sprites, orbitSprite(o.kind, variant));
    if (!sprite) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(o.angle);
    // Whatever flies on purpose faces its own travel — the art's noses point
    // left, so a rightward crosser is mirrored.
    if (
      (o.kind === "plane" || o.kind === "bird" || o.kind === "paraglider") &&
      o.vx > 0
    ) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
    ctx.restore();
    if (o.kind === "satellite" && Math.floor(nowMs / 500) % 2 === 0) {
      ctx.fillStyle = "#8ccdd7";
      ctx.fillRect(Math.round(s.x), Math.round(s.y) - 1, 1, 1);
    }
    // A drone's little status light — green, faster than the satellite's,
    // because the parcel is late.
    if (o.kind === "drone" && Math.floor(nowMs / 260) % 2 === 0) {
      ctx.fillStyle = "#7ef0c8";
      ctx.fillRect(Math.round(s.x), Math.round(s.y) - 2, 1, 1);
    }
    // An airliner's strobes, both wingtips.
    if (o.kind === "plane" && Math.floor(nowMs / 700) % 2 === 0) {
      ctx.fillStyle = "#e8635a";
      ctx.fillRect(
        Math.round(s.x - sprite.width / 2) + 1,
        Math.round(s.y),
        1,
        1,
      );
      ctx.fillStyle = "#7ef0c8";
      ctx.fillRect(
        Math.round(s.x + sprite.width / 2) - 2,
        Math.round(s.y),
        1,
        1,
      );
    }
  }
}

/** The engine is ALWAYS burning on the climb (`FLIGHT.ascent.burnPx`), so the
 * ship always wears its firing frames up there; the cold frames belong to the
 * module coasting on the drop. */
function shipFrame(nowMs: number): string {
  return `ship_fire_${Math.floor(nowMs / 120) % 2}`;
}

/** THE SHIP'S EXHAUST, in the sprite's own px (`RocketExhaust`) — the same
 * bells as the cutscene's launch, with the REACH grown half again: up here
 * the plume is the whole spectacle, and there is no pad under it to cut it
 * short. The module's descent engine is a shorter throat under a wider
 * hull. */
const SHIP_PLUME: RocketExhaust = {
  bellX: 12,
  bellY: 27,
  reach: 96,
  flare: 10,
};
const LANDER_PLUME: RocketExhaust = {
  bellX: 12,
  bellY: 17,
  reach: 34,
  flare: 7,
};

/** The ship (or the module), leaned to its real tilt, wearing its trash, its
 * smears, and the takeoff's own plume. `burn` is the smoothed throttle
 * (`easeBurn`, 0..1): the base burn is a live column, full boost is the
 * cutscene's takeoff. */
function drawCraft(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  burn: number,
  smears: readonly HullSmear[],
  nowMs: number,
): void {
  // A wrecked craft is not drawn — it is mid-fireball, and a hull visible
  // inside its own explosion un-says the explosion.
  if (state.outcome === "wrecked") return;
  const { craft } = state;
  const landing = state.phase === "landing";
  const s = toScreen(cam, craft.x, craft.alt);
  const name = landing
    ? burn > 0.2
      ? "orbit_lander_burn"
      : "orbit_lander"
    : shipFrame(nowMs);
  const sprite = spriteByName(sprites, name);
  if (!sprite) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(craft.tilt);
  // THE PLUME FIRST, so the hull sits in front of its own fire — the
  // cutscene's own column (`drawPlume`: the four bands, the lash, the shock
  // diamonds, the halo), drawn in the sprite's own top-left space with all
  // the sky in the world under it. The VACUUM is the altitude's answer: the
  // low sky gets the full bonfire, and as the air thins the bright core
  // shortens, the diamonds fade and the exhaust balloons into the faint wide
  // sheath a real engine wears up there. The moon's drop is all sheath.
  const look = landing ? LANDER_PLUME : SHIP_PLUME;
  const vacuum = landing
    ? 1
    : 1 - airFrac(craft.alt, flightCoursePx(state.params));
  if (burn > 0.02 && !(landing && burn <= 0.2)) {
    ctx.save();
    ctx.translate(-sprite.width / 2, -sprite.height / 2);
    drawPlume(ctx, look, nowMs, burn, Number.POSITIVE_INFINITY, vacuum);
    ctx.restore();
  }
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  // WHAT THE SKY LEFT ON THE PAINTWORK — the soft bodies' smears, in the
  // ship's own frame where the engine says they landed, under the trash the
  // way paint is under cargo.
  for (const smear of smears) {
    ctx.fillStyle = smear.color;
    ctx.globalAlpha = 0.85;
    const w = 2 + (smear.seed % 3);
    const h = 3 + ((smear.seed >> 2) % 4);
    ctx.fillRect(
      Math.round(smear.across - w / 2),
      Math.round(-smear.along),
      w,
      h,
    );
    ctx.globalAlpha = 1;
  }
  // THE TRASH RIDES THE HULL — each bag drawn in the ship's own frame, where
  // the sim stuck it, so a filthy ship leans filthy.
  for (const t of state.trash) {
    if (state.trash.indexOf(t) >= FLIGHT.trash.maxWorn) break;
    const junk = spriteByName(sprites, orbitSprite("junk", t.variant));
    if (!junk) continue;
    ctx.save();
    ctx.translate(t.across, -t.along);
    ctx.rotate(t.angle);
    const s2 = 0.8;
    ctx.drawImage(
      junk,
      (-junk.width / 2) * s2,
      (-junk.height / 2) * s2,
      junk.width * s2,
      junk.height * s2,
    );
    ctx.restore();
  }
  ctx.restore();
}

/** The regolith — a tiled strip of the moon's own ground, the marked pad, and
 * a couple of boulders so the plain is a place. */
function drawMoonGround(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  viewW: number,
  viewH: number,
  nowMs: number,
): void {
  const groundY = cam.topAlt; // alt 0
  if (groundY < -8) return;
  ctx.fillStyle = "#3a3d45";
  ctx.fillRect(0, groundY, viewW, Math.max(0, viewH - groundY));
  const tile = spriteByName(sprites, "moon_0");
  if (tile) {
    const w = tile.width;
    for (let x = -((cam.x % w) + w) % w; x < viewW; x += w) {
      ctx.drawImage(tile, x, groundY);
    }
  }
  // The dressing stands where the seed put the pad, so every attempt at the
  // drop is the same place.
  const boulder = spriteByName(sprites, "boulder");
  if (boulder) {
    const bx = ((state.padX * 7919) % FLIGHT.fieldW) - cam.x;
    ctx.drawImage(boulder, bx, groundY - boulder.height + 3);
  }
  const pad = spriteByName(sprites, "orbit_pad");
  if (pad) {
    const s = toScreen(cam, state.padX, 0);
    ctx.drawImage(pad, s.x - pad.width / 2, s.y - pad.height + 2);
    // The pad's beacons breathe — the one light on the plain, so the eye finds
    // it without being told.
    if (Math.floor(nowMs / 400) % 2 === 0) {
      ctx.fillStyle = "#8ccdd7";
      ctx.fillRect(
        Math.round(s.x - pad.width / 2) + 1,
        Math.round(s.y) - 2,
        1,
        1,
      );
      ctx.fillRect(
        Math.round(s.x + pad.width / 2) - 2,
        Math.round(s.y) - 2,
        1,
        1,
      );
    }
  }
}

/**
 * HEAT SHIMMER — the candle's trick: the column of hot exhaust bends the
 * light coming through it, so the sky BEHIND the wake wobbles. Faked the way
 * 2D has always faked it: thin slivers of the already-painted canvas redrawn
 * with a small sinusoidal sideways offset, each row on its own phase so the
 * wobble crawls. Horizontal offsets only, copied top-down, so no sliver ever
 * samples a row this pass already moved.
 *
 * `strength` is REFRACTION'S OWN physics: it needs air to heat, so the caller
 * scales it by `airFrac` — strong over the lawn, gone in vacuum, the exact
 * opposite arc to the plume's blue shift.
 */
function drawHeatShimmer(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  strength: number,
  nowMs: number,
): void {
  if (strength <= 0.05) return;
  const m = ctx.getTransform();
  // The view is drawn under one uniform scale (`RocketScreen`'s setTransform);
  // the canvas-space source rects below multiply through it.
  const unit = m.a;
  const canvas = ctx.canvas;
  const halfW = 24;
  const tall = 92;
  const sliver = 3;
  for (let row = 0; row < tall; row += sliver) {
    const y = topY + row;
    const deep = row / tall;
    // Widest and strongest at the nozzle, blending out down the wake.
    const amp =
      strength * 1.7 * (1 - deep * 0.55) * Math.sin(nowMs / 55 + row * 0.31);
    if (Math.abs(amp) < 0.2) continue;
    const w = halfW * 2 * (1 - deep * 0.3);
    const sx = Math.max(0, Math.round((centerX - w / 2) * unit));
    const sy = Math.max(0, Math.round(y * unit));
    const sw = Math.min(canvas.width - sx, Math.round(w * unit));
    const sh = Math.min(canvas.height - sy, Math.round(sliver * unit));
    if (sw <= 0 || sh <= 0) continue;
    ctx.drawImage(
      canvas,
      sx,
      sy,
      sw,
      sh,
      centerX - w / 2 + amp,
      y,
      sw / unit,
      sh / unit,
    );
  }
}

/** The whole picture, in paint order: sky, stars, the weather, home (the lawn
 * low down, the limb high up), the moon, the field, the ground, the craft.
 * The fx layer draws over this on the same camera. `burn` is the smoothed
 * throttle for the plume; `smears` what the soft bodies left on the hull. */
export function drawFlight(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  assets: GameAssets,
  viewW: number,
  viewH: number,
  nowMs: number,
  burn: number,
  smears: readonly HullSmear[],
): void {
  const landing = state.phase === "landing";
  const altFrac = landing ? 1 : flightAltFrac(state);

  // The ramp is painted as two bands lerped by eye — cheaper than a gradient
  // object per frame and indistinguishable at this darkness.
  ctx.fillStyle = skyColor(altFrac);
  ctx.fillRect(0, 0, viewW, viewH);
  const low = skyColor(Math.max(0, altFrac - 0.12));
  ctx.fillStyle = low;
  ctx.fillRect(0, viewH * 0.6, viewW, viewH * 0.4);

  drawStars(ctx, cam, viewW, viewH, altFrac);
  if (!landing) {
    // The storm sits on the low sky like a lid — the night gets DARKER under
    // the deck, and the ordinary ramp only takes over once the climb is out.
    const storm = stormIntensity(state.craft.alt);
    if (storm > 0) {
      ctx.fillStyle = `rgba(6,7,12,${(0.3 * storm).toFixed(3)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    drawNightMoon(ctx, assets.sprites, viewW, altFrac);
    drawClouds(ctx, cam, assets.sprites, viewW, viewH);
    drawEarthLimb(ctx, viewW, viewH, altFrac);
    drawLaunchSite(ctx, cam, assets.sprites, viewW, viewH, nowMs);
  }
  drawMoonAhead(ctx, assets.sprites, viewW, altFrac, landing);

  // THE SHELL'S TOP, MADE VISIBLE: a faint line of thinning haze at the
  // altitude the garbage stops, so "get above the junk" is a place on the
  // screen before it is a fact on the timeline.
  if (!landing) {
    const shellTop = flightCoursePx(state.params) * FLIGHT.field.shellTopFrac;
    const y = cam.topAlt - shellTop;
    if (y > -4 && y < viewH + 4) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#8ccdd7";
      ctx.fillRect(0, Math.round(y), viewW, 1);
      ctx.globalAlpha = 1;
    }
  }

  drawField(ctx, state, cam, assets.sprites, viewW, viewH, nowMs);
  if (landing) {
    drawMoonGround(ctx, state, cam, assets.sprites, viewW, viewH, nowMs);
  }
  drawCraft(ctx, state, cam, assets.sprites, burn, smears, nowMs);

  // The exhaust's heat bending the sky behind the wake — refraction spends
  // AIR, so it rides `airFrac` and dies with the climb exactly as the flame's
  // orange does. Painted last: it re-samples everything already down,
  // ship and plume included.
  if (!landing && state.outcome !== "wrecked" && burn > 0.05) {
    const s = toScreen(cam, state.craft.x, state.craft.alt);
    drawHeatShimmer(
      ctx,
      s.x,
      s.y + 16,
      airFrac(state.craft.alt, flightCoursePx(state.params)) * burn,
      nowMs,
    );
  }
}
