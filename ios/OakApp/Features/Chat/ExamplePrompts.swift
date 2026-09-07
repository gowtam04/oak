/// GENERATED FILE — do not edit.
/// Source: web/src/lib/example-prompts.ts
/// Regenerate: cd web && npm run sync:starters
enum ExamplePrompts {
  struct FiledStarter: Hashable, Identifiable {
    /// The four starter categories — keep labels in sync with web / Android.
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

  /// Canonical filed-starter pool, generated from web `STARTER_ENTRIES`.
  /// `pickFiledStarters()` returns one random entry per category.
  static let filedPool: [FiledStarter] = [
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "What's Garchomp's best nature for Speed?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fighting",
      prompt: "Can Garchomp OHKO Gholdengo with Earthquake?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fire",
      prompt: "Garchomp's Speed at level 50 with max Speed and Jolly"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "Build me a rain team"
    ),
    FiledStarter(
      category: .battle, typeDot: "psychic",
      prompt: "Build me a Trick Room team"
    ),
    FiledStarter(
      category: .battle, typeDot: "fighting",
      prompt: "How does my team look?"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "Build me a Champions team around Mega Swampert"
    ),
    FiledStarter(
      category: .battle, typeDot: "dark",
      prompt: "Best Stat Point spread for Incineroar in Champions"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "Was Excadrill good in Gen 5?"
    ),
    FiledStarter(
      category: .battle, typeDot: "steel",
      prompt: "Best Steel types in Gen 7?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fire",
      prompt: "Damage from a 120 BP STAB super-effective hit vs 95 Defense"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "How much HP does a fully invested Blissey have?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "What's strong against Dragapult?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fairy",
      prompt: "Best counters to Fairy types"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "What beats Water types?"
    ),
    FiledStarter(
      category: .battle, typeDot: "steel",
      prompt: "What is Gholdengo weak to?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "Can Dragapult outspeed Flutter Mane with a Choice Scarf?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dark",
      prompt: "What's the best nature for Kingambit?"
    ),
    FiledStarter(
      category: .battle, typeDot: "ground",
      prompt: "Does Choice Band Garchomp OHKO Toxapex with Earthquake?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fire",
      prompt: "Build me a sun team"
    ),
    FiledStarter(
      category: .battle, typeDot: "ground",
      prompt: "Build me a sand team"
    ),
    FiledStarter(
      category: .battle, typeDot: "ice",
      prompt: "Build me a snow team"
    ),
    FiledStarter(
      category: .battle, typeDot: "normal",
      prompt: "How do I build a team from the Pokémon I own?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fairy",
      prompt: "Best Stat Point spread for Flutter Mane in Champions"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "Best Stat Point spread for Dragonite in Champions"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "Was Garchomp good in Gen 4?"
    ),
    FiledStarter(
      category: .battle, typeDot: "ground",
      prompt: "Was Landorus-Therian good in Gen 5?"
    ),
    FiledStarter(
      category: .battle, typeDot: "ghost",
      prompt: "Was Mimikyu good in Gen 7?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "Was Dragapult good in Gen 8?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "How much Speed does Jolly Dragapult have at level 50?"
    ),
    FiledStarter(
      category: .battle, typeDot: "poison",
      prompt: "What's a bulky HP investment for Toxapex?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fire",
      prompt: "Can Heatran live a Close Combat from Great Tusk?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fighting",
      prompt: "What nature should I run on Iron Hands?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dark",
      prompt: "Build me a hyper offense team"
    ),
    FiledStarter(
      category: .battle, typeDot: "steel",
      prompt: "Build me a bulky offense team"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "Build me a team around Pelipper"
    ),
    FiledStarter(
      category: .battle, typeDot: "fire",
      prompt: "Build me a team around Torkoal"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "How does my rain team look?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dark",
      prompt: "What beats Kingambit?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fairy",
      prompt: "What's strong against Flutter Mane?"
    ),
    FiledStarter(
      category: .battle, typeDot: "ground",
      prompt: "Best counters to Great Tusk"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "Can Rapid Strike Urshifu OHKO Incineroar?"
    ),
    FiledStarter(
      category: .battle, typeDot: "steel",
      prompt: "Does Gholdengo outspeed Amoonguss?"
    ),
    FiledStarter(
      category: .battle, typeDot: "rock",
      prompt: "How much damage does Salt Cure do to Steel types?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dragon",
      prompt: "Can a +1 Dragonite Extreme Speed OHKO Flutter Mane?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dark",
      prompt: "What's the Speed tier for Timid Chi-Yu?"
    ),
    FiledStarter(
      category: .battle, typeDot: "flying",
      prompt: "Best EV spread for Corviknight in OU"
    ),
    FiledStarter(
      category: .battle, typeDot: "fire",
      prompt: "Should I run Jolly or Adamant on Mega Charizard X?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fighting",
      prompt: "Build me a Champions team around Mega Lucario"
    ),
    FiledStarter(
      category: .battle, typeDot: "grass",
      prompt: "Best Stat Point spread for Rillaboom in Champions"
    ),
    FiledStarter(
      category: .battle, typeDot: "steel",
      prompt: "Was Aegislash good in Gen 6?"
    ),
    FiledStarter(
      category: .battle, typeDot: "electric",
      prompt: "Can Pikachu OHKO a 4x weak target with Thunderbolt?"
    ),
    FiledStarter(
      category: .battle, typeDot: "poison",
      prompt: "What's the best nature for Galarian Slowking?"
    ),
    FiledStarter(
      category: .battle, typeDot: "grass",
      prompt: "How much HP does Ferrothorn have with max HP EVs?"
    ),
    FiledStarter(
      category: .battle, typeDot: "flying",
      prompt: "Does Tailwind let my team outspeed Dragapult?"
    ),
    FiledStarter(
      category: .battle, typeDot: "psychic",
      prompt: "Can Trick Room let Amoonguss move before Flutter Mane?"
    ),
    FiledStarter(
      category: .battle, typeDot: "ice",
      prompt: "What beats Ice types in Champions?"
    ),
    FiledStarter(
      category: .battle, typeDot: "dark",
      prompt: "Best counters to Dark types"
    ),
    FiledStarter(
      category: .battle, typeDot: "bug",
      prompt: "Was Volcarona good in Gen 5?"
    ),
    FiledStarter(
      category: .battle, typeDot: "bug",
      prompt: "Does Technician Scizor outdamage Choice Band?"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "How much Attack does Huge Power Azumarill have?"
    ),
    FiledStarter(
      category: .battle, typeDot: "fire",
      prompt: "Can Tera Fire Chi-Yu OHKO Assault Vest Toxapex?"
    ),
    FiledStarter(
      category: .battle, typeDot: "steel",
      prompt: "What's a good spread for Gholdengo in Gen 9 OU?"
    ),
    FiledStarter(
      category: .battle, typeDot: "psychic",
      prompt: "Build me a doubles team around Indeedee"
    ),
    FiledStarter(
      category: .battle, typeDot: "rock",
      prompt: "Was Tyranitar good in Gen 2?"
    ),
    FiledStarter(
      category: .battle, typeDot: "ghost",
      prompt: "Should I Mega evolve Gengar or keep it base?"
    ),
    FiledStarter(
      category: .dex, typeDot: "ground",
      prompt: "Which Pokémon are immune to Ground?"
    ),
    FiledStarter(
      category: .dex, typeDot: "dragon",
      prompt: "Show me Garchomp"
    ),
    FiledStarter(
      category: .dex, typeDot: "dragon",
      prompt: "What are Dragapult's abilities?"
    ),
    FiledStarter(
      category: .dex, typeDot: "fighting",
      prompt: "Tell me about Iron Valiant"
    ),
    FiledStarter(
      category: .dex, typeDot: "steel",
      prompt: "Gholdengo's stats and typing"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "How does Eevee evolve?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "What forms does Tauros have?"
    ),
    FiledStarter(
      category: .dex, typeDot: "grass",
      prompt: "How do I evolve Applin?"
    ),
    FiledStarter(
      category: .dex, typeDot: "flying",
      prompt: "Is Ground super effective against Flying?"
    ),
    FiledStarter(
      category: .dex, typeDot: "ghost",
      prompt: "Pokémon that learn Trick Room and Will-O-Wisp"
    ),
    FiledStarter(
      category: .dex, typeDot: "ground",
      prompt: "What can learn Spikes?"
    ),
    FiledStarter(
      category: .dex, typeDot: "rock",
      prompt: "Who gets both Stealth Rock and Recover?"
    ),
    FiledStarter(
      category: .dex, typeDot: "dark",
      prompt: "Pokémon that learn Knock Off and Roost"
    ),
    FiledStarter(
      category: .dex, typeDot: "fire",
      prompt: "Fastest Fire types"
    ),
    FiledStarter(
      category: .dex, typeDot: "fire",
      prompt: "Fire types that learn Will-O-Wisp with Flash Fire"
    ),
    FiledStarter(
      category: .dex, typeDot: "dragon",
      prompt: "Dragon types with base Speed over 100"
    ),
    FiledStarter(
      category: .dex, typeDot: "water",
      prompt: "Bulkiest Water types"
    ),
    FiledStarter(
      category: .dex, typeDot: "steel",
      prompt: "Steel types that can set Stealth Rock"
    ),
    FiledStarter(
      category: .dex, typeDot: "electric",
      prompt: "Fastest Pokémon in the game"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Highest base stat total"
    ),
    FiledStarter(
      category: .dex, typeDot: "fighting",
      prompt: "Pokémon with base Attack over 130"
    ),
    FiledStarter(
      category: .dex, typeDot: "ghost",
      prompt: "How do I evolve Gimmighoul?"
    ),
    FiledStarter(
      category: .dex, typeDot: "steel",
      prompt: "Did Garchomp get Scale Shot in Gen 8?"
    ),
    FiledStarter(
      category: .dex, typeDot: "ghost",
      prompt: "What could Aegislash learn in Gen 6?"
    ),
    FiledStarter(
      category: .dex, typeDot: "electric",
      prompt: "What's the average base Speed of Electric types?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Which type combination has the most Pokémon?"
    ),
    FiledStarter(
      category: .dex, typeDot: "flying",
      prompt: "Name all the Route 1 birds"
    ),
    FiledStarter(
      category: .dex, typeDot: "poison",
      prompt: "How many Pokémon are purple?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Which Pokémon are exclusive to Violet?"
    ),
    FiledStarter(
      category: .dex, typeDot: "grass",
      prompt: "Show me Chikorita"
    ),
    FiledStarter(
      category: .dex, typeDot: "electric",
      prompt: "What are Rotom's forms and their types?"
    ),
    FiledStarter(
      category: .dex, typeDot: "bug",
      prompt: "How does Wurmple evolve?"
    ),
    FiledStarter(
      category: .dex, typeDot: "electric",
      prompt: "How do I evolve Pawmo?"
    ),
    FiledStarter(
      category: .dex, typeDot: "dark",
      prompt: "What's Kingambit's typing?"
    ),
    FiledStarter(
      category: .dex, typeDot: "ground",
      prompt: "Tell me about Great Tusk"
    ),
    FiledStarter(
      category: .dex, typeDot: "water",
      prompt: "Combined weight of Wailord and Skitty"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Which Pokémon has the same National Dex number as its BST?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Which Pokémon go from dual type to monotype on evolution?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Which Pokémon have a higher catch rate than their pre-evolution?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Which Pokémon are based on cats?"
    ),
    FiledStarter(
      category: .dex, typeDot: "electric",
      prompt: "How many signature moves does Pikachu have?"
    ),
    FiledStarter(
      category: .dex, typeDot: "ice",
      prompt: "Is there a Fire/Ice type combination?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "How many Pokémon are in the National Dex?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "How many unique type combinations are missing?"
    ),
    FiledStarter(
      category: .dex, typeDot: "electric",
      prompt: "Fastest Electric types"
    ),
    FiledStarter(
      category: .dex, typeDot: "water",
      prompt: "Heaviest Pokémon"
    ),
    FiledStarter(
      category: .dex, typeDot: "steel",
      prompt: "Lightest Pokémon"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Highest base HP"
    ),
    FiledStarter(
      category: .dex, typeDot: "electric",
      prompt: "Who learns both U-turn and Volt Switch?"
    ),
    FiledStarter(
      category: .dex, typeDot: "flying",
      prompt: "What can learn Defog?"
    ),
    FiledStarter(
      category: .dex, typeDot: "steel",
      prompt: "Steel types that learn Recover"
    ),
    FiledStarter(
      category: .dex, typeDot: "ghost",
      prompt: "Ghost types with Levitate"
    ),
    FiledStarter(
      category: .dex, typeDot: "bug",
      prompt: "Bug types with base Attack over 120"
    ),
    FiledStarter(
      category: .dex, typeDot: "ice",
      prompt: "Ice types that can set Aurora Veil"
    ),
    FiledStarter(
      category: .dex, typeDot: "fairy",
      prompt: "Fairy types with Magic Bounce"
    ),
    FiledStarter(
      category: .dex, typeDot: "poison",
      prompt: "How do I evolve Hisuian Qwilfish?"
    ),
    FiledStarter(
      category: .dex, typeDot: "fighting",
      prompt: "What's the average base Attack of Fighting types?"
    ),
    FiledStarter(
      category: .dex, typeDot: "dragon",
      prompt: "Dragon types immune to Electric"
    ),
    FiledStarter(
      category: .dex, typeDot: "dark",
      prompt: "Who gets both Rapid Spin and Knock Off?"
    ),
    FiledStarter(
      category: .dex, typeDot: "water",
      prompt: "Tell me about Walking Wake"
    ),
    FiledStarter(
      category: .dex, typeDot: "grass",
      prompt: "What types does Ogerpon have?"
    ),
    FiledStarter(
      category: .dex, typeDot: "psychic",
      prompt: "How does Ralts evolve?"
    ),
    FiledStarter(
      category: .dex, typeDot: "rock",
      prompt: "Show me Tyranitar"
    ),
    FiledStarter(
      category: .dex, typeDot: "fighting",
      prompt: "Which Pokémon are exclusive to Scarlet?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ghost",
      prompt: "Does Prankster work on Dark types?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Does Fake Out work on Farigiraf?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ground",
      prompt: "Does Earthquake hit everyone in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Fake Out's priority work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Leftovers do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "What does Armor Tail do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "What does Protosynthesis do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What item does Snorlax hold in the wild?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "Can Levitate dodge Earthquake?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "Is Dragapult legal in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does the Physical/Special split work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does the MissingNo glitch work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "What is the Mew glitch in Red and Blue?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Do encounter rates change by time of day?"
    ),
    FiledStarter(
      category: .rules, typeDot: "flying",
      prompt: "Where do I get HM Fly in HeartGold?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "What's the best strategy to catch Feebas in Gen 3?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How do I get the Shiny Charm in Scarlet and Violet?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does recruiting work in Pokémon Mystery Dungeon?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "What starters can you play as in Mystery Dungeon: Explorers of Sky?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dark",
      prompt: "How does Intimidate work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ground",
      prompt: "Does Mold Breaker ignore Levitate?"
    ),
    FiledStarter(
      category: .rules, typeDot: "steel",
      prompt: "What does Good as Gold do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dark",
      prompt: "How does Supreme Overlord work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "What does Booster Energy do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Terastallization work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fire",
      prompt: "How do Z-Moves work in Gen 7?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "How does Dynamax work in Sword and Shield?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "How does Mega Evolution work in Gen 6?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "Does Magic Bounce reflect Stealth Rock?"
    ),
    FiledStarter(
      category: .rules, typeDot: "bug",
      prompt: "Can Rage Powder redirect a spread move?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "How does Psychic Terrain stop priority?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Choice Scarf do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "rock",
      prompt: "How does Salt Cure's residual damage work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "poison",
      prompt: "Does Sheer Force remove Life Orb recoil?"
    ),
    FiledStarter(
      category: .rules, typeDot: "poison",
      prompt: "How does Neutralizing Gas work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "Can Unaware ignore Calm Mind boosts?"
    ),
    FiledStarter(
      category: .rules, typeDot: "rock",
      prompt: "What does Loaded Dice do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Parental Bond work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fire",
      prompt: "Does Flash Fire absorb Will-O-Wisp?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fire",
      prompt: "Are Mega Evolutions legal in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fairy",
      prompt: "Is Zacian legal in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "Is Mega Rayquaza legal in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How do IVs work in Gen 3?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "Did Gen 1 have a Special Defense stat?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "How do Stat Points work in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "flying",
      prompt: "How does the Old Man glitch work in Red?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What's the cloning glitch in Gold and Silver?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "How does the Pomeg glitch work in Emerald?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ghost",
      prompt: "What is tweaking in Diamond and Pearl?"
    ),
    FiledStarter(
      category: .rules, typeDot: "steel",
      prompt: "How does the Coin Case glitch work in Gen 2?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "What's the Berry glitch in Ruby and Sapphire?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "Where do I get HM Surf in Pokémon Red?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "Where do I get HM Strength in Emerald?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "Where do I get Waterfall in Platinum?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "Where do I get HM Cut in Gold?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "How do I catch a roaming Raikou in Gen 2?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does the Safari Zone work in Fuchsia?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fairy",
      prompt: "How do Friend Safaris work in X and Y?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does SOS chaining work in Sun and Moon?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ice",
      prompt: "How do I catch Articuno in Yellow?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dark",
      prompt: "How do Hidden Grottos work in Black 2?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "How do I recruit legendaries in Rescue Team?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fairy",
      prompt: "What does a Friend Bow do in Mystery Dungeon?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "How do IQ skills work in Explorers of Sky?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "What is Gholdengo's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Who has the highest usage in Champions right now?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "How many gym leaders are Fire type?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "Who leads the guild in Pokémon Mystery Dungeon Explorers?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "What are the most populous cities in the mainline games?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "What's Incineroar's usage in Champions right now?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "Who is the most used Mega in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "What moves is Flutter Mane running in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's Rillaboom's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "How common is Urshifu in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "Who partners with Incineroar in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "What's Landorus's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's Amoonguss's usage in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Most used Water type in Champions"
    ),
    FiledStarter(
      category: .meta, typeDot: "dragon",
      prompt: "What's Dragonite's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "electric",
      prompt: "Who is the top restricted Pokémon in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "What item does Flutter Mane usually hold in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "What's the highest usage in Smogon Gen 9 OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "What does Kingambit run in OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "What's Great Tusk's usage on the Smogon ladder?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "What items does Gholdengo run in Gen 9 OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "Who are Kingambit's checks in OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "Common teammates for Great Tusk in OU"
    ),
    FiledStarter(
      category: .meta, typeDot: "dragon",
      prompt: "What's Dragapult's role in Smogon OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Is Palafin used in Gen 9 OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "Who's the top hazards setter in Gen 9 OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "What EV spread does Great Tusk run in OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ice",
      prompt: "Is Baxcalibur used in Smogon OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "What's the usage trend for Gholdengo in OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "poison",
      prompt: "What's Galarian Slowking's role in OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "bug",
      prompt: "Is Volcarona used in Gen 9 OU?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "Who is the first gym leader in Kanto?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "What type is Whitney's gym in Johto?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Who is the Water gym leader in Hoenn?"
    ),
    FiledStarter(
      category: .meta, typeDot: "electric",
      prompt: "What's Volkner's type in Sinnoh?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dragon",
      prompt: "Who is the Dragon gym leader in Unova?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "What type is Korrina's gym in Kalos?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "Who is the first gym leader in Galar?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ghost",
      prompt: "Who is Paldea's Ghost gym leader?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "How many gym leaders are Water type?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ice",
      prompt: "Who is the Ice Elite Four member in Kanto?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dragon",
      prompt: "Who is the champion in Pokémon Platinum?"
    ),
    FiledStarter(
      category: .meta, typeDot: "bug",
      prompt: "Who is the champion in Pokémon Black and White?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ghost",
      prompt: "Who is the Ghost Elite Four in Hoenn?"
    ),
    FiledStarter(
      category: .meta, typeDot: "electric",
      prompt: "Who is Lt. Surge?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "Who is the champion in Ruby?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "Who is the Fairy gym leader in Galar?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's the starting town in Pokémon Gold?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "Where is the Pokémon League in Kanto?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "Where is the Battle Frontier in Emerald?"
    ),
    FiledStarter(
      category: .meta, typeDot: "electric",
      prompt: "What's the city with the Magnet Train?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "Where is the Pokémon Mansion in Gen 1?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's the starting town in Scarlet and Violet?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Where is Treasure Town in Explorers of Sky?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "Who runs the Kecleon shop in Mystery Dungeon?"
    ),
    FiledStarter(
      category: .meta, typeDot: "psychic",
      prompt: "What is Temporal Tower in Explorers of Sky?"
    ),
    FiledStarter(
      category: .meta, typeDot: "poison",
      prompt: "Who is on Team Skull in Explorers of Sky?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "Where can I recruit Riolu in Explorers of Sky?"
    ),
    FiledStarter(
      category: .meta, typeDot: "flying",
      prompt: "Who is the Guild assistant in Explorers of Sky?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ghost",
      prompt: "Who is Dusknoir in Explorers of Sky?"
    ),
  ]

  /// One random starter per category, in Battle → Dex → Rules → Meta order.
  static func pickFiledStarters() -> [FiledStarter] {
    FiledStarter.Category.allCases.compactMap { category in
      filedPool.filter { $0.category == category }.randomElement()
    }
  }
}
