// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE — the player's heroes and their PAID coins, carried between their
// own devices by the platform's cloud (iCloud on iOS today; Google Play Games
// Saved Games is the planned Android drop-in behind the very same bridge).
//
// NATIVE APP ONLY. The browser/PWA has no platform cloud to talk to, so
// `cloudBridgeAvailable()` reads false there and every entry point below is a
// no-op — the website keeps saving to localStorage exactly as before.
//
// Why it exists: coin packs are bought with real money. A purchase that lived
// only in one phone's localStorage would be gone with the phone, and invisible
// on the player's iPad. So the money — and the heroes it funds — belong to the
// player's ACCOUNT, not to a device.
//
// The whole design is one idea: NEVER RESOLVE A CONFLICT WITH A COIN AT STAKE.
// The payload is built so a merge is always mechanical, never a judgement call:
//
//   coins    grow-only per-device counters (store.ts `CoinLedger`) — the bank
//            is DERIVED (Σ credited − Σ sent), so merging is a per-device max
//            and a purchase made on either phone is banked on both. Nothing to
//            pick, nothing to lose, and re-running it changes nothing.
//   heroes   last-writer-wins per hero, on the `updatedAt` stamp
//            `saveCharacters` puts on the heroes a save actually changed. Two
//            devices playing DIFFERENT heroes therefore both keep their work;
//            the same hero played on both keeps the more recently played
//            version (the same rule every other cross-device RPG uses).
//   deleted  tombstones, so a deletion is a fact that travels — otherwise the
//            cloud's copy would walk back in on the next merge.
//   scores   a union: the hardcore board is finished history, never edited.
//   drive    the same, for the minigame's arcade board (drive-scores.ts) — a
//            banked leg is a finished trip and a union is the whole merge.
//
// ADDING A FIELD DOES NOT BUMP `CLOUD_VERSION`, and `driveScores` is the worked
// example: an older build reads the payload, ignores the key it does not know
// and keeps syncing everything it does. Bumping would make that build see a
// FUTURE save and stop syncing altogether — losing a hero's progress to protect
// a scoreboard. A missing key defaults to an empty board on the way in.
//
// What is NOT synced, on purpose: settings, key bindings, the active-character
// selection, and the parked run. Those are device-shaped — a phone's touch
// controls have no business overwriting an iPad's, and a run parked mid-level
// on one device can't be resumed on another anyway.

import { canonicalJson } from "@ui/lib/canonical-json.ts";
import { getDeviceId } from "@ui/lib/device-id.ts";

import {
  cloudBridgeAvailable,
  fetchCloudStatus,
  initCloudBridge,
  loadFromCloud,
  saveToCloud,
  type CloudPlayer,
  type CloudProviderId,
} from "../app/cloud-bridge.ts";
import { storageKey } from "../identity.ts";

import {
  characterTombstones,
  getActiveCharacterId,
  loadCharacters,
  replaceRoster,
  setActiveCharacterId,
  setCharacterTombstones,
  trimTombstones,
  type Character,
} from "./characters.ts";
import {
  campaignScoreKey,
  campaignScoresSnapshot,
  mergeCampaignScores,
  trimCampaignScores,
  type CampaignScore,
} from "./highscores.ts";
import {
  driveScoreKey,
  driveScoresSnapshot,
  mergeDriveScores,
  trimDriveScores,
  type DriveScoreEntry,
} from "./drive-scores.ts";
import {
  flightScoreKey,
  flightScoresSnapshot,
  mergeFlightScores,
  trimFlightScores,
  type FlightScoreEntry,
} from "./rocket-scores.ts";
import {
  coinLedger,
  mergeCoinLedgers,
  normalizeLedger,
  setCoinLedger,
  type CoinLedger,
} from "./store.ts";

/** Archive format id + version, stamped into every payload so a future format
 * change is detected rather than mis-merged. A payload from an UNKNOWN format
 * or a NEWER version is left strictly alone — the older build neither merges
 * nor overwrites it, so an upgrade in progress across two devices can't have
 * the laggard flatten the leader's save. */
