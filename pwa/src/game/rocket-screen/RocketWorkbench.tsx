// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `?rocket` — the flight's developer workbench: the real minigame in one URL
// instead of a campaign's walk to the launch, the `?drive` idea at the second
// cabinet.
//
// It mounts the same `RocketScreen` on the same `createFlight`; what it adds
// is only what a run would have settled — the rung, the seed — plus the three
// knobs a working session wants off the query string:
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
//
// IT LAPS FOREVER and never banks a board row — the screen is remounted per
// lap with the seed in the `key`, which is also why `window.__flight` is not
// cleaned up on unmount (`RocketScreen`'s own note).

import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";

import {
  DIFFICULTY_ORDER,
  beginDescent,
  type Difficulty,
  type FlightParams,
  type FlightState,
} from "@game/core";

import { loadGameAssets, peekGameAssets, type GameAssets } from "../assets.ts";
import { LoadingScreen } from "../LoadingScreen.tsx";
import { resetControlsCard } from "./RocketIntro.tsx";
import { RocketScreen } from "./RocketScreen.tsx";

function flightFromParams(params: URLSearchParams): FlightParams {
  const wanted = (params.get("difficulty") ?? "").toLowerCase();
  const difficulty = (
    DIFFICULTY_ORDER.includes(wanted as Difficulty) ? wanted : "medium"
  ) as Difficulty;
  const course = Number(params.get("course"));
  return {
    seed: Number(params.get("seed")) || 1234,
    difficulty,
    to: "moon",
    ...(Number.isFinite(course) && course > 0 ? { coursePx: course } : {}),
  };
}

/** The stager: jump to the drop, or plant hardware in the nose's path.
 * Everything is planted by hand rather than rolled, so the sky's own seeded
 * stream is untouched. */
function stagerFor(
  params: URLSearchParams,
): ((flight: FlightState) => void) | undefined {
  const landing = (params.get("phase") ?? "").toLowerCase() === "landing";
  const stage = (params.get("stage") ?? "").toLowerCase();
  if (!landing && stage !== "hit" && stage !== "chain") return undefined;
  return (flight) => {
    if (landing) {
      beginDescent(flight);
      return;
    }
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
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <RocketScreen
        key={`${flightParams.seed}:${lap}`}
        params={flightParams}
        assets={assets}
        stage={stagerFor(params)}
        heroPortrait={null}
        arcade
        onLanded={nextLap}
        onMenu={onClose}
      />
    </div>
  );
}
