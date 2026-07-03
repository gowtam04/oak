import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/site";

// `generateSitemaps()` in `sitemap.ts` emits shards (0–4) but no sitemap
// index file, so every shard URL must be listed here individually.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin"],
      },
    ],
    sitemap: [
      `${SITE_ORIGIN}/sitemap/0.xml`,
      `${SITE_ORIGIN}/sitemap/1.xml`,
      `${SITE_ORIGIN}/sitemap/2.xml`,
      `${SITE_ORIGIN}/sitemap/3.xml`,
      `${SITE_ORIGIN}/sitemap/4.xml`,
    ],
  };
}
