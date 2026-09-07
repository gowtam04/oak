/**
 * Starter prompts for the fresh-session empty state (ChatThread). A large,
 * curated pool spanning *all* of Oak's capabilities so that, across repeated
 * visits, a user discovers the full range of help on offer — filters, learnsets,
 * mechanics reasoning, type matchups, stat/damage math, lookups, ability/item
 * effects, evolution, catch locations, in-game events/progression, glitches,
 * spin-off games like Mystery Dungeon, and competitive Champions content.
 *
 * Phrasing is **mostly mode-agnostic** (valid in both Standard and Champions),
 * plus a handful of Champions-flavored prompts. All prompts avoid out-of-scope
 * topics (franchise MEDIA: anime, movies, TV, manga) so a chip never leads to a
 * dead-end decline.
 *
 * This file is the **only authored pool**. iOS and Android copies are generated:
 *
 *   cd web && npm run sync:starters
 *
 * Empty chat samples one prompt per category (Battle → Dex → Rules → Meta) on
 * the client. Do not fetch this list from an API; the desk must stay instant
 * and offline. `Math.random()` belongs in `pickFiledStarters` only — never at
 * render time (hydration).
 *
 * The "Teams" chips double as discoverability for referring to a saved team by
 * name in chat ("how's my rain team?"): a build chip always produces a team, and
 * "how does my team look?" leads Oak to read the user's saved teams (or, with
 * none / for a guest, offer to build one) — an on-scope reply, never a decline.
 */

/** Filed-starter categories — fixed labels, sync across web/iOS/Android. */
export const STARTER_CATEGORIES = ["Battle", "Dex", "Rules", "Meta"] as const;

export type StarterCategory = (typeof STARTER_CATEGORIES)[number];

/**
 * One filed starter: category stamp + type-dot token + prompt text.
 * `type` is a Pokémon type token matching a `--type-*` CSS variable.
 */
