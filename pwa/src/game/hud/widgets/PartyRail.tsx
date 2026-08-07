// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LEFT RAIL'S THREE WIDGETS — the companion's portrait, the other heroes'
// frames, and the trade asks under them.
//
// All three draw a LIST whose length is the run's, out of portraits composed per
// frame by the paper-doll compositor, so none of them is expressible as authored
// boxes. What content owns is where the rail sits, which of the three are on it
// and in what order — and, through the sound catalog, what each press says.

import { fieldLive } from "../../local-seat.ts";
import { bustSrc } from "../../SpritePortrait.tsx";
import { dollDataUrl } from "../../paper-doll.ts";
import { medkitIconFor } from "../../consumables.ts";
import { playerDollLayers } from "../../paper-doll-live.ts";
import { runCommand, runCommandOk } from "../../run-commands.ts";
import { spriteDataUrl } from "../../assets.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import type { HudFieldContext } from "../context.ts";
import { playHudEvent } from "../sounds.ts";

/**
 * THE COMPANION RAIL. A press does one of two jobs, and WHICH is a question the
 * portrait has already answered on screen: a MEDKIT BADGE means the press MENDS
 * the companion out of the hero's own pouch, and a bare portrait means it opens
 * their equip screen.
 *
 * The badge is what makes that legible rather than moody: the player sees which
 * press they are about to make before they make it, the way a quest giver's head
 * mark says whether walking up takes work or hands it in.
 */
