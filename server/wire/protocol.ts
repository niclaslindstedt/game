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
export const PROTOCOL_VERSION = 6;

/**
 * The most clients one session seats, host included.
 *
 * Eight, matching Diablo 2 and the `/players` scale it is measured against
 * (decision 1 in the plan's register). It is a HARD cap rather than a
 * preference: it bounds the host's memory, the per-tick publish cost and — the
 * reason it lives in the wire rather than in the shell — how many peers an open
 * UDP socket may hold half-open at once.
 */
export const MAX_CLIENTS = 8;

/**
 * The smallest a connectionless `hello` may be, in whole bytes.
 *
 * THIS IS THE ANTI-REFLECTION RULE, and it is the reason the number exists at
 * all. An open UDP port answers strangers, and a stranger who spoofs a victim's
 * source address turns every host into an amplifier — so §5.2's rule is that a
 * connectionless request must never be answered with more bytes than it
 * contained. The `challenge` reply is ~80 bytes; padding the request past that
 * makes the amplification factor less than one, which is what makes the whole
 * mechanism safe rather than merely authenticated. Quake and Source pad their
 * connectionless requests for exactly this reason.
 */
export const HELLO_MIN_BYTES = 128;

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
 * Everything a client needs to rebuild the RUN for itself.
 *
 * This is the whole of the plan's STATIC tier: the level is a deterministic
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
  | "no-session"
  | "bad-password"
  | "bad-challenge"
  | "rate-limited";

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
};

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
  /**
   * client → server, CONNECTIONLESS: "are you there, and what must I prove?"
   *
   * The first packet a stranger sends, and the only one answered before
   * anything is known about them. It must be at least `HELLO_MIN_BYTES` long —
   * see that constant for why the padding is the security property.
   */
  hello: 8,
  /** server → client, CONNECTIONLESS: a cookie to echo, and what else is
   * needed. Deliberately tiny; see `HELLO_MIN_BYTES`. */
  challenge: 9,
  /** client → server: the cookie echoed, the handshake, and the password
   * proof. The first frame that may reach a session. */
  join: 10,
  /** both ways: one line of chat, or the session's answer to a slash command. */
  chat: 11,
  /** server → client: who is in the session, and what they are doing. */
  roster: 12,
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
  /** False for a spectator. PR 3 seats a second hero; until then exactly one
   * entry is ever true. */
  playing: boolean;
  /** Round trip in ms as the server last measured it, or -1 for the host's own
   * renderer, which has no wire to measure. */
  ping: number;
};

/** A `roster` frame. */
export type RosterPayload = {
  entries: RosterEntry[];
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
 * PR 1 shipped exactly the scene-advance verbs a single-player run needs to get
 * from the prelude to the field and out the other side. **PR 1.5 added the
 * rest** — the screens, the bag, the counter, the build, the party, the errands,
 * the vault and the ride — because the run loop cannot move into the server
 * until every verb it calls can travel. (The plan first gave that work to PR 3,
 * which was a circular dependency: PR 3's prediction assumes the run already
 * goes through the server.)
 *
 * The two halves are separate jobs on the same names: **PR 1.5 makes them
 * TRAVEL** with today's blocking semantics exactly preserved, and **PR 3 makes
 * them NON-BLOCKING** per player. Anyone widening this list for the first
 * reason must not quietly do the second at the same time — a command that
 * stopped freezing the world would change how single-player feels, which is the
 * one thing the cutover may not do.
 *
 * **THIS IS A COPY, AND THE COPY IS DELIBERATE.** What each verb DOES lives in
 * the engine (`src/game/commands.ts`), which this leaf may not import: the page
 * reads this module from screens on the app's startup path, where the 170 KB
 * critical-path budget forbids reaching `@game/core`. So the names are
 * snapshotted here for the allow-list and `tests/engine/run_commands_test.ts`
 * fails the build when the two lists disagree — the same shape `mod/catalog.json`
 * and the Game Center manifests already use. Never re-derive the list at
 * runtime; that import IS the budget bug.
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
  "skipBossDeath",
  "advanceDialogue",
  "muteDialogue",
  "unmuteDialogue",
  "openInventory",
  "closeInventory",
  "openShop",
  "closeShop",
  "openMap",
  "closeMap",
  "openQuestLog",
  "closeQuestLog",
  "openCompanionPanel",
  "closeCompanionPanel",
  "promptPendingPoints",
  "pauseGame",
  "resumeGame",
  "stayOnField",
  "reopenVictoryChoice",
  "equipFromInventory",
  "equipFromInventoryInto",
  "unequipToInventory",
  "moveInventoryItem",
  "discardFromInventory",
  "discardEquipped",
  "spendGateKey",
  "spendReviveItem",
  "autoEquipBest",
  "scrapInferiorLoot",
  "discardHeldAbility",
  "buyStock",
  "sellItem",
  "repairGear",
  "buyQuestPiece",
  "sellQuestPiece",
  "allocateStat",
  "deallocateStat",
  "spendTalentPoint",
  "beginRespec",
  "confirmRespec",
  "spendCleanSlate",
  "equipCompanionFromInventory",
  "unequipCompanionToInventory",
  "healCompanionWithMedkit",
  "resolveChoice",
  "talkToQuestGiver",
  "pickQuestTopic",
  "acceptQuest",
  "declineQuest",
  "turnInQuest",
  "advanceQuestDialogue",
  "closeQuestDialogue",
  "talkToEnemy",
  "advanceTalk",
  "pickTalkChoice",
  "closeTalk",
  "reclaimVaultItem",
  "clearVault",
  "startAutopilot",
  "stopAutopilot",
  "setAutopilotSpeed",
  "creditAutopilotPurse",
  "refundAutopilotBuild",
] as const;

export type CommandName = (typeof COMMANDS)[number];

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
    value === FRAME.command ||
    value === FRAME.hello ||
    value === FRAME.challenge ||
    value === FRAME.join ||
    value === FRAME.chat ||
    value === FRAME.roster
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
