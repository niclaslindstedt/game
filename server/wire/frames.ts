// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIRE'S FRAME VOCABULARY — the frame tags, the command allow-list and the
// transport constants both ends of the wire read while a session is LIVE.
//
// Split out of `./protocol.ts`, and the split is a chunk-placement fact rather
// than a taxonomy: the title menu's screens read the handshake half of the
// wire (PROTOCOL_VERSION, REFUSAL_TEXT, `refuseHandshake`) to word a refusal,
// which puts THAT module on the app's startup path, where the 200 KB
// critical-path budget is measured — and tree-shaking is global, so every
// export a lazy chunk used stayed in the eager chunk with it. Everything here
// is read only by the session server and the run's lazily loaded net client,
// so it lives in its own leaf and the entry pays nothing for it.
//
// **NO value re-export may connect the two files, in either direction** — a
// re-export puts these bytes straight back on the startup path. Like
// `protocol.ts` this module is deliberately a LEAF: constants and narrow
// guards, no engine import at all.

/**
 * The most clients one session seats, host included.
 *
 * Eight, matching Diablo 2 and the `/players` scale it is measured against. It
 * is a HARD cap rather than a preference: it bounds the host's memory, the
 * per-tick publish cost and — the reason it lives in the wire rather than in
 * the shell — how many peers an open UDP socket may hold half-open at once.
 */
export const MAX_CLIENTS = 8;

/**
 * The smallest a connectionless `hello` may be, in whole bytes.
 *
 * THIS IS THE ANTI-REFLECTION RULE, and it is the reason the number exists at
 * all. An open UDP port answers strangers, and a stranger who spoofs a
 * victim's source address turns every host into an amplifier — so the rule is
 * that a connectionless request must never be answered with more bytes than it
 * contained. The `challenge` reply is ~80 bytes; padding the request past that
 * makes the amplification factor less than one, which is what makes the whole
 * mechanism safe rather than merely authenticated. Quake and Source pad their
 * connectionless requests for exactly this reason.
 */
export const HELLO_MIN_BYTES = 128;

/**
 * How often the server publishes a snapshot, in simulation ticks. The
 * simulation runs at 60 Hz; publishing every third tick is 20 Hz, the low end
 * of the 20–30 Hz band and the one that leaves the most headroom for eight
 * recipients on a mid-range machine.
 *
 * It divides 60 exactly, which matters: a non-integer publish period would put
 * a variable number of ticks between snapshots and give the client's
 * interpolation buffer a moving target to smooth over.
 */
export const SNAPSHOT_EVERY_TICKS = 3;

/**
 * How long a dropped player's seat is kept for them, in ms.
 *
 * Thirty seconds is a judgement between two costs that pull opposite ways. Too
 * short and a wifi hiccup — the whole case this exists for — costs somebody the
 * run they were an hour into. Too long and a party that genuinely lost a player
 * plays a member down with a body standing in the field, unable to admit the
 * friend they invited to take the empty chair, because the seat is being kept
 * for somebody who is not coming back. Thirty is comfortably past a router
 * reboot and comfortably inside a fight.
 *
 * It is measured by the SESSION, which is the only part of this feature with a
 * clock; the engine only honours the flag (`Player.held`).
 */
export const RECONNECT_GRACE_MS = 30_000;

/** The simulation's fixed timestep, in ms. The same 1000/60 the browser loop
 * has always used — see `pwa/src/lib/game-loop.ts`. The server owns the clock
 * now, but the SLICE is unchanged, because changing it would change the
 * physics. */
export const TICK_MS = 1000 / 60;

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
 * `killEnemy` — the day a UDP port opens, and no amount of later validation
 * would put that back in the box.
 *
 * The verbs cover everything the run loop calls between the prelude and the
 * field's far side: the scene advances, the screens, the bag, the counter, the
 * build, the party, the errands, the vault and the ride. A screen verb moves
 * the acting hero's own `Player.screen`, and the world halts only when every
 * hero in play has one up (solo: exactly the old freeze).
 *
 * **THIS IS A COPY, AND THE COPY IS DELIBERATE.** What each verb DOES lives in
 * the engine (`src/game/commands.ts`), which this leaf may not import: the
 * wire's modules are readable from the page, where the 200 KB critical-path
 * budget forbids reaching `@game/core`. So the names are snapshotted here for
 * the allow-list and `tests/engine/run_commands_test.ts` fails the build when
 * the two lists disagree — the same shape `mod/catalog.json` and the Game
 * Center manifests already use. Never re-derive the list at runtime; that
 * import IS the budget bug.
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
  "closeLevelup",
  "pauseGame",
  "resumeGame",
  "stayOnField",
  "reopenVictoryChoice",
  "respawn",
  "equipFromInventory",
  "swapHand",
  "sortInventory",
  "equipFromInventoryInto",
  "unequipToInventory",
  "moveInventoryItem",
  "discardFromInventory",
  "discardEquipped",
  "spendGateKey",
  "spendReviveItem",
  "spendLookupTicket",
  "autoEquipBest",
  "autoEquipGear",
  "scrapInferiorLoot",
  "bankSpareItem",
  "discardHeldAbility",
  "buyStock",
  "sellItem",
  "buybackItem",
  "repairGear",
  "identifyItem",
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
  "chooseQuestReward",
  "acceptQuest",
  "declineQuest",
  "turnInQuest",
  "advanceQuestDialogue",
  "closeQuestDialogue",
  "talkToEnemy",
  "advanceTalk",
  "pickTalkChoice",
  "closeTalk",
  "requestTrade",
  "acceptTradeRequest",
  "declineTradeRequest",
  "cancelTrade",
  "offerTradeItem",
  "clearTradeOffer",
  "offerTradeCoins",
  "acceptTrade",
  "reclaimVaultItem",
  "clearVault",
  "enterCar",
  "exitCar",
  "tapTravelDoor",
  "travelTo",
  "startAutopilot",
  "stopAutopilot",
  "setAutopilotSpeed",
  "creditAutopilotPurse",
  "refundAutopilotBuild",
] as const;

export type CommandName = (typeof COMMANDS)[number];

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
