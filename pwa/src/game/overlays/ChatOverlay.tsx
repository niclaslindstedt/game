// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SESSION'S CHAT — the thing that makes eight people watching a hardcore
// run a game rather than a stream.
//
// **IT LIVES IN THE BOTTOM LEFT AND NOWHERE ELSE.** The reference device is a
// phone held in landscape, and the right-hand third of it is where the steering
// thumb lives; the rule is "a scrollback that does not steal the steering
// thumb's third of the screen", and this is that rule implemented. The log is also POINTER-TRANSPARENT while nobody is typing —
// a tap that lands on a chat line is a tap the hero did not take.
//
// **THE FIELD IS RAISED, NOT PARKED.** A permanently open text box on a game
// screen swallows every key the run wants (W, A, S, D, the powerup digits) and
// puts a caret in the corner of a fight. ENTER opens it, ENTER sends, ESCAPE
// abandons it — the arrangement every game with a chat box has used since
// Quake, and the one every player already knows.
//
// **WHAT A SLASH COMMAND DOES IS THE SERVER'S BUSINESS.** `/players 8`,
// `/kick`, `/who` are parsed by `server/wire/chat.ts` against its own closed
// list, and the answer comes back as a system line like any other. Nothing here
// looks at the text: a chat box that acted on a command locally would be a
// second, weaker copy of the rules the session already enforces — and on a
// spectator's machine it would be acting on a session it is not entitled to
// change.

import { useEffect, useRef, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { SessionLink } from "../net/session-link.ts";

/** How many lines are drawn over the field. Deliberately fewer than the link
 * keeps: what a player reads mid-fight is the last few things said, and a wall
 * of text over the floor is a wall of text they cannot see the floor through. */
const VISIBLE_LINES = 6;
/** How long a line stays up once nobody is typing. Chat is news, not a
 * document — the log is still all there the moment the field is raised. */
const LINE_LIFE_MS = 12_000;

export function ChatOverlay({
  font,
  link,
  /** The run is on a screen that owns the keyboard (a menu, the map, a
   * dialogue): ENTER belongs to that, not to a chat box behind it. */
  suspended,
}: {
  font: PixelFont;
  link: SessionLink;
  suspended: boolean;
}) {
  const [, bump] = useState(0);
  const [raised, setRaised] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Whether the log is still worth drawing over the field. Chat is news, not a
  // document: it shows up, it is read, and it gets out of the way of the fight.
  // A boolean with its own timer rather than a timestamp compared at render —
  // the render pass has to be pure, and "how long ago was that" is not.
  const [showing, setShowing] = useState(false);
  // ENTER belongs to a screen that owns the keyboard, so a raised field is
  // DERIVED away rather than closed by an effect: the moment a menu goes up the
  // box is not composing, and it comes back when the menu does not.
  const typing = raised && !suspended;

  useEffect(
    () =>
      link.subscribe(() => {
        setShowing(true);
        bump((n) => n + 1);
      }),
    [link],
  );

  // The fade's own timer, re-armed by every line: without it the last thing
  // anybody said would hang over the field for the rest of the run.
  useEffect(() => {
    if (!showing) return;
    const timer = window.setTimeout(() => setShowing(false), LINE_LIFE_MS);
    return () => window.clearTimeout(timer);
  }, [showing, link.lines.length]);

  useEffect(() => {
    if (typing || suspended) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat) return;
      // CAPTURED, so the run's own Enter (dismissing a title card, advancing a
      // page) does not also fire on the way past.
      event.preventDefault();
      event.stopPropagation();
      setRaised(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [typing, suspended]);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  const send = () => {
    const said = text.trim();
    setText("");
    setRaised(false);
    if (said) link.say(said);
  };

  const fresh = typing || showing;
  const lines = link.lines.slice(-VISIBLE_LINES);
  if (!fresh && lines.length === 0) return null;

  return (
    <div className={`chat-overlay${typing ? " typing" : ""}`}>
      {fresh && (
        <div className="chat-log" aria-label="session-chat">
          {lines.map((line, at) => (
            <PixelText
              key={`${line.slot}-${at}-${line.text}`}
              font={font}
              // A SYSTEM line has no speaker to name — it is the session
              // talking (a refusal, a `/players` acknowledgement, somebody
              // arriving) — and an EMOTE is the speaker doing something rather
              // than saying it, so neither wears the "NAME:" colon.
              text={
                line.kind === "say"
                  ? `${line.name}: ${line.text}`.toUpperCase()
                  : line.text.toUpperCase()
              }
              scale={2}
              color={
                line.kind === "system"
                  ? "#7ef0c8"
                  : line.kind === "emote"
                    ? "#c9a6ff"
                    : "#e6e9ef"
              }
            />
          ))}
        </div>
      )}
      {typing && (
        <div className="chat-field">
          <PixelText
            font={font}
            text={link.spectating ? "WATCHING" : "SAY"}
            scale={2}
            color="#9aa3ad"
          />
          <div className="pixel-input focused">
            <div className="pixel-input-display" aria-hidden="true">
              <PixelText
                font={font}
                text={text.toUpperCase()}
                scale={2}
                color="#ffd75e"
              />
              <span className="pixel-caret" />
            </div>
            <input
              ref={inputRef}
              className="pixel-input-field"
              aria-label="chat-say"
              value={text}
              maxLength={120}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") send();
                if (e.key === "Escape") {
                  setText("");
                  setRaised(false);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
