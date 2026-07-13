package ai.gowtam.oak.features.chat

/**
 * Starter prompts for the fresh-thread empty state ([EmptyState]).
 *
 * Phase 1 specimen desk (`docs/design/soul.md`) shows **filed starters** — four
 * category rows (Battle / Dex / Rules / Meta) with an optional type-dot — not
 * equal beige pills. [pickFiled] returns one prompt per category.
 *
 * The flat [pool] remains the full curated set (synced with
 * `web/src/lib/example-prompts.ts` / `ios/OakApp/Features/Chat/ExamplePrompts.swift`)
 * for sampling and tests.
 */
object ExamplePrompts {

    /** Filed-starter categories — fixed labels, sync across web/iOS/Android. */
    enum class Category(val label: String) {
        Battle("Battle"),
        Dex("Dex"),
        Rules("Rules"),
        Meta("Meta"),
    }

    /**
     * One filed starter: mono category label, type-dot (Pokémon type slug for
     * [ai.gowtam.oak.ui.OakType.color]), and the prompt text sent on tap.
     */
    data class FiledStarter(
        val category: Category,
        /** Type slug for the colored dot (e.g. `"dragon"`); unknown falls back to Normal. */
        val typeDot: String,
        val prompt: String,
    )

    /**
     * Curated filed-starter pool, grouped by [Category]. [pickFiled] samples one
     * from each category so the empty desk always shows Battle/Dex/Rules/Meta.
     * Type-dot defaults match soul.md (Battle dragon/fighting, Dex ground/normal,
     * Rules ghost/dark, Meta steel/water).
     */
    val filedPool: List<FiledStarter> = listOf(
        // Battle — competitive / nature / damage
        FiledStarter(Category.Battle, "dragon", "What's Garchomp's best nature for Speed?"),
        FiledStarter(Category.Battle, "fighting", "Can Garchomp OHKO Gholdengo with Earthquake?"),
        FiledStarter(Category.Battle, "dragon", "Garchomp's Speed at level 50 with max Speed and Jolly"),
        FiledStarter(Category.Battle, "fire", "Build me a rain team"),
        FiledStarter(Category.Battle, "water", "Best Stat Point spread for Incineroar in Champions"),
        // Dex — species / typing / immunity lists
        FiledStarter(Category.Dex, "ground", "Which Pokémon are immune to Ground?"),
        FiledStarter(Category.Dex, "normal", "Show me Garchomp"),
        FiledStarter(Category.Dex, "steel", "Gholdengo's stats and typing"),
        FiledStarter(Category.Dex, "ground", "What is Gholdengo weak to?"),
        FiledStarter(Category.Dex, "fairy", "Best counters to Fairy types"),
        // Rules — mechanics / abilities / gen rules
        FiledStarter(Category.Rules, "ghost", "Does Prankster work on Dark types?"),
        FiledStarter(Category.Rules, "dark", "Does Fake Out work on Farigiraf?"),
        FiledStarter(Category.Rules, "ghost", "How does Fake Out's priority work?"),
        FiledStarter(Category.Rules, "dark", "Does Earthquake hit everyone in doubles?"),
        FiledStarter(Category.Rules, "ghost", "How does the Physical/Special split work?"),
        // Meta — usage / role / format niche
        FiledStarter(Category.Meta, "steel", "What is Gholdengo's role in Champions?"),
        FiledStarter(Category.Meta, "water", "Who has the highest usage in Champions right now?"),
        FiledStarter(Category.Meta, "steel", "Is Dragapult legal in Champions?"),
        FiledStarter(Category.Meta, "dragon", "Was Excadrill good in Gen 5?"),
        FiledStarter(Category.Meta, "water", "Build me a Champions team around Mega Swampert"),
    )

    /**
     * Flat pool spanning all of Oak's capabilities (filters, learnsets, mechanics,
     * type matchups, stat/damage math, locations, glitches, Mystery Dungeon, …).
     * Kept in sync with web `STARTER_PROMPTS` / iOS `ExamplePrompts.pool`.
     */
    val pool: List<String> = listOf(
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
    )

    /** Sample [count] distinct prompts from [pool] at random (sampling without replacement). */
    fun pick(count: Int = 4): List<String> = pool.shuffled().take(count)

    /**
     * One filed starter per category (Battle → Dex → Rules → Meta), each sampled
     * at random from that category's entries in [filedPool]. Stable category order
     * so the empty desk always reads the same instrument layout.
     */
    fun pickFiled(): List<FiledStarter> =
        Category.entries.map { category ->
            filedPool.filter { it.category == category }.random()
        }
}
