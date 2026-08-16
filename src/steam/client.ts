import { config } from "../config.js";

type Query = Record<string, string | number | boolean | undefined>;

/**
 * - `none` — public endpoint.
 * - `key` — sent as the `x-webapi-key` header so the key never lands in a URL or error message.
 * - `token` — user access token, which Steam only accepts as an `access_token` query parameter.
 */
type Auth = "none" | "key" | "token";

interface ApiOptions {
  method?: "GET" | "POST";
  query?: Query;
  auth?: Auth;
  /** Payload for `*Service` methods, serialized into the `input_json` parameter. */
  input?: Record<string, unknown>;
}

export async function steamApi<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = new URL(path, config.apiBase);
  applyQuery(url, opts.query);

  const headers: Record<string, string> = {
    "User-Agent": config.userAgent,
    Accept: "application/json",
  };

  const auth = opts.auth ?? "none";
  if (auth === "key") headers["x-webapi-key"] = requireApiKey();
  if (auth === "token") url.searchParams.set("access_token", requireAccessToken());

  const method = opts.method ?? "GET";
  let body: string | undefined;
  if (method === "POST") {
    const form = new URLSearchParams();
    if (opts.input) form.set("input_json", JSON.stringify(opts.input));
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = form.toString();
  } else if (opts.input) {
    url.searchParams.set("input_json", JSON.stringify(opts.input));
  }

  return request<T>(url, { method, headers, body }, path);
}

export async function storeApi<T = unknown>(path: string, query: Query = {}): Promise<T> {
  const url = new URL(path, config.storeBase);
  applyQuery(url, query);

  return request<T>(
    url,
    { headers: { "User-Agent": config.userAgent, Accept: "application/json" } },
    path,
  );
}

async function request<T>(url: URL, init: RequestInit, label: string): Promise<T> {
  const res = await fetch(url, init);

  if (res.status === 429) {
    throw new Error(`Steam ${label} hit a rate limit (429). Wait before retrying.`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Steam ${label} was rejected (${res.status}). The API key or access token is missing, expired, or lacks permission for this data. Private profiles also return this.`,
    );
  }
  if (!res.ok) {
    const detail = res.headers.get("x-error_message") ?? (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Steam ${label} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Steam ${label} returned non-JSON: ${text.slice(0, 120)}`);
  }
}

function applyQuery(url: URL, query: Query | undefined) {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
}

function requireApiKey(): string {
  if (!config.apiKey) {
    throw new Error(
      "STEAM_API_KEY is not set — this endpoint needs one. Get a key at https://steamcommunity.com/dev/apikey and add it to .env.",
    );
  }
  return config.apiKey;
}

function requireAccessToken(): string {
  if (!config.accessToken) {
    throw new Error(
      "STEAM_ACCESS_TOKEN is not set — wishlist writes need one. Log into Steam, open https://store.steampowered.com/pointssummary/ajaxgetasyncconfig and copy the webapi_token into .env. It expires about every 24 hours.",
    );
  }
  return config.accessToken;
}
