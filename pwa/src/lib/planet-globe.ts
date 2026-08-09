// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A tiny software renderer for a lit, textured, *rotating* world on a 2D
// canvas — a real globe, not a flat disc with a gradient. Generic enough to
// live in the @ui/lib pool (which a later game keeps); the title menu is its
// first consumer (see game/title-sky.ts). The surfaces it paints are baked by
// planet-skins.ts from the real geography in planet-maps.ts.
//
// The maths, per output pixel of the disc:
//   • the pixel's surface normal N = (nx, ny, nz), nz = √(1 − nx² − ny²) toward
//     the camera — so the disc is treated as the front hemisphere of a unit
//     sphere, not a flat circle;
//   • a texture ("skin") lookup at that point's longitude/latitude, with the
//     longitude advanced each frame by the spin so the surface wheels past;
//   • FOR A WORLD WITH WEATHER, a second lookup into its CLOUD DECK at a
//     different longitude offset, composited over the ground — the layer turns
//     at its own rate, which is the whole point of keeping it separate;
//   • Lambert lighting N·L against the sun direction L (the SAME 3D vector the
//     orbit solver already knows), with a soft terminator (smoothstep across
//     the day/night boundary) — the physically-correct elliptical terminator
//     falls out for free because it is computed per pixel on the sphere, not
//     faked with an offset disc;
//   • limb darkening toward the rim, and — ONLY ON A WORLD THAT HAS AIR — a
//     Fresnel-ish atmospheric glow on the sunlit edge. Mercury and the Moon
//     have no atmosphere and therefore get NO limb haze and a hard terminator:
//     an airless body's day/night line is a knife edge, and hazing it is the
//     single most common way a rendered moon stops looking like a moon.
//
// Normals and texture coordinates depend only on the render resolution, so they
// are cached and rebuilt only when the disc changes size; each frame then costs
// a handful of multiplies and one or two texture fetches per pixel — no
// per-pixel trig.
//
// RINGS. A ringed world draws into a canvas PADDED beyond its disc (`padding`),
// and the ring plane is intersected per pixel: one ray-plane solve gives both
// the radius in the ring and its depth, so the half in front of the planet and
// the half behind sort correctly, the planet's shadow falls across the far arc,
// and the whole thing thins to a line when the rings are edge-on.

import {
  cloudSkin,
  surfaceSkin,
  type CloudSkin,
  type GlobeKind,
  type PlanetKind,
  type Skin,
} from "./planet-skins.ts";
import {
  SATELLITE_AIR,
  SATELLITE_KINDS,
  SATELLITE_PARENT,
  type SatelliteKind,
} from "./moon-skins.ts";
import { SATURN_RINGS } from "./planet-maps.ts";
import { PLANET_POLES } from "./planet-poles.ts";

export type { GlobeKind } from "./planet-skins.ts";

/** Per-world look + physics knobs.
 *
 * A NOTE ON THE TILTS, because there are two different numbers and the famous
 * one is the wrong one here. The textbook "axial tilt" (Mars 25.19°, Saturn
 * 26.73°) is measured against the planet's OWN orbital plane. This renderer
 * leans each axis away from the ECLIPTIC, so what it needs is the tilt in that
 * frame instead — which differs by the planet's orbital inclination, and by
 * 7° for Mercury, whose axis is bolt upright to its own orbit but 7° off the
 * ecliptic because its orbit is. Every obliquity below is therefore derived
 * from the body's IAU J2000 north-pole right ascension and declination,
 * converted to ecliptic coordinates — the same conversion that gives poleLon.
 */
type GlobeStyle = {
  /** Tilt of the spin axis from ECLIPTIC north (radians) — see above. */
  obliquity: number;
  /** Which way the tilt leans, as a heliocentric ecliptic longitude (radians):
   * the longitude of the north pole's projection onto the ecliptic. A planet's
   * axis holds a FIXED direction in space while it orbits — that is what gives
   * it seasons — so this is a constant, not a function of time. */
  poleLon: number;
  /** Does this world have an atmosphere at all? Everything below keys off it:
   * false means no limb glow and a hard terminator, and the caller should give
   * it no halo either. */
  air: boolean;
  /** Terminator softness in Lambert units — wide = deep, hazy atmosphere. */
  soft: number;
  /** Night-side ambient floor (0 = pure black shadow). */
  ambient: number;
  /** Atmospheric rim strength on the lit limb. Zero on an airless world. */
  rim: number;
  /** Rim colour, RGB 0–255. */
  rimColor: [number, number, number];
  /** How much wider than the disc the canvas must be, for a ring system. */
  padding: number;
};

