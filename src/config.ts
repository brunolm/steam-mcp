import { config as dotenvConfig } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(here, "..", ".env") });

const defaultSteamId = process.env.STEAM_DEFAULT_STEAM_ID?.trim();
if (defaultSteamId && !/^\d{17}$/.test(defaultSteamId)) {
  throw new Error(`STEAM_DEFAULT_STEAM_ID must be a 17-digit SteamID64, got "${defaultSteamId}"`);
}

export const config = {
  apiKey: process.env.STEAM_API_KEY?.trim() || undefined,
  accessToken: process.env.STEAM_ACCESS_TOKEN?.trim() || undefined,
  defaultSteamId: defaultSteamId || undefined,
  countryCode: process.env.STEAM_COUNTRY_CODE?.trim() || "US",
  language: process.env.STEAM_LANGUAGE?.trim() || "english",
  apiBase: "https://api.steampowered.com",
  storeBase: "https://store.steampowered.com",
  userAgent: "steam-mcp/0.1.0",
};