export interface StarterPrompt {
  category: StarterCategory;
  /** Type token for the type-dot (e.g. `"dragon"`). */
  type: string;
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
  { category: "Battle", type: "dragon", text: "Can Dragapult outspeed Flutter Mane with a Choice Scarf?" },
  { category: "Battle", type: "dark", text: "What's the best nature for Kingambit?" },
  { category: "Battle", type: "ground", text: "Does Choice Band Garchomp OHKO Toxapex with Earthquake?" },
  { category: "Battle", type: "fire", text: "Build me a sun team" },
  { category: "Battle", type: "ground", text: "Build me a sand team" },
  { category: "Battle", type: "ice", text: "Build me a snow team" },
  { category: "Battle", type: "normal", text: "How do I build a team from the Pokémon I own?" },
  { category: "Battle", type: "fairy", text: "Best Stat Point spread for Flutter Mane in Champions" },
  { category: "Battle", type: "dragon", text: "Best Stat Point spread for Dragonite in Champions" },
  { category: "Battle", type: "dragon", text: "Was Garchomp good in Gen 4?" },
  { category: "Battle", type: "ground", text: "Was Landorus-Therian good in Gen 5?" },
  { category: "Battle", type: "ghost", text: "Was Mimikyu good in Gen 7?" },
  { category: "Battle", type: "dragon", text: "Was Dragapult good in Gen 8?" },
  { category: "Battle", type: "dragon", text: "How much Speed does Jolly Dragapult have at level 50?" },
  { category: "Battle", type: "poison", text: "What's a bulky HP investment for Toxapex?" },
  { category: "Battle", type: "fire", text: "Can Heatran live a Close Combat from Great Tusk?" },
  { category: "Battle", type: "fighting", text: "What nature should I run on Iron Hands?" },
  { category: "Battle", type: "dark", text: "Build me a hyper offense team" },
  { category: "Battle", type: "steel", text: "Build me a bulky offense team" },
  { category: "Battle", type: "water", text: "Build me a team around Pelipper" },
  { category: "Battle", type: "fire", text: "Build me a team around Torkoal" },
  { category: "Battle", type: "water", text: "How does my rain team look?" },
  { category: "Battle", type: "dark", text: "What beats Kingambit?" },
  { category: "Battle", type: "fairy", text: "What's strong against Flutter Mane?" },
  { category: "Battle", type: "ground", text: "Best counters to Great Tusk" },
  { category: "Battle", type: "water", text: "Can Rapid Strike Urshifu OHKO Incineroar?" },
  { category: "Battle", type: "steel", text: "Does Gholdengo outspeed Amoonguss?" },
  { category: "Battle", type: "rock", text: "How much damage does Salt Cure do to Steel types?" },
  { category: "Battle", type: "dragon", text: "Can a +1 Dragonite Extreme Speed OHKO Flutter Mane?" },
  { category: "Battle", type: "dark", text: "What's the Speed tier for Timid Chi-Yu?" },
  { category: "Battle", type: "flying", text: "Best EV spread for Corviknight in OU" },
  { category: "Battle", type: "fire", text: "Should I run Jolly or Adamant on Mega Charizard X?" },
  { category: "Battle", type: "fighting", text: "Build me a Champions team around Mega Lucario" },
  { category: "Battle", type: "grass", text: "Best Stat Point spread for Rillaboom in Champions" },
  { category: "Battle", type: "steel", text: "Was Aegislash good in Gen 6?" },
  { category: "Battle", type: "electric", text: "Can Pikachu OHKO a 4x weak target with Thunderbolt?" },
  { category: "Battle", type: "poison", text: "What's the best nature for Galarian Slowking?" },
  { category: "Battle", type: "grass", text: "How much HP does Ferrothorn have with max HP EVs?" },
  { category: "Battle", type: "flying", text: "Does Tailwind let my team outspeed Dragapult?" },
  { category: "Battle", type: "psychic", text: "Can Trick Room let Amoonguss move before Flutter Mane?" },
  { category: "Battle", type: "ice", text: "What beats Ice types in Champions?" },
  { category: "Battle", type: "dark", text: "Best counters to Dark types" },
  { category: "Battle", type: "bug", text: "Was Volcarona good in Gen 5?" },
  { category: "Battle", type: "bug", text: "Does Technician Scizor outdamage Choice Band?" },
  { category: "Battle", type: "water", text: "How much Attack does Huge Power Azumarill have?" },
  { category: "Battle", type: "fire", text: "Can Tera Fire Chi-Yu OHKO Assault Vest Toxapex?" },
  { category: "Battle", type: "steel", text: "What's a good spread for Gholdengo in Gen 9 OU?" },
  { category: "Battle", type: "psychic", text: "Build me a doubles team around Indeedee" },
  { category: "Battle", type: "rock", text: "Was Tyranitar good in Gen 2?" },
  { category: "Battle", type: "ghost", text: "Should I Mega evolve Gengar or keep it base?" },

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
  { category: "Dex", type: "grass", text: "Show me Chikorita" },
  { category: "Dex", type: "electric", text: "What are Rotom's forms and their types?" },
  { category: "Dex", type: "bug", text: "How does Wurmple evolve?" },
  { category: "Dex", type: "electric", text: "How do I evolve Pawmo?" },
  { category: "Dex", type: "dark", text: "What's Kingambit's typing?" },
  { category: "Dex", type: "ground", text: "Tell me about Great Tusk" },
  { category: "Dex", type: "water", text: "Combined weight of Wailord and Skitty" },
  { category: "Dex", type: "normal", text: "Which Pokémon has the same National Dex number as its BST?" },
  { category: "Dex", type: "normal", text: "Which Pokémon go from dual type to monotype on evolution?" },
  { category: "Dex", type: "normal", text: "Which Pokémon have a higher catch rate than their pre-evolution?" },
  { category: "Dex", type: "normal", text: "Which Pokémon are based on cats?" },
  { category: "Dex", type: "electric", text: "How many signature moves does Pikachu have?" },
  { category: "Dex", type: "ice", text: "Is there a Fire/Ice type combination?" },
  { category: "Dex", type: "normal", text: "How many Pokémon are in the National Dex?" },
  { category: "Dex", type: "normal", text: "How many unique type combinations are missing?" },
  { category: "Dex", type: "electric", text: "Fastest Electric types" },
  { category: "Dex", type: "water", text: "Heaviest Pokémon" },
  { category: "Dex", type: "steel", text: "Lightest Pokémon" },
  { category: "Dex", type: "normal", text: "Highest base HP" },
  { category: "Dex", type: "electric", text: "Who learns both U-turn and Volt Switch?" },
  { category: "Dex", type: "flying", text: "What can learn Defog?" },
  { category: "Dex", type: "steel", text: "Steel types that learn Recover" },
  { category: "Dex", type: "ghost", text: "Ghost types with Levitate" },
  { category: "Dex", type: "bug", text: "Bug types with base Attack over 120" },
  { category: "Dex", type: "ice", text: "Ice types that can set Aurora Veil" },
  { category: "Dex", type: "fairy", text: "Fairy types with Magic Bounce" },
  { category: "Dex", type: "poison", text: "How do I evolve Hisuian Qwilfish?" },
  { category: "Dex", type: "fighting", text: "What's the average base Attack of Fighting types?" },
  { category: "Dex", type: "dragon", text: "Dragon types immune to Electric" },
  { category: "Dex", type: "dark", text: "Who gets both Rapid Spin and Knock Off?" },
  { category: "Dex", type: "water", text: "Tell me about Walking Wake" },
  { category: "Dex", type: "grass", text: "What types does Ogerpon have?" },
  { category: "Dex", type: "psychic", text: "How does Ralts evolve?" },
  { category: "Dex", type: "rock", text: "Show me Tyranitar" },
  { category: "Dex", type: "fighting", text: "Which Pokémon are exclusive to Scarlet?" },

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
  { category: "Rules", type: "dark", text: "How does Intimidate work in doubles?" },
  { category: "Rules", type: "ground", text: "Does Mold Breaker ignore Levitate?" },
  { category: "Rules", type: "steel", text: "What does Good as Gold do?" },
  { category: "Rules", type: "dark", text: "How does Supreme Overlord work?" },
  { category: "Rules", type: "electric", text: "What does Booster Energy do?" },
  { category: "Rules", type: "normal", text: "How does Terastallization work?" },
  { category: "Rules", type: "fire", text: "How do Z-Moves work in Gen 7?" },
  { category: "Rules", type: "dragon", text: "How does Dynamax work in Sword and Shield?" },
  { category: "Rules", type: "fighting", text: "How does Mega Evolution work in Gen 6?" },
  { category: "Rules", type: "psychic", text: "Does Magic Bounce reflect Stealth Rock?" },
  { category: "Rules", type: "bug", text: "Can Rage Powder redirect a spread move?" },
  { category: "Rules", type: "psychic", text: "How does Psychic Terrain stop priority?" },
  { category: "Rules", type: "normal", text: "What does Choice Scarf do?" },
  { category: "Rules", type: "rock", text: "How does Salt Cure's residual damage work?" },
  { category: "Rules", type: "poison", text: "Does Sheer Force remove Life Orb recoil?" },
  { category: "Rules", type: "poison", text: "How does Neutralizing Gas work?" },
  { category: "Rules", type: "water", text: "Can Unaware ignore Calm Mind boosts?" },
  { category: "Rules", type: "rock", text: "What does Loaded Dice do?" },
  { category: "Rules", type: "normal", text: "How does Parental Bond work?" },
  { category: "Rules", type: "fire", text: "Does Flash Fire absorb Will-O-Wisp?" },
  { category: "Rules", type: "fire", text: "Are Mega Evolutions legal in Champions?" },
  { category: "Rules", type: "fairy", text: "Is Zacian legal in Champions?" },
  { category: "Rules", type: "dragon", text: "Is Mega Rayquaza legal in Champions?" },
  { category: "Rules", type: "normal", text: "How do IVs work in Gen 3?" },
  { category: "Rules", type: "psychic", text: "Did Gen 1 have a Special Defense stat?" },
  { category: "Rules", type: "fighting", text: "How do Stat Points work in Champions?" },
  { category: "Rules", type: "flying", text: "How does the Old Man glitch work in Red?" },
  { category: "Rules", type: "normal", text: "What's the cloning glitch in Gold and Silver?" },
  { category: "Rules", type: "grass", text: "How does the Pomeg glitch work in Emerald?" },
  { category: "Rules", type: "ghost", text: "What is tweaking in Diamond and Pearl?" },
  { category: "Rules", type: "steel", text: "How does the Coin Case glitch work in Gen 2?" },
  { category: "Rules", type: "grass", text: "What's the Berry glitch in Ruby and Sapphire?" },
  { category: "Rules", type: "water", text: "Where do I get HM Surf in Pokémon Red?" },
  { category: "Rules", type: "fighting", text: "Where do I get HM Strength in Emerald?" },
  { category: "Rules", type: "water", text: "Where do I get Waterfall in Platinum?" },
  { category: "Rules", type: "grass", text: "Where do I get HM Cut in Gold?" },
  { category: "Rules", type: "electric", text: "How do I catch a roaming Raikou in Gen 2?" },
  { category: "Rules", type: "normal", text: "How does the Safari Zone work in Fuchsia?" },
  { category: "Rules", type: "fairy", text: "How do Friend Safaris work in X and Y?" },
  { category: "Rules", type: "water", text: "How does SOS chaining work in Sun and Moon?" },
  { category: "Rules", type: "ice", text: "How do I catch Articuno in Yellow?" },
  { category: "Rules", type: "dark", text: "How do Hidden Grottos work in Black 2?" },
  { category: "Rules", type: "dragon", text: "How do I recruit legendaries in Rescue Team?" },
  { category: "Rules", type: "fairy", text: "What does a Friend Bow do in Mystery Dungeon?" },
  { category: "Rules", type: "psychic", text: "How do IQ skills work in Explorers of Sky?" },

