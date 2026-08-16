#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAchievementTools } from "./tools/achievements.js";
import { registerAppTools } from "./tools/apps.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerUserTools } from "./tools/users.js";
import { registerWishlistTools } from "./tools/wishlist.js";

const INSTRUCTIONS = `This server provides access to Steam (game library, achievements, store, wishlist).

Tools that take an \`appid\` need a numeric Steam app ID. When the user names a game instead, call \`search_store\` first to resolve the name to an app ID.

Tools that take a \`steam_id\` accept a SteamID64, a vanity name, or a profile URL, and fall back to the configured default account when omitted — so "my library" needs no argument.

Most account-scoped data depends on the target profile being public. A 401/403 or an empty result usually means private privacy settings rather than a broken request.

\`add_to_wishlist\` and \`remove_from_wishlist\` modify the configured account's real wishlist. Confirm with the user before calling them.`;

async function main() {
  const server = new McpServer(
    {
      name: "steam-mcp",
      version: "0.1.0",
    },
    {
      instructions: INSTRUCTIONS,
    },
  );

  registerUserTools(server);
  registerLibraryTools(server);
  registerAchievementTools(server);
  registerAppTools(server);
  registerWishlistTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("steam-mcp failed to start:", err);
  process.exit(1);
});
