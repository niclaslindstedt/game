// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIRE'S HANDSHAKE VOCABULARY — the message TYPES that cross between a
// session server and a client, the one integer that says whether the two are
// speaking the same language, and the refusal texts a join screen prints.
//
// This module is deliberately a LEAF: types, constants and narrow guards, no
// engine import at all. Both ends of the wire read it — the server inside its
// utility process and the page inside the renderer — and the page reaches it
// from a screen that sits on the app's STARTUP path, where the 200 KB
// critical-path budget forbids anything that drags `@game/core` behind it.
// A `type` import of `GameInput` would be free, but a value import would not,
// and the distinction is too easy to lose; so nothing here knows the engine
// exists and the shapes that must name engine types do so structurally.
//
// The budget is also why the wire's RUNTIME vocabulary lives next door: the
// frame tags, the command allow-list and the transport constants are read only
// once a session is live, so they sit in `./frames.ts` behind the run's lazy
// chunk — tree-shaking is global, and an export a lazy chunk used would keep
// its bytes HERE, on the startup path. What stays in this file is what the
// title menu genuinely reads to word a refusal. **No value re-export may
// connect the two files, in either direction.**
//
// PROTOCOL_VERSION is bumped on EVERY change to a message shape, including one
// that looks backward compatible. Version skew is the failure mode that reaches
// a player as "random crashes", and the only cheap defence is a handshake that
// refuses a mismatch by name rather than a decoder that limps along.

import type { CommandName, FrameType } from "./frames.ts";

/**
 * The wire's own version. Bump on any change to a message shape, a field's
 * meaning, or the snapshot split. A mismatch is refused at the handshake with
 * BOTH numbers named — a refusal a player can act on beats a desync they
 * cannot.
 */
export const PROTOCOL_VERSION = 20;

// ---------------------------------------------------------------------------
// Session parameters — the STATIC half of the replication split
// ---------------------------------------------------------------------------

/**
 * Everything a client needs to rebuild the RUN for itself.
 *
 * This is the whole of the replication split's STATIC tier: the level is a deterministic
 * function of these arguments, so the obstacles, the decor, the canopy, the
 * ground layer, the spawner layout and the carved geometry are all built by
 * the client's own `createRunFromParams` call and NEVER travel. On a measured
 * `moon` run that is ~100 KB the wire does not carry, once per level, per
 * client.
 *
 * The claim it rests on — that the same arguments build the same world in two
 * processes — is a determinism claim about the same build, and it is TESTED
 * rather than believed (`tests/engine/net_determinism_test.ts`).
 *
 * **THE RUN, NOT THE LEVEL — and the difference is where this shape went wrong
 * once.** A RUN is not `createGame(params)`: the app performs several further
 * mutations before the first tick (the campaign chain, the purse, the thoughts
 * already read, an opening already watched, a bot run's dialogue mute), and
 * while those were app code alone a session built from these parameters held a
 * DIFFERENT world from the one the app built — which the client's first delta
 * would have carried as corrections to a run that was right to begin with. They
 * are parameters now, and the rule that keeps them so is stated where they are
 * applied: **anything the app does to a run before its first tick belongs
 * here** (`src/game/session-setup.ts`).
 *
 * This leaf may not import the engine, so it names `RunParams` structurally
 * rather than by type. Keep the two in step; the determinism suite is what
 * fails when they drift.
 */