  // Meta — usage / role / format niche
  { category: "Meta", type: "steel", text: "What is Gholdengo's role in Champions?" },
  { category: "Meta", type: "water", text: "Who has the highest usage in Champions right now?" },
  { category: "Meta", type: "fire", text: "How many gym leaders are Fire type?" },
  { category: "Meta", type: "normal", text: "Who leads the guild in Pokémon Mystery Dungeon Explorers?" },
  { category: "Meta", type: "normal", text: "What are the most populous cities in the mainline games?" },
  { category: "Meta", type: "dark", text: "What's Incineroar's usage in Champions right now?" },
  { category: "Meta", type: "fire", text: "Who is the most used Mega in Champions?" },
  { category: "Meta", type: "fairy", text: "What moves is Flutter Mane running in Champions?" },
  { category: "Meta", type: "grass", text: "What's Rillaboom's role in Champions?" },
  { category: "Meta", type: "fighting", text: "How common is Urshifu in Champions?" },
  { category: "Meta", type: "dark", text: "Who partners with Incineroar in Champions?" },
  { category: "Meta", type: "ground", text: "What's Landorus's role in Champions?" },
  { category: "Meta", type: "grass", text: "What's Amoonguss's usage in Champions?" },
  { category: "Meta", type: "water", text: "Most used Water type in Champions" },
  { category: "Meta", type: "dragon", text: "What's Dragonite's role in Champions?" },
  { category: "Meta", type: "electric", text: "Who is the top restricted Pokémon in Champions?" },
  { category: "Meta", type: "fairy", text: "What item does Flutter Mane usually hold in Champions?" },
  { category: "Meta", type: "ground", text: "What's the highest usage in Smogon Gen 9 OU?" },
  { category: "Meta", type: "dark", text: "What does Kingambit run in OU?" },
  { category: "Meta", type: "ground", text: "What's Great Tusk's usage on the Smogon ladder?" },
  { category: "Meta", type: "steel", text: "What items does Gholdengo run in Gen 9 OU?" },
  { category: "Meta", type: "dark", text: "Who are Kingambit's checks in OU?" },
  { category: "Meta", type: "fighting", text: "Common teammates for Great Tusk in OU" },
  { category: "Meta", type: "dragon", text: "What's Dragapult's role in Smogon OU?" },
  { category: "Meta", type: "water", text: "Is Palafin used in Gen 9 OU?" },
  { category: "Meta", type: "rock", text: "Who's the top hazards setter in Gen 9 OU?" },
  { category: "Meta", type: "ground", text: "What EV spread does Great Tusk run in OU?" },
  { category: "Meta", type: "ice", text: "Is Baxcalibur used in Smogon OU?" },
  { category: "Meta", type: "steel", text: "What's the usage trend for Gholdengo in OU?" },
  { category: "Meta", type: "poison", text: "What's Galarian Slowking's role in OU?" },
  { category: "Meta", type: "bug", text: "Is Volcarona used in Gen 9 OU?" },
  { category: "Meta", type: "rock", text: "Who is the first gym leader in Kanto?" },
  { category: "Meta", type: "normal", text: "What type is Whitney's gym in Johto?" },
  { category: "Meta", type: "water", text: "Who is the Water gym leader in Hoenn?" },
  { category: "Meta", type: "electric", text: "What's Volkner's type in Sinnoh?" },
  { category: "Meta", type: "dragon", text: "Who is the Dragon gym leader in Unova?" },
  { category: "Meta", type: "fighting", text: "What type is Korrina's gym in Kalos?" },
  { category: "Meta", type: "grass", text: "Who is the first gym leader in Galar?" },
  { category: "Meta", type: "ghost", text: "Who is Paldea's Ghost gym leader?" },
  { category: "Meta", type: "water", text: "How many gym leaders are Water type?" },
  { category: "Meta", type: "ice", text: "Who is the Ice Elite Four member in Kanto?" },
  { category: "Meta", type: "dragon", text: "Who is the champion in Pokémon Platinum?" },
  { category: "Meta", type: "bug", text: "Who is the champion in Pokémon Black and White?" },
  { category: "Meta", type: "ghost", text: "Who is the Ghost Elite Four in Hoenn?" },
  { category: "Meta", type: "electric", text: "Who is Lt. Surge?" },
  { category: "Meta", type: "steel", text: "Who is the champion in Ruby?" },
  { category: "Meta", type: "fairy", text: "Who is the Fairy gym leader in Galar?" },
  { category: "Meta", type: "grass", text: "What's the starting town in Pokémon Gold?" },
  { category: "Meta", type: "rock", text: "Where is the Pokémon League in Kanto?" },
  { category: "Meta", type: "steel", text: "Where is the Battle Frontier in Emerald?" },
  { category: "Meta", type: "electric", text: "What's the city with the Magnet Train?" },
  { category: "Meta", type: "fire", text: "Where is the Pokémon Mansion in Gen 1?" },
  { category: "Meta", type: "grass", text: "What's the starting town in Scarlet and Violet?" },
  { category: "Meta", type: "water", text: "Where is Treasure Town in Explorers of Sky?" },
  { category: "Meta", type: "normal", text: "Who runs the Kecleon shop in Mystery Dungeon?" },
  { category: "Meta", type: "psychic", text: "What is Temporal Tower in Explorers of Sky?" },
  { category: "Meta", type: "poison", text: "Who is on Team Skull in Explorers of Sky?" },
  { category: "Meta", type: "fighting", text: "Where can I recruit Riolu in Explorers of Sky?" },
  { category: "Meta", type: "flying", text: "Who is the Guild assistant in Explorers of Sky?" },
  { category: "Meta", type: "ghost", text: "Who is Dusknoir in Explorers of Sky?" },
];

