// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The UI SHELF — the exhibits whose subject is a piece of the game's own
// interface rather than something drawn on the field.
//
// **IT EXISTS BECAUSE SOME CHROME CANNOT BE LOOKED AT ANY OTHER WAY.** The
// party scoreboard only draws inside a live session of two or more, which on a
// developer's machine means a hosted listen server, a second client and a
// router — for a table. So it is staged here instead, exactly as the road's
// gearbox exhibit stages a dial the minigame otherwise only shows at 60 mph:
// the gallery mounts the REAL component against a REAL staged run, and the
// shelf therefore cannot drift from what ships.
//
// **THE PARTY IS SEATED THROUGH THE ENGINE'S OWN DOOR** (`seatHero` — the same
// one the session server admits a joiner through), so the busts down the board's
// left edge are real dressed paper dolls of real heroes rather than a picture of
// some. What is invented here is the half the engine genuinely cannot answer:
// the ROSTER — names, pings and join times are a fact about a session, and there
// is no session.

import { rollEquipment, seatHero, type GameState } from "@game/core";

import type { RosterEntry } from "@game/wire/protocol.ts";

import type { SessionLink } from "../net/session-link.ts";

import { horde, type Exhibit } from "./exhibit-kit.ts";

/** The slots a rolled piece can actually be WORN in — everything on the paper
 * doll. A gear roll may also land on a bag, which is carried. */
type WornSlot =
  "head" | "chest" | "legs" | "feet" | "amulet" | "ring1" | "ring2" | "offhand";

const WORN = new Set<string>([
  "head",
  "chest",
  "legs",
  "feet",
  "amulet",
  "ring1",
  "ring2",
  "offhand",
]);

/** How many seats the staged party fills. Four is the number worth judging at:
 * enough for the ranking to be a ranking and for a long name to sit beside a
 * short one, few enough to fit the reference phone in landscape. */
const SEATS = 4;

/**
 * The staged session — everything about the party that lives on the ROSTER
 * rather than in the run, which is to say everything the engine has no opinion
 * about.
 *
 * Deliberately awkward on purpose in three places, because those are the cases
 * a board gets wrong: a long name (THE FULFILLER, which the board must cut
 * rather than let push the columns about), somebody standing on ANOTHER LEVEL
 * (through a town portal — their numbers must read as dashes, not zeroes), and
 * a SPECTATOR (who must sink below every player whatever the run says).
 */
const ROSTER: RosterEntry[] = [
  {
    slot: 0,
    name: "ADA",
    playing: true,
    seat: 0,
    ping: -1,
    rate: 4_200,
    joinedMs: 2_711_000,
    level: "goodco_hq",
  },
  {
    slot: 1,
    name: "BREN",
    playing: true,
    seat: 1,
    ping: 38,
    rate: 3_900,
    joinedMs: 741_000,
    level: "goodco_hq",
  },
  {
    slot: 2,
    name: "THE FULFILLER",
    playing: true,
    seat: 2,
    ping: 112,
    rate: 4_100,
    joinedMs: 1_302_000,
    // Through the portal: the board can say nothing about them but their name.
    level: "garage",
  },
  {
    slot: 3,
    name: "BOT 4",
    playing: true,
    seat: 3,
    ping: -1,
    rate: 3_800,
    joinedMs: 402_000,
    level: "goodco_hq",
    bot: true,
  },
  {
    slot: 4,
    name: "KESTREL",
    playing: false,
    seat: null,
    ping: 64,
    rate: 900,
    joinedMs: 96_000,
  },
];

/** The link the staged board reads. Inert — nothing here can be said to, and
 * nothing changes, so the subscription is a no-op that never fires. */
export function gallerySession(): SessionLink {
  return {
    say: () => {},
    lines: [],
    roster: ROSTER,
    // Zero rather than a stamp: `scoreRows` adds the elapsed since the roster
    // landed to make the TIME column tick, and a diorama's clock should read
    // the authored figures rather than creeping while a contact sheet is shot.
    rosterAt: 0,
    subscribe: () => () => {},
    spectating: false,
  };
}

/**
 * Fill the staged run's remaining seats and give each hero the numbers the
 * board ranks on.
 *
 * IDEMPOTENT, because an exhibit's `fire` runs once per show and the loop
 * replays for as long as the shelf is open — seating on every take would grow
 * the party past the roster it is paired with. `applyScenario` re-stages the
 * diorama around the party rather than rebuilding it, so the seats survive a
 * replay and this does nothing on every take but the first.
 */
function seatParty(state: GameState): void {
  while (state.players.length < SEATS) seatHero(state, null);
  const levels = [14, 9, 21, 11];
  const kills = [37, 62, 118, 24];
  state.players.forEach((hero, seat) => {
    if (seat >= SEATS) return;
    hero.level = levels[seat] as number;
    hero.kills = kills[seat] as number;
    // HOLSTERED, like the hero the display case stages (`STAGE_BASE`). A hero
    // seated mid-run arrives ARMED on purpose — the opening beats belong to the
    // run, not to the person (`seatHero`) — so without this the staged party
    // opens fire on the frozen crowd and the diorama fills with damage numbers
    // and XP popups that have nothing to do with the exhibit.
    hero.disarmed = true;
    // One of them is DOWN where they fell: the row greys, the way their party
    // frame does.
    hero.downed = seat === 1;
    if (seat === 3) hero.bot = true;
    // Dressed off the real loot roller, at levels far enough apart that the
    // busts read as four different people rather than four of the same hero.
    // Rolled once — the seats keep their kit across every replay.
    if (hero.equipment.head) return;
    for (let piece = 0; piece < 4; piece++) {
      const rolled = rollEquipment(state, hero, {
        slot: "gear",
        mlvl: 8 + seat * 6,
      });
      // A gear roll can land on a BAG, which is carried rather than worn and
      // has no slot on the doll — skip it and take the next roll.
      if (WORN.has(rolled.slot)) {
        hero.equipment[rolled.slot as WornSlot] = rolled;
      }
    }
  });
}

export function uiExhibits(): Exhibit[] {
  return [
    {
      id: "scoreboard",
      // A board with people listed on it, which is what this is.
      icon: "icon_wanted_board",
      label: "SCOREBOARD",
      blurb: "WHO IS IN THE SESSION - PORTRAIT, LEVEL, KILLS, TIME AND PING",
      group: "UI",
      keywords: [
        "party",
        "session",
        "multiplayer",
        "coop",
        "roster",
        "players",
        "scores",
        "frags",
        "quake",
        "tab",
        "ping",
      ],
      // A crowd behind it, so the board is judged the way it is actually read:
      // over a fight, with something underneath it to be legible against.
      stage: { spawns: horde(7, 40, 90) },
      chrome: "scoreboard",
      showMs: 2_000,
      fire: (ctx) => seatParty(ctx.state),
    },
  ];
}