export const CLOUD_FORMAT = "adas-trail/cloud-save";
export const CLOUD_VERSION = 1;

/** iCloud's key-value store caps a value at 1 MB. Measured in JS characters,
 * which for this near-ASCII payload undercounts only the odd non-Latin hero
 * name — the native side does the exact byte check (native/src/cloud-save.ts)
 * and this is the friendly early exit. A roster that big is a hundred heroes:
 * a backstop, not a budget. */
const MAX_PAYLOAD_CHARS = 900_000;

/** How long to wait for the dust to settle before pushing after a local
 * change, so a burst (buy, distribute, bank a victory) is one write. */
const PUSH_DEBOUNCE_MS = 2_000;

/** This device's row id inside the coin ledger — also stamped on a payload so
 * a human reading the cloud can tell which device wrote it. */
const DEVICE_KEY = storageKey("device-id");
/** When this device last completed a sync (ms) — the status line survives a
 * relaunch. */
const SYNCED_AT_KEY = storageKey("cloud-synced-at");

/** Everything the cloud holds for this player. */
export type CloudSave = {
  format: string;
  version: number;
  /** When this payload was written (ms) — provenance for a human, never a
   * merge input: every field below merges on its own terms. */
  writtenAt: number;
  /** The device that wrote it (provenance). */
  writtenBy: string;
  characters: Character[];
  /** Deleted hero ids → when (ms). */
  tombstones: Record<string, number>;
  coins: CoinLedger;
  /** Banked hardcore campaigns, keyed by difficulty. */
  scores: Record<string, CampaignScore[]>;
  /** The DRIVE minigame's arcade board — one list, best first. */
  driveScores: DriveScoreEntry[];
  /** …and the ROCKET's, same shape rules (rocket-scores.ts). */
  rocketScores: FlightScoreEntry[];
};

/** Where the sync stands, for the SETTINGS → DATA status line. */
export type CloudPhase = "off" | "idle" | "syncing" | "error";

export type CloudState = {
  phase: CloudPhase;
  /** A cloud is reachable and writable (the player is signed into iCloud). */
  available: boolean;
  provider?: CloudProviderId;
  /** The signed-in Game Center / Play Games player, when the platform says. */
  player?: CloudPlayer;
  /** Last successful sync (ms), or null if this device has never synced. */
  lastSyncAt: number | null;
  /** Player-facing failure text, set only in the `error` phase. */
  error?: string;
};

export type CloudSyncResult =
  | { ok: true; pushed: boolean; pulled: boolean }
  | { ok: false; reason: "unavailable" | "read" | "write" | "too-large" };

// ---- Observable state ---------------------------------------------------------

function storedSyncedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(SYNCED_AT_KEY);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

let state: CloudState = {
  phase: "off",
  available: false,
  lastSyncAt: storedSyncedAt(),
};
const listeners = new Set<(state: CloudState) => void>();

/** The current sync state (the DATA menu's status row reads this). */
export function cloudState(): CloudState {
  return state;
}

