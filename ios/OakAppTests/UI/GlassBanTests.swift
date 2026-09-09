import Foundation
import Testing

/// Regression gate: OakApp sources must not call iOS 26 Liquid Glass APIs as
/// chrome. Comments that mention the ban (without invoking the modifier) are
/// allowed — this looks for call-shaped tokens only.
struct GlassBanTests {
  @Test
  func oakAppSourcesDoNotCallBannedGlassAPIs() throws {
    let testsFile = URL(fileURLWithPath: #filePath)
    let iosRoot = testsFile
      .deletingLastPathComponent() // UI
      .deletingLastPathComponent() // OakAppTests
      .deletingLastPathComponent() // ios
    let oakApp = iosRoot.appending(path: "OakApp")

    let banned: [(String, String)] = [
      ("glassEffect(", "glassEffect"),
      ("GlassEffectContainer", "GlassEffectContainer"),
      ("ultraThinMaterial", "ultraThinMaterial"),
      (".thinMaterial", ".thinMaterial"),
      (".regularMaterial", ".regularMaterial"),
      ("UIBlurEffect", "UIBlurEffect"),
      ("scrollEdgeEffectStyle(.soft", "scrollEdgeEffectStyle(.soft"),
      (".searchable(", ".searchable("),
      ("tabBarMinimizeBehavior", "tabBarMinimizeBehavior"),
      ("ToolbarItem(placement: .bottomBar)", "bottomBar toolbar"),
    ]

    var hits: [String] = []
    try walkSwiftFiles(oakApp) { url, contents in
      let relative = url.path.replacingOccurrences(of: oakApp.path + "/", with: "")
      for (token, label) in banned {
        if contents.contains(token) {
          hits.append("\(relative): \(label)")
        }
      }
    }

    #expect(hits.isEmpty, "Banned glass APIs still present:\n\(hits.joined(separator: "\n"))")
  }

  private func walkSwiftFiles(_ root: URL, visit: (URL, String) throws -> Void) throws {
    let enumerator = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: [.isRegularFileKey],
      options: [.skipsHiddenFiles]
    )
    while let item = enumerator?.nextObject() as? URL {
      guard item.pathExtension == "swift" else { continue }
      let contents = try String(contentsOf: item, encoding: .utf8)
      try visit(item, contents)
    }
  }
}