export type SessionParams = {
  /** The run's seed. Every rng stream in the level is derived from it. */
  seed: number;
  levelId: string;
  /** The run's difficulty id (`easy` … `jesus`). Structural, so this leaf
   * needs no engine import to name it. */
  difficulty: string;
  /** The arriving hero's carry-over, or null for the authored fresh start.
   * Opaque here on purpose: the wire moves it, the engine reads it. */
  loadout: unknown | null;
  /**
   * The build an AUTO PILOT flight already in progress engaged on, or null.
   *
   * Opaque here for the same reason `loadout` is: the wire moves it, the engine
   * reads it. It travels because a FLIGHT outlives a run — the ride crosses
   * levels and each level is a fresh session — and the refund owed when it
   * stops must revert to the build the player had before the FIRST level.
   * Held app-side alone (as it was before the cutover) it could not survive the
   * simulation moving out of the renderer.
   */
  autopilotBuild?: unknown | null;
  /** A LEVEL TOKEN respec is owed at the run's start. */
  respec: boolean;
  /** Level ids the hero has already cleared on this difficulty. */
  clearedLevels: string[];
  /** The hero has already met this level's merchant on this difficulty. */
  merchantDiscovered: boolean;
  /** The CAMPAIGN quest chain the hero carries. Opaque here like `loadout`:
   * the wire moves it, the engine reads it. */
  campaignQuests?: unknown | null;
  /** The hero's whole banked wealth, or null to keep whatever the loadout gave
   * — a synthetic BOT VIEW / demo run flies a loadout rather than a purse. */
  coins?: number | null;
  /** The inner monologues this hero has already read on this difficulty. */
  seenThoughts?: string[];
  /** How much of the opening to skip: `none`, `story` (already watched on this
   * difficulty), or `all` (a developer warp-in). Structural, so this leaf needs
   * no engine import to name it. */
  openingSkip?: string;
  /** Mute the in-world dialogue — a bot run has nobody to tap through it. */
  muteDialogue?: boolean;
  /**
   * The session's LOOT RULE — `free` (the default) or `allocated`; see
   * `GameState.lootMode`. Structural, so this leaf needs no engine import to
   * name it, and it travels as a session parameter rather than a command
   * because it must be the same for everybody and cannot change under a party
   * mid-fight.
   */
  lootMode?: string;
  /** MAP SIZE: which of the three sizes this session's maps are carved at. An
   * engine FLAG rather than a `createGame` argument, so it travels separately
   * and the client applies it before it builds. */
  generatedMapSize: string;
  /**
   * THE SESSION IS A HARDCORE GAME — hosted by a hardcore character.
   *
   * A session fact rather than a per-player one, because the two modes may
   * never mix: a hardcore hero dying in a stranger's softcore-rules session is
   * a betrayal, and a softcore hero in a hardcore session is a tourist among
   * people playing for keeps. Admission refuses the mismatch by name
   * (`hardcore-mismatch`) — the ENGINE never learns hardcore exists (death and
   * permadeath stay app-side, as ever); this flag lives only at the door.
   * Absent means softcore, which is every session hosted before it existed.
   */
  hardcore?: boolean;
};

/**
 * What the two ends compare before a single game byte is exchanged.
 *
 * `build` is the engine version rather than a git hash because that is what
 * both ends can honestly know about themselves; a real build hash replaces it
 * once the client is a different machine and a different download.
 */
export type Handshake = {
  protocol: number;
  build: string;
  /** The mod ids and their load order, in the order they were applied. An
   * empty list is the shipped game. */
  mods: string[];
};

/** Why a join was refused, in the terms the JOIN screen puts on screen. */
export type RefusalReason =
  | "protocol-mismatch"
  | "build-mismatch"
  | "mod-mismatch"
  | "session-full"
  | "no-session"
  | "bad-password"
  | "bad-challenge"
  | "rate-limited"
  | "unlicensed"
  | "hardcore-mismatch";

/**
 * What the JOIN screen prints for each refusal.
 *
 * Here rather than in the app because both ends need it: the server writes it
 * into the `bye` it sends, and a client refused before it ever reached a
 * session has nothing but the reason code to word. Wording a refusal twice is
 * how the two copies come to disagree about what "build-mismatch" means.
 */
