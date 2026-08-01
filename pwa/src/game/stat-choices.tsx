// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The widgets the stat-allocation overlays share (the level-up chooser and the
// LEVEL TOKEN respec): the per-stat glyph, the (i) toggle, and the full
// breakdown panel it reveals. Both overlays render the same five stats from the
// same catalog — which is the DATA module `stat-info.ts`, re-exported here so
// the overlays keep their one import.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { STAT_CHOICES } from "./stat-info.ts";

export { STAT_CHOICES, statChoice, type StatChoice } from "./stat-info.ts";

/** The stat's pixel glyph, or nothing if the sprite is missing. */
export function StatGlyph({
  sprites,
  icon,
}: {
  sprites: Sprites;
  icon: string;
}) {
  const src = spriteDataUrl(sprites, icon);
  if (!src) return null;
  return (
    <img src={src} alt="" className="pixel-img stat-icon" draggable={false} />
  );
}

/** The (i) toggle both stat overlays pin to their box corner. The glyph is a
 * dotted lowercase "i" drawn from blocks — the pixel font is uppercase-only,
 * so its "i" would render as a dotless capital I. */
export function InfoButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`info-button${active ? " active" : ""}`}
      aria-label="toggle-stat-info"
      onClick={onToggle}
    >
      <span className="info-glyph" aria-hidden="true">
        <span className="info-glyph-dot" />
        <span className="info-glyph-stem" />
      </span>
    </button>
  );
}

/** The full per-stat breakdown the (i) toggle reveals — one row per stat with
 * its glyph, label, and the pre-wrapped effect lines. Shared verbatim by the
 * level-up chooser and the respec screen so the two never drift. */
export function StatInfoPanel({
  font,
  sprites,
}: {
  font: PixelFont;
  sprites: Sprites;
}) {
  return (
    <div className="stat-info">
      {STAT_CHOICES.map(({ stat, label, info, icon }) => (
        <div key={stat} className="stat-info-row">
          <div className="stat-info-head">
            <StatGlyph sprites={sprites} icon={icon} />
            <PixelText font={font} text={label} scale={2} color="#ffd75e" />
          </div>
          {info.map((line, i) => (
            <PixelText
              key={i}
              font={font}
              text={line}
              scale={2}
              color="#c7ccd1"
            />
          ))}
        </div>
      ))}
      {/* The one thing the buttons themselves cannot say: the number beside
          each stat is the points THIS PLAYER has spent, and nothing else. The
          character sheet prints the whole attribute — head start, per-level
          growth, gear and carried charms folded in — so a hero who has spent
          nothing can honestly read 0 here and 1 there. Both numbers were always
          right; only their difference went unexplained. */}
      <div className="stat-info-foot">
        {[
          "THE NUMBER ON EACH BUTTON IS",
          "WHAT YOU HAVE SPENT. THE SHEET",
          "ADDS GEAR, CHARMS AND LEVEL",
          "GROWTH ON TOP — TAP A ROW",
          "THERE TO SEE THE SPLIT.",
        ].map((line, i) => (
          <PixelText
            key={i}
            font={font}
            text={line}
            scale={2}
            color="#8b94a0"
          />
        ))}
      </div>
    </div>
  );
}
