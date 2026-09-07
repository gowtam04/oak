import Testing

@testable import OakApp

/// ``ExamplePrompts`` — generated mirror of web's `example-prompts.ts`.
/// Pins the empty-state sampling invariants: no duplicate prompts, all four
/// categories, and `pickFiledStarters()` returns one entry per category
/// in Battle → Dex → Rules → Meta order.
struct ExamplePromptsTests {

  @Test
  func filedPoolHasNoDuplicatePrompts() {
    let prompts = ExamplePrompts.filedPool.map(\.prompt)
    #expect(Set(prompts).count == prompts.count)
  }

  @Test
  func filedPoolIsALargeDiscoverySet() {
    #expect(ExamplePrompts.filedPool.count >= 200)
    for category in ExamplePrompts.FiledStarter.Category.allCases {
      #expect(ExamplePrompts.filedPool.filter { $0.category == category }.count >= 50)
    }
  }

  @Test
  func filedPoolCoversAllFourCategories() {
    let cats = Set(ExamplePrompts.filedPool.map(\.category))
    #expect(cats == Set(ExamplePrompts.FiledStarter.Category.allCases))
  }

  @Test
  func filedPoolEntriesHaveTypeDots() {
    for starter in ExamplePrompts.filedPool {
      #expect(!starter.typeDot.isEmpty)
      #expect(!starter.prompt.isEmpty)
    }
  }

  @Test
  func pickFiledStartersReturnsOnePerCategoryInOrder() {
    let picked = ExamplePrompts.pickFiledStarters()
    #expect(picked.count == 4)
    #expect(picked.map(\.category) == ExamplePrompts.FiledStarter.Category.allCases)
    for starter in picked {
      #expect(ExamplePrompts.filedPool.contains(starter))
      #expect(!starter.typeDot.isEmpty)
      #expect(!starter.prompt.isEmpty)
    }
  }
}
