import Foundation

/// The Oak backend base URL, selected per build configuration.
///
/// Debug builds target **staging**, Release builds target **production**
/// (deployment.md "Environments"). The switch is the `OAK_STAGING` compilation
/// condition, set only in the Debug config by `project.yml`.
///
/// The canonical public host is **oak.gowtam.ai**. The internal Fly host
/// (`oak-gowtam.fly.dev`) remains live and serves /api/* for older builds.
/// Staging == production for now; point staging at a dedicated Fly staging app if one
/// is created before App Store submission.
enum BaseURL {
  /// The base URL for the active build configuration.
  static let current: URL = {
    #if OAK_STAGING
    return staging
    #else
    return production
    #endif
  }()

  /// Production backend (oak.gowtam.ai).
  static let production = URL(string: "https://oak.gowtam.ai")!

  /// Staging backend (currently the same host as production — see note above).
  static let staging = URL(string: "https://oak.gowtam.ai")!
}
