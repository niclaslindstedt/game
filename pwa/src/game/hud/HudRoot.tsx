// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HUD, MOUNTED — the whole of what a screen does to put one up.
//
//   <HudRoot ctx={ctx} />
//
// It reads the LIVE layout (shipped, or shipped with a mod's merged on top),
// resolves it against this instant's values, and draws the regions of its own
// surface in order. Two screens mount it: the fight (`GameScreen`) and the
// road's minigame (`DriveScreen`), and neither of them knows what is on the HUD
// — which is the point. A mod that adds a panel does not touch either.
//
// THE RESOLVE IS MEMOISED ON THE VALUES, not done per render. React re-renders
// the game screen for plenty of reasons that are not a HUD change (a toast, a
// scene, a settings flip), and the resolve is where every Lua judgement in the
// HUD is called — so it is keyed on the values themselves, which change only
// when the HUD snapshot publishes.

import { useMemo, type CSSProperties } from "react";

import { spriteDataUrl } from "../assets.ts";

import { hudLayout } from "./layout.ts";
import { HudNode } from "./nodes.tsx";
import {
  resolveContext,
  resolveLayout,
  type HudRegionView,
} from "./resolve.ts";
import type { HudContext } from "./context.ts";

export function HudRoot({ ctx }: { ctx: HudContext }) {
  const { regions, elements } = hudLayout();
  const tree = useMemo(
    () => resolveLayout(regions, elements, resolveContext(ctx.values)),
    // The layout objects are swapped wholesale when a mod is applied, so
    // identity is exactly the right dependency for them.
    [regions, elements, ctx.values],
  );
  return (
    <>
      {tree
        .filter((region) => (region.def.surface ?? "field") === ctx.surface)
        .map((region) => (
          <HudRegion key={region.def.id} region={region} ctx={ctx} />
        ))}
    </>
  );
}

function HudRegion({
  region,
  ctx,
}: {
  region: HudRegionView;
  ctx: HudContext;
}) {
  if (!region.visible) return null;
  const children = region.children.map((child) =>
    "region" in child ? (
      <HudRegion key={child.region.def.id} region={child.region} ctx={ctx} />
    ) : (
      <HudNode key={child.element.def.id} view={child.element} ctx={ctx} />
    ),
  );
  // `wrap: none` draws NO box at all: the docks each paint their own
  // full-screen layer, and a wrapper around them would be a second one.
  if (region.def.wrap === "none") return <>{children}</>;
  return (
    <div className={region.className} style={frameStyle(region, ctx)}>
      {children}
    </div>
  );
}

/** A region's own 9-slice plate, folded into its inline style — the same sprite
 * seam an element's `frame:` uses, so the plate behind the portrait and the
 * plate behind a mod's own panel are replaced the same way. A sprite the atlas
 * cannot answer for leaves the box unframed rather than broken. */
function frameStyle(
  region: HudRegionView,
  ctx: HudContext,
): CSSProperties | undefined {
  const style = region.style as CSSProperties | undefined;
  if (!region.def.frame) return style;
  const src = spriteDataUrl(ctx.assets.sprites, region.def.frame);
  if (!src) return style;
  return { ...style, borderImageSource: `url(${src})` };
}
