// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for the App Store Connect client, so its tests can import
// the plain-JavaScript module without `any`. Keep in step with
// app-store-connect.mjs.

export const ASC_HOST: string;
export const ASC_AUDIENCE: string;
export const TOKEN_TTL_SECONDS: number;
export const MAX_PAGE_LIMIT: number;

export function parseEnvFile(file: string): Record<string, string>;

export function nativeEnv(root: string): {
  file: string;
  dir: string;
  exists: boolean;
  value(key: string): string;
};

/** The API key, with `missing` naming every gap instead of throwing on the
 * first one. */
export type AscCredentials = {
  keyId: string;
  issuerId: string;
  privateKey: string;
  missing: string[];
  envFile: string;
};

export function ascCredentials(root: string): AscCredentials;

export function mintToken(
  credentials: Pick<AscCredentials, "keyId" | "issuerId" | "privateKey">,
  options?: { now?: number; ttl?: number },
): string;

export class AscError extends Error {
  constructor(method: string, url: string, status: number, payload: unknown);
  status: number;
  errors: {
    title?: string;
    detail?: string;
    code?: string;
    source?: { pointer?: string; parameter?: string };
  }[];
}

/** One upload operation from a freshly reserved asset. */
export type UploadOperation = {
  method?: string;
  url: string;
  offset?: number;
  length?: number;
  requestHeaders?: { name: string; value: string }[];
};

export class AppStoreConnect {
  constructor(
    credentials: Pick<AscCredentials, "keyId" | "issuerId" | "privateKey">,
    options?: {
      host?: string;
      fetch?: typeof globalThis.fetch;
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
      retries?: number;
    },
  );
  requests: number;
  bearer(): string;
  request(
    method: string,
    urlPath: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      headers?: Record<string, string>;
    },
  ): Promise<any>;
  get(
    urlPath: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<any>;
  post(urlPath: string, body: unknown): Promise<any>;
  patch(urlPath: string, body: unknown): Promise<any>;
  delete(urlPath: string): Promise<any>;
  list(
    urlPath: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<{ data: any[]; included: any[] }>;
  uploadAsset(
    operations: UploadOperation[] | undefined,
    bytes: Buffer,
  ): Promise<void>;
}
