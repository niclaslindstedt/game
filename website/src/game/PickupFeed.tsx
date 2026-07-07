// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pickup feed: WoW-style "PICKED UP X" lines that stack in the lower-right
// corner as loot and powerups are scooped up. Newest sits at the bottom; each
// line lives for PICKUP_TTL_MS and fades out on its own timer (the removal is
// driven by GameScreen, which owns the list and schedules each expiry).

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** How long a pickup line stays on screen before it is dropped, in ms. */
export const PICKUP_TTL_MS = 10_000;

export type PickupMessage = {
  id: number;
  text: string;
  /** Tier/quality color for the line (defaults to a neutral off-white). */
  color?: string;
};

export function PickupFeed({
  font,
  messages,
}: {
  font: PixelFont;
  messages: PickupMessage[];
}) {
  if (messages.length === 0) return null;
  return (
    <div className="pickup-feed" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className="pickup-line">
          <PixelText
            font={font}
            text={`PICKED UP ${m.text}`}
            scale={2}
            color={m.color ?? "#e8ecf0"}
          />
        </div>
      ))}
    </div>
  );
}
