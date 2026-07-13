/**
 * Starter prompts for the fresh-session empty state (ChatThread). A large,
 * curated pool spanning *all* of Oak's capabilities so that, across repeated
 * visits, a user discovers the full range of help on offer — filters, learnsets,
 * mechanics reasoning, type matchups, stat/damage math, lookups, ability/item
 * effects, evolution, catch locations, in-game events/progression, glitches,
 * spin-off games like Mystery Dungeon, and competitive Champions content.
 *
 * Phrasing is **mostly mode-agnostic** (valid in both Standard and Champions),
 * plus a handful of Champions-flavored prompts — Champions is Oak's default
 * scope, so the empty state should reflect that. All prompts avoid out-of-scope
 * topics (franchise MEDIA: anime, movies, TV, manga) so a chip never leads to a
 * dead-end decline. Drawn from the eval golden cases and benchmark questions.
 *
 * Specimen-desk filed starters carry a **category** (Battle / Dex / Rules / Meta
 * — soul.md starter table, synced across clients) and an optional **type** token
 * for the type-dot. The flat string array remains available for older call sites
 * and cross-platform parity mirrors of prompt text only.
 *
 * The "Teams" chips double as discoverability for referring to a saved team by
 * name in chat ("how's my rain team?"): a build chip always produces a team, and
 * "how does my team look?" leads Oak to read the user's saved teams (or, with
 * none / for a guest, offer to build one) — an on-scope reply, never a decline.
 *
 * This pool is the single canonical source — iOS
 * (`ios/OakApp/Features/Chat/ExamplePrompts.swift`) and Android
 * (`android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ExamplePrompts.kt`)
 * each mirror it (same entries, same order) since there is no shared package
 * between the three clients. Keep all three in sync when editing.
 */

/** soul.md starter categories — use these four labels everywhere. */
export type StarterCategory = "Battle" | "Dex" | "Rules" | "Meta";

/**
 * One filed starter: category stamp + optional type-dot + prompt text.
 * `type` is a Pokémon type token matching a `--type-*` CSS variable.
 */
export interface StarterPrompt {
  category: StarterCategory;
  /** Type token for the type-dot (e.g. `"dragon"`); omit for a neutral row. */
  type?: string;
  text: string;
}

