// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE's own backdrop — what makes the store feel like the end of
// the rainbow instead of just another menu on the starfield. It layers a warm
// treasure glow and a faint rainbow arc over the title sky, then rains
// tumbling 3D gold coins down the screen. A purchase (`celebrate` bumps) fires
// a dense celebratory burst from the top. Purely decorative and aria-hidden;
// every coin is CSS — a real minted cylinder (two struck faces a thickness
// apart plus a milled rim slab, turning under perspective), so there is no
// sprite plumbing and the whole layer is cheap GPU transforms.

import { useMemo, type CSSProperties } from "react";

/** One falling coin's randomized look and timing, handed to CSS as vars. */
type Coin = {
  id: number;
  /** Horizontal spawn, as a viewport-width fraction. */
  left: number;
  /** Diameter in rem. */
  size: number;
  /** Fall duration (s) — bigger, closer coins fall a touch slower. */
  fall: number;
  /** Negative start offset (s) so the field is mid-rain on entry, not empty. */
  delay: number;
  /** Opacity at full visibility — a small, distant coin hangs back in the
   * haze instead of reading as bright as the ones falling past your nose. */
  lit: number;
  /** One full flip's duration (s). */
  spin: number;
  /** Negative spin offset (s) so each coin enters mid-turn at its own angle
   * instead of the whole field starting face-on together. */
  spinDelay: number;
  /** How far the flip axis tips out of the screen plane (deg). Every coin
   * gets its own, so the field never flips sideways in unison. */
  tilt: number;
  /** The axis at the halfway point of a flip — the NUTATION: the axis nods
   * once per turn, which is what stops a spin reading as a flat wheel. */
  tilt2: number;
  /** The PRECESSION's period (s): how long the flip axis takes to roll once
   * around the screen normal. On its own clock, unrelated to `spin`, so the
   * two compose into a tumble that never repeats within a fall. */
  tumble: number;
  /** Negative precession offset (s) — the roll's own starting phase. */
  tumbleDelay: number;
  /** ±360deg: which way the axis rolls (a whole turn, so the loop is seamless). */
  tumbleTurn: number;
  /** Sideways drift at the END of the fall (vw), signed — a lazy diagonal. */
  sway: number;
  /** …and at the halfway point, so the drift CURVES instead of tracking a
   * straight ruled line: each coin carves its own path down the screen. */
  swayMid: number;
};

/** `Math.random` is fine here — this is cosmetic sparkle, not gameplay RNG
 * (the same call the title asteroids/twinkles use). */
function makeCoins(count: number, opts: { burst?: boolean } = {}): Coin[] {
  const { burst = false } = opts;
  return Array.from({ length: count }, (_, id) => {
    // Depth: 0 is a small coin far back in the haze, 1 one falling past the
    // camera. It drives size, brightness and fall speed together, so the rain
    // reads as a volume rather than as one flat plane of identical coins.
    const depth = Math.random();
    const size = (burst ? 0.55 : 0.5) + depth * (burst ? 1.3 : 1.25);
    // 0.35s..2.1s per flip — the spread is the point: a field where every coin
    // turns at its own rate reads as loose change, not as one animation.
    const spin = 0.35 + Math.random() * 1.75;
    const tumble = 1.1 + Math.random() * 5;
    const sway = (Math.random() * 2 - 1) * (burst ? 26 : 14);
    return {
      id,
      // Burst coins erupt from the middle third and fan out; ambient rain
      // spreads edge to edge.
      left: burst ? 0.28 + Math.random() * 0.44 : Math.random(),
      size,
      fall: burst
        ? 1.4 + Math.random() * 1.1
        : 3.4 + depth * 2 + Math.random() * 4.5,
      delay: burst ? -Math.random() * 0.3 : -Math.random() * 9,
      lit: burst ? 1 : 0.5 + depth * 0.5,
      spin,
      spinDelay: -Math.random() * spin,
      tilt: (Math.random() * 2 - 1) * 70,
      tilt2: (Math.random() * 2 - 1) * 70,
      tumble,
      tumbleDelay: -Math.random() * tumble,
      tumbleTurn: Math.random() < 0.5 ? -360 : 360,
      sway,
      // Between a third and two thirds of the way to the final drift, and
      // occasionally past it — the wind pushes, then eases or overshoots.
      swayMid: sway * (0.25 + Math.random() * 0.85),
    };
  });
}

function coinStyle(coin: Coin): CSSProperties {
  return {
    left: `${coin.left * 100}%`,
    "--size": `${coin.size.toFixed(2)}rem`,
    "--fall": `${coin.fall.toFixed(2)}s`,
    "--delay": `${coin.delay.toFixed(2)}s`,
    "--lit": coin.lit.toFixed(2),
    "--spin": `${coin.spin.toFixed(2)}s`,
    "--spin-delay": `${coin.spinDelay.toFixed(2)}s`,
    "--tilt": `${coin.tilt.toFixed(1)}deg`,
    "--tilt2": `${coin.tilt2.toFixed(1)}deg`,
    "--tumble": `${coin.tumble.toFixed(2)}s`,
    "--tumble-delay": `${coin.tumbleDelay.toFixed(2)}s`,
    "--tumble-turn": `${coin.tumbleTurn}deg`,
    "--sway": `${coin.sway.toFixed(1)}vw`,
    "--sway-mid": `${coin.swayMid.toFixed(1)}vw`,
  } as CSSProperties;
}

function CoinField({ coins, burst }: { coins: Coin[]; burst?: boolean }) {
  return (
    <>
      {coins.map((coin) => (
        <span
          key={coin.id}
          className={`store-coin${burst ? " burst" : ""}`}
          style={coinStyle(coin)}
        >
          {/* The cylinder: the milled rim first, the two struck faces over it
              (siblings, not nested — see the CSS). */}
          <span className="store-coin-rim" />
          <span className="store-coin-face" />
        </span>
      ))}
    </>
  );
}

export function StoreBackdrop({
  celebrate,
  intense,
}: {
  /** Bumps once per successful purchase — a bump replays the coin burst. */
  celebrate: number;
  /** The BUY confirmation screen: thicken the rain so the "about to strike
   * gold" moment pours instead of drizzles. */
  intense?: boolean;
}) {
  // The steady rain: generated once so it never re-rolls (and never jumps)
  // when the store re-renders as the cursor moves or prices arrive.
  const ambient = useMemo(() => makeCoins(16), []);
  // A few extra streams while confirming a buy — mounted on top of the
  // ambient set so the base rain is left untouched.
  const extra = useMemo(() => makeCoins(10), []);

  // The purchase celebration: a dense one-shot burst. The `.burst` coins run
  // their fall/spin exactly ONCE (see the CSS) and settle invisible, so the
  // whole set can simply stay mounted; bumping `celebrate` re-keys the field
  // and replays the burst without any timers or effect-driven state.
  const burst = useMemo(
    () => (celebrate > 0 ? makeCoins(28, { burst: true }) : []),
    [celebrate],
  );

  return (
    <div className="store-backdrop" aria-hidden="true">
      {/* The end of the rainbow: a faint arc up top and a pot-of-gold glow
          welling from the bottom, so the whole vault reads warm and rich. */}
      <div className="store-rainbow" />
      <div className="store-glow" />
      <div className="store-coins">
        <CoinField coins={ambient} />
        {intense && <CoinField coins={extra} />}
        {burst.length > 0 && (
          <div key={celebrate} className="store-burst">
            <CoinField coins={burst} burst />
          </div>
        )}
      </div>
    </div>
  );
}
