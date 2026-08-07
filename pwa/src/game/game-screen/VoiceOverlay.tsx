// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO IS TALKING — a card per speaker, with their face on it, and a waveform
// that makes a whisper and a shout different at a glance.
//
// **IT IS DESIGNED FOR A DESKTOP VIEWPORT, WHICH IS A DEPARTURE FROM EVERY
// OTHER SURFACE IN THIS GAME AND IS ALLOWED HERE ONLY BECAUSE IT CANNOT APPEAR
// ANYWHERE ELSE.** The reference device is a phone held horizontally (~844×390)
// and the rest of the HUD is sized against it. Voice is gated on the `voice`
// build capability, which only the desktop shell is ever stamped with — there is
// no phone build and no browser build in which this component renders at all —
// so the cards are sized in rem against a desktop window: a 2.6rem portrait
// where a party frame uses 1.8, a name at scale 2 with room for eight
// characters, and a waveform wide enough to read at arm's length rather than
// at a phone's reading distance. If voice ever reaches a phone, this file needs
// a pass at 844×390 and the sizes below are the thing to change.
//
// **IT LIVES ON THE LEFT RAIL, UNDER THE PARTY FRAMES, ON PURPOSE.** That rail
// already means "somebody on your side" — the companion portraits, the party
// frames, the trade asks — and a voice card is the same claim with a mouth on
// it. Putting it there also means it inherits the rail's flex column and cannot
// collide with the minimap hub, the docks, or the steering area, which an
// absolutely-positioned "popup" in a corner would eventually do on some window
// size nobody tested.
//
// **THE WAVEFORM IS WHY THIS IS A CANVAS AND NOT A ROW OF DIVS.** It redraws
// 30 times a second per speaker; as DOM that is up to seven elements' worth of
// style recalculation per frame for something the compositor cannot help with.
// One canvas per card, drawn from the room's own history ring, costs a few
// hundred fills a second in total.
//
// **AND IT NEVER RE-RENDERS ON A LEVEL.** React is told only when the STRUCTURE
// changes — somebody started or stopped talking, was muted, went unheard — and
// the loudness is read imperatively inside the animation frame. See `room.ts`
// for that split; getting it wrong is 400 reconciliations a second.

import { useEffect, useMemo, useRef, useState } from "react";

