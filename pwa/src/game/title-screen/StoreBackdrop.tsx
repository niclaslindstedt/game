// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE's own backdrop — what makes the store feel like the end of
// the rainbow instead of just another menu on the starfield. It layers a warm
// treasure glow and a faint rainbow arc over the title sky, then rains
// spinning 3D gold coins down the screen. A purchase (`celebrate` bumps) fires
// a dense celebratory burst from the top. Purely decorative and aria-hidden;
// every coin is CSS (radial-gradient disc + a rotateY spin), so there is no
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
  /** One full flip's duration (s). */
  spin: number;
  /** Sideways drift over the fall (vw), signed — a lazy diagonal. */
  sway: number;
};

/** `Math.random` is fine here — this is cosmetic sparkle, not gameplay RNG
 * (the same call the title asteroids/twinkles use). */
function makeCoins(count: number, opts: { burst?: boolean } = {}): Coin[] {
  const { burst = false } = opts;
  return Array.from({ length: count }, (_, id) => ({
    id,
    // Burst coins erupt from the middle third and fan out; ambient rain
    // spreads edge to edge.
    left: burst ? 0.28 + Math.random() * 0.44 : Math.random(),
    size: (burst ? 0.9 : 0.8) + Math.random() * (burst ? 1.5 : 1.4),
    fall: burst ? 1.5 + Math.random() * 0.8 : 4.5 + Math.random() * 4.5,
    delay: burst ? -Math.random() * 0.25 : -Math.random() * 9,
    spin: 0.7 + Math.random() * 1.1,
    sway: (Math.random() * 2 - 1) * (burst ? 26 : 10),
  }));
}

function coinStyle(coin: Coin): CSSProperties {
  return {
    left: `${coin.left * 100}%`,
    "--size": `${coin.size}rem`,
    "--fall": `${coin.fall}s`,
    "--delay": `${coin.delay}s`,
    "--spin": `${coin.spin}s`,
    "--sway": `${coin.sway}vw`,
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
