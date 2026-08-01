// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The little explainer card the game hangs off a figure that does not speak for
// itself — the character sheet's rows, the bag's ammunition sockets. A gold
// heading over grey body lines, in the game's own pixel font and wearing the
// item tooltip's frame so the two read as the same kind of object.
//
// The lines are PRE-WRAPPED by whoever wrote them (PixelText draws one canvas
// per line and never wraps), which is why the content models author short lines
// against the 390px reference phone rather than passing a paragraph. An empty
// string is a blank line — the models use one to fence the "what it does" half
// off from the "where it came from" half.
//
// It knows nothing about placement: `@ui/lib/InfoTip.tsx` portals and positions
// it, and this file is only the look.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function InfoNote({
  font,
  title,
  lines,
}: {
  font: PixelFont;
  /** The heading — the thing being explained, in the sheet's own words. */
  title: string;
  /** The body, one authored line each; `""` renders as a gap. */
  lines: readonly string[];
}) {
  return (
    <div className="info-note">
      <PixelText font={font} text={title} scale={2} color="#ffd75e" />
      {lines.map((line, i) =>
        line === "" ? (
          <span key={i} className="info-note-gap" />
        ) : (
          <PixelText
            key={i}
            font={font}
            text={line}
            scale={2}
            color="#c7ccd1"
          />
        ),
      )}
    </div>
  );
}
