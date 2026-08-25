// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP STORE CONNECT CLIENT — the credentials, the token and the HTTP, so
// that a script which pushes something to Apple's portal is about its own
// subject rather than about JWTs.
//
// Three things here are easy to get subtly wrong, and each fails as a bare 401
// or a silent no-op rather than as an error that names the cause:
//
//   1. THE SIGNATURE ENCODING. ES256 wants the raw 64-byte r‖s pair (RFC 7515
//      §3.4); OpenSSL — and therefore node:crypto by default — emits the ASN.1
//      DER SEQUENCE instead. Apple rejects that with a 401 and no body, which
//      reads exactly like a wrong key. `dsaEncoding: "ieee-p1363"` is the whole
//      fix.
//   2. THE TOKEN'S LIFETIME. Apple caps it at 20 minutes and rejects a longer
//      `exp` outright. A push of ninety-odd rows takes several hundred requests
//      and can outlive one token, so the client re-mints on the way rather than
//      signing once at startup.
//   3. THE CREDENTIALS' PROVENANCE. They live in `native/.env`, which fastlane
//      also reads, and a HALF-FILLED template is the most common way a checkout
//      ends up "configured" but not working — so a value still equal to the one
//      in `.env.example` counts as absent. That rule is here, in one place,
//      because store-preflight applies it too.
//
// Nothing in this module is specific to Game Center; it is the pipe.

import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** Apple's API host. Overridable per client so a test never reaches the net. */
export const ASC_HOST = "https://api.appstoreconnect.apple.com";

/** The audience claim every App Store Connect token carries. */
export const ASC_AUDIENCE = "appstoreconnect-v1";

/** Apple's ceiling on a token's lifetime. A longer `exp` is rejected. */
export const TOKEN_TTL_SECONDS = 20 * 60;

/** Re-mint this long before expiry, so a request never races the clock. */
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

/** Apple's page size ceiling for a collection read. */
export const MAX_PAGE_LIMIT = 200;

/** A `KEY=value` file, parsed the way dotenv parses one. Missing file → {}. */
export function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * The values fastlane would see, read from `native/.env` with the process
 * environment winning — and with a leftover from `.env.example` treated as
 * absent, because a template value configures nothing.
 */
export function nativeEnv(root) {
  const native = path.join(root, "native");
  const file = path.join(native, ".env");
  const dotenv = parseEnvFile(file);
  const template = parseEnvFile(path.join(native, ".env.example"));
  return {
    file,
    dir: native,
    exists: existsSync(file),
    value(key) {
      const value = process.env[key] ?? dotenv[key] ?? "";
      if (!value) return "";
      return value === template[key] ? "" : value;
    },
  };
}

/**
 * A review phone that is really the shipped placeholder. Apple CALLS this
 * number, so a run of zeros is not a number that has been filled in badly — it
 * is the template, and treating it as set is how a listing reaches review with
 * nobody on the other end.
 */
const placeholderPhone = (phone) => /0{6,}/.test(phone.replace(/[\s-]/g, ""));

/**
 * The App Store review contact number.
 *
 * It is the one listing field that behaves like a credential rather than like
 * copy: Apple rings it, so it has to be a reachable personal or business line,
 * and THIS REPOSITORY IS PUBLIC — committing one publishes it to everybody who
 * ever clones the tree, permanently and in the history. So the authored YAML
 * carries a placeholder on purpose and the real value arrives out of band,
 * through `ASC_REVIEW_PHONE` in native/.env (gitignored) or the process
 * environment, which is how CI hands one over from a repository secret.
 *
 * Returns "" when neither source has a real number, so every caller reports
 * the gap instead of shipping the placeholder to Apple.
 */
export function reviewPhone(root, listingDoc) {
  const fromEnv = nativeEnv(root).value("ASC_REVIEW_PHONE");
  if (fromEnv) return placeholderPhone(fromEnv) ? "" : fromEnv;
  const authored = String(listingDoc?.apple?.review?.phone ?? "").trim();
  return placeholderPhone(authored) ? "" : authored;
}

