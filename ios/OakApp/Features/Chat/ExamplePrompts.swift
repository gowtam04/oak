/// Starter prompts for the fresh-thread empty state (``ChatView``'s blank specimen
/// plate). A large, curated pool spanning *all* of Oak's capabilities so that,
/// across repeated visits, a user discovers the full range of help on offer —
/// filters, learnsets, mechanics reasoning, type matchups, stat/damage math,
/// lookups, ability/item effects, evolution, catch locations, in-game
/// events/progression, glitches, spin-off games like Mystery Dungeon, and
/// competitive Champions content.
///
/// Phrasing is **mostly mode-agnostic** (valid in both Standard and Champions), plus
/// a handful of Champions-flavored prompts — Champions is Oak's default scope, so the
/// empty state should reflect that. All prompts avoid out-of-scope topics (franchise
/// MEDIA: anime, movies, TV, manga) so a chip never leads to a dead-end decline.
///
/// **`web/src/lib/example-prompts.ts`'s `STARTER_PROMPTS` is the canonical pool** —
/// this is a mirrored port (this repo's established parity pattern: the mobile apps
/// are structural ports of the portable web modules; there is no shared package).
/// Keep this array, in this order, in sync with the web file. Android mirrors it too,
/// at `android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ExamplePrompts.kt`.
///
/// **Filed starters** (soul.md empty desk) are a separate, category-tagged set —
/// Battle / Dex / Rules / Meta with a type-dot — shown on the blank specimen plate
/// instead of four equal beige pills.
enum ExamplePrompts {
  // MARK: Filed starters (soul.md — Battle / Dex / Rules / Meta)

  /// One filed starter on the empty desk: category label, type-dot (Pokémon type
  /// slug for `Theme.type`), and the prompt text sent on tap.
  struct FiledStarter: Hashable, Identifiable {
    /// The four starter categories — keep labels in sync with soul.md / web / Android.
    enum Category: String, CaseIterable, Hashable {
      case battle = "Battle"
      case dex = "Dex"
      case rules = "Rules"
      case meta = "Meta"
    }

    var id: String { "\(category.rawValue)|\(prompt)" }
    let category: Category
    /// Pokémon type slug driving the colored type-dot (e.g. `"dragon"`).
    let typeDot: String
    let prompt: String
  }

