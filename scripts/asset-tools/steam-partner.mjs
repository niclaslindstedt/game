// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAMWORKS WEB API CLIENT — the key, the app id and the HTTP, so that a
// script which reads the partner site back is about its own subject rather than
// about query strings.
//
// The Steamworks Web API can READ an app's achievement schema
// (`ISteamUserStats/GetSchemaForGame`) but cannot CREATE one: authoring a
// definition lives in the partner-site UI and has no documented public
// endpoint. That asymmetry is the whole reason this module exists — the entry
// half of the job stays manual, so the CHECKING half has to be automatic.
//
// Three things here fail as a bare 200 or an empty body rather than as an error
// that names the cause, and each is handled once, here:
//
//   1. AN UNKNOWN APP ANSWERS `{"game":{}}` WITH HTTP 200. Not a 404, not an
//      error field — an empty object, which is byte-identical to what a real
//      app with no achievements yet returns. Guessing wrong between those two
//      is the difference between "create 86 rows" and "your key can't see this
//      app", so `schemaForGame` refuses to guess and says which it cannot rule
//      out.
//   2. A USER KEY LOOKS LIKE A PUBLISHER KEY. Both are 32 hex characters and
//      both authenticate; only the publisher key can read an app that has not
//      been released. The failure is a 403 with no body.
//   3. AN APP WITH ACHIEVEMENTS BUT NO STATS OMITS `availableGameStats`
//      entirely rather than sending it empty, so every read of it has to
//      tolerate absence.
//
// Nothing in this module is specific to achievements; it is the pipe.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** Valve's Web API host. Overridable per client so a test never reaches the net. */
export const STEAM_API_HOST = "https://api.steampowered.com";

/** Where a publisher Web API key is minted, quoted in every "it isn't set" hint. */
export const STEAM_KEY_HINT =
  "Steamworks → Users & Permissions → Manage Groups → your group → " +
  "Create Web API Key. It must be the PUBLISHER key: a personal key " +
  "authenticates fine and still cannot read an unreleased app.";

/** A Steam Web API key is 32 hex characters. Anything else is a paste error. */
const KEY_SHAPE = /^[0-9A-Fa-f]{32}$/;

/**
 * The publisher Web API key, from the environment — the same place
 * `steam:upload` reads `STEAM_USER` from, so the Steam half of the pipeline has
 * one credential convention rather than two.
 *
 * Never throws: `missing` is the list of what to tell the operator, so a caller
 * can report every gap at once instead of one per run.
 */
export function steamCredentials() {
  const key = (process.env.STEAM_WEB_API_KEY ?? "").trim();
  const missing = [];
  if (!key) {
    missing.push(`STEAM_WEB_API_KEY is not set — ${STEAM_KEY_HINT}`);
  } else if (!KEY_SHAPE.test(key)) {
    missing.push(
      `STEAM_WEB_API_KEY is ${key.length} character(s), not the 32 hex ` +
        "digits a Steam Web API key is — check for a truncated paste",
    );
  }
  return { key, missing };
}

/**
 * The app id, resolved the way `electron/scripts/steam-upload.mjs` resolves it:
 * an explicit override, then CI's environment, then the committed ids. Returns
 * `{ id, source }` with `id` null when nothing names one.
 */
export function steamAppId(root, override) {
  if (override !== undefined && override !== null && override !== "") {
    return { id: Number(override), source: "--app" };
  }
  if (process.env.GIS_STEAM_APP_ID) {
    return {
      id: Number(process.env.GIS_STEAM_APP_ID),
      source: "GIS_STEAM_APP_ID",
    };
  }
  const file = path.join(root, "electron/store/steam.json");
  if (existsSync(file)) {
    try {
      const config = JSON.parse(readFileSync(file, "utf8"));
      if (config.appId !== null && config.appId !== undefined) {
        return {
          id: Number(config.appId),
          source: "electron/store/steam.json",
        };
      }
    } catch {
      /* store-preflight owns reporting a malformed steam.json. */
    }
  }
  return { id: null, source: null };
}

/** Valve's shared test app. Everything works, into a sandbox everyone shares. */
export const SPACEWAR_APP_ID = 480;

/**
 * A request Valve refused, carrying whatever it said. Steam's error bodies are
 * thin — often nothing at all behind a 403 — so the status is spelled out in
 * words rather than left as a number to look up.
 */