/**
 * The App Store Connect API key, resolved exactly as fastlane resolves it: a
 * key id, an issuer id, and the `.p8` from either a path (relative to
 * `native/`, since that is where the lanes run) or a base64 blob for CI.
 *
 * Never throws — `missing` is the list of what to tell the operator, so a
 * caller can report every gap at once instead of one per run.
 */
export function ascCredentials(root) {
  const env = nativeEnv(root);
  const keyId = env.value("ASC_KEY_ID");
  const issuerId = env.value("ASC_ISSUER_ID");
  const keyPath = env.value("ASC_KEY_PATH");
  const keyContent = env.value("ASC_KEY_CONTENT");

  const missing = [];
  if (!keyId) {
    missing.push("ASC_KEY_ID — the id in the AuthKey_<KEY_ID>.p8 filename");
  }
  if (!issuerId) {
    missing.push("ASC_ISSUER_ID — one per team, above the key list (a UUID)");
  }

  let privateKey = "";
  if (keyPath && keyContent) {
    missing.push(
      "exactly one of ASC_KEY_PATH / ASC_KEY_CONTENT — both are set, and the " +
        "loser is silently ignored",
    );
  } else if (keyContent) {
    privateKey = Buffer.from(keyContent, "base64").toString("utf8");
  } else if (keyPath) {
    const resolved = path.resolve(env.dir, keyPath);
    if (existsSync(resolved)) privateKey = readFileSync(resolved, "utf8");
    else {
      missing.push(
        `ASC_KEY_PATH → ${keyPath} does not exist (a relative path resolves ` +
          "against native/, where fastlane runs)",
      );
    }
  } else {
    missing.push(
      "ASC_KEY_PATH or ASC_KEY_CONTENT — App Store Connect → Users and " +
        "Access → Integrations → an App Manager key. The .p8 downloads once",
    );
  }

  return { keyId, issuerId, privateKey, missing, envFile: env.file };
}

const b64url = (value) => Buffer.from(value).toString("base64url");

/**
 * One signed bearer token. `now` and `ttl` are parameters so the claims are
 * testable without waiting twenty minutes for one to expire.
 */
export function mintToken(credentials, { now, ttl = TOKEN_TTL_SECONDS } = {}) {
  const issuedAt = now ?? Math.floor(Date.now() / 1000);
  const header = b64url(
    JSON.stringify({ alg: "ES256", kid: credentials.keyId, typ: "JWT" }),
  );
  const payload = b64url(
    JSON.stringify({
      iss: credentials.issuerId,
      iat: issuedAt,
      exp: issuedAt + ttl,
      aud: ASC_AUDIENCE,
    }),
  );
  const signed = `${header}.${payload}`;
  const signature = createSign("SHA256")
    .update(signed)
    .sign({ key: credentials.privateKey, dsaEncoding: "ieee-p1363" });
  return `${signed}.${b64url(signature)}`;
}

/**
 * A request Apple refused, carrying its own words. Apple's error bodies are
 * genuinely informative — `title`, `detail`, and the `source.pointer` naming
 * the offending attribute — and losing them to a bare status code is what
 * makes an API like this feel opaque.
 */
export class AscError extends Error {
  constructor(method, url, status, payload) {
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const detail = errors.length
      ? errors
          .map((e) => {
            const at = e.source?.pointer ?? e.source?.parameter;
            return `${e.title ?? e.code ?? "error"}: ${e.detail ?? ""}${
              at ? ` (at ${at})` : ""
            }`;
          })
          .join("\n  ")
      : typeof payload === "string" && payload
        ? payload
        : "no error body";
    super(`${method} ${url} → ${status}\n  ${detail}`);
    this.name = "AscError";
    this.status = status;
    this.errors = errors;
  }
}

/** How long to wait before retry n (1-based), when Apple names no delay. */
const backoffMs = (attempt) => Math.min(30_000, 1000 * 2 ** (attempt - 1));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A thin JSON:API client for App Store Connect. It knows about the token, the
 * `data`/`included` envelope, cursor paging and Apple's rate limit — and
 * nothing about what is being pushed.
 */
export class AppStoreConnect {
  #credentials;
  #host;
  #fetch;
  #now;
  #sleep;
  #retries;
  #token = "";
  #tokenExpiry = 0;

