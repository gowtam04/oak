import Testing
import UIKit

@testable import OakApp

/// Guards that the bundled brand typefaces are actually registered and resolvable
/// by their PostScript names. `Font.custom` resolves by PostScript name, and iOS
/// loads them from the app bundle's `Info.plist` `UIAppFonts` — a missing entry
/// or a renamed face silently falls back to the system font, which is exactly the
/// "still looks like SF" failure this re-theme exists to kill. Runs hosted in the
/// OakApp target (TEST_HOST), so the app's registered fonts are available.
struct BrandFontsTests {

  /// The eight Enamel PostScript names `Theme` requests via `Font.custom`. If
  /// any of these resolves to `nil`, the corresponding `.ttf` isn't in
  /// `UIAppFonts` (or its PostScript name differs) and the app is silently
  /// rendering system fonts.
  static let postScriptNames = [
    "Fredoka-Medium",
    "Fredoka-SemiBold",
    "NunitoSans-Regular",
    "NunitoSans-Medium",
    "NunitoSans-SemiBold",
    "NunitoSans-Bold",
    "JetBrainsMono-Medium",
    "JetBrainsMono-SemiBold",
  ]

  @Test(arguments: postScriptNames)
  func brandFaceResolvesByPostScriptName(_ name: String) {
    let font = UIFont(name: name, size: 17)
    #expect(font != nil, "Font \"\(name)\" did not resolve — check Info.plist UIAppFonts + the bundled TTF's PostScript name.")
    // A resolved custom font reports the requested PostScript name; a silent
    // fallback to the system font would report a different one (e.g. ".SFUI-…").
    #expect(font?.fontName == name)
  }
}
