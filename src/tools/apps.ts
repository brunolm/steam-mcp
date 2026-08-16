import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { toHours, truncate, unixToDate } from "../format.js";
import { steamApi, storeApi } from "../steam/client.js";
import { jsonResult } from "./helpers.js";

interface AppDetails {
  type?: string;
  name?: string;
  steam_appid?: number;
  required_age?: number;
  is_free?: boolean;
  controller_support?: string;
  dlc?: number[];
  short_description?: string;
  supported_languages?: string;
  header_image?: string;
  website?: string;
  developers?: string[];
  publishers?: string[];
  price_overview?: { final_formatted?: string; initial_formatted?: string; discount_percent?: number };
  platforms?: Record<string, boolean>;
  metacritic?: { score?: number; url?: string };
  categories?: { description: string }[];
  genres?: { description: string }[];
  recommendations?: { total?: number };
  achievements?: { total?: number };
  release_date?: { coming_soon?: boolean; date?: string };
}

interface StoreSearchItem {
  id: number;
  name: string;
  type?: string;
  price?: { currency?: string; initial?: number; final?: number };
  metascore?: string;
  platforms?: Record<string, boolean>;
  controller_support?: string;
}

interface NewsItem {
  gid: string;
  title?: string;
  url?: string;
  author?: string;
  contents?: string;
  feedlabel?: string;
  date?: number;
}

export function registerAppTools(server: McpServer) {
  server.registerTool(
    "search_store",
    {
      title: "Search the Steam store",
      description:
        "Finds games on the Steam store by name and returns their app IDs. Use this first when the user names a game rather than an app ID. No API key required.",
      inputSchema: {
        term: z.string().describe("Search text, e.g. 'hollow knight'."),
        limit: z.number().int().min(1).max(50).optional().describe("Max results. Defaults to 10."),
      },
    },
    async ({ term, limit }) => {
      const data = await storeApi<{ total?: number; items?: StoreSearchItem[] }>("/api/storesearch/", {
        term,
        l: config.language,
        cc: config.countryCode,
      });

      const items = data.items ?? [];
      return jsonResult({
        total: data.total ?? items.length,
        items: items.slice(0, limit ?? 10).map((item) => ({
          appid: item.id,
          name: item.name,
          type: item.type,
          price: formatCents(item.price?.final, item.price?.currency),
          metascore: item.metascore || undefined,
          platforms: enabledKeys(item.platforms),
          url: `https://store.steampowered.com/app/${item.id}/`,
        })),
      });
    },
  );

  server.registerTool(
    "get_app_details",
    {
      title: "Get app details",
      description:
        "Store details for one game: description, price, genres, developers, release date, Metacritic score, and review count. No API key required.",
      inputSchema: {
        appid: z.number().int(),
        full: z
          .boolean()
          .optional()
          .describe(
            "Return Steam's complete raw payload, including the long HTML description. Defaults to false, which returns a compact summary.",
          ),
      },
    },
    async ({ appid, full }) => {
      const data = await storeApi<Record<string, { success?: boolean; data?: AppDetails }>>(
        "/api/appdetails",
        { appids: appid, cc: config.countryCode, l: config.language },
      );

      const entry = data[String(appid)];
      if (!entry?.success || !entry.data) {
        throw new Error(`No store details for appid ${appid}. It may be delisted, region-locked, or not an app.`);
      }
      if (full) return jsonResult(entry.data);

      return jsonResult(summarizeAppDetails(entry.data, appid));
    },
  );

  server.registerTool(
    "get_app_reviews",
    {
      title: "Get app reviews",
      description:
        "Review score summary for a game plus a sample of individual reviews. No API key required.",
      inputSchema: {
        appid: z.number().int(),
        count: z.number().int().min(0).max(100).optional().describe("Sample reviews to include. Defaults to 5."),
        filter: z
          .enum(["all", "recent", "updated"])
          .optional()
          .describe("'all' sorts by helpfulness, 'recent' by date. Defaults to all."),
        review_type: z.enum(["all", "positive", "negative"]).optional().describe("Defaults to all."),
      },
    },
    async ({ appid, count, filter, review_type }) => {
      const sampleSize = count ?? 5;
      const data = await storeApi<{
        query_summary?: Record<string, unknown>;
        reviews?: {
          recommendationid: string;
          author?: { playtime_forever?: number };
          review?: string;
          voted_up?: boolean;
          votes_up?: number;
          timestamp_created?: number;
        }[];
      }>(`/appreviews/${appid}`, {
        json: 1,
        num_per_page: Math.max(sampleSize, 1),
        filter: filter ?? "all",
        review_type: review_type ?? "all",
        language: config.language,
        purchase_type: "all",
      });

      return jsonResult({
        appid,
        summary: data.query_summary,
        reviews: (data.reviews ?? []).slice(0, sampleSize).map((review) => ({
          voted_up: review.voted_up,
          votes_up: review.votes_up,
          playtime_hours: toHours(review.author?.playtime_forever),
          posted: unixToDate(review.timestamp_created),
          review: truncate(review.review, 800),
        })),
      });
    },
  );

  server.registerTool(
    "get_current_players",
    {
      title: "Get current player count",
      description: "How many people are playing a game right now. No API key required.",
      inputSchema: { appid: z.number().int() },
    },
    async ({ appid }) => {
      const data = await steamApi<{ response?: { player_count?: number } }>(
        "/ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
        { query: { appid } },
      );

      return jsonResult({ appid, player_count: data.response?.player_count });
    },
  );

  server.registerTool(
    "get_news_for_app",
    {
      title: "Get news for app",
      description: "Recent news items and patch notes for a game. No API key required.",
      inputSchema: {
        appid: z.number().int(),
        count: z.number().int().min(1).max(50).optional().describe("Max items. Defaults to 5."),
        max_length: z
          .number()
          .int()
          .min(0)
          .max(5000)
          .optional()
          .describe("Truncate each item's body to this many characters. Defaults to 600."),
      },
    },
    async ({ appid, count, max_length }) => {
      const maxlength = max_length ?? 600;
      const data = await steamApi<{ appnews?: { newsitems?: NewsItem[] } }>(
        "/ISteamNews/GetNewsForApp/v2/",
        { query: { appid, count: count ?? 5, maxlength } },
      );

      return jsonResult({
        appid,
        news: (data.appnews?.newsitems ?? []).map((item) => ({
          title: item.title,
          author: item.author,
          feed: item.feedlabel,
          date: unixToDate(item.date),
          url: item.url,
          contents: truncate(item.contents, maxlength),
        })),
      });
    },
  );
}