const DEG = Math.PI / 180;

const PLANET_STYLES: Record<PlanetKind, GlobeStyle> = {
  mercury: {
    // Bolt upright to its own orbit (0.03°) — but that orbit is tipped 7° to
    // the ecliptic, and the ecliptic is the frame this renderer works in.
    ...PLANET_POLES.mercury,
    // No atmosphere worth the name: a surface-bound exosphere of atoms the
    // solar wind knocks loose. Nothing to scatter light at the limb.
    air: false,
    soft: 0.02,
    ambient: 0.02,
    rim: 0,
    rimColor: [0, 0, 0],
    padding: 1,
  },
  venus: {
    // Venus is quoted at 177.4° "axial tilt", which sounds dramatic and means
    // something simple: its pole is very nearly upright (1.2° off ecliptic
    // north) and it turns BACKWARDS underneath it. The upright axis is in the
    // pole table; the backwards part is the sign of its rotation period.
    ...PLANET_POLES.venus,
    air: true,
    soft: 0.26,
    ambient: 0.06,
    rim: 0.85,
    rimColor: [255, 238, 196],
    padding: 1,
  },
  earth: {
    // The north pole's projection points at ecliptic longitude 90°, which is
    // why the northern hemisphere leans sunward in June — the seasons come out
    // of the geometry rather than being drawn on.
    ...PLANET_POLES.earth,
    air: true,
    soft: 0.15,
    ambient: 0.05,
    rim: 1,
    rimColor: [150, 205, 255],
    padding: 1,
  },
  moon: {
    obliquity: 1.54 * DEG,
    poleLon: 270 * DEG,
    air: false,
    soft: 0.022,
    ambient: 0.025,
    rim: 0,
    rimColor: [0, 0, 0],
    padding: 1,
  },
  mars: {
    ...PLANET_POLES.mars,
    // Air, but only 0.6% of Earth's — enough for dust storms and a thin blue
    // twilight, nowhere near enough for Earth's bright limb.
    air: true,
    soft: 0.075,
    ambient: 0.035,
    rim: 0.3,
    rimColor: [255, 186, 140],
    padding: 1,
  },
  jupiter: {
    ...PLANET_POLES.jupiter,
    air: true,
    soft: 0.14,
    ambient: 0.045,
    rim: 0.5,
    rimColor: [255, 236, 206],
    padding: 1,
  },
  saturn: {
    ...PLANET_POLES.saturn,
    air: true,
    soft: 0.16,
    ambient: 0.05,
    rim: 0.45,
    rimColor: [255, 240, 200],
    // The A ring's outer edge sits at 2.27 planet radii; a little margin past
    // it keeps the antialiased edge inside the buffer.
    padding: 2.4,
  },
  uranus: {
    // 82° from ecliptic north: Uranus does not spin so much as roll along its
    // orbit, and its poles take turns facing the sun for 42 years each.
    ...PLANET_POLES.uranus,
    air: true,
    soft: 0.2,
    ambient: 0.05,
    rim: 0.5,
    rimColor: [206, 240, 240],
    padding: 1,
  },
  neptune: {
    ...PLANET_POLES.neptune,
    air: true,
    soft: 0.18,
    ambient: 0.045,
    rim: 0.55,
    rimColor: [180, 214, 240],
    padding: 1,
  },
};

/**
 * A SATELLITE SPINS ON ITS PLANET'S AXIS, and that is physics rather than a
 * shortcut.
 *
 * Every one of these twenty is TIDALLY LOCKED: the planet's pull on the bulge
 * it raises has been braking the moon's spin for four billion years, and the
 * only rate that survives is the one that keeps the same face turned inward.
 * Two things follow, and both are load-bearing here. Its day IS its year — so
 * `title-moons.ts` sets each satellite's spin to its own orbital period, never
 * to the planets' rotation clock. And its pole ends up parallel to the pole of
 * the planet it circles, because the orbit itself was dragged into the planet's
 * equatorial plane long before the spin locked to it.
 *
 * So a satellite's axis is COPIED from its parent's row above rather than
 * restated. Uranus is what makes that visible: its moons roll over with it, and
 * a table that repeated the numbers would be one edit away from having them
 * stand upright while their planet lies on its side.
 */
