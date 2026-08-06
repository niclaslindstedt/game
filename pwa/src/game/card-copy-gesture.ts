// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PRESS AND HOLD A PIECE OF LOOT TO COPY ITS CARD — the seam between the
// gesture (@ui/lib/long-press.ts) and the picture (./item-card-image.tsx),
// shared by every surface that shows an item so the hold means the same thing
// everywhere: the bordered card the arsenal, the vault, the merchant's counter
// and the buyback shelf all render, and the bag CELL underneath the inventory's
// tooltip — which is pointer-transparent by design, so the finger that means
// "this card" is really on the cell.
//
// THE COPY MODULE IS PULLED IN DYNAMICALLY, for two reasons that happen to
// agree. It renders an `ItemCard` of its own, so a static import would close a
// cycle back through the very component that arms the gesture. And it is dead
// weight until somebody actually holds a card — it drags in the DOM rasterizer
// and a React root — so a bag that is merely opened never pays for it. The
// fetch starts when the press is ARMED rather than when it fires, which hands
// the module the whole hold to load in; by the time the clipboard write is
// issued it has been ready for most of half a second.

import { watchLongPress, type LongPressWatch } from "@ui/lib/long-press.ts";

// Type-only, and therefore erased — this module must not import the copy
// module for real (see the note above).
import type { ItemCardImageProps } from "./item-card-image.tsx";

/**
 * Arm a copy hold at `at`. `props` is read LAZILY, when the hold fires, so the
 * card that gets drawn is the state as it stands at that moment rather than at
 * the instant the finger landed.
 *
 * The caller owns the pointer stream: feed the returned watch's `moved` from
 * pointermove, `cancel` it on release or cancellation, and ask `fired` before
 * treating the release as a tap.
 */
export function armCardCopy(
  at: { x: number; y: number },
  props: () => ItemCardImageProps,
): LongPressWatch {
  const copyModule = import("./item-card-image.tsx");
  return watchLongPress(at, () => {
    void copyModule.then((module) => module.copyItemCardAt(props(), at));
  });
}