export function CompanionRail({ ctx }: { ctx: HudFieldContext }) {
  const { hud, state, assets } = ctx;
  if (hud.companions.length === 0) return null;
  const press = (id: number, canHeal: boolean) => {
    if (!fieldLive(state)) return;
    if (canHeal) {
      if (runCommandOk(state, "healCompanionWithMedkit", id)) {
        playHudEvent("companion.heal");
        ctx.bumpUi();
      }
      return;
    }
    runCommand(state, "openCompanionPanel", id);
    playHudEvent("companion.open");
    ctx.bumpUi();
  };
  return (
    <div className="companion-portraits">
      {hud.companions.map((companion) => {
        // The ally's FACE, cropped by the same rule the hero's bust beside it
        // is — a party portrait is a who, not a token.
        const src = bustSrc(assets.sprites, companion.sprite);
        // The corner glyph says what this portrait wants: a medkit while a press
        // would spend one, the salts bottle while it is down and only a bag item
        // can help. Nothing when it is whole.
        const badge = companion.downed
          ? "icon_smelling_salts"
          : companion.canHeal
            ? medkitIconFor(hud.medkitTier)
            : null;
        const badgeSrc = badge ? spriteDataUrl(assets.sprites, badge) : null;
        return (
          <button
            key={companion.id}
            type="button"
            className={`companion-portrait${companion.downed ? " downed" : ""}`}
            aria-label={
              companion.canHeal
                ? `heal-companion-${companion.defId}`
                : `open-companion-${companion.defId}`
            }
            onClick={() => press(companion.id, companion.canHeal)}
          >
            {src ? (
              <img
                src={src}
                alt=""
                className="pixel-img companion-portrait-img"
              />
            ) : null}
            {badgeSrc ? (
              <img
                src={badgeSrc}
                alt=""
                className="pixel-img companion-portrait-badge"
              />
            ) : null}
            <span className="companion-portrait-hp">
              <span
                style={{ width: `${Math.round(100 * companion.hpFrac)}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * THE PARTY FRAMES: every other hero in play. The portrait is the hero's own
 * dressed paper-doll bust, the sliver is their hp, DOWN greys the frame where
 * they fell, and a BAG badge is D2's own "in their menus" affordance. A press
 * ASKS for a trade (trade.ts rule 5) and raises nothing on their screen — so the
 * BAG badge reads as "they may take a moment to answer" rather than as a refusal
 * waiting to happen.
 */
export function PartyFrames({ ctx }: { ctx: HudFieldContext }) {
  const { hud, state, assets, font, seatName } = ctx;
  if (hud.partyFrames.length === 0) return null;
  return (
    <div className="party-frames">
      {hud.partyFrames.map((frame) => {
        const hero = state.players[frame.seat];
        if (!hero) return null;
        const src = dollDataUrl(
          assets.sprites,
          playerDollLayers(state, "0", { weapon: false, hero }),
          undefined,
          { bust: true },
        );
        const badgeSrc = frame.busy
          ? spriteDataUrl(assets.sprites, "icon_bag")
          : null;
        const name = seatName?.(frame.seat) ?? `SEAT ${frame.seat + 1}`;
        return (
          <button
            key={frame.seat}
            type="button"
            className={`party-frame${frame.downed ? " downed" : ""}`}
            aria-label={`party-frame-${frame.seat}`}
            title={name}
            onClick={() => {
              if (!fieldLive(state)) return;
              if (runCommandOk(state, "requestTrade", frame.seat)) {
                // The generic press: this is the ASK being made, and the chirp
                // that belongs to a trade is the one on the RECEIVING rail.
                playHudEvent("hud.press");
                ctx.bumpUi();
              }
            }}
          >
            {src ? (
              <img src={src} alt="" className="pixel-img party-frame-img" />
            ) : null}
            {badgeSrc ? (
              <img
                src={badgeSrc}
                alt=""
                className="pixel-img party-frame-badge"
              />
            ) : null}
            <span className="party-frame-level">
              <PixelText
                font={font}
                text={String(frame.level)}
                scale={2}
                color="#f4f4f4"
              />
            </span>
            <span className="party-frame-hp">
              <span style={{ width: `${Math.round(100 * frame.hpFrac)}%` }} />
            </span>
            <PixelText
              font={font}
              text={name.slice(0, 8).toUpperCase()}
              scale={2}
              color="#9aa3ad"
              className="party-frame-name"
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * THE ASKS: somebody wants to trade. A PIP, never a screen — a request that
 * halted the target would be exactly the interruption the consent step exists to
 * prevent. The hero keeps fighting behind it; YES raises the table on both
 * seats, NO costs nobody anything, and ignoring it lets the ask lapse.
 */
export function TradeAsks({ ctx }: { ctx: HudFieldContext }) {
  const { hud, state, font, seatName } = ctx;
  if (hud.tradeRequests.length === 0) return null;
  return (
    <div className="trade-asks">
      {hud.tradeRequests.map((seat) => (
        <div className="trade-ask" key={seat}>
          {/* Two lines rather than one: the phone is the reference device, and
              a name plus a sentence on one row is the widest thing on this
              rail. */}
          <PixelText
            font={font}
            text={(seatName?.(seat) ?? `SEAT ${seat + 1}`)
              .slice(0, 8)
              .toUpperCase()}
            scale={2}
            color="#ffd75e"
          />
          <PixelText
            font={font}
            text="WANTS TO TRADE"
            scale={2}
            color="#9aa3ad"
          />
          <div className="trade-ask-row">
            <button
              type="button"
              className="trade-ask-btn yes"
              aria-label={`trade-accept-${seat}`}
              onClick={() => {
                // The engine's busy-hero refusal is the backstop here (the
                // requester may have wandered into their own bag since asking),
                // and the request is spent either way — so the pip goes whatever
                // the answer was.
                runCommandOk(state, "acceptTradeRequest", seat);
                playHudEvent("trade.accept");
                ctx.bumpUi();
              }}
            >
              <PixelText font={font} text="YES" scale={2} color="#7cff9b" />
            </button>
            <button
              type="button"
              className="trade-ask-btn no"
              aria-label={`trade-decline-${seat}`}
              onClick={() => {
                runCommandOk(state, "declineTradeRequest", seat);
                playHudEvent("trade.decline");
                ctx.bumpUi();
              }}
            >
              <PixelText font={font} text="NO" scale={2} color="#ff9b9b" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
