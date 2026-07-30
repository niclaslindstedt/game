// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIRE'S VOCABULARY — every message that crosses between a session server
// and a client, and the one integer that says whether the two are speaking the
// same language.
//
// This module is deliberately a LEAF: types, constants and narrow guards, no
// engine import at all. Both ends of the wire read it — the server inside its
// utility process and the page inside the renderer — and the page reaches it
// from a screen that may sit on the app's STARTUP path, where the 170 KB
// critical-path budget forbids anything that drags `@game/core` behind it.
// A `type` import of `GameInput` would be free, but a value import would not,
// and the distinction is too easy to lose; so nothing here knows the engine
// exists and the shapes that must name engine types do so structurally.
//
// PROTOCOL_VERSION is bumped on EVERY change to a message shape, including one
// that looks backward compatible. Version skew is the failure mode that reaches
// a player as "random crashes", and the only cheap defence is a handshake that
// refuses a mismatch by name rather than a decoder that limps along.

/**
 * The wire's own version. Bump on any change to a message shape, a field's
 * meaning, or the snapshot split. A mismatch is refused at the handshake with
 * BOTH numbers named — a refusal a player can act on beats a desync they
 * cannot.
 */
export const PROTOCOL_VERSION = 1;

/**
 * How often the server publishes a snapshot, in simulation ticks. The
 * simulation runs at 60 Hz; publishing every third tick is 20 Hz, the low end
 * of the plan's 20–30 Hz band and the one that leaves the most headroom for
 * eight recipients on a mid-range machine.
 *
 * It divides 60 exactly, which matters: a non-integer publish period would put
 * a variable number of ticks between snapshots and give the client's
 * interpolation buffer a moving target to smooth over.
 */
export const SNAPSHOT_EVERY_TICKS = 3;

/** The simulation's fixed timestep, in ms. The same 1000/60 the browser loop
 * has always used — see `pwa/src/lib/game-loop.ts`. The server owns the clock
 * now, but the SLICE is unchanged, because changing it would change the
 * physics. */
export const TICK_MS = 1000 / 60;

// ---------------------------------------------------------------------------
// Session parameters — the STATIC half of the replication split
// ---------------------------------------------------------------------------

/**
 * Everything a client needs to rebuild the level for itself.
 *
 * This is the whole of the plan's STATIC tier: the level is a deterministic
 * function of these arguments, so the obstacles, the decor, the canopy, the
 * ground layer, the spawner layout and the carved geometry are all built by
 * the client's own `createGame` call and NEVER travel. On a measured `moon`
 * run that is ~100 KB the wire does not carry, once per level, per client.
 *
 * The claim it rests on — that the same arguments build the same world in two
 * processes — is a determinism claim about the same build, and it is TESTED
 * rather than believed (`tests/engine/net_determinism_test.ts`).
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
  /** A LEVEL TOKEN respec is owed at the run's start. */
  respec: boolean;
  /** Level ids the hero has already cleared on this difficulty. */
  clearedLevels: string[];
  /** The hero has already met this level's merchant on this difficulty. */
  merchantDiscovered: boolean;
  /** GENERATED MAPS: the carve is on, and at which size. Both are engine
   * FLAGS rather than `createGame` arguments, so they travel separately and
   * the client applies them before it builds. */
  generatedMaps: boolean;
  generatedMapSize: string;
};

/**
 * What the two ends compare before a single game byte is exchanged.
 *
 * `build` is the engine version rather than a git hash because that is what
 * both ends can honestly know about themselves; PR 2 replaces it with a real
 * build hash once the client is a different machine and a different download.
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
  | "no-session";

// ---------------------------------------------------------------------------
// The frames themselves
// ---------------------------------------------------------------------------

/** The one-byte tag at the head of every frame. Kept as an enum of small
 * integers rather than strings because it is read on the hot path, once per
 * frame per client. */
export const FRAME = {
  /** server → client, once: the session parameters and the handshake. */
  welcome: 1,
  /** server → client: a complete snapshot, no baseline required. */
  snapshot: 2,
  /** server → client: a snapshot coded against the client's last ACKED one. */
  delta: 3,
  /** client → server: one sampled input frame. */
  input: 4,
  /** client → server: "I have applied everything up to this sequence." */
  ack: 5,
  /** server → client: the session is over, with a reason. */
  bye: 6,
  /** client → server: one named command (see `CommandPayload`). */
  command: 7,
} as const;