/** Watch the sync state; returns an unsubscribe. */
export function subscribeCloud(
  listener: (state: CloudState) => void,
): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function setState(patch: Partial<CloudState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

// The roster/bank changed underneath the UI because a merge landed — the title
// screen re-reads its lists when this fires.
const dataListeners = new Set<() => void>();

/** Watch for a merge that changed local data (roster, bank, board). */
export function subscribeCloudData(listener: () => void): () => void {
  dataListeners.add(listener);
  return () => void dataListeners.delete(listener);
}

// ---- Payload ------------------------------------------------------------------

/** This device's data, as a payload. */
export function localSnapshot(): CloudSave {
  return {
    format: CLOUD_FORMAT,
    version: CLOUD_VERSION,
    writtenAt: Date.now(),
    writtenBy: getDeviceId(DEVICE_KEY),
    characters: loadCharacters(),
    tombstones: characterTombstones(),
    coins: coinLedger(),
    scores: campaignScoresSnapshot(),
    driveScores: driveScoresSnapshot(),
    rocketScores: flightScoresSnapshot(),
  };
}

/**
 * Parse a blob read from the cloud. Returns null for "nothing usable there" —
 * no save yet, corrupt JSON, a foreign format, or a payload from a NEWER
 * format version than this build understands. A null makes the caller push its
 * own state without merging, so an unreadable cloud can never delete a hero;
 * the newer-version case additionally refuses to PUSH (see `syncNow`).
 */
export function parseCloudSave(raw: string | null): CloudSave | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const save = parsed as Partial<CloudSave>;
  if (save.format !== CLOUD_FORMAT) return null;
  if (typeof save.version !== "number" || save.version > CLOUD_VERSION) {
    return null;
  }
  const characters = Array.isArray(save.characters)
    ? (save.characters.filter(
        (c) =>
          c && typeof c === "object" && typeof (c as Character).id === "string",
      ) as Character[])
    : [];
  const tombstones: Record<string, number> = {};
  for (const [id, at] of Object.entries(save.tombstones ?? {})) {
    if (typeof at === "number" && Number.isFinite(at)) tombstones[id] = at;
  }
  const scores: Record<string, CampaignScore[]> = {};
  for (const [difficulty, list] of Object.entries(save.scores ?? {})) {
    if (Array.isArray(list)) scores[difficulty] = list as CampaignScore[];
  }
  return {
    format: CLOUD_FORMAT,
    version: save.version,
    writtenAt: typeof save.writtenAt === "number" ? save.writtenAt : 0,
    writtenBy: typeof save.writtenBy === "string" ? save.writtenBy : "",
    characters,
    tombstones,
    coins: normalizeLedger(save.coins),
    scores,
    // Absent on a payload written before the board existed — an empty list,
    // never a refusal (see the format note at the top of this file).
    driveScores: Array.isArray(save.driveScores)
      ? trimDriveScores(save.driveScores)
      : [],
    rocketScores: Array.isArray(save.rocketScores)
      ? trimFlightScores(save.rocketScores)
      : [],
  };
}

/** True when the blob in the cloud is a save this build must NOT overwrite — a
 * newer format version, written by a device already upgraded. */
export function isFutureSave(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<CloudSave>;
    return (
      parsed?.format === CLOUD_FORMAT &&
      typeof parsed.version === "number" &&
      parsed.version > CLOUD_VERSION
    );
  } catch {
    return false;
  }
}

/** A hero's change stamp, defaulting to 0 for one saved before stamps existed
 * (it loses to any stamped copy — the stamped one is demonstrably newer). */
function stampOf(character: Character): number {
  return typeof character.updatedAt === "number" ? character.updatedAt : 0;
}

/**
 * Pick the surviving version of one hero held by both devices.
 *
 * ONE FIELD DOES NOT TAKE THE WINNER'S ANSWER: the AUTO PILOT mark
 * (`Character.autopiloted`) is unioned rather than replaced. Last-writer-wins is
 * right for progress — the device that played the hero most recently knows what
 * it did — and it would be a laundry service for a mark that is supposed to be
 * permanent: fly the hero on the phone, open the roster on the desktop, and the
 * desktop's later stamp restores a clean hero. Sticky is also what keeps
 * `mergeSaves` commutative and idempotent, since an OR does not care which side
 * it is given first.
 */
function newerCharacter(a: Character, b: Character): Character {
  const winner = pickNewer(a, b);
  return a.autopiloted === true || b.autopiloted === true
    ? { ...winner, autopiloted: true }
    : winner;
}

/** The last-writer-wins pick itself — everything but the sticky mark above. */
function pickNewer(a: Character, b: Character): Character {
  const byStamp = stampOf(a) - stampOf(b);
  if (byStamp !== 0) return byStamp > 0 ? a : b;
  // Same stamp (both unstamped, or a clock collision): keep the copy that has
  // actually seen more of the game rather than tossing a coin.
  const byProgress = a.clears.length - b.clears.length;
  if (byProgress !== 0) return byProgress > 0 ? a : b;
  return (a.loadout?.level ?? 0) >= (b.loadout?.level ?? 0) ? a : b;
}

