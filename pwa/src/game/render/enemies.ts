// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The horde: fog/line-of-sight culling, wounded sprite stages, menace and
// rarity auras, telegraphs, enrage/last-stand tells, and the two-pass health
// bars drawn over the whole crowd.

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

import { spriteTopLeft } from "./shared.ts";
import { type Sprites } from "../assets.ts";
import { getSettings } from "../settings.ts";
import { enemySprites, opaqueWidth } from "./caches.ts";
import { fogDistanceAt, type FogField } from "./fog.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

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

export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
  field: FogField,
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
    if (!enemyVisible(state, state.player.pos, enemy.pos, def.radius)) continue;
    // Offset the float phase per enemy so the haunting doesn't bob in sync.
    // This same idle bob keeps speakers visibly alive during dialogue —
    // it runs on render time, which never freezes.
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
    const sprite = stage[frame] ?? sprites.ghost_0;
    const bob = Math.round(Math.sin(timeMs / 260 + enemy.id) * 1.5);
    const at = spriteTopLeft(enemy.pos, sprite, camera);
    const x = at.x;
    const y = at.y + bob;
    // An evolved minion (menace stage stamped at spawn) wears a pulsing warm
    // aura that intensifies and reddens with its stage — the readable tell
    // that a rampage has toughened the horde it lured in.
    const evo = enemy.evo ?? 0;
    if (evo > 0) {
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
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
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
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
    // A TELEGRAPHED move winding up (mechanics.ts): the mob is rooted, so
    // the tell must carry — a fast white/red strobe ring plus, for a slam,
    // the danger circle the shockwave will fill; for a charge, the locked
    // bearing drawn as a lunge line. Read the dodge, earn the dodge.
    const telegraph = enemy.mech?.telegraph;
    if (telegraph) {
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
      const strobe = Math.floor(timeMs / 90) % 2 === 0;
      ctx.strokeStyle = strobe ? "#ffffff" : "#ff4030";
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      if (telegraph.kind === "slam") {
        const slam = activeMechanics(enemy, def)?.slam;
        if (slam) {
          ctx.beginPath();
          ctx.arc(cx, cy, slam.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (telegraph.dir) {
        const charge = activeMechanics(enemy, def)?.charge;
        const reach = (charge?.range ?? 120) * 1.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          Math.round(cx + telegraph.dir.x * reach),
          Math.round(cy + telegraph.dir.y * reach),
        );
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // An ENRAGED set piece burns: a steady red aura under the sprite, the
    // standing tell that its speed and blows are up for good.
    if (enemy.mech?.enraged) {
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
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
    // A departing apparition dissolves: fade with its linger countdown.
    if (enemy.vanishMs !== undefined) {
      ctx.globalAlpha = Math.min(
        ctx.globalAlpha,
        Math.max(0, enemy.vanishMs / APPARITION.lingerMs),
      );
    }
    if (!critBlink) ctx.drawImage(sprite, x, y);
    ctx.globalAlpha = 1;

    // Health over the head. Bosses and elites always carry a bar once wounded,
    // and so do RARE/UNIQUE mobs — the special-monster tell that reads them as
    // the mini-bosses they fight like, in their aura's color. A plain minion
    // gets one only when the HEALTH BARS display setting is on, drawn thin and
    // trimmed just inside its silhouette since it holds so little hp. All are
    // collected here and drawn in the pass below, so a mob in front never
    // paints over another's bar.
    const plainMinion = def.role === "minion" && !def.rarity;
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
        : def.role === "boss"
          ? "#d83a3a"
          : def.role === "elite"
            ? "#d9a0f0"
            : "#e05050";
      healthBars.push({
        x: enemy.pos.x - camera.x,
        y: y - (plainMinion ? 3 : 6),
        width,
        height: plainMinion ? 1 : 3,
        color,
        hpFrac: enemy.hp / enemy.maxHp,
      });
    }
  }
  // Second pass: paint every collected bar on top of the drawn horde.
  for (const bar of healthBars) {
    const bx = Math.round(bar.x - bar.width / 2);
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(bx - 1, bar.y - 1, bar.width + 2, bar.height + 2);
    ctx.fillStyle = bar.color;
    ctx.fillRect(
      bx,
      bar.y,
      Math.max(1, Math.round(bar.width * bar.hpFrac)),
      bar.height,
    );
  }
}
