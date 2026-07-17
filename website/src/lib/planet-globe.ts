// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A tiny software renderer for a lit, textured, *rotating* sphere on a 2D
// canvas — a real globe, not a flat disc with a gradient. Generic enough to
// live in the @ui/lib pool (earmarked for oss-framework); the title menu is its
// first consumer (see game/titleSky.ts).
//
// The maths, per output pixel of the disc:
//   • the pixel's surface normal N = (nx, ny, nz), nz = √(1 − nx² − ny²) toward
//     the camera — so the disc is treated as the front hemisphere of a unit
//     sphere, not a flat circle;
//   • a texture ("skin") lookup at that point's longitude/latitude, with the
//     longitude advanced each frame by the spin so the surface wheels past;
//   • Lambert lighting N·L against the sun direction L (the SAME 3D vector the
//     orbit solver already knows), with a soft terminator (smoothstep across
//     the day/night boundary) — the physically-correct elliptical terminator
//     falls out for free because it is computed per pixel on the sphere, not
//     faked with an offset disc;
//   • limb darkening toward the rim and a Fresnel-ish atmospheric rim glow on
//     the sunlit edge, so worlds with air (Earth, Venus) haze at the limb while
//     airless ones (Moon, Mercury) keep a crisp edge.
//
// Normals and texture coordinates depend only on the render resolution, so they
// are cached and rebuilt only when the disc changes size; each frame then costs
// a handful of multiplies and one texture fetch per pixel — no per-pixel trig.

export type GlobeKind = "earth" | "mars" | "venus" | "mercury" | "moon";

/** An equirectangular surface texture: `w×h` RGB triples, row-major. */
type Skin = {
  w: number;
  h: number;
  rgb: Uint8ClampedArray;
};

/** Per-world look + physics knobs. */
type GlobeStyle = {
  /** True axial tilt (obliquity, radians): how far the spin axis leans from the
   * orbital vertical. Earth 23.4°, Mars 25.2°, Venus ~nil (but retrograde),
   * Mercury ~nil, the Moon ~6.7°. Orients the axis the surface rotates about. */
  obliquity: number;
  /** Terminator softness in Lambert units — wide = hazy atmosphere. */
  soft: number;
  /** Night-side ambient floor (0 = pure black shadow). */
  ambient: number;
  /** Atmospheric rim strength on the lit limb (0 = airless, crisp edge). */
  rim: number;
  /** Rim colour, RGB 0–255. */
  rimColor: [number, number, number];
};

const DEG = Math.PI / 180;

const STYLES: Record<GlobeKind, GlobeStyle> = {
  earth: {
    obliquity: 23.4 * DEG,
    soft: 0.16,
    ambient: 0.05,
    rim: 1,
    rimColor: [150, 205, 255],
  },
  mars: {
    obliquity: 25.2 * DEG,
    soft: 0.1,
    ambient: 0.035,
    rim: 0.4,
    rimColor: [255, 180, 130],
  },
  venus: {
    obliquity: 2.6 * DEG,
    soft: 0.24,
    ambient: 0.06,
    rim: 0.7,
    rimColor: [255, 235, 180],
  },
  mercury: {
    obliquity: 0.03 * DEG,
    soft: 0.05,
    ambient: 0.025,
    rim: 0,
    rimColor: [0, 0, 0],
  },
  moon: {
    obliquity: 6.7 * DEG,
    soft: 0.055,
    ambient: 0.03,
    rim: 0,
    rimColor: [0, 0, 0],
  },
};

/** The camera looks slightly down onto the orbital plane, so the sunlit tops of
 * the globes and their tilted axes read (a pure equator-on view hides both). A
 * single shared pitch keeps every world consistent with one viewpoint. */
const CAM_PITCH = 18 * DEG;

/** A right-handed frame for a spin axis: `north` (the pole, view space) plus two
 * equatorial basis vectors so a surface point's latitude/longitude can be read
 * off with dot products. Built from the obliquity (lean from vertical) and the
 * shared camera pitch (lean toward the viewer). The absolute longitude origin is
 * arbitrary — the spin rotates it — so any equatorial basis will do. */
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

