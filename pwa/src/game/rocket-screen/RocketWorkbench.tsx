// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `?rocket` — the flight's developer workbench: the real minigame in one URL
// instead of a campaign's walk to the launch, the `?drive` idea at the second
// cabinet.
//
// It mounts the same `RocketScreen` on the same `createFlight`; what it adds
// is only what a run would have settled — the rung, the seed — plus the knobs a
// working session wants off the query string:
//
//   ?rocket                      the climb, medium, seed 1234
//   &difficulty=jesus            the rung
//   &seed=99                     the sky
//   &course=2600                 a short climb (reaches orbit and the drop fast)
//   &phase=landing               open on the DROP — the half being worked on
//   &stage=hit|chain             plant hardware in the nose's path, so the
//                                collision (and the chain it lights) happens in
//                                the first seconds instead of when the shell
//                                deals one
//   &launch=0                    skip the lift-off cutscene the first lap opens
//                                on — what a harness that steers the sky wants,
//                                since a held caption is a `window.__flight`
//                                that never arrives
//   &bot=1                       hand the stick to the engine's own auto-pilot
//                                (`createFlightDriver`) — the `?drive&bot=1`
//                                idea at the second cabinet, and how a
//                                screenshot recipe flies this sky
//
// IT LAPS FOREVER and never banks a board row — the screen is remounted per
// lap with the seed in the `key`, which is also why `window.__flight` is not
// cleaned up on unmount (`RocketScreen`'s own note).
//
// THE LAUNCH OPENS THE SITTING, NOT EVERY LAP. Sitting down at this workbench
// is what a player sitting down at the cabinet gets, cutscene included; a lap
// after that is a RE-FLIGHT, and a developer who has to watch the lawn burn
// between every attempt stops using the workbench.

import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";

import {
  DIFFICULTY_ORDER,
  type Difficulty,
  type FlightParams,
  type FlightState,
} from "@game/core";

import { loadGameAssets, peekGameAssets, type GameAssets } from "../assets.ts";
import { LoadingScreen } from "../LoadingScreen.tsx";
import { MOON_LANDING_VARIANT, arcadeFlightParams } from "./begin.ts";
import { resetControlsCard } from "./RocketIntro.tsx";
import { RocketScreen } from "./RocketScreen.tsx";

function flightFromParams(params: URLSearchParams): FlightParams {
  const wanted = (params.get("difficulty") ?? "").toLowerCase();
  const difficulty = (
    DIFFICULTY_ORDER.includes(wanted as Difficulty) ? wanted : "medium"
  ) as Difficulty;
  const course = Number(params.get("course"));
  // `phase=landing` is the shelf's MOON LANDING leg, so the drop opens with
  // its own par, its own board and its own briefing — exactly what a session
  // working on the landing wants to be working on.
  const landing = (params.get("phase") ?? "").toLowerCase() === "landing";
  // Through the arcade door, so the gore gate is settled exactly as a shipped
  // lap settles it — a safe-mode capture harness must not meet a workbench
  // that bleeds anyway.
  return {
    ...arcadeFlightParams(
      Number(params.get("seed")) || 1234,
      difficulty,
      landing ? MOON_LANDING_VARIANT : undefined,
    ),
    ...(Number.isFinite(course) && course > 0 ? { coursePx: course } : {}),
  };
}

/** The stager: plant hardware in the nose's path. Everything is planted by
 * hand rather than rolled, so the sky's own seeded stream is untouched. The
 * drop itself needs no stager — `phase=landing` builds a landing LEG. */
function stagerFor(
  params: URLSearchParams,
): ((flight: FlightState) => void) | undefined {
  const stage = (params.get("stage") ?? "").toLowerCase();
  if (stage !== "hit" && stage !== "chain") return undefined;
  return (flight) => {
    // One satellite square in the path, past the opening's hold; `chain` parks
    // two more beside it so the first blast lights them.
    const plant = (dx: number, dAlt: number) => {
      flight.field.push({
        id: flight.nextId++,
        kind: "satellite",
        variant: 0,
        x: flight.craft.x + dx,
        alt: flight.craft.alt + dAlt,
        vx: 0,
        vy: 0,
        angle: 0,
        spin: 0,
        r: 10,
      });
    };
    plant(0, 420);
    if (stage === "chain") {
      plant(60, 460);
      plant(-70, 490);
      plant(30, 560);
    }
  };
}

export function RocketWorkbench({
  params,
  onClose,
}: {
  params: URLSearchParams;
  onClose: () => void;
}): ReactElement | null {
  const [assets, setAssets] = useState<GameAssets | null>(peekGameAssets);
  const [lap, setLap] = useState(0);
  const [flightParams, setFlightParams] = useState<FlightParams>(() =>
    flightFromParams(params),
  );

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

  // Every lap is a fresh sky — a new seed, and the pre-flight card re-armed so
  // a controls change can be re-read without a reload.
  const nextLap = useCallback(() => {
    resetControlsCard();
    setFlightParams((prev) => ({ ...prev, seed: (prev.seed + 1) >>> 0 }));
    setLap((n) => n + 1);
  }, []);

  if (!assets) return <LoadingScreen />;
  const bot = params.get("bot");
  const auto =
    bot !== null && !["0", "off", "false"].includes(bot.toLowerCase());
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <RocketScreen
        key={`${flightParams.seed}:${lap}`}
        params={flightParams}
        assets={assets}
        stage={stagerFor(params)}
        arcade
        auto={auto}
        launch={lap === 0 && params.get("launch") !== "0"}
        onLanded={nextLap}
        onMenu={onClose}
      />
    </div>
  );
}
