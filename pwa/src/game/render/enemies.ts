// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The horde: fog/line-of-sight culling, wounded sprite stages, menace and
// rarity auras, telegraphs, enrage/last-stand tells, and the two-pass health
// bars drawn over the whole crowd.

import { localHero } from "../local-seat.ts";
import {
  activeMechanics,
  APPARITION,
  enemyDef,
  LAST_STAND,
  lineOfSight,
  MAP,
  WOUNDS,
  type GameState,
} from "@game/core";
import { normalize } from "@game/lib/vec.ts";

import { clamp01, seatX, seatY, spriteTopLeft } from "./shared.ts";
import { spriteByName, type Sprites } from "../assets.ts";
import { getSettings } from "../settings.ts";
import { enemySprites, opaqueWidth } from "./caches.ts";
import { fogDistanceAt, type FogField } from "./fog.ts";
import { drawFloatShadow, floatLift, walkGait, withStance } from "./gait.ts";
import { beginBillboard, billboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** The windup a telegraph's ground marks ramp over. Longer than most windups
 * on purpose: a mark that finished growing early would stop reading as a
 * countdown, and one that never finished would never reach full strength. */
const TELL_RAMP_MS = 900;
/** Grit puffs kicked up along a charge's locked lane. */
const CHARGE_GRIT = 7;

/** How far ABOVE a sprite's bottom edge its shadow sits (px). A floating body is
 * drawn LIFTED off that edge, so the shadow has to come up to meet where its
 * feet would have been — left at the cell's bottom row it opens a gap the eye
 * reads as a second object on the floor rather than as this one's shadow. */
const SHADOW_INSET = 4;

/**
 * Can the hero actually SEE a body of `radius` at `pos` — or is it fully hidden
 * behind cover? A mob tucked behind a wall or boulder (the same TALL obstacles
 * that stop shots; jumpable low rocks never occlude) isn't drawn. We test the
 * hero's sightline to the body's centre first, and — only if that's blocked —
 * to its two silhouette edges (the points ±radius across the line of sight), so
 * a mob merely PEEKING out from behind cover still reads. It's culled only when
 * no part of it has line of sight, matching "the player has no line of sight to
 * it". The centre test alone clears every mob standing in the open in one query.
 */
function enemyVisible(
  state: GameState,
  eye: { x: number; y: number },
  pos: { x: number; y: number },
  radius: number,
): boolean {
  if (lineOfSight(state, eye, pos)) return true;
  const n = normalize(pos.x - eye.x, pos.y - eye.y);
  // Unit perpendicular to the sightline, scaled to the body's half-width: the
  // left/right edges of the silhouette as the hero sees it.
  const ex = -n.y * radius;
  const ey = n.x * radius;
  return (
    lineOfSight(state, eye, { x: pos.x + ex, y: pos.y + ey }) ||
    lineOfSight(state, eye, { x: pos.x - ex, y: pos.y - ey })
  );
}

/**
 * Draw the horde. `barFade` (default 1) dims the health-bar pass only — the
 * death scene eases it to 0 so the crowd rings the fallen hero as a wall of
 * silhouettes instead of a wall of frozen hp bars (render/death.ts
 * `combatNoiseFade`); the bodies themselves are the tableau and never fade.
 */
export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
  field: FogField,
  barFade = 1,
): void {
  // Health bars are collected here and drawn in a second pass below, so a mob
  // drawn later in the loop never paints over an earlier mob's bar — every bar
  // stays legible on top of the whole horde.
  const healthBars: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    hpFrac: number;
    /** Where on the ground the body it belongs to is standing. The bars are
     * flushed AFTER the loop, outside the billboard each mob was drawn in, so
     * each one has to re-enter its owner's (render/tilt.ts). */
    worldX: number;
    worldY: number;
  }[] = [];
  const minionBarsOn = getSettings().healthBars === "on";
  for (const enemy of state.enemies) {
    if (!inView(enemy.pos.x, enemy.pos.y, 48)) continue;
    // Hidden by the fog: a mob standing in the frontier transition band (or the
    // unseen dark past it) is not drawn — the horde only appears once it stands
    // on ground the hero has fully uncovered.
    if (fogDistanceAt(field, enemy.pos.x, enemy.pos.y) < MAP.fogBand) continue;
    const def = enemyDef(enemy.defId);
    // Line of sight: a mob standing behind a wall or boulder — cover the hero
    // genuinely cannot see through, the same solids that eat his shots — is not
    // drawn until it steps into view (a peeking silhouette still shows). Runs
    // after the cheap view/fog culls so only on-screen mobs pay for the query.
    if (!enemyVisible(state, localHero(state).pos, enemy.pos, def.radius))
      continue;
    // A BODY STANDS UP out of the tilted floor (render/tilt.ts): every screen
    // coordinate below is written as if the camera still looked straight down,
    // and the mob's projected spot on the ground is what moves. The ground
    // marks its telegraphs lay down go through the same wrap — a slam's
    // footprint is already an authored ellipse, so foreshortening it a second
    // time would flatten it to a line.
    beginBillboard(ctx, enemy.pos.x, enemy.pos.y, camera.x, camera.y);
    // The two-frame idle shimmer runs on render time, which never freezes, so a
    // mob stays visibly alive through its own dialogue. Its GAIT is a separate
    // thing entirely, measured below off the ground it actually covers.
    const frame = Math.floor(timeMs / 300 + enemy.id) % 2;
    // Battle damage: sprites swap to wounded variants as hp falls — every
    // mob at half, elites and bosses heavier below a quarter, bosses in a
    // dying last stand at the bottom (thresholds in config.WOUNDS /
    // LAST_STAND). Missing variants degrade to the base frame.
    const hpFrac = enemy.hp / enemy.maxHp;
    const lastStand = def.role === "boss" && hpFrac <= LAST_STAND.hpFraction;
    const variants = enemySprites(sprites, def.sprite);
    const stage = lastStand
      ? variants.dying
      : def.role !== "minion" && hpFrac <= WOUNDS.wreckedAt
        ? variants.wrecked
        : hpFrac <= WOUNDS.hurtAt
          ? variants.hurt
          : variants.base;
    // THE CAST POSE — a mob winding up a telegraphed move wears its OWN
    // authored frames for it (`<sprite>_cast_0/1`) when it has any. This is the
    // tell, and it deliberately sits on the CHARACTER rather than on the floor:
    // a player who learns to watch the boss beats a player who learns to watch
    // for a marker, and the pose is legible the instant it appears rather than
    // after a ring has finished growing. Resolved by naming convention, exactly
    // like the wound stages above, so a boss earns the treatment by shipping
    // the two frames and nothing has to be registered anywhere.
    // The frames run on a FASTER clock than the idle shimmer, so the windup
    // visibly builds — a cast pose ticking at the idle rate reads as a mob
    // standing still, which is the one thing it must not read as.
    const casting = enemy.mech?.telegraph !== undefined;
    const castFrame = Math.floor(timeMs / 110) % 2;
    const cast = casting
      ? spriteByName(sprites, `${def.sprite}_cast_${castFrame}`)
      : undefined;
    const sprite = cast ?? stage[frame] ?? sprites.ghost_0;
    // HOW IT GETS ABOUT (`EnemyDef.locomotion`, drawn by gait.ts). A mob on
    // LEGS tips softly left and right about its feet, harder and faster the
    // faster it is actually covering ground, and breathes where it stands. A
    // FLOATER hangs a few px off the floor on a slow drift, over a shadow. A
    // WHEELED thing does neither — a rover that rocked like a walker would read
    // as a machine pretending to have legs.
    const key = `e${enemy.id}`;
    const loco = def.locomotion ?? "legs";
    const floats = loco === "float";
    const gait = loco === "legs" ? walkGait(key, enemy.pos, timeMs) : null;
    const lift = floats ? floatLift(key, timeMs) : (gait?.lift ?? 0);
    const at = spriteTopLeft(enemy.pos, sprite, camera);
    const x = at.x;
    const y = at.y + Math.round(lift);
    // The shadow goes down BEFORE the body and before every aura, so the crowd's
    // glows lie over the floor rather than under it. Placed at the feet the mob
    // would have had, which is the only thing that sells the hover as height.
    const groundY =
      seatY(enemy.pos.y, camera.y) +
      Math.round(sprite.height / 2) -
      SHADOW_INSET;
    // A departing apparition dissolves over its linger countdown — shadow and
    // all, since a shadow outliving the body that cast it is a hole in the floor.
    const vanishFade =
      enemy.vanishMs === undefined
        ? 1
        : Math.max(0, enemy.vanishMs / APPARITION.lingerMs);
    if (floats) {
      drawFloatShadow(
        ctx,
        sprites.shadow,
        seatX(enemy.pos.x, camera.x),
        groundY,
        opaqueWidth(sprite),
        lift,
        vanishFade,
      );
    }
    // An evolved minion (menace stage stamped at spawn) wears a pulsing warm
    // aura that intensifies and reddens with its stage — the readable tell
    // that a rampage has toughened the horde it lured in.
    const evo = enemy.evo ?? 0;
    if (evo > 0) {
      const cx = seatX(enemy.pos.x, camera.x);
      const cy = seatY(enemy.pos.y, camera.y) + Math.round(lift);
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 200 + enemy.id);
      ctx.globalAlpha = 0.12 + 0.1 * pulse;
      ctx.fillStyle = evo >= 4 ? "#ff5030" : evo >= 2 ? "#ff9040" : "#ffd050";
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 3 + evo, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // A RARE or UNIQUE mob (config RARE_MOBS) wears a steady jeweled aura —
    // the Diablo special-monster glow: cool blue for a rare, radiant gold for
    // a one-of-a-kind unique — so the special find reads at a glance over the
    // recolored body, wherever it stands in the horde.
    if (def.rarity) {
      const cx = seatX(enemy.pos.x, camera.x);
      const cy = seatY(enemy.pos.y, camera.y) + Math.round(lift);
      const unique = def.rarity === "unique";
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 260 + enemy.id);
      // Two nested rings — a soft body halo under a brighter rim — so the tell
      // reads without washing out the sprite it wraps.
      ctx.fillStyle = unique ? "#ffcf40" : "#5cc8ff";
      ctx.globalAlpha = (unique ? 0.16 : 0.13) + 0.09 * pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + (unique ? 6 : 4), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = (unique ? 0.5 : 0.4) + 0.2 * pulse;
      ctx.strokeStyle = unique ? "#ffe38a" : "#a6e0ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + (unique ? 7 : 5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // A HELLBORN mob (config HELLGATES — what a rampage-only hellgate lets
    // through) burns with a RIFT halo: violet-into-magenta, the tear's own
    // colors, wider and harder than the evolution glow it draws over so an
    // elite-sized horror out of another universe never reads as rank and file.
    // Two counter-phased rings breathe against each other, so the aura churns
    // rather than merely pulsing.
    if (def.hellborn) {
      const cx = seatX(enemy.pos.x, camera.x);
      const cy = seatY(enemy.pos.y, camera.y) + Math.round(lift);
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 190 + enemy.id);
      const churn = 0.5 + 0.5 * Math.sin(timeMs / 310 - enemy.id);
      ctx.fillStyle = "#7a2ce0";
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 7 + churn * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 + 0.25 * churn;
      ctx.strokeStyle = "#ec52be";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 9 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // A TELEGRAPHED move winding up (mechanics/): the mob is rooted, so the
    // tell has to carry — but it is drawn as a thing happening IN THE WORLD,
    // never as an annotation over it. What used to be here was a strobing
    // white/red `ctx.arc` ring around the body, a stroked circle for the slam's
    // footprint and a `ctx.lineTo` for the charge's bearing: shapes, in a game
    // where every other pixel is authored art. A stroked circle reads as a
    // debug overlay because that is exactly what a stroked circle is.
    //
    // So the read is carried by three things instead, in this order of
    // importance: the CAST POSE on the mob itself (above — his eyes light, he
    // draws himself up), the GROUND the move is about to happen to, and only
    // then a hint of light on the body. The ground marks borrow the asteroid
    // strike's language (render/hazards.ts) — a soft shadow that firms and
    // tightens as the moment nears, deliberately understated — because the
    // game already taught the player to read exactly that.
    const telegraph = enemy.mech?.telegraph;
    if (telegraph) {
      const cx = seatX(enemy.pos.x, camera.x);
      const cy = seatY(enemy.pos.y, camera.y) + Math.round(lift);
      const groundCy = seatY(enemy.pos.y, camera.y);
      // 0 → 1 across the windup. Every mark below ramps on it, so a tell that
      // is about to land looks nothing like a tell that just started.
      const near = clamp01(1 - telegraph.remainingMs / TELL_RAMP_MS);
      if (telegraph.kind === "slam") {
        // THE FOOTPRINT: the ground the shockwave will take, as a pressure
        // shadow pooling under him — dark, soft-edged, and drawn flat (a
        // squashed ellipse) so it lies ON the floor rather than hooping around
        // him in the air.
        const slam = activeMechanics(enemy, def)?.slam;
        if (slam) {
          ctx.save();
          const r = slam.radius * (1.12 - 0.12 * near);
          const grad = ctx.createRadialGradient(
            cx,
            groundCy,
            r * 0.2,
            cx,
            groundCy,
            r,
          );
          grad.addColorStop(0, "rgba(210,60,40,0.34)");
          grad.addColorStop(0.72, "rgba(150,30,20,0.20)");
          grad.addColorStop(1, "rgba(90,16,10,0)");
          ctx.globalAlpha = 0.35 + 0.5 * near;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(cx, groundCy, r, r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (telegraph.kind === "charge" && telegraph.dir) {
        // THE LANE: grit kicking up off the ground he is about to tear down —
        // the same read the stampede's approach dust gives, and the same
        // sprites the hero's own boots throw. It thickens toward him, so the
        // lane points back at what is about to come down it.
        const charge = activeMechanics(enemy, def)?.charge;
        const reach = (charge?.range ?? 120) * 1.3;
        ctx.save();
        for (let i = 1; i <= CHARGE_GRIT; i++) {
          const t = i / (CHARGE_GRIT + 1);
          const d = reach * t;
          const grit = spriteByName(
            sprites,
            `ground_grit_${(i + Math.floor(timeMs / 120)) % 2}`,
          );
          if (!grit) break;
          // Nearest the mob kicks hardest and earliest in the windup.
          const bite = clamp01(near * 1.6 - t);
          if (bite <= 0) continue;
          ctx.globalAlpha = 0.5 * bite;
          ctx.drawImage(
            grit,
            Math.round(cx + telegraph.dir.x * d - grit.width / 2),
            Math.round(groundCy + telegraph.dir.y * d - grit.height / 2),
          );
        }
        ctx.restore();
      }
      // The body's own light, for a mob with no cast pose of its own to strike
      // — a warm rim swelling under it as the windup runs out, so an elite
      // that has never been drawn a cast frame still reads as winding up.
      // A boss WITH cast frames needs none of this: it is already acting.
      if (!cast) {
        ctx.save();
        ctx.globalAlpha = 0.12 + 0.3 * near;
        ctx.fillStyle = "#ffb060";
        ctx.beginPath();
        ctx.arc(cx, cy, def.radius + 2 + 4 * near, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // An ENRAGED set piece burns: a steady red aura under the sprite, the
    // standing tell that its speed and blows are up for good.
    if (enemy.mech?.enraged) {
      const cx = seatX(enemy.pos.x, camera.x);
      const cy = seatY(enemy.pos.y, camera.y) + Math.round(lift);
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 120 + enemy.id);
      ctx.globalAlpha = 0.18 + 0.1 * pulse;
      ctx.fillStyle = "#ff3020";
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // A critical hit blinks the victim — skip alternating 60ms windows.
    const critBlink =
      (enemy.critFlashMs ?? 0) > 0 && Math.floor(timeMs / 60) % 2 === 0;
    // A boss on its last stand flickers: the tell that it now hits harder.
    if (lastStand && Math.floor(timeMs / 140) % 2 === 1) {
      ctx.globalAlpha = 0.55;
    }
    if (vanishFade < 1) {
      ctx.globalAlpha = Math.min(ctx.globalAlpha, vanishFade);
    }
    if (!critBlink) {
      // The tip pivots on the body's own base, so it rocks over its feet — the
      // auras and telegraphs above are rings about its centre and gain nothing
      // from rotating, so they stay out of the transform.
      withStance(
        ctx,
        { x: seatX(enemy.pos.x, camera.x), y: y + sprite.height },
        { tilt: gait?.tilt ?? 0 },
        () => ctx.drawImage(sprite, x, y),
      );
    }
    ctx.globalAlpha = 1;

    // Health over the head. Bosses and elites always carry a bar once wounded,
    // and so do RARE/UNIQUE mobs — the special-monster tell that reads them as
    // the mini-bosses they fight like, in their aura's color. A plain minion
    // gets one only when the HEALTH BARS display setting is on, drawn thin and
    // trimmed just inside its silhouette since it holds so little hp. All are
    // collected here and drawn in the pass below, so a mob in front never
    // paints over another's bar.
    // HELLBORN mobs join the rare/unique exception: they fight like elites and
    // carry an elite's bar, in their rift violet, whatever the display setting.
    const plainMinion = def.role === "minion" && !def.rarity && !def.hellborn;
    const showBar = !plainMinion || minionBarsOn;
    if (showBar && enemy.hp < enemy.maxHp) {
      const width = plainMinion
        ? // Trim the visible-body width by 2 so the bar sits inside the
          // sprite's silhouette rather than reaching its edges.
          Math.max(2, opaqueWidth(sprite) - 2)
        : def.role === "boss"
          ? 40
          : 28;
      const color = def.rarity
        ? def.rarity === "unique"
          ? "#ffcf40"
          : "#5cc8ff"
        : def.hellborn
          ? "#c05cff"
          : def.role === "boss"
            ? "#d83a3a"
            : def.role === "elite"
              ? "#d9a0f0"
              : "#e05050";
      healthBars.push({
        x: seatX(enemy.pos.x, camera.x),
        y: y - (plainMinion ? 3 : 6),
        width,
        height: plainMinion ? 1 : 3,
        color,
        hpFrac: enemy.hp / enemy.maxHp,
        worldX: enemy.pos.x,
        worldY: enemy.pos.y,
      });
    }
    endBillboard(ctx);
  }
  // Second pass: paint every collected bar on top of the drawn horde. Drawn
  // outside every billboard, so each bar re-applies its own owner's shift and
  // is stretched back to full height — a bar squashed with the floor would be
  // a hair thick and read as a scratch.
  if (barFade <= 0) return;
  ctx.globalAlpha = barFade;
  for (const bar of healthBars) {
    const bx = bar.x - Math.round(bar.width / 2);
    billboard(ctx, bar.worldX, bar.worldY, camera.x, camera.y, () => {
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(bx - 1, bar.y - 1, bar.width + 2, bar.height + 2);
      ctx.fillStyle = bar.color;
      ctx.fillRect(
        bx,
        bar.y,
        Math.max(1, Math.round(bar.width * bar.hpFrac)),
        bar.height,
      );
    });
  }
  ctx.globalAlpha = 1;
}
