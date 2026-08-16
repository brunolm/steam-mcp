import { config } from "../config.js";
import { steamApi } from "./client.js";

export interface StoreItem {
  id: number;
  appid?: number;
  name?: string;
  success?: number;
  visible?: boolean;
  store_url_path?: string;
  is_free?: boolean;
  basic_info?: {
    short_description?: string;
    developers?: { name: string }[];
    publishers?: { name: string }[];
  };
  release?: { steam_release_date?: number; is_coming_soon?: boolean };
  best_purchase_option?: {
    formatted_final_price?: string;
    formatted_original_price?: string;
    discount_pct?: number;
  };
}

interface GetItemsResponse {
  response?: { store_items?: StoreItem[] };
}

/** Steam rejects oversized batches, and 50 keeps each request comfortably under that. */
const BATCH_SIZE = 50;

/** Batch app lookup. Unlike the store's appdetails endpoint, this accepts many appids per request. */
export async function fetchStoreItems(appids: number[]): Promise<Map<number, StoreItem>> {
  const items = new Map<number, StoreItem>();
  if (!appids.length) return items;

  for (let i = 0; i < appids.length; i += BATCH_SIZE) {
    const batch = appids.slice(i, i + BATCH_SIZE);
    const data = await steamApi<GetItemsResponse>("/IStoreBrowseService/GetItems/v1/", {
      input: {
        ids: batch.map((appid) => ({ appid })),
        context: {
          language: config.language,
          country_code: config.countryCode,
          steam_realm: 1,
        },
        data_request: { include_basic_info: true, include_release: true },
      },
    });

    for (const item of data.response?.store_items ?? []) {
      const appid = item.appid ?? item.id;
      if (appid) items.set(appid, item);
    }
  }

  return items;
}

export function summarizeStoreItem(item: StoreItem | undefined) {
  if (!item) return undefined;

  const price = item.best_purchase_option;
  return {
    name: item.name,
    short_description: item.basic_info?.short_description,
    developers: item.basic_info?.developers?.map((d) => d.name),
    publishers: item.basic_info?.publishers?.map((p) => p.name),
    release_date: item.release?.steam_release_date
      ? new Date(item.release.steam_release_date * 1000).toISOString().slice(0, 10)
      : undefined,
    coming_soon: item.release?.is_coming_soon,
    is_free: item.is_free,
    price: price?.formatted_final_price,
    original_price: price?.discount_pct ? price.formatted_original_price : undefined,
    discount_percent: price?.discount_pct || undefined,
    url: item.store_url_path ? `https://store.steampowered.com/${item.store_url_path}` : undefined,
  };
}
