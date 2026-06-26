import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native CommonJS module; keep it out of the server
  // bundle so Next does not try to trace/bundle the .node binary. Must be
  // TOP-LEVEL (not under experimental.*) on Next 15.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