export type FrameType = (typeof FRAME)[keyof typeof FRAME];

/** A frame's fixed header. Every frame carries all four fields even when one
 * is meaningless for its type — a fixed-size header is what lets the decoder
 * validate a length before it reads anything, which §5.2 of the plan makes
 * non-negotiable once the socket is open to the internet. */
export type FrameHeader = {
  type: FrameType;
  /** The server's snapshot sequence this frame belongs to (0 on client→server
   * frames other than `ack`). */
  seq: number;
  /** The last sequence the SENDER has applied from the other side. A delta is
   * always coded against the receiver's acked snapshot, never against the
   * sender's latest — that is what makes a lost packet cost one frame of
   * smoothness instead of a desync. */
  ack: number;
  /** The simulation tick the frame was produced on. */
  tick: number;
};

/** The payload of a `welcome`. */
export type WelcomePayload = {
  handshake: Handshake;
  params: SessionParams;
  /** Which player slot this client is seated in. 0 for the host in PR 1; the
   * party arrives in PR 3. */
  slot: number;
  /**
   * Whether this client STEERS the hero, or only watches him.
   *
   * Stated outright rather than inferred from `slot === 0`, and the difference
   * is not cosmetic: the first spectator to connect is also seated at slot 0
   * (there is nobody else), so inferring it silently handed a watcher the
   * hero's whole private bag to draw. Two facts, two fields.
   */
  ownsPlayer: boolean;
};

/** The payload of a `bye`. */
export type ByePayload = {
  reason: RefusalReason | "host-left" | "shutdown" | "error";
  detail?: string;
};

/**
 * One sampled input frame. Structurally `GameInput` plus the two fields that
 * make it replayable: the sequence the client will reconcile against, and the
 * tick it was sampled on.
 *
 * The client sends INPUT, never positions. A client that sends positions is a
 * client that can teleport, and PR 5's trust rules would have nothing to check.
 */
export type InputPayload = {
  seq: number;
  input: Record<string, unknown>;
};

/**
 * THE COMMANDS A CLIENT MAY RUN, and the list is the whole security model.
 *
 * Steering is one thing and the app's other engine calls are another: the run
 * loop also *acts* on the state directly — it turns a page of the opening
 * monologue, skips a cutscene, ends the death tableau. Those used to be plain
 * function calls on a local `GameState`, and once the state lives in another
 * process they have to travel.
 *
 * They travel as NAMES FROM A CLOSED LIST, never as anything the server
 * resolves dynamically. A command channel that took a function name and looked
 * it up would hand a client the whole engine surface — `grantXp`, `mintUnique`,
 * `killEnemy` — the day PR 2 opens a UDP port, and no amount of later
 * validation would put that back in the box.
 *
 * PR 1 ships exactly the scene-advance verbs a single-player run needs to get
 * from the prelude to the field and out the other side. The inventory, the
 * shop, the level-up chooser and the talent picker join them in PR 3, when
 * they stop freezing the world for everybody.
 */
export const COMMANDS = [
  "advanceIntro",
  "skipIntro",
  "dismissIntro",
  "advanceOutro",
  "skipOutro",
  "skipCutscene",
  "tapCutscene",
  "skipStoryOpening",
  "skipDeathScene",
] as const;

export type CommandName = (typeof COMMANDS)[number];

/** One command frame's payload. */
export type CommandPayload = {
  name: CommandName;
};

/** True when `value` looks like a frame header this build can act on. Used at
 * the decoder's mouth, where the bytes may have come from anywhere. */
export function isFrameType(value: number): value is FrameType {
  return (
    value === FRAME.welcome ||
    value === FRAME.snapshot ||
    value === FRAME.delta ||
    value === FRAME.input ||
    value === FRAME.ack ||
    value === FRAME.bye ||
    value === FRAME.command
  );
}

/** True when `value` names a command this build will run. The allow-list IS
 * the security boundary — see `COMMANDS`. */
export function isCommand(value: unknown): value is CommandName {
  return (
    typeof value === "string" && (COMMANDS as readonly string[]).includes(value)
  );
}

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
