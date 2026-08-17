import Foundation
import Testing

@testable import OakApp

/// Pure marketing-version comparator used by soft-update decisions.
struct AppVersionTests {

  @Test
  func equalVersionsCompareAsZero() {
    #expect(AppVersion.compare("1.0.2", "1.0.2") == 0)
    #expect(AppVersion.compare("1.0", "1.0.0") == 0)
  }

  @Test
  func patchBumpIsNewer() {
    #expect(AppVersion.compare("1.0.1", "1.0.2") == -1)
    #expect(AppVersion.isNewer("1.0.2", than: "1.0.1"))
  }

  @Test
  func doubleDigitPatchOrdersNumerically() {
    // String compare would wrongly put "1.0.10" before "1.0.2".
    #expect(AppVersion.compare("1.0.10", "1.0.2") == 1)
    #expect(AppVersion.isNewer("1.0.10", than: "1.0.2"))
  }

  @Test
  func majorAndMinorOrdering() {
    #expect(AppVersion.compare("2.0.0", "1.9.9") == 1)
    #expect(AppVersion.compare("1.1.0", "1.0.9") == 1)
    #expect(AppVersion.compare("1.0.0", "2.0.0") == -1)
  }

  @Test
  func unequalComponentCountsPadWithZero() {
    #expect(AppVersion.compare("1.0", "1.0.1") == -1)
    #expect(AppVersion.isNewer("1.0.1", than: "1.0"))
  }

  @Test
  func nonNumericSegmentsParseAsZero() {
    #expect(AppVersion.compare("1.0.beta", "1.0.0") == 0)
  }
}