/**
 * Merge two payloads into the state both devices should end up holding. Pure,
 * commutative, and idempotent — merging in either order, or twice, gives the
 * same answer, which is what lets a device apply the result locally AND push it
 * without a round of ping-pong.
 */
export function mergeSaves(local: CloudSave, remote: CloudSave): CloudSave {
  const union: Record<string, number> = { ...local.tombstones };
  for (const [id, at] of Object.entries(remote.tombstones)) {
    union[id] = Math.max(union[id] ?? 0, at);
  }
  // Capped exactly as the local store caps it, so what we push is what a
  // device would hold after applying it.
  const tombstones = trimTombstones(union);

  const byId = new Map<string, Character>();
  for (const character of [...local.characters, ...remote.characters]) {
    const held = byId.get(character.id);
    byId.set(character.id, held ? newerCharacter(held, character) : character);
  }
  // A deletion only wins over versions of the hero that predate it: a hero
  // deleted on the iPad but PLAYED on the phone afterwards is one the player
  // clearly still wants.
  // Sorted by (createdAt, id) rather than merge order, so both devices lay the
  // roster out identically — a payload that differs only in order would look
  // like a change to whichever device pulled it.
  const characters = [...byId.values()]
    .filter((c) => stampOf(c) >= (tombstones[c.id] ?? 0))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));

  const scores: Record<string, CampaignScore[]> = {};
  for (const difficulty of new Set([
    ...Object.keys(local.scores),
    ...Object.keys(remote.scores),
  ])) {
    const mine = local.scores[difficulty] ?? [];
    const seen = new Set(mine.map(campaignScoreKey));
    const fresh = (remote.scores[difficulty] ?? []).filter(
      (score) => !seen.has(campaignScoreKey(score)),
    );
    scores[difficulty] = trimCampaignScores([...mine, ...fresh]);
  }

  const mineDrive = local.driveScores;
  const seenDrive = new Set(mineDrive.map(driveScoreKey));
  const driveScores = trimDriveScores([
    ...mineDrive,
    ...remote.driveScores.filter((row) => !seenDrive.has(driveScoreKey(row))),
  ]);

  const mineFlight = local.rocketScores;
  const seenFlight = new Set(mineFlight.map(flightScoreKey));
  const rocketScores = trimFlightScores([
    ...mineFlight,
    ...remote.rocketScores.filter(
      (row) => !seenFlight.has(flightScoreKey(row)),
    ),
  ]);

  return {
    format: CLOUD_FORMAT,
    version: CLOUD_VERSION,
    writtenAt: Date.now(),
    writtenBy: getDeviceId(DEVICE_KEY),
    characters,
    tombstones,
    coins: mergeCoinLedgers(local.coins, remote.coins),
    scores,
    driveScores,
    rocketScores,
  };
}

/** The comparable content of a payload: provenance neutralized (an unchanged
 * sync mustn't look like a change worth writing) and CANONICAL (key order must
 * not either — otherwise two devices would each see the other's byte-identical
 * data as new and write it back at each other forever). */
function contentOf(save: CloudSave): string {
  return canonicalJson({ ...save, writtenAt: 0, writtenBy: "" });
}

/** Install a merged payload as this device's state. */
export function applySave(save: CloudSave): void {
  replaceRoster(save.characters);
  setCharacterTombstones(save.tombstones);
  setCoinLedger(save.coins);
  mergeCampaignScores(save.scores);
  mergeDriveScores(save.driveScores);
  mergeFlightScores(save.rocketScores);
  // The hero this device had selected may have been deleted on another one.
  const active = getActiveCharacterId();
  if (active && !save.characters.some((c) => c.id === active)) {
    setActiveCharacterId(null);
  }
  for (const listener of dataListeners) listener();
}