export const REFUSAL_TEXT: Record<RefusalReason, string> = {
  "protocol-mismatch": "THIS GAME SPEAKS A DIFFERENT VERSION OF THE PROTOCOL",
  "build-mismatch": "ONE OF YOU NEEDS TO UPDATE - THE BUILDS DISAGREE",
  "mod-mismatch": "THE HOST IS PLAYING WITH DIFFERENT MODS",
  "session-full": "THAT SESSION IS FULL",
  "no-session": "NOBODY IS HOSTING AT THAT ADDRESS",
  "bad-password": "WRONG PASSWORD",
  "bad-challenge": "THE HANDSHAKE EXPIRED - TRY AGAIN",
  "rate-limited": "TOO MANY ATTEMPTS - WAIT A MOMENT",
  unlicensed: "MULTIPLAYER IS PLAYED THROUGH STEAM",
  // Worded from the joiner's side, mode-neutral: whichever way the mismatch
  // runs, the thing the player can act on is picking a matching character.
  "hardcore-mismatch": "HARDCORE AND SOFTCORE HEROES CANNOT SHARE A GAME",
};

// ---------------------------------------------------------------------------
// The frames' shapes (the tags themselves live in ./frames.ts)
// ---------------------------------------------------------------------------

/** A frame's fixed header. Every frame carries all four fields even when one
 * is meaningless for its type — a fixed-size header is what lets the decoder
 * validate a length before it reads anything, which is
 * non-negotiable once the socket is open to the internet. */
export type FrameHeader = {
  type: FrameType;
  /** The server's snapshot sequence this frame belongs to (0 on client→server
   * frames other than `ack`). */
  seq: number;
  /**
   * The last sequence the SENDER has applied from the other side — and WHICH
   * sequence space depends on the direction.
   *
   * Client → server (`ack` frames): the last SNAPSHOT sequence applied. A
   * delta is always coded against the receiver's acked snapshot, never against
   * the sender's latest — that is what makes a lost packet cost one frame of
   * smoothness instead of a desync.
   *
   * Server → client STATE frames (`snapshot`/`delta`): the highest
   * `InputPayload.seq` from THIS client the server has applied. The client's
   * movement prediction reads it to drop acknowledged inputs and replay only
   * the ones the snapshot cannot yet reflect. Meaningless (0) on every other
   * server → client frame.
   */
  ack: number;
  /** The simulation tick the frame was produced on. */
  tick: number;
};

/** The payload of a `welcome`. */
export type WelcomePayload = {
  handshake: Handshake;
  params: SessionParams;
  /** Which ROSTER slot this client is drawn in — its row in the party frame
   * and the name a `/kick` matches. Not the same fact as `seat`: a spectator
   * has a slot and no seat. */
  slot: number;
  /**
   * WHICH HERO THIS CLIENT STEERS — an index into `state.players` — or null to
   * watch.
   *
   * Stated outright rather than inferred from `slot`, and the difference is not
   * cosmetic: the first spectator to connect is also drawn at slot 0 (there is
   * nobody else), so inferring it silently handed a watcher the hero's whole
   * private bag to draw. Two facts, two fields.
   *
   * The seat is the SERVER's answer, decided at admission from what it seated
   * the connection in. A client is TOLD its seat; it never asserts one, which
   * is what stops a stranger claiming somebody else's hero.
   */
  seat: number | null;
  /**
   * THE TICKET BACK INTO THIS SEAT if the connection drops.
   * Opaque, unguessable, and this client's alone; echoed on a later
   * `join` to resume the hero rather than be built a fresh one.
   *
   * Absent for a spectator, who has no hero to come back to.
   *
   * **IT IS A SECRET, and that is the whole of its security.** A seat is
   * claimed by whoever presents the ticket, so anybody who can read one can
   * take that hero — the same standing as a session password, which the trust
   * model already calls a speed bump rather than a wall. What it is genuinely
   * for is telling a reconnecting player apart from a newcomer, which nothing
   * else on the wire can do: a peer key changes with the source port, and a
   * name is not a credential.
   */
  resume?: string;
};

/** The payload of a `bye`. */
export type ByePayload = {
  reason: RefusalReason | "host-left" | "shutdown" | "error" | "kicked";
  detail?: string;
};

