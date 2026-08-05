// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for the Steamworks Web API client's exports. Keep in step
// with steam-partner.mjs.

import type { GameSchema } from "./steam-achievement-plan.d.mts";

export const STEAM_API_HOST: string;
export const STEAM_KEY_HINT: string;
export const SPACEWAR_APP_ID: number;

export function steamCredentials(): { key: string; missing: string[] };

export function steamAppId(
  root: string,
  override?: string,
): { id: number | null; source: string | null };

export class SteamApiError extends Error {
  constructor(method: string, url: string, status: number, body?: unknown);
  status: number;
}

export class SteamSchemaEmptyError extends Error {
  constructor(appId: number | string);
  appId: number | string;
}

export class SteamPartner {
  constructor(
    key: string,
    options?: {
      host?: string;
      fetch?: typeof globalThis.fetch;
      sleep?: (ms: number) => Promise<void>;
      retries?: number;
    },
  );
  requests: number;
  get(urlPath: string, query?: Record<string, unknown>): Promise<unknown>;
  schemaForGame(
    appId: number | string,
    options?: { language?: string },
  ): Promise<GameSchema>;
}
