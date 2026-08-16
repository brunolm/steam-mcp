# steam-mcp

MCP server for the [Steam Web API](https://steamapi.xpaw.me/). Exposes your game library, playtime, achievements, friends, wishlist, and the Steam store to MCP clients (Claude Code, Claude Desktop, etc.) over stdio.

## Prerequisites

- [mise](https://mise.jdx.dev/) (manages node + bun versions via `.mise.toml`)
- A Steam Web API key — [get it here](https://steamcommunity.com/dev/apikey)

## Setup

```powershell
mise install
bun install
Copy-Item .env.example .env
# edit .env and set STEAM_API_KEY + STEAM_DEFAULT_STEAM_ID
```

## Run

```powershell
bun run dev      # watch mode
bun run start    # one-shot
```

## Hook into Claude Code

```sh
claude mcp add steam --scope user -- bun run "$(pwd)/src/index.ts"
```

Or add it to your MCP config directly:

```json
{
  "mcpServers": {
    "steam": {
      "command": "bun",
      "args": ["run", "<path-to-steam-mcp>/src/index.ts"]
    }
  }
}
```

The `.env` file in the project root is loaded automatically.

## Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `STEAM_API_KEY` | For account data | Everything account-scoped: library, achievements, friends, vanity URL resolution. Sent as the `x-webapi-key` header so it never appears in a URL. |
| `STEAM_DEFAULT_STEAM_ID` | Recommended | Your SteamID64, used whenever a tool omits `steam_id`. [Find it here](https://steamdb.info/calculator/). |
| `STEAM_ACCESS_TOKEN` | Wishlist writes only | User access token for `add_to_wishlist` / `remove_from_wishlist`. |
| `STEAM_COUNTRY_CODE` | No | Store region for prices. Defaults to `US`. |
| `STEAM_LANGUAGE` | No | Language for store text and achievement names. Defaults to `english`. |

Store search, app details, reviews, player counts, news, and global achievement percentages work with **no key at all**.

### Getting an access token

Wishlist writes are not covered by API keys — Steam requires a user access token instead. Log into Steam in a browser, open
[store.steampowered.com/pointssummary/ajaxgetasyncconfig](https://store.steampowered.com/pointssummary/ajaxgetasyncconfig),
and copy the `webapi_token` value into `STEAM_ACCESS_TOKEN`. **It expires roughly every 24 hours**, so it needs periodic refreshing.

## Tools exposed

| Area | Tools |
|------|-------|
| Users | `get_player_summary`, `resolve_vanity_url`, `get_friend_list`, `get_player_bans`, `get_user_groups` |
| Library | `get_owned_games`, `get_recently_played_games`, `get_steam_level`, `get_badges` |
| Achievements | `get_player_achievements`, `get_global_achievement_percentages`, `get_game_schema`, `get_user_stats_for_game` |
| Store & apps | `search_store`, `get_app_details`, `get_app_reviews`, `get_current_players`, `get_news_for_app` |
| Wishlist | `get_wishlist`, `get_wishlist_item_count`, `add_to_wishlist`, `remove_from_wishlist` |

### Conventions

- **`steam_id` accepts anything.** A SteamID64, a vanity name (`gaben`), or a full profile URL — all resolve to the same account, and resolutions are cached. Omit it entirely to use `STEAM_DEFAULT_STEAM_ID`.
- **`appid` is numeric.** When you only know a game's name, `search_store` resolves it to an app ID first.
- **Responses are trimmed.** Libraries, wishlists, achievements, and news are sorted, summarized, and capped by a `limit` so a 2,000-game library doesn't flood the context. `get_app_details` returns a compact projection unless you pass `full: true`.

## Privacy and rate limits

Most account-scoped endpoints require the target profile to be public — a private "game details" setting makes `get_owned_games` and `get_player_achievements` fail or return nothing, even for your own account with a valid key. Steam applies undocumented per-method rate limits and answers with HTTP 429 when you cross one.

## API references

- Endpoint reference: https://steamapi.xpaw.me/
- Steamworks Web API overview: https://partner.steamgames.com/doc/webapi_overview
- EResult codes: https://steamerrors.com/

`search_store`, `get_app_details`, and `get_app_reviews` use the store's public JSON endpoints, which Valve does not formally document and may change without notice.
