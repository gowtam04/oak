import Foundation
import Testing

@testable import OakApp

/// Decode guard for the additive `learnset_unavailable` warning code
/// (team-from-box BOX-AC-1.2 / BOX-AC-2.4). `TeamWarning.Code` is a closed
/// `String` enum — unknown codes currently crash decode — so the named case
/// is required for the keep-and-warn path.
struct TeamWarningDecodeTests {

  /// `{"code":"learnset_unavailable",…}` decodes as the named
  /// `TeamWarning.Code.learnsetUnavailable` case, not a throw.
  @Test
  func learnsetUnavailableDecodesAsNamedCase() throws {
    let json = Data(
      """
      {"code":"learnset_unavailable","message":"Learnset unavailable for this form in this scope; species kept because you named it."}
      """.utf8)
    let warning = try JSONDecoder().decode(TeamWarning.self, from: json)
    #expect(warning.code == .learnsetUnavailable)
    #expect(warning.code.rawValue == "learnset_unavailable")
    #expect(warning.message.contains("kept"))
  }
}
