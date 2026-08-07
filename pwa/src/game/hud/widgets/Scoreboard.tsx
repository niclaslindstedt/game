// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCOREBOARD — who is in this session, ranked by frags. QuakeWorld's TAB
// board, in this game's own pixel font.
//
// **IT IS A WIDGET BECAUSE IT IS A LIST NOBODY CAN AUTHOR THE LENGTH OF**, and
// because every row leads with a portrait composited per cast by the paper-doll
// compositor — the same reason the party frames beside it are one. What content
// owns is the rest: whether the board is on the HUD at all, where it sits, and
// what it is gated on (`content/hud/elements/scoreboard.yaml`).
//
// **THE COLUMNS ARE THE FOUR QUESTIONS A PLAYER ASKS ABOUT A STRANGER**, in the
// order QuakeWorld settled sixty million deathmatches ago: who are you, how big
// are you, how many have you killed, how long have you been here. The fifth —
// the ping — is the one number that answers "why does this feel like that", so
// it rides along at the right edge where a Quake player already looks for it.
//
// **THE RANKING IS THE POINT AND IT IS NOT THIS FILE'S** — `scoreRows` owns
// every judgement about what a row says and where it sits, so the board's rules
// can be tested without a canvas, a session or a run. This draws what it is
// handed.
//
// **A DASH IS A REAL ANSWER.** A teammate through a town portal is simulating
// in another world (`server/worlds.ts`) and this client holds nothing but a
// departed body in their chair; printing `0 KILLS` for them would be a lie, and
// a lie about the one column the board sorts on.

