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
      category: .battle, typeDot: "electric",
      prompt: "Can Pikachu OHKO a 4x weak target with Thunderbolt?"
    ),
    FiledStarter(
      category: .battle, typeDot: "poison",
      prompt: "What's the best nature for Galarian Slowking?"
    ),
    FiledStarter(
      category: .battle, typeDot: "grass",
      prompt: "How much HP does Ferrothorn have with max HP Stat Points?"
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
      prompt: "Does Technician Scizor outdamage Choice Band?"
    ),
    FiledStarter(
      category: .battle, typeDot: "water",
      prompt: "How much Attack does Huge Power Azumarill have?"
    ),
    FiledStarter(
      category: .battle, typeDot: "psychic",
      prompt: "Build me a doubles team around Indeedee"
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
      category: .dex, typeDot: "electric",
      prompt: "What's the average base Speed of Electric types?"
    ),
    FiledStarter(
      category: .dex, typeDot: "normal",
      prompt: "Which type combination has the most Pokémon?"
    ),
    FiledStarter(
      category: .dex, typeDot: "poison",
      prompt: "How many Pokémon are purple?"
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
      category: .dex, typeDot: "grass",
      prompt: "Show me Rillaboom"
    ),
    FiledStarter(
      category: .dex, typeDot: "dark",
      prompt: "Tell me about Incineroar"
    ),
    FiledStarter(
      category: .dex, typeDot: "fairy",
      prompt: "What are Flutter Mane's stats?"
    ),
    FiledStarter(
      category: .dex, typeDot: "fighting",
      prompt: "What types does Urshifu have?"
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
      category: .rules, typeDot: "fighting",
      prompt: "How do Stat Points work in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "What's the Stat Point budget in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "Can I put 32 Stat Points into one stat?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Does Champions use Stat Points instead of EVs?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does level 50 stat calculation work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "How do restricted Pokémon work in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "How many restricted Pokémon can I bring?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What's the team size in Champions Doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Can I bring six and pick four in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does species clause work in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "steel",
      prompt: "Can two Pokémon hold the same item in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fire",
      prompt: "How does Mega Evolution work in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fire",
      prompt: "Can a Mega share a team with its base form?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Are Z-Moves legal in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "flying",
      prompt: "How does Tailwind work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ground",
      prompt: "Does Wide Guard block Earthquake?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Can Follow Me redirect a spread move?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Does Protect fail on consecutive uses?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "Can Prankster Tailwind go through Psychic Terrain?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Helping Hand work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "What does Coaching do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "How does Ally Switch work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Assault Vest do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "What does Choice Band do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "What does Choice Specs do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "What does Life Orb do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Focus Sash do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "rock",
      prompt: "Can Sturdy survive a multi-hit move?"
    ),
    FiledStarter(
      category: .rules, typeDot: "flying",
      prompt: "How does Multiscale work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Does Unaware ignore Intimidate?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fairy",
      prompt: "How does Friend Guard work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "What does Safety Goggles do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "bug",
      prompt: "Does Overcoat block Spore?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Storm Drain redirect Water moves?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "How does Lightning Rod redirect Electric moves?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "Does Bulletproof block Aura Sphere?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "How does Magic Guard interact with Life Orb?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ghost",
      prompt: "What does Covert Cloak do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Clear Amulet work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Does Red Card trigger before Eject Button?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "How does Fake Out interact with Inner Focus?"
    ),
    FiledStarter(
      category: .rules, typeDot: "steel",
      prompt: "What does Rocky Helmet do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Rough Skin work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "steel",
      prompt: "Does Iron Barbs stack with Rocky Helmet?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fire",
      prompt: "How does Flame Body's burn chance work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "What does Static do on contact?"
    ),
    FiledStarter(
      category: .rules, typeDot: "poison",
      prompt: "How does Poison Touch work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "Does Guts ignore the burn Attack drop?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Huge Power work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Simple do to stat changes?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Contrary work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "Does Defiant trigger on Intimidate?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "How does Competitive work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "steel",
      prompt: "What does Mirror Armor do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Imposter work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dark",
      prompt: "Can Illusion copy a Mega?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ghost",
      prompt: "How does Disguise work on Mimikyu?"
    ),
    FiledStarter(
      category: .rules, typeDot: "flying",
      prompt: "What does Air Balloon do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "steel",
      prompt: "How does Heavy-Duty Boots ignore hazards?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "Does Magic Bounce reflect Taunt?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dark",
      prompt: "How does Taunt work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Encore do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Disable work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "Does Throat Spray trigger on a blocked sound move?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "How does Punching Glove work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "rock",
      prompt: "How does Skill Link work with Rock Blast?"
    ),
    FiledStarter(
      category: .rules, typeDot: "bug",
      prompt: "Does Technician boost Ice Spinner?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Adaptability STAB work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "bug",
      prompt: "What does Tinted Lens do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dragon",
      prompt: "Does Sniper boost crits?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Super Luck work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Scope Lens do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "How does Focus Energy work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "poison",
      prompt: "What does Mortal Spin do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Court Change work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "poison",
      prompt: "How does Clear Smog work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "Does Roar phaze through Suction Cups?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How does Shed Tail work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fairy",
      prompt: "What does Revival Blessing do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "How does Healing Wish work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "psychic",
      prompt: "How does Wish timing work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "What does Aqua Ring do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "Does Leech Seed fail on Grass types?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "How does Strength Sap work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "dark",
      prompt: "What does Parting Shot do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Flip Turn work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "bug",
      prompt: "Does U-turn trigger Intimidate on the switch-in?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "How does Volt Switch work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "What does Eject Pack do?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fighting",
      prompt: "How does Weakness Policy work?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "Does White Herb clear Intimidate?"
    ),
    FiledStarter(
      category: .rules, typeDot: "normal",
      prompt: "How do Stat Points interact with nature?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ice",
      prompt: "How does Aurora Veil work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ice",
      prompt: "Does Snow Warning set snow in Champions?"
    ),
    FiledStarter(
      category: .rules, typeDot: "rock",
      prompt: "How does Sand Stream work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fire",
      prompt: "How does Drought work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "water",
      prompt: "How does Drizzle work in doubles?"
    ),
    FiledStarter(
      category: .rules, typeDot: "grass",
      prompt: "How does Grassy Terrain change Grassy Glide?"
    ),
    FiledStarter(
      category: .rules, typeDot: "electric",
      prompt: "Does Electric Terrain stop sleep?"
    ),
    FiledStarter(
      category: .rules, typeDot: "fairy",
      prompt: "How does Misty Terrain block status?"
    ),
    FiledStarter(
      category: .rules, typeDot: "ghost",
      prompt: "Are Z-Moves and Dynamax legal in Champions?"
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
      category: .meta, typeDot: "dark",
      prompt: "What's Incineroar's most common item in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Who is the most used Pokémon in Champions Doubles?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "What's the top rain core in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "Common partners for Rillaboom in Champions"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "What's Flutter Mane's usual spread in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "Who checks Incineroar in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "What's the most used Mega stone in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "psychic",
      prompt: "How common is Trick Room in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "What's the best lead in Champions Doubles?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "Who is rising in Champions usage?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's Amoonguss usually holding in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "Common items on Urshifu in Champions"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "What's Landorus-Therian's usual set in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Who pairs with Pelipper in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dragon",
      prompt: "What's the most used restricted in Champions Doubles?"
    ),
    FiledStarter(
      category: .meta, typeDot: "flying",
      prompt: "How common is Tailwind in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dragon",
      prompt: "What's Dragonite's usual item in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "Who are the top supports in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "What's Gholdengo's usual moveset in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "How often is Fake Out used in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "What's the top sun core in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "Common partners for Torkoal in Champions"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "Who is the best redirection user in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's Rillaboom's usual item in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "How common is Follow Me in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "flying",
      prompt: "What's the best speed control in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "Who is the most used Fairy in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "What's Chi-Yu's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "How common is Iron Hands in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "What's Great Tusk's usual set in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "Who is the best spread attacker in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "psychic",
      prompt: "Common partners for Indeedee in Champions"
    ),
    FiledStarter(
      category: .meta, typeDot: "psychic",
      prompt: "What's the top Trick Room core in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dragon",
      prompt: "Who is the most used Dragon in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "What's Mega Lucario's usage in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "How often is Mega Charizard X used in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "What's Mega Swampert's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "Who is the best Intimidate user in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "What's the most used Fighting type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "How common is Kingambit in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "Who checks Flutter Mane in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "What's the best Steel type in Champions right now?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "How common is Heatran in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "flying",
      prompt: "What's Tornadus's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ghost",
      prompt: "Who is the most used Ghost in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "What's the top sand core in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "How common is Tyranitar in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ice",
      prompt: "What's the most used Ice type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "flying",
      prompt: "Who is the best Tailwind setter in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's Ogerpon's usage in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "How common is Walking Wake in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "electric",
      prompt: "What's the most used Electric type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "psychic",
      prompt: "Who is the best terrain setter in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "psychic",
      prompt: "What's Indeedee's role in Champions Doubles?"
    ),
    FiledStarter(
      category: .meta, typeDot: "psychic",
      prompt: "How common is Psychic Terrain in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "What's the best hazard setter in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "Who is the most used Rock type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "What's Salt Cure's usage in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "How common is Garganacl in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "bug",
      prompt: "What's the most used Bug type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "Who is the best pivot in Champions Doubles?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "What's the top hyper offense core in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "How common is Choice Scarf in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "What's the most used item in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "Who holds the most Assault Vests in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ghost",
      prompt: "What's Covert Cloak usage like in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "How common is Clear Amulet in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "What's the best rain sweeper in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "How often is Grassy Terrain used in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "grass",
      prompt: "What's the best Grassy Glide user in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fighting",
      prompt: "Who checks Urshifu in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "water",
      prompt: "What's Rapid Strike Urshifu's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "How common is Single Strike Urshifu in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "dark",
      prompt: "What's the most used Dark type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "Who is the best Fake Out user in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "How common is Wide Guard in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "What's the most used Protect user in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "Who is rising among Megas in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ghost",
      prompt: "What's Mega Gengar's usage in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "How common is Mega Kangaskhan in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ice",
      prompt: "What's the best snow team look in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ice",
      prompt: "Who is the most used Ice setter in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ice",
      prompt: "What's Alolan Ninetales's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ice",
      prompt: "How common is Aurora Veil in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "rock",
      prompt: "What's the best sand setter in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "Who pairs with Excadrill in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ground",
      prompt: "What's the most used Ground type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "What's Entei's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "Who is the most used Fire type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "What's the top sun sweeper in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fire",
      prompt: "How common is Drought in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "normal",
      prompt: "What's the most used ability in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "fairy",
      prompt: "Who is the best support Pokémon in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "poison",
      prompt: "What's Toxapex's usage in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "poison",
      prompt: "How common is Amoonguss over Toedscruel?"
    ),
    FiledStarter(
      category: .meta, typeDot: "poison",
      prompt: "Who is the most used Poison type in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "bug",
      prompt: "What's Scizor's role in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "bug",
      prompt: "How common is Volcarona in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "electric",
      prompt: "What's Miraidon's usage in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "electric",
      prompt: "How common is Raging Bolt in Champions?"
    ),
    FiledStarter(
      category: .meta, typeDot: "ghost",
      prompt: "What's Dragapult's usage in Champions Doubles?"
    ),
    FiledStarter(
      category: .meta, typeDot: "steel",
      prompt: "How common is Kingambit vs Gholdengo right now?"
    ),
  ]

  /// One random starter per category, in Battle → Dex → Rules → Meta order.
  static func pickFiledStarters() -> [FiledStarter] {
    FiledStarter.Category.allCases.compactMap { category in
      filedPool.filter { $0.category == category }.randomElement()
    }
  }
}