function satelliteStyles(): Record<SatelliteKind, GlobeStyle> {
  const out = {} as Record<SatelliteKind, GlobeStyle>;
  for (const kind of SATELLITE_KINDS) {
    const parent = PLANET_STYLES[SATELLITE_PARENT[kind] as PlanetKind];
    const air = SATELLITE_AIR[kind];
    out[kind] = {
      obliquity: parent.obliquity,
      poleLon: parent.poleLon,
      air: !!air,
      // Airless unless the table above says otherwise: a knife-edge terminator
      // and a hard limb are what make a moon read as a moon.
      soft: air?.soft ?? 0.02,
      ambient: 0.025,
      rim: air?.rim ?? 0,
      rimColor: air?.rimColor ?? [0, 0, 0],
      padding: 1,
    };
  }
  return out;
}

const STYLES: Record<GlobeKind, GlobeStyle> = {
  ...PLANET_STYLES,
  ...satelliteStyles(),
};

/** How far the camera sits above the orbital plane (radians). Shared by every
 * globe so all nine agree on one viewpoint — and it must match the ecliptic
 * tilt the orbit solver projects with, or the axes lean one way and the orbits
 * another. */
export const DEFAULT_CAM_PITCH = 17 * DEG;

/** A right-handed frame for a spin axis: `north` (the pole, view space) plus two
 * equatorial basis vectors so a surface point's latitude/longitude can be read
 * off with dot products. */
type Axis = {
  nx: number;
  ny: number;
  nz: number; // north pole
  ex: number;
  ey: number;
  ez: number; // east (prime-meridian tangent)
  fx: number;
  fy: number;
  fz: number; // front (prime meridian)
};

/**
 * Build the spin axis in VIEW space. The pole is first placed in world space —
 * leaned from the ecliptic normal by the obliquity, in the direction `poleLon`
 * — and then carried through the camera's pitch, exactly as the orbit solver
 * carries a body's position. World space here is x right, y ecliptic north,
 * z toward the camera in the plane; view space is x right, y DOWN, z toward
 * the camera.
 */
function buildAxis(obliquity: number, poleLon: number, pitch: number): Axis {
  const so = Math.sin(obliquity);
  const co = Math.cos(obliquity);
  const wx = so * Math.cos(poleLon);
  const wy = co;
  const wz = so * Math.sin(poleLon);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const nx = wx;
  const ny = wz * sp - wy * cp;
  const nz = wy * sp + wz * cp;
  // East = a vector in the equatorial plane, roughly screen-horizontal. The
  // pole is never parallel to it here, so it is stable — including for Uranus,
  // whose pole lies almost in the plane.
  let ex = -ny;
  let ey = nx;
  let ez = 0;
  let el = Math.hypot(ex, ey, ez);
  if (el < 1e-4) {
    // Degenerate only if the pole points straight at the camera; fall back to
    // the view's own horizontal.
    ex = 1;
    ey = 0;
    ez = 0;
    el = 1;
  }
  ex /= el;
  ey /= el;
  ez /= el;
  // Front = north × east completes the right-handed equatorial frame.
  const fx = ny * ez - nz * ey;
  const fy = nz * ex - nx * ez;
  const fz = nx * ey - ny * ex;
  return { nx, ny, nz, ex, ey, ez, fx, fy, fz };
}

/** The unit direction from the surface toward the sun, in view space:
 * x right, y down, z toward the camera — the same frame the disc normals use. */
export type GlobeLight = { x: number; y: number; z: number };

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Cap the software-shaded buffer; larger discs upscale (and soften pleasantly)
 * rather than paying for every device pixel. High enough that a ringed world —
 * whose canvas is 2.4× its disc, so the rings live in the OUTER pixels where
 * upscaling shows worst — keeps clean edges on the Cassini division. */
const MAX_RES = 192;
/** Snap the buffer resolution to this step so a continuously-rescaling body
 * reuses its geometry caches instead of reallocating every frame. */
const RES_STEP = 8;