import { useEffect, useMemo, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { GameState } from "@game/core";

import { dollDataUrl } from "../../paper-doll.ts";
import { localSeat } from "../../local-seat.ts";
import { playerDollLayers } from "../../paper-doll-live.ts";
import type { Sprites } from "../../assets.ts";
import type { SessionLink } from "../../net/session-link.ts";
import {
  formatSessionTime,
  scoreRows,
  type ScoreRow,
} from "../../game-screen/scoreboard.ts";

import type { HudFieldContext } from "../context.ts";

/** How often the TIME column advances. A clock that reads in seconds needs one
 * tick a second; anything faster is a re-render nobody can see. */
const TICK_MS = 1_000;

/** How much of a name the board draws. Long enough for the names people
 * actually pick, short enough that the columns after it stay in the same place
 * down the whole table — a ragged score column is unreadable at a glance, which
 * is the only way a board held open mid-fight is ever read. */
const NAME_CHARS = 12;

const HEAD = "#7c8798";
const TEXT = "#e6e9ef";
const DIM = "#9aa3ad";
const MINE = "#ffd75e";

export function Scoreboard({ ctx }: { ctx: HudFieldContext }) {
  const session = ctx.session ?? null;
  return (
    <ScoreboardTable
      font={ctx.font}
      sprites={ctx.assets.sprites}
      state={ctx.state}
      session={session}
      // A SPECTATOR IS NOT SEAT 0. `localSeat()` answers 0 for a client that
      // steers nothing (which is the right answer for the camera and the wrong
      // one here), so a watcher is told they own no row rather than being shown
      // somebody else's name in their own colour.
      mySeat={session?.spectating ? null : localSeat()}
    />
  );
}

/**
 * The table itself, taking a plain prop list rather than the HUD context — the
 * PAUSE screen puts the same board up (`SessionPanel`), and that screen has a
 * session and a run but no HUD.
 *
 * `onTrade` is the pause screen's alone: a row grows an ASK button there, where
 * the player has already stopped to read. The in-fight board is a READOUT and
 * carries no verbs at all — a press target that appears under a held key, over
 * the field, while the horde keeps coming, is a mis-tap waiting to happen.
 */
export function ScoreboardTable({
  font,
  sprites,
  state,
  session,
  mySeat,
  onTrade,
}: {
  font: PixelFont;
  sprites: Sprites;
  state: GameState;
  session: SessionLink | null;
  mySeat: number | null;
  onTrade?: (seat: number) => void;
}) {
  // The clock the TIME column reads. A roster is broadcast when it CHANGES, so
  // the elapsed since it landed is what makes the column tick (see
  // `SessionLink.rosterAt`) — and this is the only thing on the board that
  // moves on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  // Redraw when somebody joins, leaves or crosses a portal.
  const [, bump] = useState(0);
  useEffect(() => session?.subscribe(() => bump((n) => n + 1)), [session]);

  const roster = session?.roster ?? [];
  const rows = scoreRows({
    roster,
    state,
    mySeat,
    levelId: state.level.id,
    sinceRoster: session?.rosterAt ? now - session.rosterAt : 0,
  });

  /**
   * The busts, composited once per CHANGE OF CAST rather than per render —
   * `dollDataUrl` draws a whole paper doll onto a canvas and reads it back as a
   * data URL, which is cheap once and absurd every second.
   */
  const cast = rows.map((row) => row.seat).join(",");
  const portraits = useMemo(() => {
    const out = new Map<number, string | null>();
    for (const row of rows) {
      if (row.seat === null) continue;
      const hero = state.players[row.seat];
      // A seat this client holds no body for — somebody through a portal, or a
      // roster frame that landed before the snapshot naming them — still gets a
      // row. The name identifies them; the portrait is the nicety.
      const bust = hero
        ? dollDataUrl(
            sprites,
            playerDollLayers(state, "0", { weapon: false, hero }),
            undefined,
            { bust: true },
          )
        : undefined;
      out.set(row.seat, bust ?? null);
    }
    return out;
    // `cast` is who is on the board; the state and the atlas are the run's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast, state, sprites]);

  // NOTHING TO COMPARE IS NOTHING TO SHOW. A solo run has no session at all and
  // a session of one is a player looking at their own name — the board is a
  // party readout, so it stands down rather than drawing a table with one row
  // in it.
  if (rows.length < 2) return null;

  return (
    <div
      className={`scoreboard${onTrade ? " asks" : ""}`}
      aria-label="scoreboard"
    >
      <div className="scoreboard-row head">
        <span className="scoreboard-portrait" />
        <Cell font={font} text="PLAYER" color={HEAD} className="name" />
        <Cell font={font} text="LVL" color={HEAD} className="num" />
        <Cell font={font} text="KILLS" color={HEAD} className="num" />
        <Cell font={font} text="TIME" color={HEAD} className="num wide" />
        <Cell font={font} text="PING" color={HEAD} className="num" />
        {onTrade && <span className="scoreboard-ask" />}
      </div>
      {rows.map((row) => (
        <Row
          key={row.slot}
          font={font}
          row={row}
          portrait={
            row.seat === null ? null : (portraits.get(row.seat) ?? null)
          }
          onTrade={onTrade}
        />
      ))}
    </div>
  );
}

function Row({
  font,
  row,
  portrait,
  onTrade,
}: {
  font: PixelFont;
  row: ScoreRow;
  portrait: string | null;
  onTrade?: (seat: number) => void;
}) {
  // A DOWN teammate greys the way their party frame does, and an AWAY one — off
  // through a town portal — dims without going grey: they are fine, they are
  // just somewhere this client cannot see.
  const classes = [
    "scoreboard-row",
    row.self ? "self" : "",
    row.downed ? "downed" : "",
    row.away || row.spectating ? "away" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const color = row.self ? MINE : row.downed ? DIM : TEXT;
  return (
    <div className={classes}>
      <span className="scoreboard-portrait">
        {portrait ? <img src={portrait} alt="" className="pixel-img" /> : null}
      </span>
      <Cell
        font={font}
        text={row.name.slice(0, NAME_CHARS).toUpperCase()}
        color={color}
        className="name"
      />
      <Cell
        font={font}
        text={numberOrDash(row.level)}
        color={color}
        className="num"
      />
      <Cell
        font={font}
        text={numberOrDash(row.kills)}
        color={color}
        className="num"
      />
      <Cell
        font={font}
        text={row.timeMs === null ? "-" : formatSessionTime(row.timeMs)}
        color={DIM}
        className="num wide"
      />
      {/* WHAT THIS ROW IS, where the ping would be. A spectator has no frags to
          rank and a bot has no wire to time, and both facts belong in the
          column the player is already reading for "why is this one odd". */}
      <Cell
        font={font}
        text={
          row.spectating
            ? "WATCH"
            : row.bot
              ? "BOT"
              : row.ping >= 0
                ? String(row.ping)
                : "-"
        }
        color={DIM}
        className="num"
      />
      {onTrade && (
        <span className="scoreboard-ask">
          {/* A TABLE WITH YOURSELF IS REFUSED BY THE ENGINE ANYWAY, and there
              is nobody to ask on a spectator's row or an away seat's. */}
          {row.seat !== null && !row.self && !row.away && !row.spectating ? (
            <button
              type="button"
              className="session-copy"
              aria-label={`ask-trade-${row.seat}`}
              onClick={() => onTrade(row.seat as number)}
            >
              <PixelText font={font} text="ASK" scale={2} color={MINE} />
            </button>
          ) : null}
        </span>
      )}
    </div>
  );
}

function Cell({
  font,
  text,
  color,
  className,
}: {
  font: PixelFont;
  text: string;
  color: string;
  className: string;
}) {
  return (
    <span className={`scoreboard-cell ${className}`}>
      <PixelText font={font} text={text} scale={2} color={color} />
    </span>
  );
}

/** A number the run could answer, or the dash that says it could not. */
function numberOrDash(value: number | null): string {
  return value === null ? "-" : String(value);
}
