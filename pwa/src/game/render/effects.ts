// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Transient app-side effects: lightning strikes, nuke rings, gore splashes
// on hit mobs, corpses, crate breaks, spell blooms, and floating damage
// numbers. GameScreen accumulates them from engine events and passes what is
// still alive.

import { formatCompact } from "@ui/lib/format-number.ts";

import { spriteByName, type GameAssets } from "../assets.ts";
import {
  drawBurst,
  drawMuzzle,
  shotStyleFor,
  type GoreStyle,
  type ShotStyle,
} from "../weapon-fx.ts";
import { enemySprites } from "./caches.ts";
import {
  MELEE_SWING_MS,
  SWING_STRIKE_END,
  SWING_WINDUP_END,
} from "./player.ts";
import { clamp01, fract } from "./shared.ts";
import { type Camera } from "./view.ts";

export type Effect = {
  kind:
    | "lightning"
    | "nuke"
    | "nova"
    | "asteroidImpact"
    | "splash"
    | "burst"
    | "damage"
    | "swing"
    | "muzzle"
    | "text"
    | "corpse"
    | "incinerate"
    | "spellcast"
    | "crateBreak";
  pos: { x: number; y: number };
  untilMs: number;
  /** Total effect length, for progress-driven animation. */
  durationMs?: number;
  /** World-clock ms before the effect begins drawing — lets a float lag behind
   * the hit that spawned it (the XP popup trails the damage number). */
  startMs?: number;
  /** Splash: gore family ("blood", "ecto") — frames `<family>_0/_1`.
   * Corpse: the slain enemy's sprite family, drawn as it keels over. */
  sprite?: string;
  /** Text float: the word to rise off the spot (e.g. "DODGE"). */
  text?: string;
  /** Text float: the glyph color. */
  color?: string;
  /** Text float: how far the word climbs over its life, in world px
   * (default 16). XP popups rise further so they read as "flowing up". */
  rise?: number;
  /** Text float: glyph scale (default 1). A golden-arrow XP popup doubles it,
   * and a merged pack-kill float grows it with the pack (≈count/10 — 20 mobs →
   * 2×, 30 → 3×), so a bigger gain reads as a bigger number. */
  scale?: number;
  /** Text float: crit-style jolt. The word shakes left–right–centre in place
   * for a run of opening beats, THEN lifts off — an arrow's (or a whole pack's)
   * XP is basically a crit's worth of levels, so it hits like one before it
   * floats. The beat count and throw grow with `scale`, so a bigger pop rattles
   * longer and wider. Plain floats (DODGE/MISS) leave this off and rise from
   * the first frame. */
  shake?: boolean;
  /** Damage number: the hit's rounded damage. */
  value?: number;
  /** Damage number: crits jolt left-right-center, grow, and glow gold. */
  crit?: boolean;
  /** Damage number: on a crit, how hard the blow rolled in [0, 1] — scales the
   * popup from a modest 1.5× (a glancing crit) up to a fat 3× (a top-of-band
   * slam). Absent = a neutral mid-size crit. */
  critPower?: number;
  /** Swing/muzzle: the aim direction in radians.
   * Corpse: the signed angle it keels over to (±π/2), rolled at spawn so
   * the horde doesn't topple in lockstep. */
  angle?: number;
  /** Corpse: an epic (elite/boss) body — it keels over and then simply lies
   * there for the rest of the level instead of blinking out. There are only
   * ever a handful, so leaving them on the field reads as a battlefield of
   * fallen giants rather than clutter. */
  persist?: boolean;
  /** Corpse: an OVERKILL launch — the body is knocked flying away from the
   * hero. `dx`/`dy` is the unit heading (already pointing away from the
   * player), `dist` how far it sails in world px, `spins` how many whole
   * end-over-end tumbles it turns in flight. Bigger overkill = further and
   * more spins (one spin per full extra starting-HP bar). Sized in GameScreen
   * from the kill's `damage / maxHp`; absent for a plain keel-over. */
  launch?: { dx: number; dy: number; dist: number; spins: number };
  /** Swing: the arc's reach in world px (the weapon's effective range). */
  radius?: number;
  /** Nova: an icy-blue chilling burst (a companion's FROST NOVA) rather than
   * the plain violet arcane ring. */
  frost?: boolean;
  /** Spellcast: the spell's SCHOOL, which shapes the cast bloom — a sharp
   * starburst for an attack, a broad expanding ring for AOE, a soft double
   * halo for a defensive cast (see spell-fx.ts / the "spellcast" draw). */
  category?: "attack" | "aoe" | "defense";
  /** Swing: the full cone angle in radians (wide blade vs narrow spear). */
  arc?: number;
  /** Muzzle: ranged fires a hot flash, magic a cool cast burst. */
  weaponClass?: "melee" | "ranged" | "magic";
  /** Burst: the themed gore a signature melee blow throws (weapon-fx.ts). */
  gore?: GoreStyle;
  /** Burst: a per-hit seed so stacked bursts scatter differently. */
  seed?: number;
  /** Muzzle: the firing weapon's shot signature (weapon-fx.ts). Absent = the
   * plain class look. */
  fx?: ShotStyle;
  /** Muzzle: the HERO's facing when he fired (only set for his own shots). The
   * flash is pinned to the weapon's side (where the sprite is drawn) rather than
   * the aim, so firing at a foe BEHIND him still flashes at the barrel, not off
   * his back. Absent on companion/enemy shots (they flash along the aim). */
  faceLeft?: boolean;
};

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  camera: Camera,
  timeMs: number,
  assets: GameAssets,
): void {
  const font = assets.font;
  const viewW = ctx.canvas.width;
  const viewH = ctx.canvas.height;
  for (const effect of effects) {
    if (timeMs > effect.untilMs) continue;
    // A delayed float (e.g. the XP popup trailing its damage number) stays
    // hidden until its start tick, then animates from t=0 as usual.
    if (effect.startMs != null && timeMs < effect.startMs) continue;
    const x = Math.round(effect.pos.x - camera.x);
    const groundY = Math.round(effect.pos.y - camera.y);
    // Off-screen cull: a corpse felled two screens back (epic bodies persist
    // for the whole level) or a fight's leftovers beyond the rim must not
    // keep paying draw calls every frame. The margin covers each effect's
    // furthest reach — its radius, a launched corpse's throw, a lightning
    // bolt's sky anchor. The nuke is a whole-screen flash and never culls.
    if (effect.kind !== "nuke") {
      const reach =
        96 + (effect.radius ?? 0) + (effect.launch ? effect.launch.dist : 0);
      if (
        x < -reach ||
        x > viewW + reach ||
        groundY < -reach ||
        groundY > viewH + reach
      ) {
        continue;
      }
    }

    if (effect.kind === "splash") {
      // Two-frame gore burst pinned to where the hit landed.
      const duration = effect.durationMs ?? 240;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const frame = t < 0.5 ? 0 : 1;
      const sprite = spriteByName(
        assets.sprites,
        `${effect.sprite ?? "blood"}_${frame}`,
      );
      if (sprite) {
        ctx.drawImage(
          sprite,
          x - Math.round(sprite.width / 2),
          groundY - Math.round(sprite.height / 2),
        );
      }
      continue;
    }

    if (effect.kind === "burst") {
      // The themed gore a signature melee blow throws — colored specks flung off
      // the wound over the splash (slash-fx.ts). Lifted to the hit, not the feet.
      if (effect.gore) {
        const duration = effect.durationMs ?? 300;
        const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
        if (t >= 0 && t <= 1) {
          drawBurst(ctx, x, groundY - 4, t, effect.gore, effect.seed ?? 0);
        }
      }
      continue;
    }

    if (effect.kind === "corpse") {
      // A slain mob's send-off: it keels over flat to the ground with a little
      // hop, lies there a beat, then blinks out and is gone. Purely cosmetic —
      // the engine already removed the live enemy the tick it died, so this
      // plays on top at the spot it fell. Timeline over `duration` (2s):
      // keel-over (first ~260ms) → lie still → blink for the final second.
      const duration = effect.durationMs ?? 2000;
      const age = duration - (effect.untilMs - timeMs); // ms since death
      // A single fixed frame (dying, frame 0) — a corpse never walks or bobs,
      // it just keels over once and lies still. The dead don't animate.
      const sprite = enemySprites(assets.sprites, effect.sprite ?? "ghost")
        .dying[0];
      // Blink out over the final second: skip alternate ~90ms windows so it
      // flickers before it disappears. Epic bodies (persist) never blink —
      // they just keel over and stay down.
      const blinkAt = duration - 1000;
      if (
        !effect.persist &&
        age >= blinkAt &&
        Math.floor(timeMs / 90) % 2 === 0
      )
        continue;
      // OVERKILL LAUNCH: an overpowered kill punts the body flying away from
      // the hero (kung-fu style) — it sails along `launch`, arcs up off the
      // ground, and tumbles end over end, decelerating into the spot it lands.
      // The harder it was overkilled the further it sails, up to clear off the
      // screen for a legendary one-shot. A plain kill has no launch and just
      // topples in place. GameScreen sized `dist` from the kill's overkill.
      const launch = effect.launch;
      const launched = launch != null && launch.dist > 2;
      const flightMs = launched ? Math.min(1000, 240 + launch.dist * 2.0) : 0;
      const flight = launched ? Math.min(1, age / flightMs) : 0;
      const flightEase = flight * (2 - flight); // ease-out into the landing
      const tx = launched
        ? Math.round(launch.dx * launch.dist * flightEase)
        : 0;
      const ty = launched
        ? Math.round(launch.dy * launch.dist * flightEase)
        : 0;
      // Airborne arc: rise then fall over the flight, its height growing with
      // how far the body is thrown.
      const lift = launched
        ? Math.round(Math.sin(flight * Math.PI) * launch.dist * 0.16)
        : 0;
      // Tumble whole spins (so it lands flat on its keel), forward along the
      // throw, bleeding off as it decelerates. The count comes straight from
      // the kill's overkill (GameScreen sized it: one spin per full extra
      // starting-HP bar) — NOT from the distance — so it turns exactly as many
      // times as the hit earned instead of a distance-derived guess.
      const spins = launched ? launch.spins : 0;
      const tumble = launched
        ? (Math.sign(launch.dx) || 1) * spins * Math.PI * 2 * flightEase
        : 0;
      // Keel-over: rotate 0 → the rolled ±90° over the first 260ms (ease-out),
      // with a brief hop as it topples.
      const fall = Math.min(1, age / 260);
      const eased = fall * (2 - fall);
      const tip = (effect.angle ?? Math.PI / 2) * eased;
      const hop = Math.round(Math.sin(fall * Math.PI) * 4);
      const w = sprite.width;
      const h = sprite.height;
      ctx.save();
      // Pivot about the sprite's feet (bottom-centre) so it falls flat with its
      // base planted, then draw the body rising from that pivot.
      ctx.translate(x + tx, groundY + ty + Math.round(h / 2) - hop - lift);
      ctx.rotate(tip + tumble);
      ctx.drawImage(sprite, -Math.round(w / 2), -h);
      ctx.restore();
      continue;
    }

    if (effect.kind === "incinerate") {
      // A screen-nuke kill's send-off: the body BURNS UP — engulfed in flame as
      // it fades — and leaves a smoking, charred skeleton where it stood, which
      // smoulders a beat and then fades out. World-anchored (it rides the field
      // as the camera pans), seeded so a whole incinerated horde flickers and
      // smokes out of step. Timeline over `duration` (~1600ms): burn (flames up,
      // body fades) → the skeleton emerges as the fire dies to embers → smoke
      // rises and the bones fade.
      const duration = effect.durationMs ?? 1600;
      const t = clamp01(1 - (effect.untilMs - timeMs) / duration); // 0 → 1
      const seed = effect.seed ?? 0;
      const body = enemySprites(assets.sprites, effect.sprite ?? "ghost")
        .dying[0];
      const w = body.width;
      const h = body.height;
      ctx.save();
      // The burning body: the mob's own sprite, fading out over the burn as the
      // flames consume it (0.05 → 0.4).
      const bodyFade = 1 - clamp01((t - 0.05) / 0.35);
      if (bodyFade > 0) {
        ctx.globalAlpha = bodyFade;
        ctx.drawImage(body, x - Math.round(w / 2), groundY - Math.round(h / 2));
      }
      // The charred skeleton left behind: emerges as the fire dies (0.3 → 0.48),
      // holds, then fades out over the last stretch (0.82 → 1). Scaled up whole
      // for a bigger mob so a giant leaves a bigger skeleton.
      const skel = spriteByName(assets.sprites, "charred_skeleton");
      if (skel) {
        const appear =
          clamp01((t - 0.3) / 0.18) * (1 - clamp01((t - 0.82) / 0.18));
        if (appear > 0) {
          const scale = Math.max(1, Math.round(h / skel.height));
          const dw = skel.width * scale;
          const dh = skel.height * scale;
          ctx.globalAlpha = appear;
          ctx.drawImage(
            skel,
            x - Math.round(dw / 2),
            groundY - Math.round(dh / 2),
            dw,
            dh,
          );
        }
      }
      // FIRE: warm tongues licking up from the body, flickering off the clock,
      // full through the burn then receding to nothing as the bones show
      // (drawn additively so they read as pure flame, not paint).
      const fireT = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.28);
      if (fireT > 0) {
        ctx.globalCompositeOperation = "lighter";
        const baseY = groundY + Math.round(h / 2);
        const flames = 5;
        const span = Math.max(10, w * 0.8);
        for (let i = 0; i < flames; i++) {
          const fx = x + Math.round((i / (flames - 1) - 0.5) * span);
          const flick =
            0.55 + 0.45 * Math.abs(Math.sin(timeMs / 90 + seed + i * 1.7));
          const fh = (12 + h) * fireT * flick;
          const fw = Math.max(3, w * 0.24);
          const tongue = (width: number, height: number) => {
            ctx.beginPath();
            ctx.moveTo(fx - width / 2, baseY);
            ctx.quadraticCurveTo(
              fx - width / 2,
              baseY - height * 0.6,
              fx,
              baseY - height,
            );
            ctx.quadraticCurveTo(
              fx + width / 2,
              baseY - height * 0.6,
              fx + width / 2,
              baseY,
            );
            ctx.closePath();
            ctx.fill();
          };
          ctx.globalAlpha = 0.5 * fireT;
          ctx.fillStyle = "#ff5a1e";
          tongue(fw, fh);
          ctx.globalAlpha = 0.55 * fireT;
          ctx.fillStyle = "#ffc132";
          tongue(fw * 0.55, fh * 0.68);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      // Ember glow smouldering under the bones after the flames die.
      const emberT =
        clamp01((t - 0.35) / 0.15) * (1 - clamp01((t - 0.75) / 0.25));
      if (emberT > 0) {
        ctx.globalCompositeOperation = "lighter";
        const pulse = 0.6 + 0.4 * Math.sin(timeMs / 140 + seed);
        ctx.globalAlpha = 0.4 * emberT * pulse;
        ctx.fillStyle = "#ff6a1e";
        ctx.beginPath();
        ctx.ellipse(x, groundY + h * 0.2, w * 0.4, w * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      // SMOKE: grey wisps that rise off the wreck and thin out, staggered so the
      // column churns rather than puffing as one.
      if (t > 0.28) {
        const puffs = 4;
        for (let i = 0; i < puffs; i++) {
          const st = clamp01((t - 0.28 - i * 0.06) / 0.62);
          if (st <= 0) continue;
          const rise = st * (h + 20);
          const drift = Math.sin(seed + i * 2.1 + st * 2.4) * 6;
          const px = x + Math.round(drift);
          const py = Math.round(groundY - h * 0.3 - rise);
          const pr = 3 + i + st * 8;
          ctx.globalAlpha = 0.32 * (1 - st) * (1 - st);
          ctx.fillStyle = i % 2 === 0 ? "#5c5c64" : "#48484f";
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      continue;
    }

    if (effect.kind === "crateBreak") {
      // A smashed crate's send-off: the box keels over (like a slain mob) and
      // bursts, then the broken-plank debris fades out, leaving just the loot
      // the engine already spilled. Timeline over `duration` (~700ms): tip the
      // intact crate onto its side (first ~200ms), swap to the `crate_broken`
      // debris pile, then fade the wreck out — a spray of splinters flying the
      // whole time. Purely cosmetic; the engine removed the obstacle the tick
      // it broke, so this plays on top at the spot it stood.
      const duration = effect.durationMs ?? 700;
      const age = duration - (effect.untilMs - timeMs); // ms since the break
      const tipMs = 200;
      const box = spriteByName(assets.sprites, effect.sprite ?? "crate");
      // Debris matches the container that broke: a `<sprite>_broken` twin if the
      // family ships one (a locker leaves buckled chrome, not cardboard planks),
      // falling back to the generic crate wreck.
      const debris =
        (effect.sprite &&
          spriteByName(assets.sprites, `${effect.sprite}_broken`)) ||
        spriteByName(assets.sprites, "crate_broken");
      // Splinters: a handful of wood chips thrown out from the box, arcing up
      // then down and fading over the first ~360ms. Seeded off the effect so a
      // burst is stable frame to frame (each chip a fixed bearing/speed).
      const splinterMs = 360;
      if (age < splinterMs) {
        const st = age / splinterMs; // 0 → 1
        const seed = effect.seed ?? 0;
        const chips = 7;
        ctx.save();
        for (let i = 0; i < chips; i++) {
          const ang = (i / chips) * Math.PI * 2 + (seed % 7) * 0.4;
          const speed = 10 + ((seed * (i + 3)) % 11);
          const reach = speed * st;
          const cx = x + Math.round(Math.cos(ang) * reach);
          const arc = Math.sin(st * Math.PI) * (6 + (i % 3) * 3);
          const cy =
            groundY - 5 + Math.round(Math.sin(ang) * reach * 0.5 - arc);
          ctx.globalAlpha = Math.max(0, 1 - st);
          ctx.fillStyle = i % 2 === 0 ? "#caa24d" : "#8a6a2c";
          const s = i % 3 === 0 ? 2 : 1;
          ctx.fillRect(cx, cy, s + 1, s);
        }
        ctx.restore();
      }
      if (age < tipMs && box) {
        // Keel the intact box over onto its side, pivoting about its feet, with
        // a little hop as it goes — the same read as a toppling mob.
        const t = age / tipMs;
        const eased = t * (2 - t);
        const tip = (effect.angle ?? Math.PI / 2) * 0.75 * eased;
        const hop = Math.round(Math.sin(t * Math.PI) * 3);
        const w = box.width;
        const h = box.height;
        ctx.save();
        ctx.translate(x, groundY + Math.round(h / 2) - hop);
        ctx.rotate(tip);
        ctx.drawImage(box, -Math.round(w / 2), -h);
        ctx.restore();
      } else if (debris) {
        // The wreck lies where it fell and fades out over the rest of its life.
        const fade = Math.min(1, (age - tipMs) / (duration - tipMs));
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - fade);
        ctx.drawImage(
          debris,
          x - Math.round(debris.width / 2),
          groundY - Math.round(debris.height / 2),
        );
        ctx.restore();
      }
      continue;
    }

    if (effect.kind === "damage") {
      // The hit's number pops on the victim's head and stays pinned there —
      // only XP floats now. A crit is a fat gold figure that jolts once —
      // a beat left, a beat right, then dead center for the rest of its
      // life — not a continuous buzz. A normal hit is a plain static number.
      // A crit's size tracks how hard it rolled: a glancing crit grows a
      // modest 1.5×, a top-of-band slam a fat 3× (quantized to half-steps so
      // the pixel glyphs stay crisp). It jolts harder the bigger it is.
      const duration = effect.durationMs ?? 650;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const crit = effect.crit ?? false;
      const power = effect.critPower ?? 0.5;
      const scale = crit ? Math.round((1.5 + 1.5 * power) * 2) / 2 : 1;
      const elapsedMs = t * duration;
      const shake = !crit
        ? 0
        : elapsedMs < 70
          ? -Math.round(scale)
          : elapsedMs < 140
            ? Math.round(scale)
            : 0;
      const text = formatCompact(effect.value ?? 0);
      const width = font.measure(text) * scale;
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      font.draw(
        ctx,
        text,
        x - Math.round(width / 2) + shake,
        groundY - font.height * scale,
        { scale, color: crit ? "#ffd75e" : "#f4f4f4" },
      );
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "text") {
      // A short word (e.g. "DODGE") rises and fades off the spot, like a
      // damage number but spelled out.
      const duration = effect.durationMs ?? 650;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const scale = effect.scale ?? 1;
      const elapsedMs = t * duration;
      // A crit-style float jolts in place before it lifts off: it snaps
      // left–right for a run of beats, settles to centre, THEN rises over the
      // remainder. The bigger the gain (the higher `scale`), the more beats it
      // throws and the wider it throws them — a 2× pop goes left–right–centre,
      // a 3× goes left–right–left–centre, and so on up. Plain floats
      // (DODGE/MISS) leave `shake` off and rise from the first frame.
      const stepMs = 55;
      // One alternating beat per unit of scale (min two so the smallest jolt
      // still reads as a shake), then a trailing centre beat, then the rise.
      const shakeBeats = effect.shake ? Math.max(2, Math.round(scale)) : 0;
      const settleMs = shakeBeats * stepMs; // alternation ends → centre
      const shakeMs = settleMs + stepMs; // centre beat held, then lift off
      // A touch more throw for bigger gains — past 2× the swing widens faster
      // than the glyph so a huge pull visibly rattles harder.
      const amp = Math.round(scale + Math.max(0, scale - 2) * 0.5);
      const jolt =
        shakeBeats === 0 || elapsedMs >= settleMs
          ? 0
          : (Math.floor(elapsedMs / stepMs) % 2 === 0 ? -1 : 1) * amp;
      const riseT = effect.shake
        ? Math.max(0, (elapsedMs - shakeMs) / (duration - shakeMs))
        : t;
      const rise = Math.round((effect.rise ?? 16) * riseT);
      const text = effect.text ?? "";
      const width = font.measure(text) * scale;
      const tx = x - Math.round(width / 2) + jolt;
      const ty = groundY - rise - font.height * scale;
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      // A hard 1px drop-shadow first so the word keeps contrast on both the
      // bright floor and the dark sky — the colored glyphs ride on top.
      font.draw(ctx, text, tx + 1, ty + 1, { scale, color: "#0b0d10" });
      font.draw(ctx, text, tx, ty, {
        scale,
        color: effect.color ?? "#7ecbff",
      });
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "swing") {
      // The EXACT region the swing strikes — a sector centred on the player, out
      // to the weapon's reach, spanning the weapon's full cone (`radius` = true
      // reach, `arc` = the full cone; the visual and the hit test share one
      // geometry) — but drawn as the blade CARVES it: the cone tracks the held
      // weapon's swing on the shared timeline (`MELEE_SWING_MS`,
      // SWING_WINDUP_END/STRIKE_END). It stays dark through the windup, then the
      // bright edge wipes from one rim to the other across the STRIKE window,
      // filling the arc behind it as the blade passes, and clears over the
      // recover. Companion swings (no held-weapon sprite) read the same — an
      // anticipated slash that sweeps and lands.
      const duration = effect.durationMs ?? MELEE_SWING_MS;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1 over the swing
      if (t < 0 || t > 1) continue;
      // Strike progress (0→1) across the same window the blade whips through,
      // eased to match `weaponPose`; nothing shows until the strike begins.
      const p = clamp01(
        (t - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END),
      );
      if (p <= 0) continue;
      const swept = 1 - (1 - p) * (1 - p); // ease-out, in step with the blade
      // Presence fades the whole slash out over the recover so it clears as the
      // blade folds home.
      const presence =
        1 - clamp01((t - SWING_STRIKE_END) / (1 - SWING_STRIKE_END));
      const aim = effect.angle ?? 0;
      const reach = Math.max(6, effect.radius ?? 40);
      // The true half-cone — no minimum, so a thrust draws exactly the thin
      // wedge it hits and a saturated (π) cone fills the whole disc.
      const half = Math.min(Math.PI, (effect.arc ?? 1.9) / 2);
      const start = aim - half;
      const lead = start + 2 * half * swept; // the blade's current edge
      ctx.save();
      ctx.translate(x, groundY);
      // Just a FAINT AoE footprint now — the ground the swing covers, so the hit
      // area still reads. The bright slash itself is drawn ON the blade in
      // drawPlayer (`drawBladeSlash`), riding the weapon rather than fanning out
      // of the hero's feet; this is only the quiet floor tint behind it.
      // Companion swings (no held-weapon sprite) still read off this footprint.
      ctx.globalAlpha = Math.max(0, 0.13 * presence);
      ctx.fillStyle = "#9fc4ff";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, start, lead);
      ctx.closePath();
      ctx.fill();
      // A thin rim edge along the swept front so the footprint's shape reads.
      ctx.globalAlpha = Math.max(0, 0.28 * presence);
      ctx.strokeStyle = "#c7ddff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "muzzle") {
      // A short flash at the muzzle / wand tip, a few px ahead along the aim,
      // in the firing weapon's signature (weapon-fx.ts) — the hero's own shots
      // carry their weapon's `fx`; companion/enemy shots fall to the plain
      // class look. Ranged bursts rays, magic blooms a ring.
      const duration = effect.durationMs ?? 110;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      if (t < 0 || t > 1) continue;
      // The weapon points where the hero FACES, not where the shot goes — so his
      // own flash fires out the barrel's side even when the target is behind
      // him. Force the horizontal to the facing side, keeping the aim's up/down
      // tilt. Companion/enemy shots (no `faceLeft`) flash straight along the aim.
      let aim = effect.angle ?? 0;
      if (effect.faceLeft !== undefined) {
        const c = Math.abs(Math.cos(aim)) * (effect.faceLeft ? -1 : 1);
        aim = Math.atan2(Math.sin(aim), c);
      }
      const mx = x + Math.round(Math.cos(aim) * 9);
      // Lift to the weapon's height (the hero holds it mid-body).
      const my = groundY + Math.round(Math.sin(aim) * 9) - 5;
      const style =
        effect.fx ??
        shotStyleFor(
          undefined,
          effect.weaponClass === "magic" ? "magic" : "ranged",
        );
      drawMuzzle(ctx, mx, my, aim, t, style);
      continue;
    }

    if (effect.kind === "nuke") {
      // The WORLD-anchored core of the screen-clearer: a scorch burned into the
      // floor at ground zero, staggered shockwave rings bursting out of it, and
      // a spray of embers flung across the field. The blinding flash, the light
      // bloom, the licking flames and the billowing smoke are a screen-space CSS
      // overlay on top (createNukeFx / .nuke-fx-layer) — this is only what must
      // stick to the blast point in the world as the camera pans.
      const duration = effect.durationMs ?? 900;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const seed = effect.seed ?? 0;
      ctx.save();
      // Scorch: burnt ground revealed UNDER the settling smoke — it fades in
      // over the back half and clears at the very end, so it never punches a
      // dark hole through the bright fireball at the front of the blast.
      const scorch =
        clamp01((t - 0.35) / 0.3) * (1 - clamp01((t - 0.82) / 0.18));
      ctx.globalAlpha = 0.42 * scorch;
      ctx.fillStyle = "#1a1310";
      ctx.beginPath();
      ctx.ellipse(x, groundY, 34, 34 * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      // Three shockwave rings, staggered, each a hot white-gold edge bursting
      // out to a wide radius and thinning as it goes.
      for (let r = 0; r < 3; r++) {
        const rt = clamp01((t - r * 0.12) / (1 - r * 0.12));
        if (rt <= 0) continue;
        const reach = 14 + rt * (150 + r * 46);
        const fade = (1 - rt) * (1 - rt);
        ctx.globalAlpha = 0.85 * fade;
        ctx.strokeStyle = r === 0 ? "#fff3cf" : "#ffb84a";
        ctx.lineWidth = Math.max(1, 4 * (1 - rt));
        ctx.beginPath();
        ctx.arc(x, groundY, reach, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Embers: sparks flung radially, arcing out and decelerating, cooling from
      // gold to ember-red as they fade. Seeded so they scatter identically each
      // frame (no per-frame Math.random in a render pass).
      const embers = 22;
      const et = clamp01(t / 0.85);
      const ease = 1 - (1 - et) * (1 - et); // ease-out throw
      for (let i = 0; i < embers; i++) {
        const a = fract(seed + i * 1.7) * Math.PI * 2;
        const speed = 60 + fract(seed + i * 3.1) * 150;
        const reach = speed * ease;
        const ex = x + Math.cos(a) * reach;
        const ey =
          groundY + Math.sin(a) * reach * 0.7 - Math.sin(et * Math.PI) * 18;
        ctx.globalAlpha = Math.max(0, 1 - et) * 0.95;
        ctx.fillStyle = et < 0.4 ? "#ffe9a6" : et < 0.7 ? "#ff9a3c" : "#e0451c";
        const s = fract(seed + i * 5.9) < 0.3 ? 2 : 1;
        ctx.fillRect(Math.round(ex), Math.round(ey), s + 1, s + 1);
      }
      ctx.restore();
      continue;
    }

    if (effect.kind === "spellcast") {
      // The marvellous cast BLOOM: an element-tinted flare at the hero the
      // instant a spell goes off (spell-fx.ts). It rides ON TOP of the shared
      // bolt/nova/heal cues, so even a defensive cast with no field FX still
      // reads as "magic just happened". The school shapes it: a sharp rotating
      // starburst for an attack, a broad expanding ring for AOE, a soft double
      // halo for a defensive ward.
      const duration = effect.durationMs ?? 420;
      const t = Math.max(0, 1 - (effect.untilMs - timeMs) / duration); // 0→1
      const fade = 1 - t;
      const ease = t * (2 - t);
      const color = effect.color ?? "#8fb7ff";
      const base = effect.radius ?? 40;
      const cy = groundY - 6; // lift to the hero's chest, not his feet
      ctx.save();
      ctx.lineCap = "round";
      // Core glow flash.
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, cy, 5 + 4 * ease, 0, Math.PI * 2);
      ctx.fill();
      // Expanding ring — widest for AOE, a tight snap for a single-target bolt.
      const ringScale =
        effect.category === "aoe"
          ? 1
          : effect.category === "defense"
            ? 0.85
            : 0.6;
      const reach = base * ringScale * (0.2 + 0.85 * ease);
      ctx.globalAlpha = 0.85 * fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, cy, reach, 0, Math.PI * 2);
      ctx.stroke();
      if (effect.category === "defense") {
        // A second, gentler halo — the ward's protective double ring.
        ctx.globalAlpha = 0.5 * fade;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, cy, reach * 0.66, 0, Math.PI * 2);
        ctx.stroke();
      }
      // A rotating starburst of rays — sharpest and longest for an attack.
      const rays = effect.category === "aoe" ? 10 : 8;
      const rayLen = base * (effect.category === "attack" ? 1.1 : 0.8) * ease;
      const spin = t * (effect.category === "attack" ? 2.4 : 1.2);
      ctx.globalAlpha = 0.8 * fade;
      ctx.lineWidth = effect.category === "attack" ? 2 : 1;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + spin;
        const inner = 4 + 3 * ease;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(
          x + Math.cos(a) * (inner + rayLen),
          cy + Math.sin(a) * (inner + rayLen),
        );
        ctx.stroke();
      }
      // Sparkle motes riding out on the bloom.
      ctx.fillStyle = color;
      for (let i = 0; i < 7; i++) {
        const a = fract(i * 7.1 + 1) * Math.PI * 2;
        const d = (0.3 + 0.7 * fract(i * 3.3 + 2)) * reach;
        ctx.globalAlpha = fade * (0.4 + 0.5 * fract(i * 5.7));
        const sx = Math.round(x + Math.cos(a) * d);
        const sy = Math.round(cy + Math.sin(a) * d);
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
      ctx.restore();
      continue;
    }

    if (effect.kind === "asteroidImpact") {
      // A METEOR DETONATION at the impact point: a white-hot flash core, a
      // shockwave ring bursting out to the blast radius, and a spinning dust
      // cloud that expands and thins as it rolls out — the "settling dust" the
      // crater is left under.
      const duration = effect.durationMs ?? 620;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const radius = effect.radius ?? 55;
      ctx.save();

      // Flash core: a hot flare in the opening beats, gone fast.
      if (t < 0.32) {
        const f = 1 - t / 0.32;
        ctx.globalAlpha = 0.85 * f;
        ctx.fillStyle = "#fff2cf";
        ctx.beginPath();
        ctx.arc(x, groundY, radius * (0.3 + 0.7 * t), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.7 * f;
        ctx.fillStyle = "#ffb24a";
        ctx.beginPath();
        ctx.arc(x, groundY, radius * (0.18 + 0.5 * t), 0, Math.PI * 2);
        ctx.fill();
      }

      // Shockwave ring: bursts out to the full blast radius and fades.
      const reach = radius * (0.25 + 0.9 * t);
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.strokeStyle = "#e8d2a6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, groundY, reach, reach * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Dust cloud: a ring of soft grey puffs that spin outward, expanding and
      // thinning — the spinning cloud with rising transparency, in pixels.
      const puffs = 9;
      const spin = t * 2.4;
      const cloudR = radius * (0.2 + 0.85 * t);
      ctx.globalAlpha = 0.5 * (1 - t) * (1 - t);
      ctx.fillStyle = "#b9bcc6";
      for (let i = 0; i < puffs; i++) {
        const a = spin + (i / puffs) * Math.PI * 2;
        const px = x + Math.cos(a) * cloudR;
        const py = groundY + Math.sin(a) * cloudR * 0.72;
        const pr = radius * (0.34 - 0.2 * t);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, pr), 0, Math.PI * 2);
        ctx.fill();
      }
      // A darker settling puff at ground zero.
      ctx.globalAlpha = 0.4 * (1 - t);
      ctx.fillStyle = "#7c7f88";
      ctx.beginPath();
      ctx.arc(x, groundY, radius * (0.5 - 0.3 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    if (effect.kind === "nova") {
      // A NOVA burst: a ring bursting out to its damage radius — a local
      // shockwave (no screen flash; novas fire often). A FROST nova (a
      // companion's chilling pulse) rings icy blue; the arcane proc/crit
      // burst rings violet.
      const duration = effect.durationMs ?? 320;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const reach = (effect.radius ?? 56) * (0.25 + 0.75 * t);
      const fade = 1 - t;
      const outer = effect.frost ? "120, 200, 245" : "184, 138, 232";
      const inner = effect.frost ? "214, 240, 255" : "230, 214, 255";
      ctx.strokeStyle = `rgba(${outer}, ${0.85 * fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, groundY, reach, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${inner}, ${0.5 * fade})`;
      ctx.beginPath();
      ctx.arc(x, groundY, reach * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    // A jagged bolt from the sky to the strike point, plus a hot flash.
    ctx.strokeStyle = "#ffd75e";
    ctx.beginPath();
    ctx.moveTo(x + 6, Math.max(0, groundY - 90));
    ctx.lineTo(x - 3, groundY - 55);
    ctx.lineTo(x + 4, groundY - 30);
    ctx.lineTo(x, groundY);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 245, 200, 0.9)";
    ctx.fillRect(x - 2, groundY - 2, 4, 4);
  }
}