/** Flat prompt strings — derived from {@link STARTER_ENTRIES}. */
export const STARTER_PROMPTS: string[] = STARTER_ENTRIES.map((e) => e.text);

function firstOfCategory(category: StarterCategory): StarterPrompt {
  const entry = STARTER_ENTRIES.find((e) => e.category === category);
  if (!entry) {
    throw new Error(`STARTER_ENTRIES has no ${category} prompt`);
  }
  return entry;
}

function bucket(category: StarterCategory): StarterPrompt[] {
  const entries = STARTER_ENTRIES.filter((e) => e.category === category);
  if (entries.length === 0) {
    throw new Error(`STARTER_ENTRIES has no ${category} prompt`);
  }
  return entries;
}

/**
 * Deterministic one-per-category slice (first entry of each category in file
 * order). Safe for SSR / the first client paint — no `Math.random()`.
 */
export function firstFiledStarters(): StarterPrompt[] {
  return STARTER_CATEGORIES.map(firstOfCategory);
}

/**
 * One random starter per category, in Battle → Dex → Rules → Meta order.
 * Client-side only (`Math.random()`): call from `useEffect` / `onAppear`,
 * never during render.
 */
export function pickFiledStarters(): StarterPrompt[] {
  return STARTER_CATEGORIES.map((category) => {
    const entries = bucket(category);
    return entries[Math.floor(Math.random() * entries.length)]!;
  });
}
