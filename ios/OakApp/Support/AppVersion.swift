import Foundation

/// Local app version helpers and a pure marketing-version comparator.
///
/// Marketing version comes from `CFBundleShortVersionString` (`MARKETING_VERSION`
/// in `project.yml`). Soft-update decisions compare **marketing** versions only —
/// build numbers (`CFBundleVersion`) are for TestFlight/ASC identity, not store
/// "is newer" prompts.
enum AppVersion {
  /// The installed marketing version (e.g. `"1.0.2"`), or `"0"` if missing.
  static var marketing: String {
    Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
  }

  /// The installed build number (e.g. `"33"`), or `"0"` if missing.
  static var build: String {
    Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
  }

  /// Numeric dotted-version comparison: `-1` if `lhs < rhs`, `0` if equal, `1` if
  /// `lhs > rhs`. Missing trailing components are treated as `0` (`"1.0"` ==
  /// `"1.0.0"`). Non-numeric segments parse as `0`.
  static func compare(_ lhs: String, _ rhs: String) -> Int {
    let left = components(lhs)
    let right = components(rhs)
    let count = max(left.count, right.count)
    for index in 0..<count {
      let a = index < left.count ? left[index] : 0
      let b = index < right.count ? right[index] : 0
      if a < b { return -1 }
      if a > b { return 1 }
    }
    return 0
  }

  /// `true` when `candidate` is strictly newer than `current`.
  static func isNewer(_ candidate: String, than current: String) -> Bool {
    compare(candidate, current) > 0
  }

  private static func components(_ version: String) -> [Int] {
    version.split(separator: ".").map { Int($0) ?? 0 }
  }
}
