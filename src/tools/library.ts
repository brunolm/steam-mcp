import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { steamApi } from "../steam/client.js";
import { resolveSteamId } from "../steam/steam-id.js";
import { jsonResult, steamIdParam, toHours, unixToDate } from "./helpers.js";

interface OwnedGame {
  appid: number;
  name?: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
}

export function registerLibraryTools(server: McpServer) {
  server.registerTool(
    "get_owned_games",
    {
      title: "Get owned games",
      description:
        "Lists games in a player's library with playtime. Sorted by total playtime by default and trimmed to a limit, since libraries can hold thousands of entries. Requires a public 'game details' privacy setting.",
      inputSchema: {
        steam_id: steamIdParam,
        search: z.string().optional().describe("Case-insensitive substring filter on the game name."),
        sort: z
          .enum(["playtime", "recent", "name"])
          .optional()
          .describe("Sort order. Defaults to playtime (most played first)."),
        limit: z.number().int().min(1).max(500).optional().describe("Max games to return. Defaults to 50."),
        include_free: z
          .boolean()
          .optional()
          .describe("Include free-to-play games the player has launched. Defaults to true."),
      },
    },
    async ({ steam_id, search, sort, limit, include_free }) => {
      const steamid = await resolveSteamId(steam_id);
      const data = await steamApi<{ response?: { game_count?: number; games?: OwnedGame[] } }>(
        "/IPlayerService/GetOwnedGames/v1/",
        {
          query: {
            steamid,
            include_appinfo: true,
            include_played_free_games: include_free !== false,
          },
          auth: "key",
        },
      );

      const games = data.response?.games ?? [];
      const term = search?.trim().toLowerCase();
      const matched = term ? games.filter((g) => g.name?.toLowerCase().includes(term)) : games;

      sortGames(matched, sort ?? "playtime");
      const page = matched.slice(0, limit ?? 50);

      return jsonResult({
        steamid,
        game_count: data.response?.game_count ?? games.length,
        matched: matched.length,
        returned: page.length,
        games: page.map(summarizeGame),
      });
    },
  );

  server.registerTool(
    "get_recently_played_games",
    {
      title: "Get recently played games",
      description: "Games a player has played in the last two weeks, with playtime for that window.",
      inputSchema: {
        steam_id: steamIdParam,
        count: z.number().int().min(1).max(100).optional().describe("Max games to return."),
      },
    },
    async ({ steam_id, count }) => {
      const steamid = await resolveSteamId(steam_id);
      const data = await steamApi<{ response?: { total_count?: number; games?: OwnedGame[] } }>(
        "/IPlayerService/GetRecentlyPlayedGames/v1/",
        { query: { steamid, count }, auth: "key" },
      );

      return jsonResult({
        steamid,
        total_count: data.response?.total_count ?? 0,
        games: (data.response?.games ?? []).map(summarizeGame),
      });
    },
  );

  server.registerTool(
    "get_steam_level",
    {
      title: "Get Steam level",
      description: "The player's Steam community level.",
      inputSchema: { steam_id: steamIdParam },
    },
    async ({ steam_id }) => {
      const steamid = await resolveSteamId(steam_id);
      const data = await steamApi<{ response?: { player_level?: number } }>(
        "/IPlayerService/GetSteamLevel/v1/",
        { query: { steamid }, auth: "key" },
      );

      return jsonResult({ steamid, player_level: data.response?.player_level });
    },
  );

  server.registerTool(
    "get_badges",
    {
      title: "Get badges",
      description: "The player's badges, XP, level, and progress toward the next level.",
      inputSchema: { steam_id: steamIdParam },
    },
    async ({ steam_id }) =>
      jsonResult(
        await steamApi("/IPlayerService/GetBadges/v1/", {
          query: { steamid: await resolveSteamId(steam_id) },
          auth: "key",
        }),
      ),
  );
}

function sortGames(games: OwnedGame[], sort: "playtime" | "recent" | "name") {
  if (sort === "name") {
    games.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return;
  }
  if (sort === "recent") {
    games.sort((a, b) => (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0));
    return;
  }
  games.sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
}

function summarizeGame(game: OwnedGame) {
  return {
    appid: game.appid,
    name: game.name,
    playtime_hours: toHours(game.playtime_forever),
    playtime_2weeks_hours: game.playtime_2weeks ? toHours(game.playtime_2weeks) : undefined,
    last_played: unixToDate(game.rtime_last_played),
  };
}
