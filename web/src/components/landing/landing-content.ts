/**
 * Below-fold landing copy shown under the empty-state hero on `/` (see
 * `LandingSection.tsx`). Pure data — no React, no hooks, no server/env/db
 * imports — so it stays safe to import from the SSR'd empty-state chat page.
 *
 * This is the site's only crawlable prose beyond the hero `<h1>`, so it
 * doubles as SEO copy: what Oak is, what it can do, and an FAQ block that
 * also backs the FAQPage JSON-LD in `LandingSection.tsx`.
 */

/** "What is Oak?" intro paragraph. */
export const LANDING_INTRO =
  "Oak is a free AI assistant for Pokémon. Ask natural-language questions about " +
  "team building, battle mechanics, stats, and matchups, and get answers built " +
  "on real game data — with reasoning, cited sources, and explicit uncertainty " +
  "flags, not guesses.";

/** "What Oak can do" feature list. */
export const LANDING_FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "Team builder & saved teams",
    body: "Build or import competitive teams with EVs, natures, items, and legality-checked movesets.",
  },
  {
    title: "Damage & stat math",
    body: "Deterministic damage calcs and stat formulas computed from real base stats, not model guesses.",
  },
  {
    title: "Live Champions usage stats",
    body: "Current competitive usage data for the Pokémon Champions format.",
  },
  {
    title: "Six data scopes",
    body: "Pokémon Champions, Scarlet/Violet (Gen 9), and Gens 5–8, switchable per conversation.",
  },
  {
    title: "Voice mode",
    body: "Talk to Oak hands-free with a real-time spoken Pokédex.",
  },
];

/** FAQ entries — rendered as `<details>` and mirrored into FAQPage JSON-LD. */
export const LANDING_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What is Pokémon Champions?",
    a: "Pokémon Champions is the standalone competitive battling game/format. Oak defaults to its current regulation and can scope answers to it.",
  },
  {
    q: "How does Oak calculate damage?",
    a: "Oak uses deterministic in-code formulas over real base stats, types, and items — the model reasons on top of computed numbers, it doesn't estimate them.",
  },
  {
    q: "Which games and generations does Oak support?",
    a: "Pokémon Champions, Scarlet/Violet, and mainline Generations 5 through 8. Generations 1–4 are out of scope, and Oak says so honestly rather than guessing.",
  },
  {
    q: "Is Oak free?",
    a: "Yes — Oak is usable as a guest for free. An optional email sign-in unlocks saved chat history and the team builder.",
  },
  {
    q: "Is Oak official?",
    a: "No. Oak is an independent fan project and is not affiliated with, endorsed by, or sponsored by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.",
  },
];

/** One-line footer disclaimer. */
export const LANDING_DISCLAIMER =
  "An independent fan project — not affiliated with Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.";
