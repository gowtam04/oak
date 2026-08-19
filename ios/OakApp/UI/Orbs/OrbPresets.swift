import Foundation

/// thinking-orbs 0.3.1 presets + profile scaling.

enum OrbMode: String, Sendable {
  case orbits, globe, rubik, wave, web, braid, ribbon, ring, morph
}

enum OrbPresets {
  static let stateToMode: [OrbState: OrbMode] = [
    .working: .orbits,
    .searching: .globe,
    .solving: .rubik,
    .listening: .wave,
    .connecting: .web,
    .weaving: .braid,
    .composing: .ribbon,
    .breathing: .ring,
    .shaping: .morph,
  ]

  struct Resolved: Sendable {
    var mode: OrbMode
    var speed: Double
    var opts: [String: Double]
  }

  static func resolve(_ state: OrbState, size: OrbSize) -> Resolved {
    let mode = stateToMode[state] ?? .ring
    let preset = presets[mode]![size]!
    var opts = baseProfiles[mode]!
    if preset.count != 1 { opts = scaleCounts(opts, preset.count) }
    if preset.size != 1 { opts = scaleRadii(opts, preset.size) }
    for (k, v) in preset.extra { opts[k] = v }
    return Resolved(mode: mode, speed: preset.speed, opts: opts)
  }

  private struct Preset {
    var speed: Double
    var count: Double
    var size: Double
    var extra: [String: Double] = [:]
  }

  private static let presets: [OrbMode: [OrbSize: Preset]] = [
    .orbits: [
      .px64: Preset(speed: 1.885, count: 1, size: 1),
      .px20: Preset(speed: 3.9, count: 0.238, size: 2.4),
    ],
    .globe: [
      .px64: Preset(speed: 2.015, count: 0.42, size: 1.15, extra: ["scanMul": 4.08, "dimBase": 0.45]),
      .px20: Preset(speed: 2.665, count: 0.105, size: 1.75, extra: ["scanMul": 4.335, "dimBase": 0.45]),
    ],
    .rubik: [
      .px64: Preset(speed: 1.82, count: 0.35, size: 1.05),
      .px20: Preset(speed: 1.95, count: 0.088, size: 1.9),
    ],
    .wave: [
      .px64: Preset(speed: 4.388, count: 0.341, size: 1),
      .px20: Preset(speed: 3.998, count: 0.105, size: 1.6),
    ],
    .web: [
      .px64: Preset(speed: 3.315, count: 1.35, size: 0.95),
      .px20: Preset(speed: 6.63, count: 0.25, size: 1.52),
    ],
    .braid: [
      .px64: Preset(speed: 1.625, count: 0.5, size: 1),
      .px20: Preset(speed: 2.75, count: 0.1125, size: 1.36),
    ],
    .ribbon: [
      .px64: Preset(speed: 2.34, count: 0.25, size: 0.85, extra: ["spin": 0, "bandMul": 3.9, "wobMul": 1]),
      .px20: Preset(speed: 3.12, count: 0.051, size: 1.073, extra: ["spin": 0, "bandMul": 4.94, "wobMul": 1]),
    ],
    .ring: [
      .px64: Preset(speed: 3.24, count: 0.25, size: 0.956, extra: ["spin": 0, "bandMul": 3.627, "wobMul": 0.368]),
      .px20: Preset(speed: 3.78, count: 0.028, size: 1.622, extra: ["spin": 0, "bandMul": 3.968, "wobMul": 0.565]),
    ],
    .morph: [
      .px64: Preset(speed: 2.405, count: 0.702, size: 0.395, extra: ["spread": 1.45]),
      .px20: Preset(speed: 2.08, count: 0.53, size: 1.011, extra: ["spread": 1.45]),
    ],
  ]

  private static let countPairs: [(String, String)] = [
    ("latRings", "lonDensity"),
    ("rings", "lonDensity"),
    ("lanes", "segs"),
  ]
  private static let countKeys = ["orbitN", "ghostN", "nodeN", "strandN", "signals"]
  private static let iconDensityKeys = ["iconD"]
  private static let radiusKeys = [
    "rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth",
  ]

  private static func scaleCounts(_ opts: [String: Double], _ scale: Double) -> [String: Double] {
    var out = opts
    var done = Set<String>()
    let rt = sqrt(scale)
    for (a, b) in countPairs {
      if let va = out[a], let vb = out[b], !done.contains(a), !done.contains(b) {
        out[a] = max(2, (va * rt).rounded())
        out[b] = max(2, (vb * rt).rounded())
        done.insert(a)
        done.insert(b)
      }
    }
    for k in countKeys {
      if let v = out[k], v != 0, !done.contains(k) {
        out[k] = max(1, (v * scale).rounded())
      }
    }
    for k in iconDensityKeys {
      if let v = out[k] { out[k] = max(0.02, v * scale) }
    }
    return out
  }

  private static func scaleRadii(_ opts: [String: Double], _ scale: Double) -> [String: Double] {
    var out = opts
    for k in radiusKeys {
      if let v = out[k] { out[k] = v * scale }
    }
    out["rSizeMul"] = (out["rSizeMul"] ?? 1) * scale
    return out
  }

  private static let baseProfiles: [OrbMode: [String: Double]] = [
    .globe: [
      "latRings": 17, "lonDensity": 44, "rBase": 0.6, "rDepth": 1.7, "rBoost": 1.0,
      "inkFar": 0.62, "inkSpan": 0.54, "rsPow": 0.6, "rMin": 0.3,
    ],
    .orbits: [
      "orbitN": 12, "ghostN": 40, "ghostR": 0.9, "ghostA": 0.5, "particles": 3,
      "partR": 1.2, "partRDepth": 1.6, "rsPow": 0.6, "rMin": 0.3,
    ],
    .rubik: [
      "latRings": 15, "lonDensity": 40, "moveCount": 14, "rBase": 0.6, "rDepth": 1.7,
      "rActive": 0.3, "inkFar": 0.62, "inkSpan": 0.54, "rsPow": 0.6, "rMin": 0.3,
    ],
    .wave: [
      "rings": 15, "lonDensity": 40, "rBase": 0.6, "rDepth": 1.7, "rsPow": 0.6, "rMin": 0.3,
    ],
    .web: [
      "nodeN": 30, "thr": 0.72, "signals": 5, "nodeR": 1.4, "nodeRDepth": 1.8,
      "lineW": 0.8, "rsPow": 0.6, "rMin": 0.3,
    ],
    .braid: [
      "strandN": 52, "turns": 3.0, "ghostN": 150, "rBase": 1.2, "rDepth": 1.8,
      "rsPow": 0.6, "rMin": 0.3,
    ],
    .ribbon: [
      "lanes": 5, "segs": 88, "ghostN": 150, "rBase": 1.1, "rDepth": 1.7,
      "rsPow": 0.6, "rMin": 0.3,
    ],
    .ring: [
      "lanes": 5, "segs": 88, "ghostN": 0, "faceOn": 1, "rBase": 1.1, "rDepth": 1.7,
      "rsPow": 0.6, "rMin": 0.3,
    ],
    .morph: [
      "rDot": 0.021, "iconD": 1, "rMin": 0.25,
    ],
  ]
}
