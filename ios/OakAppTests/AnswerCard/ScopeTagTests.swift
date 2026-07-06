import Testing

@testable import OakApp

/// `ScopeTag.label(for:)` — the native mirror of web's `formatScopeTag`
/// (`scope-tag.ts`). Pins the same cases `Masthead.test.tsx` pins: a `gen-N` code,
/// a pre-Gen-9 fallback code, and Champions with the current regulation — plus the
/// verbatim passthrough for an already-display-form string (web's `return
/// generation` fallback).
struct ScopeTagTests {

  @Test
  func genCodeBecomesGenLabel() {
    // Masthead.test.tsx: "gen-9" → "Gen 9".
    #expect(ScopeTag.label(for: "gen-9") == "Gen 9")
    #expect(ScopeTag.label(for: "gen-8") == "Gen 8")
    #expect(ScopeTag.label(for: "gen-5") == "Gen 5")
  }

  @Test
  func preGen9FallbackCodeBecomesGenLabel() {
    // Masthead.test.tsx: the fallback fixture "gen-1" → "Gen 1".
    #expect(ScopeTag.label(for: "gen-1") == "Gen 1")
  }

  @Test
  func championsBecomesLabelWithCurrentRegulation() {
    // Masthead.test.tsx: "champions" → contains "Champions" and "Reg M-B".
    let label = ScopeTag.label(for: "champions")
    #expect(label == "Champions · Reg M-B")
    #expect(label.contains("Champions"))
    #expect(label.contains("Reg M-B"))
  }

  @Test
  func nationalDexBecomesNationalDexLabel() {
    // "national-dex" → "National Dex" (basisForFormat returns the raw format
    // string, not a "gen-N" tag, for the whole-Pokédex reference scope).
    #expect(ScopeTag.label(for: "national-dex") == "National Dex")
  }

  @Test
  func unrecognizedGenerationReturnsUnchanged() {
    // web's `return generation` fallback — an already-display-form string (or any
    // code that is neither "champions" nor "gen-*") passes straight through.
    #expect(ScopeTag.label(for: "Gen 9 (Scarlet/Violet)") == "Gen 9 (Scarlet/Violet)")
    #expect(ScopeTag.label(for: "scarlet-violet") == "scarlet-violet")
    #expect(ScopeTag.label(for: "") == "")
  }
}