/**
 * The payload of a `hello` — the connectionless probe.
 *
 * `pad` is not a field with a meaning; it is the padding `HELLO_MIN_BYTES`
 * demands, carried IN the payload so the rule can be enforced on the decoded
 * frame rather than on a datagram length the transport may have already
 * reframed. A client fills it with whatever it likes; the server only measures.
 */
export type HelloPayload = {
  protocol: number;
  pad?: string;
};

/**
 * The payload of a `challenge` — the tiny reply, and the whole of what a
 * stranger learns before proving anything.
 *
 * It names the session's protocol and build so a JOIN screen can refuse a skew
 * without a round trip through a password prompt, and says WHETHER a password
 * is wanted — never anything about it. `cookie` is what the join must echo.
 */
export type ChallengePayload = {
  cookie: number;
  protocol: number;
  build: string;
  needsPassword: boolean;
  /** Seats taken and seats there are, so a browser row can read `3/8` off a
   * probe rather than off metadata a host could have set to anything. */
  players: number;
  maxPlayers: number;
  /**
   * The session is a HARDCORE game (see `SessionParams.hardcore`).
   * On the probe so the JOIN screen can show the constraint and refuse the
   * mismatch locally, without spending the join round trip to be told; the
   * host still enforces it at admission, because a probe reply is advice and
   * the door is the door. Nothing sensitive: the Steam lobby metadata says
   * the same thing to anybody browsing.
   */
  hardcore?: boolean;
};

/**
 * The payload of a `join`.
 *
 * `proof` is the password's, and it is a proof rather than the password: the
 * client hashes the password together with the cookie it was just handed, so
 * what crosses the wire is useless on any other connection. That is a speed
 * bump and the doc says so — a listen server's host can read the password out
 * of their own memory either way — but it costs nothing and keeps a session
 * password out of a packet capture.
 */
export type JoinPayload = {
  cookie: number;
  handshake: Handshake;
  proof: number;
  /** What this player is called in the roster and in chat. Trimmed and capped
   * by the server; never trusted for anything but display. */
  name: string;
  /**
   * The arriving player's own carry-over — the hero they are bringing.
   *
   * Opaque here for the reason `SessionParams.loadout` is: the wire moves it,
   * the engine reads it. Null asks for the authored fresh start, which is what
   * a brand-new character joining a friend's game gets.
   *
   * IT IS A REQUEST, NOT A GRANT. The host builds the hero from it, so a
   * stranger's loadout is a stranger's claim about their own character and PR
   * 5's hardening is where it stops being taken at face value. What it can
   * never do is name a SEAT: the seat is the server's answer and travels back
   * in the `welcome`.
   */
  loadout?: unknown | null;
  /**
   * The arriving character is HARDCORE. Compared against the session's
   * own mode at admission — a mismatch either way is refused by name
   * (`hardcore-mismatch`), because the two modes may never share a game. A
   * claim like the loadout beside it (the listen-server trust model applies), but the
   * honest client sends it and the promise it buys — a hardcore hero never
   * lands under softcore rules — is one the hardcore player wants kept.
   * Absent means softcore.
   */
  hardcore?: boolean;
  /**
   * THE TICKET FROM AN EARLIER `welcome`, when this is a RECONNECT.
   *
   * A ticket the session still holds resumes that seat's hero exactly as the
   * connection left it — every point of xp, every item, every level — and the
   * `loadout` above is IGNORED, which is the point: the authoritative hero is
   * the one standing on the field, and dressing it in a claim that arrived from
   * a stranger would hand a reconnect the one thing a fresh join is checked
   * for. A ticket the session does not hold (the window lapsed, a different
   * session, a guess) is simply not one, and the join proceeds as an ordinary
   * arrival rather than being refused: somebody who took too long to come back
   * should get into the game, not be told no.
   */
  resume?: string;
};

