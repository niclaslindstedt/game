// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Renders a running cutscene (see @game/lib/cutscene + defs/cutscenes.ts):
// a letterboxed side-view stage drawn on its own canvas — backdrop, props,
// actors (bottom-anchored, painter-sorted by y), fade — with the current
// caption/dialogue line as DOM pixel text in a JRPG dialogue box floating
// over the stage bottom (never pushing the stage around). Text beats hold
// until the player taps. The overlay only DRAWS; advancing the scene is the
// caller's job (the game loop steps it, the preview page steps its own
// copy), so one component serves both.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";

import {
  currentLine,
  cutsceneDef,
  withHeroName,
  withHeroNameLines,
  type CutsceneProp,
  type CutsceneState,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { wrapPage } from "@ui/lib/text-pager.ts";
import { useTextColumn } from "@ui/lib/use-text-column.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { spriteByName, spriteCursor, type GameAssets } from "../assets.ts";
import { sootedSprite, spriteCrown } from "../render/caches.ts";
import { drawNightSky } from "../render/night-sky.ts";
import {
  drawRiftPortal,
  riftPortalBob,
  riftPortalLook,
} from "../render/rift-portal.ts";
import {
  BLAST_SPENT_MS,
  drawPropFire,
  drawRocketExhaust,
  propFireLevel,
  rocketExhaustLook,
  rocketPadLook,
  SCAR_LEVEL,
  SCAR_SPAN,
  sootLevel,
  type RocketExhaust,
} from "../render/rocket-exhaust.ts";

/** The reveal state the overlay publishes so the app's keyboard advance can
 * share the tap's two-step semantics (finish the crawl, then turn the beat). */
export type CutsceneReveal = { done: boolean; skip: () => void };

const EMPTY_LINE: string[] = [];

/** CSS pixels per stage pixel — scenes zoom in closer than gameplay. */
const STAGE_SCALE = 3;

/** Integer pixel scale a cutscene line is drawn at — mirror of the `scale`
 * prop below. Turns the measured CSS column width into the unscaled font
 * pixels `font.wrap` speaks. */
const TEXT_SCALE = 2;

/**
 * Loose safety cap for one row's `PixelText`, in rem: the `.cutscene-line` box
 * caps at 36rem, less its 1.2rem side padding. Rows are already flowed to the
 * box's measured column, so this only catches the degenerate case (column not
 * yet measured). Keep in step with `.cutscene-line` in styles.css.
 */
const CUTSCENE_TEXT_REM = 33;

/**
 * THE BACKDROPS THAT ARE A REAL SKY RATHER THAN A FLAT WALL — keyed by the
 * scene's own `stage.backdrop`, which is exactly what that field is for (the
 * renderer's name for the setting) and which is why this is a set of ids rather
 * than a per-scene branch.
 *
 * A scene in here is played against the night the DRIVE is played against
 * (`render/night-sky.ts`): the same wash, the same moon, the same starfield,
 * the same three cloud bands and the same open country along the horizon. The
 * launch is the reason — the hero lifts off his own lawn, on the road the car
 * later drives, and the sky over it was a moon prop and four star tiles that
 * agreed with nothing.
 *
 * IT IS HUNG STILL. There is no travel to parallax against and no reason for a
 * cutscene sky to fidget behind the acting, so the twinkle is off and the only
 * thing moving up there is the clouds' own slow drift.
 */
const SKY_BACKDROPS: ReadonlySet<string> = new Set(["garageNight"]);

/**
 * The rocket on this stage — where it is standing, and how long its engine has
 * been lit (0 while it is parked cold).
 *
 * ONE PER SCENE, deliberately: everything a rocket does to its surroundings is
 * a question of distance from a single point, and a scene with two of them
 * would be answering a question nobody has asked yet.
 *
 * IT IS FOUND WHETHER OR NOT IT IS BURNING, because the mark it has already
 * left is on the ground before the beat that lights it — the lawn under a ship
 * that has flown before is dead from the first frame of the scene.
 *
 * …AND THE MARK OUTLIVES THE BURN, which is the other half of the same idea and
 * the half a scene that only ever LIGHTS a rocket never had to answer. The
 * blast's clock is the engine's own `poseMs` while it is lit; once it is out,
 * what it blackened stays blackened (`BLAST_SPENT_MS`). Reading a dead engine's
 * clock instead would take the soot and the burning roof off the house in the
 * one frame the ship cuts its motor — which is exactly what the homecoming's
 * touchdown does (`content/cutscenes/earth_return.yaml`).
 *
 * WHETHER IT WAS EVER LIT is read off `poseMs` against the scene's own elapsed
 * time, and that is exact rather than a guess: `stepCutscene` adds the same
 * `dtMs` to both, and only a pose that actually CHANGES the sprite resets the
 * one — so `poseMs < timeMs` is precisely "this actor has been re-posed". A
 * rocket has two sprites and one of them is the fire, so a re-posed rocket
 * standing here cold has burned.
 */
function stagedRocket(
  cutscene: CutsceneState,
): { x: number; ageMs: number; look: RocketExhaust } | undefined {
  for (const actor of cutscene.actors) {
    const look = actor.hidden ? undefined : rocketPadLook(actor.sprite);
    if (!look) continue;
    if (rocketExhaustLook(actor.sprite)) {
      return { x: actor.pos.x, ageMs: actor.poseMs, look };
    }
    const spent = actor.poseMs < cutscene.timeMs;
    return { x: actor.pos.x, ageMs: spent ? BLAST_SPENT_MS : 0, look };
  }
  return undefined;
}

/** One horizontal wash of char across the ground, centred on the pad. */
function scorchGround(
  ctx: CanvasRenderingContext2D,
  x: number,
  span: number,
  level: number,
  top: number,
  width: number,
  height: number,
): void {
  if (level <= 0 || top >= height) return;
  const wash = ctx.createLinearGradient(x - span, 0, x + span, 0);
  const edge = (level * 0.15).toFixed(3);
  wash.addColorStop(0, `rgba(12, 11, 10, ${edge})`);
  wash.addColorStop(0.5, `rgba(12, 11, 10, ${level.toFixed(3)})`);
  wash.addColorStop(1, `rgba(12, 11, 10, ${edge})`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, top, width, height - top);
}

function drawStage(
  ctx: CanvasRenderingContext2D,
  cutscene: CutsceneState,
  assets: GameAssets,
  timeMs: number,
): void {
  const def = cutsceneDef(cutscene.defId);
  const { width, height } = def.stage;
  // The scene carries its own backdrop palette (defs/cutscenes.ts); the
  // renderer only supplies neutral fallbacks for a scene that omits one.
  const backdrop = def.stage.palette;
  const paint = {
    wall: backdrop?.wall ?? "#262838",
    floor: backdrop?.floor ?? "#3a3c4c",
    trim: backdrop?.trim ?? "#1a1c28",
    floorY: backdrop?.floorY ?? Math.round(height * 0.65),
  };

  // The camera shift (stage drift + pan beats) scrolls the backdrop and the
  // props; actors are screen-pinned. The floor line rides it at full depth —
  // a downward pan sends the ground falling out of frame (the launch's
  // ascent), so the wall paints the whole frame first and the floor is laid
  // over whatever part of it is still on screen.
  const shift = cutscene.shift;
  const floorY = Math.round(paint.floorY + shift.y);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = paint.wall;
  ctx.fillRect(0, 0, width, height);
  if (SKY_BACKDROPS.has(def.stage.backdrop)) {
    // THE CAMERA SHIFT IS HANDED TO THE SKY WHOLE, both axes, and the sky
    // spends it the way the props do: by depth. A `pan` beat that climbs — the
    // launch's, following the ship up — sends the lot down the frame at full
    // depth, the hedgerows behind it at two thirds, the ridge behind THEM at a
    // third, the clouds at a fifth and the stars at a fiftieth. That ladder is
    // the shot; a backdrop that moved as one piece would read as a painted
    // flat being winched.
    drawNightSky(ctx, assets.sprites, -shift.x, width, floorY, timeMs, {
      twinkle: false,
      cameraY: shift.y,
    });
  }
  // WHAT IS BURNING ON THIS STAGE, if anything: the lit rocket's mark and how
  // long it has been lit. Found once, before anything is placed, because the
  // ground and every prop standing on it have to be asked how close they are.
  const blast = stagedRocket(cutscene);

  if (floorY < height) {
    ctx.fillStyle = paint.floor;
    ctx.fillRect(0, Math.max(0, floorY), width, height - Math.max(0, floorY));
    ctx.fillStyle = paint.trim;
    ctx.fillRect(0, floorY, width, 2);
    // Faint floorboards give the room depth without a tile pass.
    for (let y = floorY + 14; y < height; y += 14) {
      if (y >= 0) ctx.fillRect(0, y, width, 1);
    }
    // …AND THE GROUND IS BURNT IN TWO PASSES, because two different things
    // burnt it. The SCAR is the tight dead patch a ship that has flown before
    // has already left under itself — there before the engine lights, and small
    // enough that the lawn past the house is still a lawn. Over it goes the
    // blast's own wash, wider and darker, as this launch adds its share.
    if (blast) {
      const top = Math.max(0, floorY);
      const span = blast.look.reach;
      scorchGround(
        ctx,
        blast.x,
        span * SCAR_SPAN,
        SCAR_LEVEL,
        top,
        width,
        height,
      );
      scorchGround(
        ctx,
        blast.x,
        span * 2,
        sootLevel(blast.look, blast.ageMs, 0),
        top,
        width,
        height,
      );
    }
  }

  const place = (prop: CutsceneProp): Placed => {
    const depth = prop.parallax ?? 1;
    const x = prop.pos.x + shift.x * depth;
    return {
      sprite: prop.kind,
      x,
      y: prop.pos.y + shift.y * depth,
      flip: false,
      wrap: prop.wrap ?? false,
      jitter: 0,
      lift: 0,
      ...(blast
        ? {
            soot: {
              dx: blast.x - x,
              ageMs: blast.ageMs,
              look: blast.look,
              standing: !prop.ground,
            },
          }
        : {}),
    };
  };
  const props = def.stage.props
    // A `prop` beat can take a piece off the stage mid-scene — the wall
    // weapon the moment the hero has it in his hand.
    .filter((prop) => !(prop.id && cutscene.hiddenProps.includes(prop.id)));
  // Art that LIES ON THE GROUND — the launch scene's driveway and the road
  // across the front of the lot — is painted with the floor, in its own queue
  // under everything standing. A slab is anchored at its NEAR edge, so left in
  // the standing queue it would sort in front of every actor walking on it.
  const floorQueue: Placed[] = props.filter((p) => p.ground).map(place);
  const queue: Placed[] = props.filter((p) => !p.ground).map(place);
  for (const actor of cutscene.actors) {
    if (actor.hidden) continue;
    // Off the ground the actor holds its airborne frame; walking alternates
    // `<sprite>_0/_1`; idle holds frame 0.
    const frame =
      actor.lift > 0 ? "jump" : actor.moving ? Math.floor(timeMs / 220) % 2 : 0;
    // A LIT ROCKET measures itself against the mark it was authored on — the
    // pad — which rides the camera at full depth like the ground it is part of.
    // Read off the actor's OWN sprite, never the framed name above: a rocket
    // that is off the ground is asked for a jump frame no rocket table knows.
    const pad = def.actors.find((a) => a.id === actor.id)?.at.y;
    const exhaust = rocketExhaustLook(actor.sprite);
    queue.push({
      sprite: `${actor.sprite}_${frame}`,
      x: actor.pos.x,
      y: actor.pos.y,
      flip: actor.faceLeft,
      wrap: false,
      jitter: actor.shake,
      lift: actor.lift,
      alt: `${actor.sprite}_0`,
      ...(exhaust === undefined || pad === undefined
        ? {}
        : {
            rocket: {
              ageMs: actor.poseMs,
              padY: pad + shift.y,
              look: exhaust,
            },
          }),
      ...(actor.holding
        ? {
            hold: {
              sprite: actor.holding.sprite,
              dx: actor.holding.at.x,
              dy: actor.holding.at.y,
            },
          }
        : {}),
    });
  }
  floorQueue.sort((a, b) => a.y - b.y);
  queue.sort((a, b) => a.y - b.y);

  for (const item of [...floorQueue, ...queue]) {
    paintOne(ctx, item, assets, cutscene, width);
  }

  if (cutscene.fade > 0) {
    ctx.fillStyle = `rgba(6, 7, 12, ${cutscene.fade})`;
    ctx.fillRect(0, 0, width, height);
  }
}

/** Props and visible actors are bottom-anchored at their pos (pos.y = where
 * they meet the floor) and painted back to front by y. */
type Placed = {
  sprite: string;
  x: number;
  y: number;
  flip: boolean;
  wrap: boolean;
  jitter: number;
  /** World px the drawing is raised by — HEIGHT, which never re-sorts the
   * queue (an airborne hero stays in front of the couch he leapt from). */
  lift: number;
  /** Carried sprite, offset from this drawing's own top-left. */
  hold?: { sprite: string; dx: number; dy: number };
  /** Last-resort art: the actor's frame 0, for a family that authors no
   * frame for the pose being asked for (only the hero has a jump). */
  alt?: string;
  /**
   * A LIT ROCKET's engine (`render/rocket-exhaust.ts`), with the two facts the
   * effect cannot work out for itself: how long ago the `pose` beat lit it, and
   * how far its bells have got above the mark it was standing on.
   *
   * The pad is the actor's AUTHORED mark carried down the camera shift, not the
   * stage's floor line — the ship stands on the lawn, well in front of it — so
   * the blast stays where the ship left it and then falls away with the ground
   * when the camera climbs. It is a STAGE y, turned into the drawing's own
   * space at paint time, because only the paint knows how tall the hull's art
   * is and therefore where its feet are.
   *
   * THE EXHAUST TRAVELS WITH IT rather than being looked up again at paint
   * time, and that is not tidiness. `sprite` here is the FRAMED name the
   * painter asks the atlas for, and a rocket off the ground is asked for its
   * jump frame (`ship_fire_jump`, which falls back to frame 0) — a name no
   * table of rockets answers to. Looking the engine up from it therefore
   * silently drew NOTHING for exactly the scene that needs it most: the
   * homecoming, whose ship is airborne for its whole descent.
   */
  rocket?: { ageMs: number; padY: number; look: RocketExhaust };
  /**
   * WHAT THE BLAST IS DOING TO THIS PIECE OF SCENERY: how far its middle stands
   * from the lit rocket (signed — the sign is which face is taking it), how
   * long that rocket has been burning, and the reach to scale both against.
   *
   * The hero lights a homemade engine a dozen px from his own garage, and the
   * garage goes black down the side that was watching. It is carried on every
   * prop rather than on a chosen one because the rule is DISTANCE: whatever is
   * standing near the pad gets it and everything else comes out clean. The
   * SUM is worked out at paint time, because the distance that matters is to
   * the near WALL and only the paint knows how wide the art is.
   */
  soot?: {
    dx: number;
    ageMs: number;
    look: RocketExhaust;
    /** Whether it STANDS. Art lying on the ground blackens like everything
     * else, but it never catches: flames walking the top edge of a road tile
     * are a line of fires burning along the tarmac. */
    standing: boolean;
  };
};

/** One drawing off a stage queue: its art, whatever it carries, its wrap. */
function paintOne(
  ctx: CanvasRenderingContext2D,
  item: Placed,
  assets: GameAssets,
  cutscene: CutsceneState,
  width: number,
): void {
  const sprite =
    spriteByName(assets.sprites, item.sprite) ??
    spriteByName(assets.sprites, `${item.sprite}_0`) ??
    (item.alt ? spriteByName(assets.sprites, item.alt) : undefined);
  if (!sprite) return;
  let cx = item.x;
  if (item.wrap) {
    // Wrapping props re-enter from the far edge under a long drift (the
    // transit star fields) instead of scrolling away forever.
    const span = width + sprite.width;
    const centered = cx + sprite.width / 2;
    cx = (((centered % span) + span) % span) - sprite.width / 2;
  }
  // A shaking actor trembles on the scene clock — deterministic, so the
  // preview harness replays it identically.
  const jx = item.jitter
    ? Math.round(Math.sin(cutscene.timeMs / 30) * item.jitter)
    : 0;
  const jy = item.jitter
    ? Math.round(Math.cos(cutscene.timeMs / 23) * item.jitter * 0.6)
    : 0;
  const x = Math.round(cx - sprite.width / 2) + jx;
  const y = Math.round(item.y - sprite.height - item.lift) + jy;
  // What this drawing carries, offset from its own top-left (the paper
  // doll's own anchoring, so the cutscene hero grips his weapon where the
  // field hero does). A held sprite is drawn INSIDE the body's box, which
  // is what mirrors it onto the other hand when the actor turns around.
  const held = item.hold
    ? spriteByName(assets.sprites, item.hold.sprite)
    : undefined;
  // A TEAR IN SPACE keeps folding while the scene plays around it — the same
  // throat, motes and smoke the field draws over the same sprite, so the door
  // the hero steps into at the end of a prelude is the object he finds standing
  // there when the level loads (render/rift-portal.ts). On the SCENE clock, so
  // the preview harness replays it frame for frame.
  const portal = riftPortalLook(item.sprite);
  const draw = () => {
    // THE ENGINE UNDER THE HULL, so the hull is in front of its own fire. The
    // pad is handed over in the drawing's OWN space — its stage y less this
    // art's top-left, un-jittered, so the shake rattles the ship rather than
    // the ground it is standing on.
    if (item.rocket) {
      drawRocketExhaust(
        ctx,
        item.rocket.look,
        item.rocket.ageMs,
        item.rocket.padY - (item.y - sprite.height - item.lift),
      );
    }
    ctx.drawImage(sprite, 0, 0);
    // …AND WHAT THE BLAST HAS DONE TO IT SINCE, over the art and masked by it.
    // The gap is to the NEAR WALL: a frontage is measured from the face that
    // took the fire, not from the middle of the building.
    if (item.soot) {
      const { dx, ageMs, look } = item.soot;
      const gap = Math.abs(dx) - sprite.width / 2;
      const side = dx < 0 ? -1 : 1;
      const soot = sootedSprite(
        sprite,
        item.sprite,
        sootLevel(look, ageMs, gap),
        side,
      );
      if (soot) ctx.drawImage(soot, 0, 0);
      // …AND WHETHER IT HAS SINCE CAUGHT. Only the thing the rocket was parked
      // against ever does, and the flames walk the art's own top edge.
      const alight = item.soot.standing ? propFireLevel(look, ageMs, gap) : 0;
      if (alight > 0) {
        const crown = spriteCrown(sprite, item.sprite);
        if (crown) drawPropFire(ctx, crown, alight, side, cutscene.timeMs);
      }
    }
    if (held && item.hold) ctx.drawImage(held, item.hold.dx, item.hold.dy);
    if (portal) {
      drawRiftPortal(
        ctx,
        portal,
        sprite.width / 2,
        sprite.height / 2,
        cutscene.timeMs,
        item.x * 0.017,
      );
    }
  };
  // A HANGING TEAR RIDES. Applied around the whole drawing so the art and the
  // churn inside it move as one piece (render/rift-portal.ts).
  const bob = portal
    ? riftPortalBob(portal, cutscene.timeMs, item.x * 0.017)
    : 0;
  ctx.save();
  if (item.flip) {
    ctx.translate(x + sprite.width, y - bob);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y - bob);
  }
  draw();
  ctx.restore();
}

