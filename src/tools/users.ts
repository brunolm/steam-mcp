import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { steamApi } from "../steam/client.js";
import { resolveSteamId } from "../steam/steam-id.js";
import { unixToDate } from "../format.js";
import { jsonResult, steamIdParam } from "./helpers.js";

interface PlayerSummary {
  steamid: string;
  personaname?: string;
  profileurl?: string;
  avatarfull?: string;
  personastate?: number;
  communityvisibilitystate?: number;
  realname?: string;
  loccountrycode?: string;
  timecreated?: number;
  lastlogoff?: number;
  gameid?: string;
  gameextrainfo?: string;
}

const PERSONA_STATES = [
  "Offline",
  "Online",
  "Busy",
  "Away",
  "Snooze",
  "Looking to trade",
  "Looking to play",
];

const VISIBILITY_STATES: Record<number, string> = {
  1: "Private",
  2: "Friends only",
  3: "Public",
};

/** GetPlayerSummaries caps the steamids list at 100 per request. */
const SUMMARY_BATCH_SIZE = 100;

export function registerUserTools(server: McpServer) {
  server.registerTool(
    "get_player_summary",
    {
      title: "Get player summary",
      description:
        "Profile info for one or more players: persona name, avatar, online state, country, account creation date, and the game they are currently playing.",
      inputSchema: {
        steam_ids: z
          .array(z.string())
          .optional()
          .describe("SteamID64s, vanity names, or profile URLs. Defaults to STEAM_DEFAULT_STEAM_ID."),
      },
    },
    async ({ steam_ids }) => {
      const ids = steam_ids?.length
        ? await Promise.all(steam_ids.map((id) => resolveSteamId(id)))
        : [await resolveSteamId()];

      const players = await fetchSummaries(ids);
      return jsonResult(players.map(summarizePlayer));
    },
  );

  server.registerTool(
    "resolve_vanity_url",
    {
      title: "Resolve vanity URL",
      description: "Converts a Steam vanity name or profile URL into a SteamID64.",
      inputSchema: {
        vanity_url: z.string().describe("Vanity name or full profile URL."),
      },
    },
    async ({ vanity_url }) => jsonResult({ input: vanity_url, steamid: await resolveSteamId(vanity_url) }),
  );

  server.registerTool(
    "get_friend_list",
    {
      title: "Get friend list",
      description:
        "Lists a player's friends with the date each was added. Requires a public friends list.",
      inputSchema: {
        steam_id: steamIdParam,
        include_summaries: z
          .boolean()
          .optional()
          .describe("Resolve each friend's persona name and online state. Defaults to true."),
        limit: z.number().int().min(1).max(500).optional().describe("Max friends to return. Defaults to 100."),
      },
    },
    async ({ steam_id, include_summaries, limit }) => {
      const steamid = await resolveSteamId(steam_id);
      const data = await steamApi<{
        friendslist?: { friends?: { steamid: string; friend_since?: number }[] };
      }>("/ISteamUser/GetFriendList/v1/", {
        query: { steamid, relationship: "friend" },
        auth: "key",
      });

      const friends = data.friendslist?.friends ?? [];
      const page = friends.slice(0, limit ?? 100);

      if (include_summaries === false) {
        return jsonResult({
          friend_count: friends.length,
          returned: page.length,
          friends: page.map((f) => ({ steamid: f.steamid, friend_since: unixToDate(f.friend_since) })),
        });
      }

      const summaries = await fetchSummaries(page.map((f) => f.steamid));
      const byId = new Map(summaries.map((p) => [p.steamid, p]));

      return jsonResult({
        friend_count: friends.length,
        returned: page.length,
        friends: page.map((f) => ({
          friend_since: unixToDate(f.friend_since),
          ...summarizePlayer(byId.get(f.steamid) ?? { steamid: f.steamid }),
        })),
      });
    },
  );

  server.registerTool(
    "get_player_bans",
    {
      title: "Get player bans",
      description: "VAC, game, economy, and community ban status for one or more players.",
      inputSchema: {
        steam_ids: z.array(z.string()).optional().describe("Defaults to STEAM_DEFAULT_STEAM_ID."),
      },
    },
    async ({ steam_ids }) => {
      const ids = steam_ids?.length
        ? await Promise.all(steam_ids.map((id) => resolveSteamId(id)))
        : [await resolveSteamId()];

      return jsonResult(
        await steamApi("/ISteamUser/GetPlayerBans/v1/", {
          query: { steamids: ids.join(",") },
          auth: "key",
        }),
      );
    },
  );

  server.registerTool(
    "get_user_groups",
    {
      title: "Get user groups",
      description: "Lists the Steam Community group IDs a player belongs to.",
      inputSchema: { steam_id: steamIdParam },
    },
    async ({ steam_id }) =>
      jsonResult(
        await steamApi("/ISteamUser/GetUserGroupList/v1/", {
          query: { steamid: await resolveSteamId(steam_id) },
          auth: "key",
        }),
      ),
  );
}

async function fetchSummaries(steamids: string[]): Promise<PlayerSummary[]> {
  const players: PlayerSummary[] = [];

  for (let i = 0; i < steamids.length; i += SUMMARY_BATCH_SIZE) {
    const batch = steamids.slice(i, i + SUMMARY_BATCH_SIZE);
    const data = await steamApi<{ response?: { players?: PlayerSummary[] } }>(
      "/ISteamUser/GetPlayerSummaries/v2/",
      { query: { steamids: batch.join(",") }, auth: "key" },
    );
    players.push(...(data.response?.players ?? []));
  }

  return players;
}

function summarizePlayer(player: PlayerSummary) {
  return {
    steamid: player.steamid,
    name: player.personaname,
    state: player.personastate === undefined ? undefined : PERSONA_STATES[player.personastate],
    playing: player.gameextrainfo
      ? { name: player.gameextrainfo, appid: player.gameid ? Number(player.gameid) : undefined }
      : undefined,
    real_name: player.realname,
    country: player.loccountrycode,
    visibility:
      player.communityvisibilitystate === undefined
        ? undefined
        : VISIBILITY_STATES[player.communityvisibilitystate],
    account_created: unixToDate(player.timecreated),
    last_logoff: unixToDate(player.lastlogoff),
    avatar: player.avatarfull,
    profile_url: player.profileurl,
  };
}