export class PlanetGlobe {
  readonly canvas: HTMLCanvasElement;
  /** How much wider the canvas is than the planet's own disc (1 = no rings). */
  readonly padding: number;
  /** Whether this world has an atmosphere — the caller reads it to decide
   * whether to hang a halo off the element (an airless body gets none). */
  readonly hasAir: boolean;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly skin: Skin;
  private readonly clouds: CloudSkin | undefined;
  private readonly style: GlobeStyle;
  private readonly rings: typeof SATURN_RINGS | undefined;

  private res = 0;
  private image: ImageData | null = null;
  // Resolution-keyed caches (rebuilt on resize): view-space normals for
  // lighting, and the skin (u,v) each pixel maps to for texture lookup.
  private nx = new Float32Array(0);
  private ny = new Float32Array(0);
  private nz = new Float32Array(0);
  private u0 = new Float32Array(0);
  private v0 = new Float32Array(0);
  private inside = new Uint8Array(0);
  private edge = new Float32Array(0);
  // Ring caches: which band a pixel falls in (−1 = none), the ring point's
  // depth, and its position, for the shadow test.
  private ringBand = new Int8Array(0);
  private ringX = new Float32Array(0);
  private ringY = new Float32Array(0);
  private ringZ = new Float32Array(0);

  private readonly axis: Axis;

  constructor(kind: GlobeKind, pitch: number = DEFAULT_CAM_PITCH) {
    this.skin = surfaceSkin(kind);
    this.clouds = cloudSkin(kind);
    this.style = STYLES[kind];
    this.padding = this.style.padding;
    this.hasAir = this.style.air;
    this.rings = kind === "saturn" ? SATURN_RINGS : undefined;
    this.axis = buildAxis(this.style.obliquity, this.style.poleLon, pitch);
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
  }

