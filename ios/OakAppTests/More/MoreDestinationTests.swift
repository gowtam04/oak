import Testing

@testable import OakApp

/// ``MoreDestination`` (nav restructure: Chat / Teams / More): pins the ordering
/// contract the More tab's list depends on, and that every case carries non-empty
/// display text so a future destination can't ship with a blank row.
struct MoreDestinationTests {

  @Test
  func accountIsTheFirstDestination() {
    #expect(MoreDestination.allCases.first == .account)
  }

  @Test
  func everyCaseHasNonEmptyTitleAndSystemImage() {
    for destination in MoreDestination.allCases {
      #expect(!destination.title.isEmpty)
      #expect(!destination.systemImage.isEmpty)
    }
  }

  @Test
  func accountTitleIsAccount() {
    #expect(MoreDestination.account.title == "Account")
  }
}
