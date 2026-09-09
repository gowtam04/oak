import Foundation

enum OrbEngine {
  static func resolve(_ state: OrbState, size: OrbSize) -> OrbPresets.Resolved {
    OrbPresets.resolve(state, size: size)
  }

  /// Geometry at instant `t` (already speed-scaled by the view, or raw for golden tests).
  static func frame(state: OrbState, size: OrbSize, t: Double) -> OrbFrame {
    let resolved = OrbPresets.resolve(state, size: size)
    return OrbModes.frame(mode: resolved.mode, size: Double(size.rawValue), t: t, opts: resolved.opts)
  }
}
