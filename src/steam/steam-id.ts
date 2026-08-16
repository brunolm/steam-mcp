import { config } from "../config.js";
import { steamApi } from "./client.js";

interface VanityResponse {
  response: { success: number; steamid?: string; message?: string };
}

const STEAM_ID_64 = /^\d{17}$/;
const PROFILE_URL = /steamcommunity\.com\/(?:id|profiles)\/([^/?#]+)/i;

const resolved = new Map<string, string>();

/** Accepts a SteamID64, a vanity name, or a profile URL. Falls back to STEAM_DEFAULT_STEAM_ID. */
export async function resolveSteamId(input?: string): Promise<string> {
  const raw = input?.trim() || config.defaultSteamId;
  if (!raw) {
    throw new Error("No steam_id was given and STEAM_DEFAULT_STEAM_ID is not set in .env.");
  }

  const vanity = raw.match(PROFILE_URL)?.[1] ?? raw;
  if (STEAM_ID_64.test(vanity)) return vanity;

  const cached = resolved.get(vanity);
  if (cached) return cached;

  const { response } = await steamApi<VanityResponse>("/ISteamUser/ResolveVanityURL/v1/", {
    query: { vanityurl: vanity },
    auth: "key",
  });

  if (response.success !== 1 || !response.steamid) {
    throw new Error(`Could not resolve "${raw}" to a SteamID64: ${response.message ?? "no match"}`);
  }

  resolved.set(vanity, response.steamid);
  return response.steamid;
}