/** One line in the session's chat log. */
export type ChatLine = {
  /** The slot that said it, or -1 for the session itself. */
  slot: number;
  /** The speaker's display name, already resolved — a client that joined after
   * the line was said has no other way to know who slot 3 was. */
  name: string;
  text: string;
  kind: "say" | "emote" | "system";
};

/** A `chat` frame. Client → server carries `text` alone; server → client
 * carries `lines`. Both directions in one shape so the frame tag stays one
 * tag — the alternative is two, and two tags for one conversation is how a
 * decoder ends up with a branch nobody tests. */
export type ChatPayload = {
  text?: string;
  lines?: ChatLine[];
};

/** One seat, as everybody else may see it. Public by construction: it carries
 * no bag, no purse and no build — the private tier never leaves its owner. */
export type RosterEntry = {
  slot: number;
  name: string;
  /** False for a spectator, who watches without a seated hero. */
  playing: boolean;
  /** The seat this client's hero sits in, or null for a spectator. The engine's
   * `Player` carries no name, so this pairing is the ONE place a party frame or
   * a trade window can put a name to a hero. */
  seat: number | null;
  /** Round trip in ms as the server last measured it, or -1 for the host's own
   * renderer, which has no wire to measure. */
  ping: number;
  /** State bytes per second the server is sending this client, over the last
   * measured second. The net graph's per-seat figure; 0 until a window has
   * completed. */
  rate: number;
};

/** A `roster` frame. */
export type RosterPayload = {
  entries: RosterEntry[];
};

/**
 * One sampled input frame. Structurally `GameInput` plus the sequence that
 * makes it replayable.
 *
 * `seq` increases by one per input frame, on the input frames' OWN counter
 * (commands and chat number their headers separately). The server folds the
 * input latest-wins exactly as before, but tracks the highest `seq` it has
 * applied per client and echoes that number in the `ack` field of every state
 * frame it sends back (see `FrameHeader.ack`) — which is what lets the
 * client's movement prediction drop the inputs a snapshot already covers and
 * replay only the rest.
 *
 * The client sends INPUT, never positions. A client that sends positions is a
 * client that can teleport, and the server's trust rules would have nothing to check.
 */
export type InputPayload = {
  seq: number;
  input: Record<string, unknown>;
};

/**
 * What a command argument may be — scalars, and only scalars.
 *
 * That is the point rather than a limitation. A verb whose payload is a
 * STRUCTURE is a verb whose payload a stranger gets to shape, and the thing
 * this channel exists to prevent is a client handing the host something the
 * host then walks. Everything the app actually has to say — an inventory
 * index, a slot name, a stat, a quest id, a speed rung — is already a scalar,
 * and the one thing that was not (the AUTO PILOT's build baseline) was moved
 * onto the run instead, where it belonged anyway.
 */
export type CommandArgValue = number | string | boolean;

/** One command frame's payload. The arity and the type of each argument are
 * declared by the ENGINE beside the verb (`RUN_COMMAND_ARGS`) and checked
 * there before anything is dispatched — this leaf carries them, it does not
 * judge them. */
export type CommandPayload = {
  name: CommandName;
  args?: CommandArgValue[];
};

/**
 * Compare two handshakes, host first. Returns null when the join may proceed,
 * or the reason it may not.
 *
 * Order matters and is deliberate: protocol before build before mods, i.e.
 * most fundamental first, so the message a player is shown names the thing
 * they actually have to fix rather than a symptom of it.
 */
export function refuseHandshake(
  host: Handshake,
  joiner: Handshake,
): RefusalReason | null {
  if (host.protocol !== joiner.protocol) return "protocol-mismatch";
  if (host.build !== joiner.build) return "build-mismatch";
  if (host.mods.length !== joiner.mods.length) return "mod-mismatch";
  for (let i = 0; i < host.mods.length; i++) {
    if (host.mods[i] !== joiner.mods[i]) return "mod-mismatch";
  }
  return null;
}
