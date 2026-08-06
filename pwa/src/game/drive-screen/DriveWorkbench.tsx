// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD, ON ITS OWN — `?drive`, the minigame's deep link.
//
// WHY IT EXISTS. The drive sits at the far end of a campaign: to see thirty
// seconds of it you had to start a run, reach the garage, take the errands, get
// in the car and pull out. That is a fine way to PLAY it and a hopeless way to
// WORK on it — every tune of a spark, every screenshot, every "does the engine
// note actually drop when it shifts" cost a five-minute walk. So the road can
// now be reached in one URL, exactly as the effects gallery can.
//
// IT IS THE REAL MINIGAME, not a diorama: the same `DriveScreen` the game
// screen mounts, on the same `createDrive`, so anything judged here is what
// ships. What the workbench adds is only the things a RUN would otherwise have
// settled — which leg, which rung, and what seed — plus somewhere to land when
// the road ends, because there is no crossing waiting for it.
//
// DEVELOPER TOOLING. `__DEV_TOOLS__` folds the whole branch (and this chunk)
// out of a store build, exactly like the gallery.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { DIFFICULTY_ORDER, type Difficulty } from "@game/menu";

import { DRIVE, type DriveState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";

import { loadGameAssets, peekGameAssets, type GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { captureScreen } from "../screenshots.ts";
import { playUiSound } from "../sfx/ui.ts";
import { DriveScreen } from "./DriveScreen.tsx";

/** The two ends of the one road there is — the same pair `legDirection` knows,
 * repeated here because the workbench names a LEG rather than a crossing. */
const GARAGE = "garage";
const GOODCO = "goodco_hq";

/**
 * Read a whole drive out of the query string.
 *
 * `?drive` alone is the trip out on MEDIUM; `?drive=home` is the way back.
 * `&difficulty=jesus` picks the rung (which is the whole point of it — the
 * ladder is the one thing about the road that cannot be judged from a single
 * drive), `&seed=` pins the stretch of road, and `&gore=off` plays it with
 * bodies knocked aside rather than burst.
 *
 * `&bot=1` hands the wheel to the engine's own auto-driver, which is what makes
 * this a place to LOOK at the road rather than only to play it: a screenshot, a
 * spark tune or a "does the engine note drop when it shifts" needs the car
 * moving, and holding a key down while judging a picture is how a tuning pass
 * becomes a wrestling match.
 */
export function driveFromParams(params: URLSearchParams): {
  seed: number;
  direction: 1 | -1;
  to: string;
  gib: boolean;
  difficulty: Difficulty;
  bot: boolean;
} {
  const home = (params.get("drive") ?? "").toLowerCase() === "home";
  const wanted = (params.get("difficulty") ?? "").toLowerCase();
  const difficulty = (
    DIFFICULTY_ORDER.includes(wanted as Difficulty) ? wanted : "medium"
  ) as Difficulty;
  const bot = params.get("bot");
  return {
    seed: Number(params.get("seed")) || 1234,
    direction: home ? -1 : 1,
    to: home ? GARAGE : GOODCO,
    gib: (params.get("gore") ?? "").toLowerCase() !== "off",
    difficulty,
    // Bare `&bot` counts, like every other flag in the query string; only an
    // explicit "0"/"off" turns it back off.
    bot: bot !== null && !["0", "off", "false"].includes(bot.toLowerCase()),
  };
}

/**
 * `&stage=body|traffic|both` — plant something in the bumper's path so the
 * collision happens in the first two seconds instead of whenever the road
 * happens to serve one up.
 *
 * THIS IS WHAT MAKES THE ROAD WORKABLE. Judging a spark shower or a sound
 * means seeing the same collision twice, before and after a change; waiting for
 * the crowd to deal you one is how a tuning pass turns into a fishing trip.
 * Everything staged is planted by hand rather than rolled, so the drive's own
 * seeded stream is untouched and the road behind the staged hit is the road
 * that seed always lays down.
 */
function stagerFor(
  what: string,
  direction: 1 | -1,
): ((d: DriveState) => void) | undefined {
  if (what !== "body" && what !== "traffic" && what !== "both")
    return undefined;
  return (drive) => {
    const lane = drive.car.pos.y;
    const ahead = (px: number) => drive.car.pos.x + direction * px;
    // Flat out from the off, so the staged hit lands at the speed worth looking
    // at rather than at the 28% the road opens on.
    drive.car.speed = DRIVE.topSpeedPx;
    if (what !== "traffic") {
      drive.pedestrians.push({
        id: drive.nextId++,
        pos: { x: ahead(900), y: lane },
        vel: { x: 0, y: 0 },
        mode: "afoot",
        variant: 0,
        phase: 0,
        z: 0,
        vz: 0,
        counted: false,
      });
    }
    if (what !== "body") {
      drive.traffic.push({
        id: drive.nextId++,
        pos: { x: ahead(1900), y: lane },
        // Dawdling the same way, so the stage is a rear-end rather than the
        // head-on that ends the leg in one hit.
        speed: direction * DRIVE.trafficSpeedPx.min,
        slew: 0,
        variant: 0,
        faceLeft: direction === -1,
        hitCooldownMs: 0,
      });
    }
  };
}

/** The workbench: the road, and a line saying which road it is. */
export function DriveWorkbench({
  params,
  onClose,
}: {
  params: URLSearchParams;
  onClose: () => void;
}): ReactElement | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [assets, setAssets] = useState<GameAssets | null>(peekGameAssets);
  const [trip, setTrip] = useState(() => driveFromParams(params));
  // ARRIVING RESTARTS IT rather than ending: a workbench that emptied itself
  // the moment the course ran out would be useless for the thing it is for.
  // A fresh seed, so the next lap is a different stretch of road.
  const [lap, setLap] = useState(0);

  useEffect(() => {
    if (assets) return;
    let live = true;
    void loadGameAssets().then((loaded) => {
      if (live) setAssets(loaded);
    });
    return () => {
      live = false;
    };
  }, [assets]);

  // ESCAPE LEAVES THE WORKBENCH. The road's own pause card answers the same
  // key, and that is fine: this handler unmounts the whole thing, so the card
  // it raised never gets a frame. A developer surface's exit outranks a menu
  // inside the thing being worked on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  /** The SCREENSHOT bind, here as in the game. No flash miniature — the shelf
   * that shows one belongs to a run, and the workbench has none; the shutter
   * and the roll are the parts a developer taking reference shots needs. */
  const takeScreenshot = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    playUiSound(synth, "shutter");
    void captureScreen(root, "THE DRIVE");
  }, []);

  if (!assets) return null;
  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0 }}>
      <DriveScreen
        key={`${lap}:${trip.seed}:${trip.difficulty}:${trip.direction}`}
        params={trip}
        assets={assets}
        auto={trip.bot}
        stage={stagerFor(params.get("stage") ?? "", trip.direction)}
        onScreenshot={takeScreenshot}
        onArrived={() => {
          setTrip((t) => ({ ...t, seed: (t.seed + 7919) >>> 0 }));
          setLap((n) => n + 1);
        }}
      />
      {/* The workbench's own caption — in the game's pixel font like every
          other word on screen, because a developer surface that wears a
          different typeface is one more thing that does not look like the
          game while you are judging how the game looks. */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 12,
          opacity: 0.65,
          pointerEvents: "none",
        }}
      >
        <PixelText
          font={assets.font}
          text={`${trip.difficulty.toUpperCase()} · ${
            trip.direction === 1 ? "OUT" : "HOME"
          } · SEED ${trip.seed}${trip.bot ? " · BOT" : ""} · ESC TO LEAVE`}
          scale={1}
          color="#e8e4d8"
        />
      </div>
    </div>
  );
}