  /** Every request this client has made, for a summary line. */
  requests = 0;

  constructor(
    credentials,
    {
      host = ASC_HOST,
      fetch: doFetch = globalThis.fetch,
      now = () => Date.now(),
      sleep: doSleep = sleep,
      retries = 4,
    } = {},
  ) {
    this.#credentials = credentials;
    this.#host = host;
    this.#fetch = doFetch;
    this.#now = now;
    this.#sleep = doSleep;
    this.#retries = retries;
  }

  /** The bearer token, re-minted whenever the live one is near its end. */
  bearer() {
    const nowSeconds = Math.floor(this.#now() / 1000);
    if (nowSeconds + TOKEN_REFRESH_MARGIN_SECONDS >= this.#tokenExpiry) {
      this.#token = mintToken(this.#credentials, { now: nowSeconds });
      this.#tokenExpiry = nowSeconds + TOKEN_TTL_SECONDS;
    }
    return this.#token;
  }

  /**
   * One request, retried on the two failures that are about the connection
   * rather than the payload: Apple's rate limit (429) and a server-side 5xx.
   * A 4xx that isn't 429 is the caller's mistake and is raised immediately —
   * retrying a malformed body just makes the same mistake four more times.
   */
  async request(method, urlPath, { body, query, headers } = {}) {
    const url = new URL(
      urlPath.startsWith("http") ? urlPath : `${this.#host}${urlPath}`,
    );
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError;
    for (let attempt = 1; attempt <= this.#retries; attempt++) {
      this.requests++;
      const response = await this.#fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.bearer()}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (response.status === 204) return null;

      const text = await response.text();
      let payload = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* Apple answers a 5xx in HTML now and then; keep the text. */
      }

      if (response.ok) return payload;

      const retryable = response.status === 429 || response.status >= 500;
      lastError = new AscError(method, url.pathname, response.status, payload);
      if (!retryable || attempt === this.#retries) throw lastError;

      const named = Number(response.headers?.get?.("retry-after"));
      await this.#sleep(
        Number.isFinite(named) && named > 0 ? named * 1000 : backoffMs(attempt),
      );
    }
    throw lastError;
  }

  get(urlPath, query) {
    return this.request("GET", urlPath, { query });
  }

  post(urlPath, body) {
    return this.request("POST", urlPath, { body });
  }

  patch(urlPath, body) {
    return this.request("PATCH", urlPath, { body });
  }

  delete(urlPath) {
    return this.request("DELETE", urlPath);
  }

  /**
   * A whole collection, following `links.next` to the end. Returns the merged
   * `data` and `included` arrays — the sideloaded half matters as much as the
   * primary one, because that is where an `include=`d relationship's resources
   * arrive.
   */
  async list(urlPath, query = {}) {
    const data = [];
    const included = [];
    // Only the FIRST request carries the query — a `links.next` cursor already
    // has every parameter baked into it, and re-appending them would fight it.
    let page = { ...query, limit: query?.limit ?? MAX_PAGE_LIMIT };
    let target = urlPath;
    for (;;) {
      const body = await this.get(target, page);
      data.push(...(body?.data ?? []));
      included.push(...(body?.included ?? []));
      const next = body?.links?.next;
      if (!next) break;
      target = next;
      page = undefined;
    }
    return { data, included };
  }

  /**
   * Push the bytes of an asset Apple has just reserved. The `uploadOperations`
   * on a freshly created image resource are pre-signed PUTs into Apple's own
   * storage — they carry their own headers and are NOT authenticated with the
   * API token, so they go out through plain fetch with the token withheld.
   */
  async uploadAsset(operations, bytes) {
    for (const op of operations ?? []) {
      const headers = {};
      for (const header of op.requestHeaders ?? []) {
        headers[header.name] = header.value;
      }
      const from = op.offset ?? 0;
      const chunk = bytes.subarray(from, from + (op.length ?? bytes.length));
      this.requests++;
      const response = await this.#fetch(op.url, {
        method: op.method ?? "PUT",
        headers,
        body: chunk,
      });
      if (!response.ok) {
        throw new AscError(
          op.method ?? "PUT",
          op.url,
          response.status,
          await response.text(),
        );
      }
    }
  }
}
