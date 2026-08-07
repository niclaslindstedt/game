// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIDGET REGISTRY — the code-backed pieces an authored element can place.
//
// A widget is the honest limit of "the HUD is content": the minimap is a canvas
// the render loop paints, the party frames are portraits composed per frame, the
// docks are gesture surfaces. None of them is expressible as boxes and words, so
// content places, orders, gates and sounds them, and their insides stay
// TypeScript.
//
// THE NAMES ARE THE SCHEMA'S. `HUD_WIDGETS` in
// `scripts/asset-tools/hud-schema.mjs` is what a YAML file may say, and
// `tests/content/hud_catalog_test.ts` pins the two together — a widget the
// schema accepts and this file does not answer would be an element that compiles
// and draws nothing.
//
// A widget that belongs to one SURFACE draws nothing on the other, and the type
// system says so: `ctx.surface` is the union's tag, so a minimap cannot read a
// wagon even by accident.

import { Minimap } from "../../Minimap.tsx";
import { PickupFeed } from "../../PickupFeed.tsx";
import { ConsumableDock } from "../../game-screen/ConsumableDock.tsx";
import { PowerupDock } from "../../game-screen/PowerupDock.tsx";
import { QuestTracker } from "../../game-screen/QuestTracker.tsx";
import { SwipeDock } from "../../game-screen/SwipeDock.tsx";
import { formatTime } from "../../game-screen/hud-model.ts";

import { hudPressAllowed, runHudPress } from "../actions.ts";
import type { HudContext } from "../context.ts";
import { playHudEvent } from "../sounds.ts";
import type { HudNodeView } from "../resolve.ts";
import { VoiceCards } from "./VoiceCards.tsx";
import { CompanionRail, PartyFrames, TradeAsks } from "./PartyRail.tsx";
import { Scoreboard } from "./Scoreboard.tsx";
export { HUD_WIDGET_NAMES } from "./names.ts";
import { WeaponSlot } from "./WeaponSlot.tsx";

/** Draw the widget an element names. An unknown name draws nothing — impossible
 * from the shipped tree (the schema refuses it), and the right answer from a mod
 * compiled against a newer game. */
export function renderWidget(view: HudNodeView, ctx: HudContext) {
  const name = view.def.widget;
  // Every FIELD widget below reads the run; none of them can be drawn on the
  // road, and the tag makes that a type error rather than a crash.
  if (ctx.surface !== "field") return null;
  const press = () => {
    if (!view.def.press) return;
    if (!hudPressAllowed(view.def.press, ctx)) return;
    runHudPress(view.def.press, ctx);
  };

  switch (name) {
    case "heroPortrait":
      return <>{ctx.heroAvatar}</>;

    case "weaponSlot":
      return <WeaponSlot ctx={ctx} view={view} onPress={press} />;

    case "companionRail":
      return <CompanionRail ctx={ctx} />;

    case "voiceCards":
      // A ROW WIDGET: the list is this file's and each CARD is the content's,
      // re-resolved per speaker (`speaker.*`). Drawn only where there IS voice
      // — see `HudFieldContext.voice`. It keeps its own subscription and its own
      // animation frame, because a level is a stream that must never reach React
      // (`room.ts`).
      return <VoiceCards ctx={ctx} view={view} />;

    case "partyFrames":
      return <PartyFrames ctx={ctx} />;

    case "scoreboard":
      // QuakeWorld's player list: portraits composited per cast and a row count
      // that is the session's, so it is a widget for the same two reasons the
      // party frames above it are. Draws nothing offline and nothing for a
      // session of one.
      return <Scoreboard ctx={ctx} />;

    case "tradeAsks":
      return <TradeAsks ctx={ctx} />;

    case "minimap":
      return (
        <Minimap
          font={ctx.font}
          hudFont={ctx.assets.hudFont}
          canvasRef={ctx.refs.minimapCanvas ?? { current: null }}
          timerText={formatTime(ctx.hud.stats.combatMs)}
          kills={ctx.hud.stats.kills}
          menaceStage={ctx.hud.menaceStage}
          onExpand={press}
          onPause={() => {
            // The timer's own tap. Latched as viewer-initiated so BOT VIEW's
            // autopilot won't clear the pause before the menu can show.
            ctx.userPausedRef.current = true;
            ctx.actions.pauseGame?.();
          }}
        />
      );

    case "autopilot":
      return <>{ctx.autopilotPanel}</>;

    case "consumableDock":
      return (
        <ConsumableDock
          hud={ctx.hud}
          assets={ctx.assets}
          font={ctx.font}
          keyHints={ctx.ui.keyHints}
          side={ctx.docks.consumableSide}
          wide={ctx.ui.wide}
          onUse={ctx.docks.onUseConsumable}
        />
      );

    case "powerupDock":
      return (
        <PowerupDock
          hud={ctx.hud.fieldLive ? ctx.hud : null}
          assets={ctx.assets}
          font={ctx.font}
          keyHints={ctx.ui.keyHints}
          weaponMenuOpen={ctx.ui.weaponMenuOpen}
          side={ctx.docks.powerupSide}
          dockRef={ctx.refs.powerupDock ?? { current: null }}
          onSpend={ctx.docks.onSpendPowerup}
          onDiscard={(index) => {
            const thrown = ctx.docks.onDiscardPowerup(index);
            if (thrown) playHudEvent("powerup.discard");
            return thrown;
          }}
        />
      );

    case "swipeDock":
      return (
        <SwipeDock
          hud={ctx.hud.fieldLive ? ctx.hud : null}
          assets={ctx.assets}
          font={ctx.font}
          dockRef={ctx.refs.powerupDock ?? { current: null }}
          onSpend={ctx.docks.onSpendPowerup}
          onUse={ctx.docks.onUseConsumable}
        />
      );

    case "questTracker":
      return <QuestTracker state={ctx.state} font={ctx.font} />;

    case "pickupFeed":
      return (
        <PickupFeed
          font={ctx.font}
          messages={ctx.docks.pickups}
          side={ctx.docks.powerupSide === "left" ? "right" : "left"}
        />
      );

    default:
      return null;
  }
}
