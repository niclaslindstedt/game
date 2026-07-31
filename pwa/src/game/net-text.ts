// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A SESSION'S ANSWERS SAY ON SCREEN — one leaf, read by the JOIN screens
// and by the run they lead into.
//
// The wording itself is the WIRE's (`REFUSAL_TEXT` in
// `server/wire/protocol.ts`), because both ends need it and a refusal worded
// twice is two copies free to disagree about what "build-mismatch" means. What
// this module adds is the half a reason code cannot carry: the DETAIL the host
// volunteered — the two protocol numbers, the two builds, the mod list — which
// is the difference between a message a player can act on and one they can only
// report.
//
// **IT IMPORTS THE WIRE AND NOTHING ELSE, ON PURPOSE.** The JOIN screens are
// title-menu screens, i.e. the app's startup path, where reaching
// `pwa/src/game/net/` (and through it `@game/core`) would drag the whole
// simulation into every player's first download. `@game/wire/*` is import-free
// and costs a few hundred bytes.

import {
  PROTOCOL_VERSION,
  REFUSAL_TEXT,
  refuseHandshake,
  type Handshake,
  type RefusalReason,
} from "@game/wire/protocol.ts";

/** The reasons a session can end that are not refusals — the other half of
 * `ByePayload["reason"]`, worded here for the same reason the refusals are. */
const ENDED_TEXT: Record<string, string> = {
  "host-left": "THE HOST LEFT THE GAME",
  shutdown: "THE SESSION ENDED",
  kicked: "YOU WERE REMOVED FROM THE SESSION",
  error: "THE SESSION HIT AN ERROR",
  "bad-address": "THAT IS NOT AN ADDRESS",
  "no-reply": "THE GAME DID NOT ANSWER",
};

/**
 * One line for the player, in the pixel font's own uppercase.
 *
 * The DETAIL is appended rather than replacing the reason, so the sentence
 * always names both the WHAT and the numbers: "ONE OF YOU NEEDS TO UPDATE - THE
 * BUILDS DISAGREE - BUILD 1.4.2 HERE, 1.5.0 THERE".
 */
export function joinRefusalText(reason: string, detail?: string): string {
  const head =
    REFUSAL_TEXT[reason as RefusalReason] ??
    ENDED_TEXT[reason] ??
    reason.toUpperCase();
  const tail = detail?.trim();
  return tail ? `${head} - ${tail.toUpperCase()}` : head;
}

/**
 * Why this build could not join that browser row — or null when it can.
 *
 * **A ROW THIS BUILD CANNOT JOIN IS SHOWN, NOT HIDDEN.** A player whose friend
 * is on a newer build and whose list is simply empty concludes the feature is
 * broken; one who sees the session greyed with "ONE OF YOU NEEDS TO UPDATE -
 * HOST BUILD 1.5.0" goes and updates. So this is the LABEL's answer, never a
 * filter over the list.
 *
 * It is judged with `refuseHandshake` — the very function the host's own
 * `admit` runs — over what the lobby ADVERTISED. That is a claim rather than a
 * fact, which is fine for a label: the handshake is what settles it, and this
 * only has to save the player a round trip they were going to lose anyway.
 */
export function sessionRowRefusal(
  row: { protocol: number; build: string; mods: string[] },
  mine: Handshake,
): string | null {
  const host: Handshake = {
    protocol: row.protocol || 0,
    build: row.build,
    mods: row.mods,
  };
  const reason = refuseHandshake(host, mine);
  if (!reason) return null;
  return joinRefusalText(reason, hostSide(reason, host));
}

/** The half only the host can supply — the numbers the player is being asked to
 * reconcile, in the same terms the wire's own refusals use. */
function hostSide(reason: RefusalReason, host: Handshake): string | undefined {
  if (reason === "protocol-mismatch") return `HOST PROTOCOL ${host.protocol}`;
  if (reason === "build-mismatch") return `HOST BUILD ${host.build}`;
  if (reason === "mod-mismatch") {
    return host.mods.length ? host.mods.join(", ") : "THE HOST HAS NO MODS ON";
  }
  return undefined;
}

/** This build's own handshake, as a browser row is compared against. */
export function myHandshake(build: string, mods: string[]): Handshake {
  return { protocol: PROTOCOL_VERSION, build, mods };
}