const buildAxis = (obliquity: number): Axis => {
  // North pole: start at screen-up (0,−1,0), lean by the obliquity in-screen
  // (about the view z axis) so the axis visibly tilts, then pitch toward the
  // camera (about the view x axis) so we look down on it a little.
  const sl = Math.sin(obliquity);
  const cl = Math.cos(obliquity);
  const sp = Math.sin(CAM_PITCH);
  const cp = Math.cos(CAM_PITCH);
  // Rz(obliquity) · up = (sl, −cl, 0); then Rx(CAM_PITCH) tips the top forward.
  const nx = sl;
  const ny = -cl * cp;
  const nz = cl * sp;
  // East = normalize(view-z × north): a vector in the equatorial plane, roughly
  // screen-horizontal. North is never parallel to view-z here, so it is stable.
  let ex = -ny;
  let ey = nx;
  let ez = 0;
  const el = Math.hypot(ex, ey, ez) || 1;
  ex /= el;
  ey /= el;
  ez /= el;
  // Front = north × east completes the right-handed equatorial frame.
  const fx = ny * ez - nz * ey;
  const fy = nz * ex - nx * ez;
  const fz = nx * ey - ny * ex;
  return { nx, ny, nz, ex, ey, ez, fx, fy, fz };
};

/** The unit direction from the surface toward the sun, in view space:
 * x right, y down, z toward the camera — the same frame the disc normals use. */
export type GlobeLight = { x: number; y: number; z: number };

// ---------------------------------------------------------------------------
// Seamless procedural noise (3D, sampled on the sphere so there is no pole or
// wrap seam) and the per-world skin bakers.
// ---------------------------------------------------------------------------

const hash3 = (x: number, y: number, z: number): number => {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
};

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

const vnoise3 = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c000 = hash3(xi, yi, zi);
  const c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1);
  const c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, xf), lerp(c010, c110, xf), yf),
    lerp(lerp(c001, c101, xf), lerp(c011, c111, xf), yf),
    zf,
  );
};

/** Fractal Brownian motion — layered noise for continents, maria and cloud. */
const fbm3 = (
  x: number,
  y: number,
  z: number,
  octaves: number,
  seed: number,
): number => {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise3(x * freq + seed, y * freq - seed, z * freq + seed * 2);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
};

const mix = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Bake a world's equirectangular skin once. `sp` for each texel is the unit
 * sphere point, so all noise is seamless across the wrap and poles. */
const bakeSkin = (kind: GlobeKind, w: number, h: number): Skin => {
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let j = 0; j < h; j++) {
    const lat = (j / (h - 1) - 0.5) * Math.PI; // +π/2 (north) … −π/2
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = (i / w) * Math.PI * 2;
      const sx = cl * Math.cos(lon);
      const sy = sl;
      const sz = cl * Math.sin(lon);
      const col = skinTexel(kind, sx, sy, sz, lat);
      const k = (j * w + i) * 3;
      rgb[k] = col[0];
      rgb[k + 1] = col[1];
      rgb[k + 2] = col[2];
    }
  }
  return { w, h, rgb };
};

const skinTexel = (
  kind: GlobeKind,
  x: number,
  y: number,
  z: number,
  lat: number,
): [number, number, number] => {
  const absLat = Math.abs(lat);
  if (kind === "earth") {
    const land = fbm3(x * 1.9, y * 1.9, z * 1.9, 5, 11.3);
    const isLand = land > 0.52;
    const ocean = mix([26, 66, 120], [40, 96, 150], clamp01((land - 0.3) * 3));
    let surface: [number, number, number];
    if (isLand) {
      const veg = fbm3(x * 3.4, y * 3.4, z * 3.4, 4, 4.1);
      const green: [number, number, number] = [72, 120, 66];
      const desert: [number, number, number] = [150, 132, 86];
      surface = mix(green, desert, clamp01(veg * 1.4));
      surface = mix(surface, [58, 92, 54], clamp01((land - 0.52) * 4));
    } else {
      surface = ocean;
    }
    // Ice caps.
    const ice = smoothstep(1.15, 1.42, absLat);
    surface = mix(surface, [235, 240, 245], ice);
    // Clouds — a second noise field laid over everything.
    const cloud = fbm3(x * 2.7 + 40, y * 2.7, z * 2.7 - 40, 4, 21.7);
    const cloudAmt = smoothstep(0.55, 0.72, cloud) * 0.85;
    return mix(surface, [240, 244, 250], cloudAmt);
  }
  if (kind === "mars") {
    const n = fbm3(x * 2.3, y * 2.3, z * 2.3, 5, 7.7);
    const base = mix([150, 74, 42], [190, 104, 66], clamp01(n * 1.3));
    const maria = smoothstep(
      0.32,
      0.5,
      fbm3(x * 1.4, y * 1.4, z * 1.4, 3, 2.2),
    );
    let surface = mix(base, [110, 52, 34], maria * 0.6);
    const ice = smoothstep(1.2, 1.45, absLat);
    surface = mix(surface, [232, 224, 220], ice);
    return surface;
  }
  if (kind === "venus") {
    const n = fbm3(x * 2.1, y * 2.1, z * 2.1, 5, 9.9);
    return mix([214, 178, 120], [244, 224, 176], clamp01(n * 1.3));
  }
  if (kind === "mercury") {
    const n = fbm3(x * 3.1, y * 3.1, z * 3.1, 5, 3.3);
    const speck = fbm3(x * 8, y * 8, z * 8, 3, 5.5);
    let g = 96 + n * 96;
    g += (speck - 0.5) * 40;
    return [g * 1.02, g * 0.97, g * 0.9];
  }
  // Moon.
  const highland = fbm3(x * 2.6, y * 2.6, z * 2.6, 5, 6.6);
  const maria = smoothstep(0.36, 0.52, fbm3(x * 1.3, y * 1.3, z * 1.3, 3, 1.1));
  const g = (150 + highland * 70) * (1 - maria * 0.42);
  return [g, g * 1.005, g * 1.02];
};

