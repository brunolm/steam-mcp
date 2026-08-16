import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { steamApi } from "../steam/client.js";
import { resolveSteamId } from "../steam/steam-id.js";
import { type StoreItem, fetchStoreItems, summarizeStoreItem } from "../steam/store-items.js";
import { unixToDate } from "../format.js";
import { jsonResult, steamIdParam } from "./helpers.js";

interface WishlistItem {
  appid: number;
  priority?: number;
  date_added?: number;
}

export function registerWishlistTools(server: McpServer) {
  server.registerTool(
    "get_wishlist",
    {
      title: "Get wishlist",
      description:
        "A player's Steam wishlist, enriched with game names and current prices. Requires the wishlist to be public.",
      inputSchema: {
        steam_id: steamIdParam,
        sort: z
          .enum(["priority", "date_added"])
          .optional()
          .describe("Sort order. Defaults to the player's own priority ordering."),
        limit: z.number().int().min(1).max(200).optional().describe("Max entries. Defaults to 50."),
        include_details: z
          .boolean()
          .optional()
          .describe("Look up names and prices for each entry. Defaults to true."),
      },
    },
    async ({ steam_id, sort, limit, include_details }) => {
      const steamid = await resolveSteamId(steam_id);
      const data = await steamApi<{ response?: { items?: WishlistItem[] } }>(
        "/IWishlistService/GetWishlist/v1/",
        { query: { steamid } },
      );

      const items = [...(data.response?.items ?? [])];
      if (!items.length) {
        return jsonResult({
          steamid,
          total: 0,
          items: [],
          note: "Steam returned an empty wishlist. It is either genuinely empty or set to private.",
        });
      }

      if (sort === "date_added") items.sort((a, b) => (b.date_added ?? 0) - (a.date_added ?? 0));
      else items.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

      const page = items.slice(0, limit ?? 50);
      const details =
        include_details === false
          ? new Map<number, StoreItem>()
          : await fetchStoreItems(page.map((i) => i.appid));

      return jsonResult({
        steamid,
        total: items.length,
        returned: page.length,
        items: page.map((item) => ({
          appid: item.appid,
          priority: item.priority,
          date_added: unixToDate(item.date_added),
          ...summarizeStoreItem(details.get(item.appid)),
        })),
      });
    },
  );

  server.registerTool(
    "get_wishlist_item_count",
    {
      title: "Get wishlist size",
      description: "How many games are on a player's wishlist.",
      inputSchema: { steam_id: steamIdParam },
    },
    async ({ steam_id }) => {
      const steamid = await resolveSteamId(steam_id);
      const data = await steamApi<{ response?: { count?: number } }>(
        "/IWishlistService/GetWishlistItemCount/v1/",
        { query: { steamid } },
      );

      return jsonResult({ steamid, count: data.response?.count ?? 0 });
    },
  );

  server.registerTool(
    "add_to_wishlist",
    {
      title: "Add to wishlist",
      description:
        "Adds a game to your own wishlist. Requires STEAM_ACCESS_TOKEN; always acts on the account that token belongs to.",
      inputSchema: {
        appid: z.number().int().describe("Steam app ID. Use search_store to find one by name."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ appid }) => {
      const data = await steamApi("/IWishlistService/AddToWishlist/v1/", {
        method: "POST",
        auth: "token",
        input: { appid },
      });

      return jsonResult({ added: true, appid, response: data });
    },
  );

  server.registerTool(
    "remove_from_wishlist",
    {
      title: "Remove from wishlist",
      description:
        "Removes a game from your own wishlist. Requires STEAM_ACCESS_TOKEN; always acts on the account that token belongs to.",
      inputSchema: {
        appid: z.number().int(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ appid }) => {
      const data = await steamApi("/IWishlistService/RemoveFromWishlist/v1/", {
        method: "POST",
        auth: "token",
        input: { appid },
      });

      return jsonResult({ removed: true, appid, response: data });
    },
  );
}
