import Testing

@testable import OakApp

/// ``ExamplePrompts`` — the native mirror of web's `example-prompts.ts` starter-prompt
/// pool. Pins the invariants the empty state's dynamic sampling relies on: no
/// duplicate entries, `pick(_:)` returns distinct pool members, and an
/// over-large request is clamped to the pool's size (web's `pickRandomPrompts`
/// counterpart, `Math.min(count, pool.length)`).
struct ExamplePromptsTests {

  @Test
  func poolHasNoDuplicates() {
    #expect(Set(ExamplePrompts.pool).count == ExamplePrompts.pool.count)
  }

  @Test
  func pickReturnsDistinctEntriesFromThePool() {
    let picked = ExamplePrompts.pick(4)
    #expect(picked.count == 4)
    #expect(Set(picked).count == 4)
    for prompt in picked {
      #expect(ExamplePrompts.pool.contains(prompt))
    }
  }

  @Test
  func pickClampsToPoolSizeWhenCountExceedsIt() {
    let picked = ExamplePrompts.pick(ExamplePrompts.pool.count + 50)
    #expect(picked.count == ExamplePrompts.pool.count)
    #expect(Set(picked).count == ExamplePrompts.pool.count)
  }
}
