// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO IS TALKING — a card per speaker, with their face on it, and a waveform
// that makes a whisper and a shout different at a glance.
//
// **IT DRAWS THE LIST; THE CONTENT DRAWS THE CARD.** This file owns the three
// things that cannot be authored — who is on the rail, each speaker's
// composited paper-doll bust, and the waveform's pixels — and everything a card
// SAYS comes out of `content/hud/elements/voice_cards.yaml`, resolved once per
// speaker with that person's own values in scope (`speaker.*`). The status
// line's wording and its precedence, both loudness thresholds and every colour
// are `content/hud/scripts/voice.lua`. So a mod can re-word a card, re-grade
// what counts as shouting, shrink the waveform or drop it, without touching the
// app — which is the same deal every other piece of the HUD gets.
//
// **IT IS DESIGNED FOR A DESKTOP VIEWPORT, WHICH IS A DEPARTURE FROM EVERY
// OTHER SURFACE IN THIS GAME AND IS ALLOWED HERE ONLY BECAUSE IT CANNOT APPEAR
// ANYWHERE ELSE.** The reference device is a phone held horizontally (~844×390)
// and the rest of the HUD is sized against it. Voice is gated on the `voice`
// build capability, which only the desktop shell is ever stamped with — there is
// no phone build and no browser build in which this component renders at all —
// so the cards are sized in rem against a desktop window. If voice ever reaches
// a phone, the sizes to change are in `styles.css` and in the card's own YAML.
//
// **IT LIVES ON THE LEFT RAIL, UNDER THE PARTY FRAMES, ON PURPOSE** — that rail
// already means "somebody on your side", and a voice card is the same claim with
// a mouth on it. Where it sits is the layout's call now, not this file's.
//
// **AND IT NEVER RE-RENDERS ON A LEVEL.** React is told only when the STRUCTURE
// changes — somebody started or stopped talking, was muted, went unheard — and
// the loudness is read imperatively inside the animation frame. See `room.ts`
// for that split; getting it wrong is 400 reconciliations a second.

import { useEffect, useMemo, useRef, useState } from "react";

import { dollDataUrl } from "../../paper-doll.ts";
import { playerDollLayers } from "../../paper-doll-live.ts";
import type { VoiceSpeaker } from "../../net/voice/room.ts";

import { speakerBindings } from "../bindings.ts";
import type { HudFieldContext } from "../context.ts";
import { resolveNode, resolveRow, type HudNodeView } from "../resolve.ts";
import { runHudPress } from "../actions.ts";
import { HudPart } from "./parts.tsx";