import type { GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { type GameAssets } from "../assets.ts";
import { dollDataUrl } from "../paper-doll.ts";
import { playerDollLayers } from "../paper-doll-live.ts";
import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import type { VoiceRoom, VoiceSpeaker } from "../net/voice/room.ts";

/** How loud counts as SHOUTING — the peak at which a card turns hot.
 *
 * It is a presentation threshold and nothing else: everything below it draws in
 * the party rail's own green, everything above in the warning amber the HUD
 * already uses for "look at this". The point is not accuracy, it is that two
 * cards side by side answer "which of these two is screaming" without the
 * player having to compare bar heights. */
const SHOUT_PEAK = 0.34;

/** …and how loud counts as a WHISPER, below which the card says so. Somebody
 * talking under this is somebody their friends will ask to speak up, and saying
 * it on the card saves the round trip. */
const WHISPER_PEAK = 0.05;

export function VoiceOverlay({
  room,
  state,
  assets,
  font,
  seatName,
}: {
  room: VoiceRoom;
  /** For the portraits — a speaker's own dressed bust, the same compositor the
   * party frames and the hero avatar share, so a voice card shows the character
   * the player is looking at on the field rather than a generic head. */
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** A seat's display name off the session roster (`RosterEntry.seat`) — the
   * engine's `Player` carries no name. */
  seatName?: (seat: number) => string | null;
}) {
  // STRUCTURE ONLY. `subscribe` deliberately does not fire on a level change;
  // see the header.
  const [speakers, setSpeakers] = useState<readonly VoiceSpeaker[]>(
    room.speakers,
  );
  const [local, setLocal] = useState(room.local);
  useEffect(() => {
    const sync = () => {
      setSpeakers(room.speakers);
      setLocal(room.local);
    };
    sync();
    return room.subscribe(sync);
  }, [room]);

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
      // A hero whose doll cannot be composited yet (a seat the client holds no
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
  const localCanvas = useRef<HTMLCanvasElement | null>(null);

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
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      for (const speaker of room.speakers) {
        const canvas = canvases.current.get(speaker.seat);
        if (canvas)
          paintBars(canvas, speaker.bars, speaker.muted, speaker.peak);
      }
      if (localCanvas.current) {
        paintBars(
          localCanvas.current,
          room.local.bars,
          !room.local.transmitting,
          Math.max(...room.local.bars),
        );
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [room]);

  // Nothing to say and nothing being said: the overlay is absent rather than
  // an empty box. A microphone FAULT is the exception — a player whose voice is
  // broken has to be told, and the run is where they will be when it breaks.
  if (speakers.length === 0 && !local.transmitting && !local.fault) return null;

  return (
    <div className="voice-cards" aria-label="voice-cards">
      {local.fault ? (
        <div className="voice-card fault" aria-label="voice-fault">
          <PixelText font={font} text="VOICE OFF" scale={2} color="#ff9b9b" />
          <PixelText font={font} text={local.fault} scale={2} color="#9aa3ad" />
        </div>
      ) : null}

      {speakers.map((speaker) => {
        const src = portraits.get(speaker.seat) ?? null;
        const name = (seatName?.(speaker.seat) ?? `SEAT ${speaker.seat + 1}`)
          .slice(0, 8)
          .toUpperCase();
        const shouting = speaker.peak >= SHOUT_PEAK;
        return (
          <button
            type="button"
            key={speaker.seat}
            className={`voice-card${shouting ? " shouting" : ""}${
              speaker.muted ? " muted" : ""
            }${speaker.unheard ? " unheard" : ""}`}
            aria-label={`voice-speaker-${speaker.seat}`}
            // A PRESS MUTES THEM, and it is the one control on this card
            // because it is the one thing a player wants at the moment they are
            // looking at it. It is LOCAL and per-session: nothing is sent, the
            // speaker is not told, and the mute dies with their seat.
            onClick={() => {
              room.setMuted(speaker.seat, !speaker.muted);
              playUiSound(synth, speaker.muted ? "confirm" : "back");
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
              <PixelText
                font={font}
                text={name}
                scale={2}
                color={shouting ? "#ffd75e" : "#e8ecf1"}
              />
              <canvas
                className="voice-card-wave"
                width={WAVE_W}
                height={WAVE_H}
                ref={(node) => {
                  canvases.current.set(speaker.seat, node);
                }}
              />
              {speaker.unheard ? (
                <PixelText
                  font={font}
                  // Named rather than silent: this is the case where somebody
                  // IS talking and this machine cannot decode their codec, and
                  // silence would be indistinguishable from a mute.
                  text="CANNOT PLAY THIS VOICE"
                  scale={2}
                  color="#ff9b9b"
                />
              ) : speaker.muted ? (
                <PixelText font={font} text="MUTED" scale={2} color="#9aa3ad" />
              ) : speaker.peak < WHISPER_PEAK ? (
                <PixelText
                  font={font}
                  text="WHISPERING"
                  scale={2}
                  color="#9aa3ad"
                />
              ) : shouting ? (
                <PixelText
                  font={font}
                  text="SHOUTING"
                  scale={2}
                  color="#ffd75e"
                />
              ) : null}
            </span>
          </button>
        );
      })}

      {/* THE PLAYER'S OWN CARD, last and plainer: it is confirmation that the
          key is doing something, which is the one thing a push-to-talk player
          cannot otherwise know. No portrait — they know who they are — and no
          mute button, because that is what letting go of the key is. */}
      {local.transmitting ? (
        <div className="voice-card self" aria-label="voice-self">
          <span className="voice-card-body">
            <PixelText font={font} text="YOU" scale={2} color="#7cff9b" />
            <canvas
              className="voice-card-wave"
              width={WAVE_W}
              height={WAVE_H}
              ref={localCanvas}
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The waveform's raster size. Fixed rather than measured: it is drawn from a
 * fixed-length history (`VOICE_BARS`), so a CSS width that did not divide it
 * evenly would alias the bars against each other. */
const WAVE_W = 96;
const WAVE_H = 16;

/**
 * Paint one loudness history as a bar strip, oldest at the left.
 *
 * A MIRRORED strip (each bar grown from the middle) rather than bars standing on
 * the floor, because that is the shape people read as "audio" — and because it
 * makes the difference between a whisper and a shout a difference in the height
 * of a silhouette rather than in the position of its top edge, which is much
 * easier to compare between two cards at a glance.
 */
function paintBars(
  canvas: HTMLCanvasElement,
  bars: readonly number[],
  dim: boolean,
  peak: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, WAVE_W, WAVE_H);
  const count = bars.length;
  if (count === 0) return;
  const step = WAVE_W / count;
  const width = Math.max(1, Math.floor(step) - 1);
  const middle = WAVE_H / 2;
  ctx.fillStyle = dim ? "#4b5563" : peak >= SHOUT_PEAK ? "#ffd75e" : "#7ef0c8";
  for (let i = 0; i < count; i++) {
    // Square-rooted, because loudness is perceived roughly logarithmically and
    // a linear RMS strip leaves ordinary speech as a barely-visible flutter
    // along the middle with nothing but a shout ever reaching the top. This is
    // the cheap approximation that makes the whole range legible.
    const level = Math.sqrt(Math.min(1, Math.max(0, bars[i] ?? 0)));
    // A floor of one pixel: a silent frame still draws a line, so the strip
    // reads as an instrument that is on rather than as a box that is empty.
    const half = Math.max(0.5, (level * WAVE_H) / 2);
    ctx.fillRect(i * step, middle - half, width, half * 2);
  }
}
