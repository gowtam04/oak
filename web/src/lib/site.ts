/**
 * Site-identity constants — the single source of truth for Oak's canonical
 * host, name, and default title/description used across metadata routes,
 * layouts, and structured data.
 *
 * Pure module (no `@/env`, no `server-only`): safe to import from
 * `middleware.ts`, App Router metadata exports (evaluated at build time),
 * and any server or client component.
 */

export const CANONICAL_HOST = "oak.gowtam.ai";
export const SITE_ORIGIN = `https://${CANONICAL_HOST}`;
export const SITE_NAME = "Oak";
export const SITE_TITLE =
  "Oak — AI Pokémon Team Builder, Damage Calcs & Pokédex";
export const SITE_DESCRIPTION =
  "Ask anything about Pokémon — competitive team building, damage calcs, stat math, usage stats, and Pokédex lookups, with reasoning and cited sources.";

/**
 * WebApplication JSON-LD, serialized once here so both the root layout and
 * its test can consume the exact same string. `<` is escaped so the payload
 * is safe inside a `<script type="application/ld+json">` tag even if a field
 * ever contains user-influenced text.
 */
export const WEB_APP_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_ORIGIN,
  description: SITE_DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
}).replace(/</g, "\\u003c");