  /// Curated filed-starter pool, one or more per category. `pickFiledStarters()`
  /// returns exactly one random entry per category (four rows, fixed category order).
  /// Type-dots match soul.md examples (Battle→dragon/fighting, Dex→ground/normal,
  /// Rules→ghost/dark, Meta→steel/water).
  static let filedPool: [FiledStarter] = [
    // Battle — competitive / nature / damage
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "What's Garchomp's best nature for Speed?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fighting",
      prompt: "Can Garchomp OHKO Gholdengo with Earthquake?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "Garchomp's Speed at level 50 with max Speed and Jolly"
    ),
    // Dex — species / typing / immunity lists
    FiledStarter(
      category: .dex, typeDot: "ground",
      prompt: "Which Pokémon are immune to Ground?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Show me Garchomp"
    ),
    FiledStarter(
      category: .dex, typeDot: "ground",
      prompt: "What is Gholdengo weak to?"
    ),
    // Rules — mechanics / abilities / gen rules
    FiledStarter(
      category: .rules, typeDot: "ghost",
      prompt: "Does Prankster work on Dark types?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dark",
      prompt: "Does Fake Out work on Farigiraf?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ghost",
      prompt: "How does Fake Out's priority work?"
    ),
    // Meta — usage / role / format niche
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "What is Gholdengo's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Who has the highest usage in Champions right now?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "Is Dragapult legal in Champions?"
    ),
  ]

  /// One random starter per category, in soul.md order (Battle → Dex → Rules → Meta).
  static func pickFiledStarters() -> [FiledStarter] {
    FiledStarter.Category.allCases.compactMap { category in
      filedPool.filter { $0.category == category }.randomElement()
    }
  }

  // MARK: Legacy flat pool (parity with web STARTER_PROMPTS)

  static let pool: [String] = [
    // Lookups / profiles
    "Show me Garchomp",
    "What are Dragapult's abilities?",
    "Tell me about Iron Valiant",
    "Gholdengo's stats and typing",
    // Evolution / forms
    "How does Eevee evolve?",
    "What forms does Tauros have?",
    "How do I evolve Applin?",
    // Type matchups
    "What's strong against Dragapult?",
    "What beats Water types?",
    "Is Ground super effective against Flying?",
    "What is Gholdengo weak to?",
    "Best counters to Fairy types",
    // Learnset filters
    "Pokémon that learn Trick Room and Will-O-Wisp",
    "What can learn Spikes?",
    "Who gets both Stealth Rock and Recover?",
    "Pokémon that learn Knock Off and Roost",
    // Compound team-building filters
    "Fastest Fire types",
    "Fire types that learn Will-O-Wisp with Flash Fire",
    "Dragon types with base Speed over 100",
    "Bulkiest Water types",
    "Steel types that can set Stealth Rock",
    // Superlatives
    "Fastest Pokémon in the game",
    "Highest base stat total",
    "Pokémon with base Attack over 130",
    // Move mechanics
    "Does Fake Out work on Farigiraf?",
    "Does Earthquake hit everyone in doubles?",
    "Does Prankster work on Dark types?",
    "How does Fake Out's priority work?",
    // Ability / item effects
    "What does Leftovers do?",
    "What does Armor Tail do?",
    "What does Protosynthesis do?",
    "What item does Snorlax hold in the wild?",
    // Stat math
    "Garchomp's Speed at level 50 with max Speed and Jolly",
    "How much HP does a fully invested Blissey have?",
    // Damage calc
    "Can Garchomp OHKO Gholdengo with Earthquake?",
    "Damage from a 120 BP STAB super-effective hit vs 95 Defense",
    // Conditional inference
    "Can Levitate dodge Earthquake?",
    "Which Pokémon are immune to Ground?",
    // Teams (build, or ask Oak about a saved team by name)
    "Build me a rain team",
    "Build me a Trick Room team",
    "How does my team look?",
    // Champions
    "Build me a Champions team around Mega Swampert",
    "Best Stat Point spread for Incineroar in Champions",
    "Who has the highest usage in Champions right now?",
    "Is Dragapult legal in Champions?",
    // Whole-games (oak-v2): locations, progression, glitches, spin-offs
    "Where do I get HM Fly in HeartGold?",
    "What's the best strategy to catch Feebas in Gen 3?",
    "How many gym leaders are Fire type?",
    "Who leads the guild in Pokémon Mystery Dungeon Explorers?",
    "Do encounter rates change by time of day?",
    "How many Pokémon are purple?",
    "What are the most populous cities in the mainline games?",
    "Name all the Route 1 birds",
    // Generation scopes (gen 5–8 are fully indexed formats)
    "Was Excadrill good in Gen 5?",
    "What could Aegislash learn in Gen 6?",
    "Best Steel types in Gen 7?",
    "Did Garchomp get Scale Shot in Gen 8?",
    // In-game progression / version exclusives
    "Which Pokémon are exclusive to Violet?",
    "How do I get the Shiny Charm in Scarlet and Violet?",
    "How do I evolve Gimmighoul?",
    // Glitches
    "How does the MissingNo glitch work?",
    "What is the Mew glitch in Red and Blue?",
    // Spin-offs
    "What starters can you play as in Mystery Dungeon: Explorers of Sky?",
    "How does recruiting work in Pokémon Mystery Dungeon?",
    // Warehouse aggregations
    "Which type combination has the most Pokémon?",
    "What's the average base Speed of Electric types?",
    // Mechanics history
    "How does the Physical/Special split work?",
  ]

  /// Samples `count` distinct prompts from ``pool`` at random (the native
  /// counterpart of web's `pickRandomPrompts`), via `Array.shuffled()`. `count` is
  /// clamped to the pool's size by `prefix(_:)`.
  static func pick(_ count: Int = 4) -> [String] {
    Array(pool.shuffled().prefix(count))
  }
}