export class SteamApiError extends Error {
  constructor(method, url, status, body) {
    const known = {
      401: "the key was not accepted",
      403:
        "the key is not authorized for this app — a personal Web API key " +
        "cannot read an app that has not been released; use the publisher key",
      429: "rate limited",
    }[status];
    const detail = String(body ?? "")
      .trim()
      .slice(0, 400);
    super(
      `${method} ${url} → ${status}` +
        (known ? ` (${known})` : "") +
        (detail ? `\n  ${detail}` : ""),
    );
    this.name = "SteamApiError";
    this.status = status;
  }
}

/** Raised when the schema read succeeded but cannot be believed — see rule 1. */
export class SteamSchemaEmptyError extends Error {
  constructor(appId) {
    super(
      `app ${appId} returned an empty schema. Steam answers HTTP 200 with ` +
        `{"game":{}} for BOTH "this app has no achievements yet" and "this ` +
        `key cannot see this app", so which one it is cannot be read off the ` +
        "response.\n" +
        "  - If no row has been created yet, that is expected: create them " +
        "first (the worksheet is what this tool prints without --verify).\n" +
        `  - Otherwise the key or the app id is wrong. ${STEAM_KEY_HINT}`,
    );
    this.name = "SteamSchemaEmptyError";
    this.appId = appId;
  }
}

/** How long to wait before retry n (1-based). */
const backoffMs = (attempt) => Math.min(30_000, 1000 * 2 ** (attempt - 1));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A thin client for the Steamworks Web API. It knows about the key, the
 * retryable failures and Valve's envelope — and nothing about achievements.
 */
export class SteamPartner {
  #key;
  #host;
  #fetch;
  #sleep;
  #retries;

  /** Every request this client has made, for a summary line. */
  requests = 0;

  constructor(
    key,
    {
      host = STEAM_API_HOST,
      fetch: doFetch = globalThis.fetch,
      sleep: doSleep = sleep,
      retries = 4,
    } = {},
  ) {
    this.#key = key;
    this.#host = host;
    this.#fetch = doFetch;
    this.#sleep = doSleep;
    this.#retries = retries;
  }

  /**
   * One GET, retried on the two failures that are about the connection rather
   * than the request: Valve's rate limit (429) and a server-side 5xx. A 403 is
   * the caller's key being wrong and is raised immediately — retrying it four
   * times just makes the same mistake four more times.
   */
  async get(urlPath, query = {}) {
    const url = new URL(`${this.#host}${urlPath}`);
    url.searchParams.set("key", this.#key);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(name, String(value));
      }
    }
    // The key must never reach a log line or an error message.
    const shown = `${urlPath}?${new URLSearchParams({ ...query }).toString()}`;

    let lastError;
    for (let attempt = 1; attempt <= this.#retries; attempt++) {
      this.requests++;
      const response = await this.#fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      const text = await response.text();

      if (response.ok) {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          throw new SteamApiError("GET", shown, response.status, text);
        }
      }

      const retryable = response.status === 429 || response.status >= 500;
      lastError = new SteamApiError("GET", shown, response.status, text);
      if (!retryable || attempt === this.#retries) throw lastError;

      const named = Number(response.headers?.get?.("retry-after"));
      await this.#sleep(
        Number.isFinite(named) && named > 0 ? named * 1000 : backoffMs(attempt),
      );
    }
    throw lastError;
  }

  /**
   * The app's achievement schema as the partner site holds it, normalized into
   * the shape the reconcile compares against. `name` is the API Name — the id
   * the game reports — and it is the only field that has to match exactly.
   *
   * Throws `SteamSchemaEmptyError` rather than returning an empty list, because
   * the two things an empty response can mean want different answers.
   */
  async schemaForGame(appId, { language = "english" } = {}) {
    const body = await this.get("/ISteamUserStats/GetSchemaForGame/v2/", {
      appid: appId,
      l: language,
    });
    const game = body?.game;
    if (!game || Object.keys(game).length === 0) {
      throw new SteamSchemaEmptyError(appId);
    }
    const stats = game.availableGameStats ?? {};
    return {
      gameName: game.gameName ?? "",
      gameVersion: game.gameVersion ?? "",
      achievements: (stats.achievements ?? []).map((row) => ({
        id: row.name ?? "",
        displayName: row.displayName ?? "",
        description: row.description ?? "",
        // Valve encodes the checkbox as 0/1, not as a boolean.
        hidden: Number(row.hidden ?? 0) === 1,
        icon: row.icon ?? "",
        iconGray: row.icongray ?? "",
      })),
      stats: (stats.stats ?? []).map((row) => ({
        id: row.name ?? "",
        displayName: row.displayName ?? "",
      })),
    };
  }
}