function summarizeAppDetails(app: AppDetails, appid: number) {
  return {
    appid: app.steam_appid ?? appid,
    name: app.name,
    type: app.type,
    short_description: app.short_description,
    developers: app.developers,
    publishers: app.publishers,
    release_date: app.release_date?.date,
    coming_soon: app.release_date?.coming_soon,
    is_free: app.is_free,
    price: app.price_overview?.final_formatted,
    original_price: app.price_overview?.discount_percent ? app.price_overview.initial_formatted : undefined,
    discount_percent: app.price_overview?.discount_percent || undefined,
    genres: app.genres?.map((g) => g.description),
    categories: app.categories?.map((c) => c.description),
    metacritic: app.metacritic?.score,
    metacritic_url: app.metacritic?.url,
    total_reviews: app.recommendations?.total,
    achievement_count: app.achievements?.total,
    platforms: enabledKeys(app.platforms),
    controller_support: app.controller_support,
    required_age: app.required_age || undefined,
    dlc_count: app.dlc?.length || undefined,
    languages: stripHtml(app.supported_languages),
    website: app.website,
    header_image: app.header_image,
    url: `https://store.steampowered.com/app/${app.steam_appid ?? appid}/`,
  };
}

function enabledKeys(flags: Record<string, boolean> | undefined): string[] | undefined {
  if (!flags) return undefined;
  return Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}

function formatCents(cents: number | undefined, currency: string | undefined): string | undefined {
  if (cents === undefined) return undefined;
  if (!cents) return "Free";
  return `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim();
}

function stripHtml(value: string | undefined): string | undefined {
  return value?.replace(/<[^>]*>/g, "").trim();
}