export function CutsceneOverlay({
  cutscene,
  assets,
  font,
  onTap,
  onSkip,
  onBlip,
  revealRef,
  heroName,
}: {
  cutscene: CutsceneState;
  assets: GameAssets;
  font: PixelFont;
  /** The name the player gave this hero — the caption header over his own
   * beats (the scenes cast him as `{HERO}`) and what an authored `{HERO}` in
   * a spoken line resolves to. */
  heroName?: string;
  /** Player tap: advance the running beat (turn the page). */
  onTap: () => void;
  /** The SKIP button: end the scene outright. */
  onSkip: () => void;
  /** Play the letter-print blip — fired as characters land. */
  onBlip?: () => void;
  /** Mirror of the live reveal state for the out-of-overlay advance handler. */
  revealRef?: MutableRefObject<CutsceneReveal>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Re-render the DOM text when the running beat changes under us — the
  // engine mutates the scene in place, so we watch it from a draw loop.
  const [, setBeat] = useState(-1);

  const def = cutsceneDef(cutscene.defId);
  const line = currentLine(cutscene, def);

  // The desktop mouse pointer over the scene is the same 16-bit Mickey glove
  // the main menu uses (hotspot on the fingertip), fed through --menu-cursor so
  // the whole overlay — stage and SKIP button — shares one pointer. Falls back
  // to a plain pointer before assets load or if the slice fails; touch shows
  // no cursor at all. Keep in step with TitleScreen's menu cursor.
  const menuCursor = spriteCursor(assets.sprites, "glove", {
    hotX: 3.5,
    hotY: 0.5,
    fallback: "pointer",
  });

  // An authored beat line is a PARAGRAPH: flow it into the box's own measured
  // text column rather than printing its source breaks, so one caption fills
  // the window on a desktop and folds on a portrait phone. A cutscene box has
  // no scroll step — a beat is short by construction and the stage behind it is
  // the thing being watched — so the folded rows are simply all shown.
  const { ref: textRef, fontPx: colFontPx } = useTextColumn(TEXT_SCALE);
  const visualLines = wrapPage(
    withHeroNameLines(line?.text ?? EMPTY_LINE, heroName),
    colFontPx == null ? null : (row) => font.wrap(row, colFontPx),
  );

  // The line prints letter by letter like the in-world dialogue: blip on every
  // other character, and the tap finishes the crawl before it turns the beat.
  // Motion/fade beats carry no line — an empty page reveals as instantly done,
  // so a tap through them still cuts the beat short.
  const { rows, done, skip } = useTypewriter(visualLines, (visibleIndex) => {
    if (visibleIndex % 2 === 0) onBlip?.();
  });

  // Publish the reveal so keyboard advance matches the tap: the first input
  // finishes the crawl, the next advances the beat.
  useEffect(() => {
    if (revealRef) revealRef.current = { done, skip };
  }, [revealRef, done, skip]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = def.stage.width;
    canvas.height = def.stage.height;

    let raf = 0;
    const draw = (timeMs: number) => {
      drawStage(ctx, cutscene, assets, timeMs);
      setBeat(cutscene.beat);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cutscene, assets, def]);

  return (
    <div
      className="game-overlay cutscene-overlay"
      style={{ "--menu-cursor": menuCursor } as CSSProperties}
      // A tap finishes the crawl if it's still printing; once the whole line is
      // up (or there's no line — a motion beat), it advances the beat.
      onPointerDown={() => (line && !done ? skip() : onTap())}
      role="presentation"
    >
      <canvas
        ref={canvasRef}
        className="cutscene-canvas"
        style={{
          // Native size, shrunk to fit the whole viewport — the dialogue box
          // floats OVER the stage (never pushing it), so no room is reserved.
          width: `min(${def.stage.width * STAGE_SCALE}px, 100vw, calc(100vh * ${def.stage.width / def.stage.height}))`,
          aspectRatio: `${def.stage.width} / ${def.stage.height}`,
          height: "auto",
        }}
      />
      {line && (
        <div
          className={
            line.kind === "say" ? "cutscene-line say" : "cutscene-line caption"
          }
        >
          {line.kind === "say" && line.actor && (
            <PixelText
              font={font}
              text={withHeroName(
                def.actors.find((a) => a.id === line.actor)?.name ??
                  line.actor.toUpperCase(),
                heroName,
              )}
              scale={2}
              color="#7ef0c8"
              maxWidth={CUTSCENE_TEXT_REM}
            />
          )}
          {/* The measured text column — stretched to the box's full inner
              width, which is what the rows are flowed to. */}
          <div className="cutscene-text" ref={textRef}>
            {visualLines.map((_, i) => (
              // Reserve each row's full height (PixelText is fixed-height even
              // when empty) so the box never reflows as the crawl fills it in.
              <PixelText
                key={i}
                font={font}
                text={rows[i] ?? ""}
                scale={2}
                maxWidth={CUTSCENE_TEXT_REM}
              />
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="pixel-button secondary cutscene-skip"
        aria-label="skip-cutscene"
        onClick={(event) => {
          event.stopPropagation();
          onSkip();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PixelText font={font} text="SKIP" scale={2} />
      </button>
    </div>
  );
}
