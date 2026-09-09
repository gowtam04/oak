import Foundation
import Testing

@testable import OakApp

struct UsageFormatTests {

  @Test
  func formatsInTheGivenTimeZoneWithoutISOOrZ() {
    // 2023-11-14 22:13:20 UTC → 2:13 PM in America/Los_Angeles (PST).
    let tz = TimeZone(identifier: "America/Los_Angeles")!
    let formatted = formatUsageFetchedAt(
      1_700_000_000_000,
      timeZone: tz,
      locale: Locale(identifier: "en_US")
    )
    #expect(!formatted.contains("Z"))
    #expect(!formatted.contains("T"))
    #expect(!formatted.contains("2023-11-14"))
    #expect(!formatted.contains("UTC"))
    #expect(formatted.contains("2023"))
    #expect(formatted.contains("Nov"))
    #expect(formatted.contains("2:13"))
  }

  @Test
  func utcZoneStillOmitsTheZSuffix() {
    let formatted = formatUsageFetchedAt(
      1_700_000_000_000,
      timeZone: TimeZone(identifier: "UTC")!,
      locale: Locale(identifier: "en_US")
    )
    #expect(!formatted.contains("Z"))
    #expect(!formatted.contains("2023-11-14"))
    #expect(formatted.contains("2023"))
  }

  @Test
  func splitsEmDashAttributionIntoSourceAndLegal() {
    let parts = parseUsageAttribution(
      "championsbattledata.com — a community-maintained Pokémon Champions project (not affiliated with Nintendo / Game Freak / The Pokémon Company)."
    )
    #expect(parts.source == "championsbattledata.com")
    #expect(parts.legal?.contains("not affiliated") == true)
    #expect(parts.legal?.contains("Nintendo") == true)
  }

  @Test
  func domainOnlyAttributionHasNoLegalLine() {
    let parts = parseUsageAttribution("championsbattledata.com")
    #expect(parts.source == "championsbattledata.com")
    #expect(parts.legal == nil)
  }
}
