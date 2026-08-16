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

export function toHours(minutes: number | undefined): number {
  return Math.round(((minutes ?? 0) / 60) * 10) / 10;
}

export function unixToDate(seconds: number | undefined): string | undefined {
  if (!seconds) return undefined;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