export const STARTER_ENTRIES: StarterPrompt[] = [
  // Battle — competitive / nature / damage
  { category: "Battle", type: "dragon", text: "What's Garchomp's best nature for Speed?" },
  { category: "Battle", type: "fighting", text: "Can Garchomp OHKO Gholdengo with Earthquake?" },
  { category: "Battle", type: "fire", text: "Garchomp's Speed at level 50 with max Speed and Jolly" },
  { category: "Battle", type: "water", text: "Build me a rain team" },
  { category: "Battle", type: "psychic", text: "Build me a Trick Room team" },
  { category: "Battle", type: "fighting", text: "How does my team look?" },
  { category: "Battle", type: "water", text: "Build me a Champions team around Mega Swampert" },
  { category: "Battle", type: "dark", text: "Best Stat Point spread for Incineroar in Champions" },
  { category: "Battle", type: "dragon", text: "Was Excadrill good in Gen 5?" },
  { category: "Battle", type: "steel", text: "Best Steel types in Gen 7?" },
  { category: "Battle", type: "fire", text: "Damage from a 120 BP STAB super-effective hit vs 95 Defense" },
  { category: "Battle", type: "water", text: "How much HP does a fully invested Blissey have?" },
  { category: "Battle", type: "dragon", text: "What's strong against Dragapult?" },
  { category: "Battle", type: "fairy", text: "Best counters to Fairy types" },
  { category: "Battle", type: "water", text: "What beats Water types?" },
  { category: "Battle", type: "steel", text: "What is Gholdengo weak to?" },

  // Dex — species / typing / immunity lists
  { category: "Dex", type: "ground", text: "Which Pokémon are immune to Ground?" },
  { category: "Dex", type: "dragon", text: "Show me Garchomp" },
  { category: "Dex", type: "dragon", text: "What are Dragapult's abilities?" },
  { category: "Dex", type: "fighting", text: "Tell me about Iron Valiant" },
  { category: "Dex", type: "steel", text: "Gholdengo's stats and typing" },
  { category: "Dex", type: "normal", text: "How does Eevee evolve?" },
  { category: "Dex", type: "normal", text: "What forms does Tauros have?" },
  { category: "Dex", type: "grass", text: "How do I evolve Applin?" },
  { category: "Dex", type: "flying", text: "Is Ground super effective against Flying?" },
  { category: "Dex", type: "ghost", text: "Pokémon that learn Trick Room and Will-O-Wisp" },
  { category: "Dex", type: "ground", text: "What can learn Spikes?" },
  { category: "Dex", type: "rock", text: "Who gets both Stealth Rock and Recover?" },
  { category: "Dex", type: "dark", text: "Pokémon that learn Knock Off and Roost" },
  { category: "Dex", type: "fire", text: "Fastest Fire types" },
  { category: "Dex", type: "fire", text: "Fire types that learn Will-O-Wisp with Flash Fire" },
  { category: "Dex", type: "dragon", text: "Dragon types with base Speed over 100" },
  { category: "Dex", type: "water", text: "Bulkiest Water types" },
  { category: "Dex", type: "steel", text: "Steel types that can set Stealth Rock" },
  { category: "Dex", type: "electric", text: "Fastest Pokémon in the game" },
  { category: "Dex", type: "normal", text: "Highest base stat total" },
  { category: "Dex", type: "fighting", text: "Pokémon with base Attack over 130" },
  { category: "Dex", type: "ghost", text: "How do I evolve Gimmighoul?" },
  { category: "Dex", type: "steel", text: "Did Garchomp get Scale Shot in Gen 8?" },
  { category: "Dex", type: "ghost", text: "What could Aegislash learn in Gen 6?" },
  { category: "Dex", type: "electric", text: "What's the average base Speed of Electric types?" },
  { category: "Dex", type: "normal", text: "Which type combination has the most Pokémon?" },
  { category: "Dex", type: "flying", text: "Name all the Route 1 birds" },
  { category: "Dex", type: "poison", text: "How many Pokémon are purple?" },
  { category: "Dex", type: "normal", text: "Which Pokémon are exclusive to Violet?" },

  // Rules — mechanics / abilities / gen rules
  { category: "Rules", type: "ghost", text: "Does Prankster work on Dark types?" },
  { category: "Rules", type: "normal", text: "Does Fake Out work on Farigiraf?" },
  { category: "Rules", type: "ground", text: "Does Earthquake hit everyone in doubles?" },
  { category: "Rules", type: "normal", text: "How does Fake Out's priority work?" },
  { category: "Rules", type: "normal", text: "What does Leftovers do?" },
  { category: "Rules", type: "psychic", text: "What does Armor Tail do?" },
  { category: "Rules", type: "grass", text: "What does Protosynthesis do?" },
  { category: "Rules", type: "normal", text: "What item does Snorlax hold in the wild?" },
  { category: "Rules", type: "electric", text: "Can Levitate dodge Earthquake?" },
  { category: "Rules", type: "dragon", text: "Is Dragapult legal in Champions?" },
  { category: "Rules", type: "normal", text: "How does the Physical/Special split work?" },
  { category: "Rules", type: "normal", text: "How does the MissingNo glitch work?" },
  { category: "Rules", type: "psychic", text: "What is the Mew glitch in Red and Blue?" },
  { category: "Rules", type: "normal", text: "Do encounter rates change by time of day?" },
  { category: "Rules", type: "flying", text: "Where do I get HM Fly in HeartGold?" },
  { category: "Rules", type: "water", text: "What's the best strategy to catch Feebas in Gen 3?" },
  { category: "Rules", type: "normal", text: "How do I get the Shiny Charm in Scarlet and Violet?" },
  { category: "Rules", type: "normal", text: "How does recruiting work in Pokémon Mystery Dungeon?" },
  { category: "Rules", type: "grass", text: "What starters can you play as in Mystery Dungeon: Explorers of Sky?" },

  // Meta — usage / role / format niche
  { category: "Meta", type: "steel", text: "What is Gholdengo's role in Champions?" },
  { category: "Meta", type: "water", text: "Who has the highest usage in Champions right now?" },
  { category: "Meta", type: "fire", text: "How many gym leaders are Fire type?" },
  { category: "Meta", type: "normal", text: "Who leads the guild in Pokémon Mystery Dungeon Explorers?" },
  { category: "Meta", type: "normal", text: "What are the most populous cities in the mainline games?" },
];

/** Flat prompt strings — derived from {@link STARTER_ENTRIES} for parity mirrors. */
export const STARTER_PROMPTS: string[] = STARTER_ENTRIES.map((e) => e.text);

/**
 * Sample `count` distinct prompts from {@link STARTER_PROMPTS} at random, via a
 * partial Fisher–Yates shuffle (sampling without replacement). Uses
 * `Math.random()`, so call it **client-side only** (e.g. inside a `useEffect`)
 * to keep server/client renders byte-stable and avoid a hydration mismatch.
 */
export function pickRandomPrompts(count = 4): string[] {
  return pickRandomStarters(count).map((e) => e.text);
}

/**
 * Sample `count` distinct filed starters from {@link STARTER_ENTRIES}. Same
 * client-only random rules as {@link pickRandomPrompts}.
 */
export function pickRandomStarters(count = 4): StarterPrompt[] {
  const pool = [...STARTER_ENTRIES];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