// ---------------------------------------------------------------------------
// The globe: owns a canvas, its skin, and the resolution-keyed geometry caches.
// ---------------------------------------------------------------------------

const SKIN_W = 256;
const SKIN_H = 128;
/** Cap the software-shaded buffer; larger discs upscale (and soften pleasantly)
 * rather than paying for every device pixel. */
const MAX_RES = 132;
/** Snap the buffer resolution to this step so a continuously-rescaling body
 * reuses its geometry caches instead of reallocating every frame. */
const RES_STEP = 8;

export class PlanetGlobe {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly skin: Skin;
  private readonly style: GlobeStyle;

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

  private readonly axis: Axis;

  constructor(kind: GlobeKind) {
    this.skin = bakeSkin(kind, SKIN_W, SKIN_H);
    this.style = STYLES[kind];
    this.axis = buildAxis(this.style.obliquity);
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

    const ax = this.axis;
    const r = res / 2;
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const i = py * res + px;
        const dx = (px + 0.5 - r) / r;
        const dy = (py + 0.5 - r) / r;
        const d2 = dx * dx + dy * dy;
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
   * Render the globe into its canvas at the given CSS diameter, lit from `light`
   * and rotated by `spin` turns (0–1 wraps one full revolution). `dpr` bounds
   * the buffer resolution to the device pixel ratio.
   */
  render(cssSize: number, light: GlobeLight, spin: number, dpr: number): void {
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
    const n = res * res;

    const nxs = this.nx;
    const nys = this.ny;
    const nzs = this.nz;
    const u0s = this.u0;
    const v0s = this.v0;
    const inside = this.inside;
    const edge = this.edge;
    const [rimR, rimG, rimB] = rimColor;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (inside[i] === 0) {
        out[o + 3] = 0;
        continue;
      }
      const nz = nzs[i] as number;
      // Lambert term against the sun, softened across the terminator.
      const lam = (nxs[i] as number) * lx + (nys[i] as number) * ly + nz * lz;
      const day = smoothstep(-soft, soft, lam);
      const shade = (ambient + (1 - ambient) * day) * (0.6 + 0.4 * nz);

      // Rotate the surface under us and fetch the skin texel.
      let u = (u0s[i] as number) + spinFrac;
      u -= Math.floor(u);
      const tx = (u * sw) | 0;
      const ty = ((v0s[i] as number) * sh) | 0;
      const ti = (ty * sw + tx) * 3;

      // Atmospheric rim: brightest where the lit limb curves away (nz → 0).
      const f = 1 - nz;
      const rimAmt = rim * f * f * f * day;

      out[o] = (rgb[ti] as number) * shade + rimR * rimAmt;
      out[o + 1] = (rgb[ti + 1] as number) * shade + rimG * rimAmt;
      out[o + 2] = (rgb[ti + 2] as number) * shade + rimB * rimAmt;
      out[o + 3] = 255 * (edge[i] as number);
    }
    this.ctx.putImageData(img, 0, 0);
  }
}
