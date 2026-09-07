/**
 * Below-fold landing copy shown under the empty-state hero on `/` (see
 * `LandingSection.tsx`). Pure data — no React, no hooks, no server/env/db
 * imports — so it stays safe to import from the SSR'd empty-state chat page.
 *
 * This is the site's only crawlable prose beyond the hero `<h1>`, so it
 * doubles as SEO copy: Oak is a Pokémon Champions coach (CF-UI-BR-1,
 * CF-UI-BR-3, CF-INT-BR-10).
 */

/** "What is Oak?" intro paragraph. */
export const LANDING_INTRO =
  "Oak is a free AI coach for Pokémon Champions. Ask natural-language questions " +
  "about team building, battle mechanics, stats, and live usage, and get answers " +
  "built on real Champions data — with reasoning, cited sources, and explicit " +
  "uncertainty flags, not guesses.";

/** "What Oak can do" feature list. */
export const LANDING_FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "Team builder & saved teams",
    body: "Build or import competitive Champions teams with Stat Points, natures, items, and legality-checked movesets.",
  },
  {
    title: "Damage & stat math",
    body: "Deterministic damage calcs and stat formulas computed from real base stats, not model guesses.",
  },
  {
    title: "Live Champions usage stats",
    body: "Current competitive usage data for Pokémon Champions, for the regulation Oak is coaching.",
  },
  {
    title: "Current regulation",
    body: "Answers, teams, and usage are for the current Pokémon Champions regulation — Oak covers that game only.",
  },
  {
    title: "Voice mode",
    body: "Talk to Oak hands-free as a real-time spoken Champions coach.",
  },
];

/** FAQ entries — rendered as `<details>` and mirrored into FAQPage JSON-LD. */
export const LANDING_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What is Pokémon Champions?",
    a: "Pokémon Champions is the standalone competitive battling game. Oak is a coach for its current regulation only — teams, calcs, the Champions roster, and live usage.",
  },
  {
    q: "How does Oak calculate damage?",
    a: "Oak uses deterministic in-code formulas over real base stats, types, and items — the model reasons on top of computed numbers, it doesn't estimate them.",
  },
  {
    q: "Does Oak cover other Pokémon games?",
    a: "No. Oak covers Pokémon Champions only. Questions about other games are declined rather than answered from another title's data.",
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
