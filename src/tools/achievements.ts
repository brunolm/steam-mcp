import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { steamApi } from "../steam/client.js";
import { resolveSteamId } from "../steam/steam-id.js";
import { unixToDate } from "../format.js";
import { jsonResult, steamIdParam } from "./helpers.js";

interface PlayerAchievement {
  apiname: string;
  achieved: number;
  unlocktime?: number;
  name?: string;
  description?: string;
}

export function registerAchievementTools(server: McpServer) {
  server.registerTool(
    "get_player_achievements",
    {
      title: "Get player achievements",
      description:
        "A player's achievements for one game, with a completion summary. Requires public game details; games without achievements return an error.",
      inputSchema: {
        appid: z.number().int().describe("Steam app ID. Use search_store to find one by name."),
        steam_id: steamIdParam,
        filter: z
          .enum(["all", "unlocked", "locked"])
          .optional()
          .describe("Which achievements to list. Defaults to all."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max achievements to list. Defaults to 100. The summary always covers every achievement."),
      },
    },
    async ({ appid, steam_id, filter, limit }) => {
      const steamid = await resolveSteamId(steam_id);
      const data = await steamApi<{
        playerstats?: { gameName?: string; achievements?: PlayerAchievement[]; success?: boolean; error?: string };
      }>("/ISteamUserStats/GetPlayerAchievements/v1/", {
        query: { steamid, appid, l: config.language },
        auth: "key",
      });

      const stats = data.playerstats;
      if (stats?.error) throw new Error(`Steam returned: ${stats.error}`);

      const achievements = stats?.achievements ?? [];
      const unlocked = achievements.filter((a) => a.achieved === 1);

      const selected =
        filter === "unlocked"
          ? unlocked
          : filter === "locked"
            ? achievements.filter((a) => a.achieved !== 1)
            : achievements;

      return jsonResult({
        appid,
        game: stats?.gameName,
        total: achievements.length,
        unlocked: unlocked.length,
        completion_percent: achievements.length
          ? Math.round((unlocked.length / achievements.length) * 1000) / 10
          : 0,
        returned: Math.min(selected.length, limit ?? 100),
        achievements: selected.slice(0, limit ?? 100).map((a) => ({
          api_name: a.apiname,
          name: a.name,
          description: a.description,
          achieved: a.achieved === 1,
          unlocked_at: a.achieved === 1 ? unixToDate(a.unlocktime) : undefined,
        })),
      });
    },
  );

  server.registerTool(
    "get_global_achievement_percentages",
    {
      title: "Get global achievement percentages",
      description:
        "How many players worldwide have each achievement in a game, as a percentage. Useful for spotting rare achievements. No API key required.",
      inputSchema: {
        appid: z.number().int(),
        limit: z.number().int().min(1).max(500).optional().describe("Max achievements to return."),
        rarest_first: z
          .boolean()
          .optional()
          .describe("Sort by rarity ascending instead of most-common first."),
      },
    },
    async ({ appid, limit, rarest_first }) => {
      const data = await steamApi<{
        achievementpercentages?: { achievements?: { name: string; percent: number }[] };
      }>("/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/", { query: { gameid: appid } });

      const achievements = [...(data.achievementpercentages?.achievements ?? [])];
      if (rarest_first) achievements.sort((a, b) => Number(a.percent) - Number(b.percent));

      return jsonResult({
        appid,
        total: achievements.length,
        achievements: achievements.slice(0, limit ?? 100),
      });
    },
  );

  server.registerTool(
    "get_game_schema",
    {
      title: "Get game schema",
      description:
        "The achievement and stat definitions for a game — display names, descriptions, and icons.",
      inputSchema: {
        appid: z.number().int(),
        include_stats: z.boolean().optional().describe("Include stat definitions. Defaults to false."),
        limit: z.number().int().min(1).max(500).optional().describe("Max achievements to return."),
      },
    },
    async ({ appid, include_stats, limit }) => {
      const data = await steamApi<{
        game?: {
          gameName?: string;
          gameVersion?: string;
          availableGameStats?: {
            achievements?: { name: string; displayName?: string; description?: string; hidden?: number }[];
            stats?: { name: string; defaultvalue?: number; displayName?: string }[];
          };
        };
      }>("/ISteamUserStats/GetSchemaForGame/v2/", { query: { appid, l: config.language }, auth: "key" });

      const gameStats = data.game?.availableGameStats;
      const achievements = gameStats?.achievements ?? [];

      return jsonResult({
        appid,
        game: data.game?.gameName,
        version: data.game?.gameVersion,
        achievement_count: achievements.length,
        achievements: achievements.slice(0, limit ?? 100).map((a) => ({
          api_name: a.name,
          name: a.displayName,
          description: a.description,
          hidden: a.hidden === 1,
        })),
        stats: include_stats ? gameStats?.stats : undefined,
      });
    },
  );

  server.registerTool(
    "get_user_stats_for_game",
    {
      title: "Get user stats for game",
      description: "A player's raw stat values for one game (kills, distance travelled, and similar).",
      inputSchema: { appid: z.number().int(), steam_id: steamIdParam },
    },
    async ({ appid, steam_id }) =>
      jsonResult(
        await steamApi("/ISteamUserStats/GetUserStatsForGame/v2/", {
          query: { steamid: await resolveSteamId(steam_id), appid },
          auth: "key",
        }),
      ),
  );
}
