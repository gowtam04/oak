import { defineConfig } from "drizzle-kit";

// Loaded by the drizzle-kit CLI via its own TS loader, so it must NOT import
// src/env.ts (that would require ANTHROPIC_API_KEY just to generate a
// migration). Read POKEBOT_DB_PATH directly with a sane default.
// dialect: "sqlite" with dbCredentials.url — NO `driver` field (better-sqlite3
// is the default sqlite driver and a `driver` value would change the codepath).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/data/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.POKEBOT_DB_PATH ?? "./data/pokebot.sqlite",
  },
});
