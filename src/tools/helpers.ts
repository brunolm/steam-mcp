import { z } from "zod";

export const steamIdParam = z
  .string()
  .optional()
  .describe("SteamID64, vanity name, or profile URL. Falls back to STEAM_DEFAULT_STEAM_ID.");

export function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}