  /** Rebuild the geometry caches for a new buffer resolution. Each pixel's
   * latitude/longitude is read against the body's tilted spin axis (so the
   * poles and equator sit on the correct axis), while the lighting normals stay
   * in plain view space (the sun lights the sphere regardless of its spin). */
  private resize(res: number): void {
    this.res = res;
    this.canvas.width = res;
    this.canvas.height = res;
    const n = res * res;
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.u0 = new Float32Array(n);
    this.v0 = new Float32Array(n);
    this.inside = new Uint8Array(n);
    this.edge = new Float32Array(n);
    this.image = this.ctx.createImageData(res, res);
    const rings = this.rings;
    if (rings) {
      this.ringBand = new Int8Array(n).fill(-1);
      this.ringX = new Float32Array(n);
      this.ringY = new Float32Array(n);
      this.ringZ = new Float32Array(n);
    }

    const ax = this.axis;
    // The planet's own radius in buffer pixels: the disc occupies 1/padding of
    // the canvas, and the rest is ring room.
    const half = res / 2;
    const r = half / this.padding;
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const i = py * res + px;
        const dx = (px + 0.5 - half) / r;
        const dy = (py + 0.5 - half) / r;
        const d2 = dx * dx + dy * dy;
        if (rings) this.solveRing(i, dx, dy, d2);
        if (d2 > 1) {
          this.inside[i] = 0;
          this.edge[i] = 0;
          continue;
        }
        this.inside[i] = 1;
        // Feather the last ~1.5 px so the limb antialiases.
        this.edge[i] = smoothstep(1, 1 - 1.5 / r, Math.sqrt(d2));
        const nz = Math.sqrt(1 - d2);
        this.nx[i] = dx;
        this.ny[i] = dy;
        this.nz[i] = nz;
        // Latitude from the pole, longitude from the equatorial basis — the
        // surface point projected onto the tilted axis frame.
        const lat = Math.asin(
          Math.max(-1, Math.min(1, dx * ax.nx + dy * ax.ny + nz * ax.nz)),
        );
        const lon = Math.atan2(
          dx * ax.ex + dy * ax.ey + nz * ax.ez,
          dx * ax.fx + dy * ax.fy + nz * ax.fz,
        );
        this.u0[i] = lon / (Math.PI * 2);
        this.v0[i] = clamp01(0.5 - lat / Math.PI);
      }
    }
  }

  /**
   * Where does the view ray through this pixel cross the ring plane? The rings
   * lie in the planet's equatorial plane (normal = the spin axis), so one
   * ray-plane solve gives the ring radius (which band) and the depth (in front
   * of the planet, or behind it). Cached per resolution — none of it moves.
   */
  private solveRing(i: number, dx: number, dy: number, d2: number): void {
    const rings = this.rings;
    if (!rings) return;
    const ax = this.axis;
    if (Math.abs(ax.nz) < 1e-3) return; // exactly edge-on: no ring pixels
    const z = -(ax.nx * dx + ax.ny * dy) / ax.nz;
    const rad = Math.sqrt(d2 + z * z);
    let band = -1;
    for (let b = 0; b < rings.length; b++) {
      const ring = rings[b];
      if (ring && rad >= ring.from && rad < ring.to) {
        band = b;
        break;
      }
    }
    if (band < 0) return;
    // Hidden behind the planet's disc? Only the half of the ring in FRONT of
    // the sphere's near surface survives where the two overlap.
    if (d2 < 1 && z < Math.sqrt(1 - d2)) return;
    this.ringBand[i] = band;
    this.ringX[i] = dx;
    this.ringY[i] = dy;
    this.ringZ[i] = z;
  }

  /**
   * Render the globe into its canvas at the given CSS diameter (of the whole
   * padded box, rings included), lit from `light`, with the surface rotated by
   * `spin` turns and the cloud deck — if it has one — by `cloudSpin` turns.
   * `dpr` bounds the buffer resolution to the device pixel ratio.
   *
   * `exposure` scales every lit term — the surface, the limb haze and the
   * rings — and is how a caller says "this world is far away, so it is DIM".
   * It deliberately does not touch alpha: a planet is an opaque body, and
   * dimming one by fading it lets the starfield show straight through a solid
   * world. Darkening is the honest version of the same cue and the one that
   * still reads as a planet.
   */
  render(
    cssSize: number,
    light: GlobeLight,
    spin: number,
    dpr: number,
    cloudSpin = spin,
    exposure = 1,
  ): void {
    // Quantise the buffer resolution to a coarse step: bodies rescale every
    // frame as they ride their orbits, and reallocating the geometry caches on
    // each 1-px change churns the GC. Snapping to RES_STEP keeps the same
    // buffers across a range of sizes (the canvas is CSS-scaled to the exact
    // disc anyway), so a resize is rare.
    const target = Math.max(8, Math.min(MAX_RES, Math.round(cssSize * dpr)));
    const res = Math.max(8, Math.round(target / RES_STEP) * RES_STEP);
    if (res !== this.res || !this.image) this.resize(res);
    const img = this.image;
    if (!img) return;
    const out = img.data;

    const { rgb, w: sw, h: sh } = this.skin;
    const { soft, ambient, rim, rimColor } = this.style;
    const lx = light.x;
    const ly = light.y;
    const lz = light.z;
    const spinFrac = spin - Math.floor(spin);
    const cloudFrac = cloudSpin - Math.floor(cloudSpin);
    const n = res * res;

    const nxs = this.nx;
    const nys = this.ny;
    const nzs = this.nz;
    const u0s = this.u0;
    const v0s = this.v0;
    const inside = this.inside;
    const edge = this.edge;
    const deck = this.clouds;
    const dRgba = deck?.rgba;
    const dw = deck?.w ?? 0;
    const dh = deck?.h ?? 0;
    const [rimR, rimG, rimB] = rimColor;
    // How far round the far side the sun has gone: 0 with the lit face toward
    // us, 1 with the world directly between us and the sun. A backlit
    // atmosphere is the BRIGHTEST an atmosphere ever looks — sunlight forward-
    // scatters straight through the limb, which is why the famous crescent
    // shots of Earth from orbit have a blue thread of air running all the way
    // round the dark side. Airless worlds (rim = 0) get none of it, and go
    // completely black instead, which is equally correct.
    const backlit = Math.max(0, -lz);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (inside[i] === 0) {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 0;
        continue;
      }
      const nz = nzs[i] as number;
      // Lambert term against the sun, softened across the terminator. On an
      // airless world `soft` is nearly zero, so this is the knife edge it
      // should be.
      const lam = (nxs[i] as number) * lx + (nys[i] as number) * ly + nz * lz;
      const day = smoothstep(-soft, soft, lam);
      const shade =
        (ambient + (1 - ambient) * day) * (0.6 + 0.4 * nz) * exposure;

      // Rotate the surface under us and fetch the skin texel.
      let u = (u0s[i] as number) + spinFrac;
      u -= Math.floor(u);
      const tx = (u * sw) | 0;
      const ty = ((v0s[i] as number) * sh) | 0;
      const ti = (ty * sw + tx) * 3;
      let cr = rgb[ti] as number;
      let cg = rgb[ti + 1] as number;
      let cb = rgb[ti + 2] as number;

      // The cloud deck, at its own longitude. Weather does not turn with the
      // ground: Earth's systems drift a little faster than the surface, and
      // Venus's whole deck laps the planet sixty times a Venusian day.
      if (dRgba) {
        let cu = (u0s[i] as number) + cloudFrac;
        cu -= Math.floor(cu);
        const di =
          (((v0s[i] as number) * dh) | 0) * dw * 4 + (((cu * dw) | 0) << 2);
        const a = (dRgba[di + 3] as number) / 255;
        if (a > 0) {
          cr += ((dRgba[di] as number) - cr) * a;
          cg += ((dRgba[di + 1] as number) - cg) * a;
          cb += ((dRgba[di + 2] as number) - cb) * a;
        }
      }

      // Atmospheric rim: brightest where the limb curves away (nz → 0). It
      // reaches a little PAST the terminator, because the air above a point is
      // still in sunlight after the ground below it is not. Exactly zero on an
      // airless world, which is the point.
      const f = 1 - nz;
      const dayRim = smoothstep(-0.3, 0.08, lam);
      const rimAmt =
        rim * f * f * f * Math.max(dayRim, backlit * 0.9) * exposure;

      out[o] = cr * shade + rimR * rimAmt;
      out[o + 1] = cg * shade + rimG * rimAmt;
      out[o + 2] = cb * shade + rimB * rimAmt;
      out[o + 3] = 255 * (edge[i] as number);
    }

    if (this.rings) this.paintRings(out, n, light, exposure);
    this.ctx.putImageData(img, 0, 0);
  }

  /**
   * Composite the ring system. Every ring pixel cached by `solveRing` is in
   * front of the planet (the ones behind its disc were dropped), so they are
   * simply painted over — but each is checked against the planet's SHADOW
   * first: a ring point lies in shadow when it is on the far side of the
   * planet from the sun and within a planet radius of the sun-line. That
   * shadow, sweeping across the far arc, is what makes the rings read as a
   * solid sheet rather than a decal.
   */
  private paintRings(
    out: Uint8ClampedArray,
    n: number,
    light: GlobeLight,
    exposure: number,
  ): void {
    const rings = this.rings;
    if (!rings) return;
    const ax = this.axis;
    // How open the rings are to the sun: grazing light makes them dim.
    const tilt = Math.abs(ax.nx * light.x + ax.ny * light.y + ax.nz * light.z);
    const lit = 0.18 + 0.82 * Math.pow(tilt, 0.6);
    for (let i = 0; i < n; i++) {
      const band = this.ringBand[i] as number;
      if (band < 0) continue;
      const ring = rings[band];
      if (!ring) continue;
      const px = this.ringX[i] as number;
      const py = this.ringY[i] as number;
      const pz = this.ringZ[i] as number;
      // Planet shadow: project onto the sun direction; behind the planet and
      // within one radius of the axis of light means eclipsed.
      const along = px * light.x + py * light.y + pz * light.z;
      let shade = 1;
      if (along < 0) {
        const perp = Math.sqrt(
          Math.max(0, px * px + py * py + pz * pz - along * along),
        );
        shade = smoothstep(0.92, 1.12, perp) * 0.86 + 0.14;
      }
      const a = ring.alpha * lit;
      const c = 236 * ring.tint * shade * exposure;
      const o = i * 4;
      const base = (out[o + 3] as number) / 255;
      // Straight-alpha over whatever is already there (the planet, or nothing).
      const outA = a + base * (1 - a);
      if (outA <= 0) continue;
      const mixIn = (v: number, add: number): number =>
        (add * a + v * base * (1 - a)) / outA;
      out[o] = mixIn(out[o] as number, c);
      out[o + 1] = mixIn(out[o + 1] as number, c * 0.95);
      out[o + 2] = mixIn(out[o + 2] as number, c * 0.82);
      out[o + 3] = 255 * outA;
    }
  }
}