export function VoiceCards({
  ctx,
  view,
}: {
  ctx: HudFieldContext;
  /** The authored card — its parts are re-resolved per speaker below. */
  view: HudNodeView;
}) {
  const room = ctx.voice?.room ?? null;
  // STRUCTURE ONLY. `subscribe` deliberately does not fire on a level change;
  // see the header.
  const [speakers, setSpeakers] = useState<readonly VoiceSpeaker[]>(
    room?.speakers ?? [],
  );
  const [local, setLocal] = useState(room?.local ?? null);
  useEffect(() => {
    if (!room) return;
    const sync = () => {
      setSpeakers(room.speakers);
      setLocal(room.local);
    };
    sync();
    return room.subscribe(sync);
  }, [room]);

  const { state, assets, seatName } = ctx;
  const seats = speakers.map((speaker) => speaker.seat).join(",");
  /**
   * The busts, composited once per CHANGE OF CAST rather than per render.
   *
   * `dollDataUrl` draws the hero's whole paper doll onto a canvas and reads it
   * back as a data URL — cheap once, absurd 30 times a second — so the memo key
   * is who is on screen, not what they are doing.
   */
  const portraits = useMemo(() => {
    const out = new Map<number, string | null>();
    for (const speaker of speakers) {
      const hero = state.players[speaker.seat];
      const bust = hero
        ? dollDataUrl(
            assets.sprites,
            playerDollLayers(state, "0", { weapon: false, hero }),
            undefined,
            { bust: true },
          )
        : null;
      // A hero whose doll cannot be composited yet (a seat this client holds no
      // body for — a speaker on another level, a frame that arrived before the
      // snapshot naming them) still gets a card. The name is what identifies
      // them; the portrait is the nicety.
      out.set(speaker.seat, bust ?? null);
    }
    return out;
    // `seats` is the cast; `state` and `assets` are stable for the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats, state, assets]);

  const canvases = useRef(new Map<number, HTMLCanvasElement | null>());
  const localCanvas = useRef<HTMLCanvasElement>(null);

  /**
   * EVERY CARD, resolved against its own speaker's values.
   *
   * The authored node is walked again per row rather than once for the rail —
   * that is what makes `speaker.peak` mean this person, and it is why two cards
   * drawn from the same YAML can wear different classes, words and colours.
   *
   * Built here, above the early returns, because the drawing loop needs the
   * colours these resolve to and a ref may not be written during a render.
   */
  const rowFor = (row: Parameters<typeof speakerBindings>[0]) =>
    // `true` is "one row IS in scope now" — the layout deliberately left this
    // template unresolved, because its judgements read a speaker that only
    // exists here.
    resolveNode(view.def, resolveRow(ctx.values, speakerBindings(row)), true);
  const cards = speakers.map((speaker) => {
    // Cut to the card's width HERE rather than in the content, because the cut
    // is a fact about the box and a name that overflowed would push the
    // waveform off the rail rather than merely reading oddly.
    const name = (seatName?.(speaker.seat) ?? `SEAT ${speaker.seat + 1}`)
      .slice(0, 8)
      .toUpperCase();
    return {
      speaker,
      name,
      view: rowFor({
        seat: speaker.seat,
        name,
        level: speaker.level,
        peak: speaker.peak,
        muted: speaker.muted,
        unheard: speaker.unheard,
        talking: speaker.speaking,
        self: false,
      }),
    };
  });
  /**
   * THE FAULT CARD is a row of one — the player, whose microphone is broken.
   *
   * It goes through the same per-row resolve as everybody else's card rather
   * than off the rail's template, because the template is deliberately left
   * unresolved until a row is in scope (see `rowFor`). Its parts read the
   * SESSION's `voice.*` rather than this row's, so the row it is handed is only
   * there to make the walk legal.
   */
  const faultCard = local?.fault ? rowFor(SELF_ROW(local)) : null;
  const selfCard =
    local?.transmitting === true ? rowFor(SELF_ROW(local)) : null;

  /**
   * The strip colours the content decided, handed to the painter.
   *
   * Through an EFFECT rather than written during the render, because the loop
   * reads them from a ref and a ref written mid-render is the bug React's own
   * rule is about. One frame of a stale colour on the tick a card turns hot is
   * not a thing anybody can see.
   */
  const waveColors = useRef(new Map<number, string>());
  const waveColorKey = [
    ...cards.map((card) => `${card.speaker.seat}:${waveColorOf(card.view)}`),
    `self:${selfCard ? waveColorOf(selfCard) : ""}`,
  ].join(",");
  useEffect(() => {
    const next = new Map<number, string>();
    for (const card of cards) {
      const color = waveColorOf(card.view);
      if (color) next.set(card.speaker.seat, color);
    }
    const own = selfCard ? waveColorOf(selfCard) : undefined;
    if (own) next.set(SELF_SEAT, own);
    waveColors.current = next;
    // The KEY is the colours themselves: re-syncing on the card objects would
    // run this every render, and they are rebuilt on every one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveColorKey]);

  /**
   * THE DRAWING LOOP — the only thing here that runs per frame, and the only
   * thing that reads a level.
   *
   * `sweep` is called from the voice link's own timer rather than here, so a
   * hidden window still retires speakers who went quiet; this loop only paints.
   * It is a plain `requestAnimationFrame` because a waveform nobody is looking
   * at genuinely does not need drawing.
   */
  useEffect(() => {
    if (!room) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      for (const speaker of room.speakers) {
        const canvas = canvases.current.get(speaker.seat);
        if (canvas) {
          paintBars(canvas, speaker.bars, waveColors.current.get(speaker.seat));
        }
      }
      if (localCanvas.current) {
        paintBars(
          localCanvas.current,
          room.local.bars,
          waveColors.current.get(SELF_SEAT),
        );
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [room]);

  if (!room || !local) return null;
  // Nothing to say and nothing being said: the rail is absent rather than an
  // empty box. A microphone FAULT is the exception — a player whose voice is
  // broken has to be told, and the run is where they will be when it breaks.
  if (speakers.length === 0 && !local.transmitting && !local.fault) return null;

  return (
    <div className="voice-cards" aria-label="voice-cards">
      {faultCard ? (
        <div className="voice-card fault" aria-label="voice-fault">
          <HudPart view={faultCard} part="fault_title" ctx={ctx} />
          <HudPart view={faultCard} part="fault_reason" ctx={ctx} />
        </div>
      ) : null}

      {cards.map(({ speaker, name, view: card }) => {
        const src = portraits.get(speaker.seat) ?? null;
        return (
          <button
            type="button"
            key={speaker.seat}
            // THE CARD'S OWN CLASSES ARE THE CONTENT'S, resolved for this
            // speaker — `voice-card` plus whichever of `shouting`, `muted` and
            // `unheard` its conditions hold for. So the border, the glow and
            // the dimming follow the same ladder the words and the waveform do,
            // and a mod that re-grades "shouting" moves all four together.
            className={card.className ?? "voice-card"}
            aria-label={`voice-speaker-${speaker.seat}`}
            // A PRESS MUTES THEM, and it is the one control on this card
            // because it is the one thing a player wants at the moment they are
            // looking at it. It is LOCAL and per-session: nothing is sent, the
            // speaker is not told, and the mute dies with their seat. The VERB
            // is the content's (`press.action`), and the seat is this row's.
            onClick={() => {
              if (!view.def.press) return;
              runHudPress(view.def.press, ctx, {
                // The seat is this ROW's, not the YAML's: one authored press
                // serves every card on the rail.
                arg: speaker.seat,
                // …and which of the two sounds it makes is the OUTCOME's.
                event: speaker.muted ? "voice.unmute" : "voice.mute",
              });
            }}
            title={
              speaker.muted
                ? `${name} — MUTED (CLICK TO UNMUTE)`
                : `MUTE ${name}`
            }
          >
            {src ? (
              <img src={src} alt="" className="pixel-img voice-card-img" />
            ) : (
              <span className="voice-card-img" />
            )}
            <span className="voice-card-body">
              <HudPart view={card} part="name" ctx={ctx} />
              <HudPart
                view={card}
                part="wave"
                ctx={ctx}
                canvasRef={(node) => canvases.current.set(speaker.seat, node)}
              />
              <HudPart view={card} part="status" ctx={ctx} />
            </span>
          </button>
        );
      })}

      {/* THE PLAYER'S OWN CARD, last and plainer: it is confirmation that the
          key is doing something, which is the one thing a push-to-talk player
          cannot otherwise know. No portrait — they know who they are — and no
          mute, because that is what letting go of the key is. */}
      {selfCard
        ? (() => {
            const card = selfCard;
            return (
              <div className="voice-card self" aria-label="voice-self">
                <span className="voice-card-body">
                  <HudPart view={card} part="self_name" ctx={ctx} />
                  <HudPart
                    view={card}
                    part="wave"
                    ctx={ctx}
                    canvasRef={(node) => {
                      localCanvas.current = node;
                    }}
                  />
                </span>
              </div>
            );
          })()
        : null}
    </div>
  );
}

/** The player's own row — their own card, and the one the fault notice borrows
 * to make its parts resolvable. */
const SELF_ROW = (local: {
  level: number;
  bars: readonly number[];
}): Parameters<typeof speakerBindings>[0] => ({
  seat: SELF_SEAT,
  name: "YOU",
  level: local.level,
  peak: Math.max(...local.bars, 0),
  muted: false,
  unheard: false,
  talking: true,
  self: true,
});

/** What the content decided this card's waveform should be drawn in. */
function waveColorOf(card: HudNodeView): string | undefined {
  return card.children.find((child) => child.def.id === "wave")?.color;
}

/** The player's own card has no seat of its own — a sentinel keyed the same way
 * the others are, so the painter's colour map needs no second shape. */
const SELF_SEAT = -1;

/**
 * Paint one loudness history as a bar strip, oldest at the left.
 *
 * A MIRRORED strip (each bar grown from the middle) rather than bars standing on
 * the floor, because that is the shape people read as "audio" — and because it
 * makes the difference between a whisper and a shout a difference in the height
 * of a silhouette rather than in the position of its top edge, which is much
 * easier to compare between two cards at a glance.
 *
 * The COLOUR is the content's (`voice.wave_color`); the fallback is only for a
 * mod whose judgement could not answer.
 */
function paintBars(
  canvas: HTMLCanvasElement,
  bars: readonly number[],
  color: string | undefined,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const count = bars.length;
  if (count === 0) return;
  const step = width / count;
  const barWidth = Math.max(1, Math.floor(step) - 1);
  const middle = height / 2;
  ctx.fillStyle = color ?? "#7ef0c8";
  for (let i = 0; i < count; i++) {
    // Square-rooted, because loudness is perceived roughly logarithmically and
    // a linear RMS strip leaves ordinary speech as a barely-visible flutter
    // along the middle with nothing but a shout ever reaching the top. This is
    // the cheap approximation that makes the whole range legible.
    const level = Math.sqrt(Math.min(1, Math.max(0, bars[i] ?? 0)));
    // A floor of half a pixel: a silent frame still draws a line, so the strip
    // reads as an instrument that is on rather than as a box that is empty.
    const half = Math.max(0.5, (level * height) / 2);
    ctx.fillRect(i * step, middle - half, barWidth, half * 2);
  }
}
