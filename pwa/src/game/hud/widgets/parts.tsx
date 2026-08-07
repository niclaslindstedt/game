// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A WIDGET'S PARTS — the authored nodes a code-backed widget keeps a place for.
//
// This is the seam that stops "widget" meaning "content stops here". The weapon
// slot draws its ring and its switcher itself, because neither is expressible as
// boxes and words — but the ROUND COUNT printed on it is an ordinary text node,
// authored in `content/hud/elements/weapon_slot.yaml` with its own class, its
// own scale and its own colour judgement. The widget says WHERE it goes; the
// content says what it is.
//
// A part the widget does not ask for is simply not drawn, and a part the content
// does not supply leaves the widget's own place empty. Both are deliberate: they
// are what let a mod drop a part it does not want, and what lets the game add
// one without breaking a mod that has never heard of it.

import type { HudContext } from "../context.ts";
import { HudNode } from "../nodes.tsx";
import type { HudNodeView } from "../resolve.ts";

export function HudPart({
  view,
  part,
  ctx,
}: {
  view: HudNodeView;
  part: string;
  ctx: HudContext;
}) {
  const found = view.children.find((child) => child.def.id === part);
  if (!found) return null;
  return <HudNode view={found} ctx={ctx} />;
}