// ---- Syncing ------------------------------------------------------------------

function rememberSync(at: number): void {
  try {
    window.localStorage.setItem(SYNCED_AT_KEY, String(at));
  } catch {
    // Best effort — the status line just falls back to "never" next launch.
  }
}

let inFlight: Promise<CloudSyncResult> | null = null;
let pushTimer: number | null = null;

/**
 * Pull, merge, apply, push — the whole sync, in that order. Safe to call from
 * anywhere: a second call while one is running joins the running one rather
 * than racing it.
 */
export function syncNow(): Promise<CloudSyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<CloudSyncResult> {
  if (!cloudBridgeAvailable()) {
    setState({ phase: "off", available: false });
    return { ok: false, reason: "unavailable" };
  }
  setState({ phase: "syncing", error: undefined });

  const status = await fetchCloudStatus();
  setState({
    available: status.available,
    ...(status.provider ? { provider: status.provider } : {}),
    ...(status.player ? { player: status.player } : {}),
  });
  if (!status.available) {
    setState({ phase: "off" });
    return { ok: false, reason: "unavailable" };
  }

  const read = await loadFromCloud();
  if (!read.ok) {
    setState({ phase: "error", error: "COULDN'T REACH THE CLOUD" });
    return { ok: false, reason: "read" };
  }
  // A save written by a NEWER build is left untouched: this build can't merge a
  // format it doesn't know, and overwriting it would throw away whatever the
  // upgraded device stored. Update the app on this device to sync again.
  if (isFutureSave(read.data)) {
    setState({ phase: "error", error: "CLOUD SAVE IS FROM A NEWER VERSION" });
    return { ok: false, reason: "read" };
  }

  const remote = parseCloudSave(read.data);
  // Snapshot AFTER the read: the round trip may have taken seconds, and
  // anything the player banked meanwhile must be in the merge, not under it.
  const local = localSnapshot();
  const merged = remote ? mergeSaves(local, remote) : local;
  const pulled = remote !== null && contentOf(merged) !== contentOf(local);
  if (pulled) applySave(merged);

  const body = JSON.stringify(merged);
  const push = !remote || contentOf(merged) !== contentOf(remote);
  if (push && body.length > MAX_PAYLOAD_CHARS) {
    setState({ phase: "error", error: "SAVE TOO BIG FOR THE CLOUD" });
    return { ok: false, reason: "too-large" };
  }
  if (push) {
    const written = await saveToCloud(body);
    if (!written.ok) {
      setState({
        phase: "error",
        error:
          written.reason === "too-large"
            ? "SAVE TOO BIG FOR THE CLOUD"
            : "COULDN'T WRITE TO THE CLOUD",
      });
      return {
        ok: false,
        reason: written.reason === "too-large" ? "too-large" : "write",
      };
    }
  }

  const at = Date.now();
  rememberSync(at);
  setState({ phase: "idle", lastSyncAt: at, error: undefined });
  return { ok: true, pushed: push, pulled };
}

/**
 * Sync soon — the trigger for a local change (a purchase, a distribution, a
 * banked victory). Debounced, so a burst of changes is one round trip.
 */
export function scheduleCloudSync(): void {
  if (!cloudBridgeAvailable()) return;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void syncNow();
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Boot cloud save: install the bridge, pull once, and keep listening. Call once
 * at app start (App.tsx) when running natively; a no-op elsewhere, where there
 * is no platform cloud.
 *
 * Two more pulls beyond the boot one: the cloud's own change notification
 * (another device wrote), and coming back to the foreground — the exact moment
 * a player who just put the other device down picks this one up.
 */
export function initCloudSave(): () => void {
  initCloudBridge(() => scheduleCloudSync());
  if (!cloudBridgeAvailable()) return () => {};
  void syncNow();
  // Both directions matter: going hidden is the last chance to push what this
  // session did, and coming back is when the other device's work should land.
  const onVisible = () => void syncNow();
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}
