import Foundation
import SwiftUI

/// Hand-port of thinking-orbs 0.3.1 geometry (MIT © Jakub Antalik).
/// Formula-faithful — do not "clean up" the sin-hash or projection.

enum OrbState: String, CaseIterable, Sendable {
  case working, searching, solving, listening, connecting
  case weaving, composing, breathing, shaping
}

enum OrbSize: Int, Sendable {
  case px20 = 20
  case px64 = 64
}

struct OrbDot: Sendable {
  var x: Double
  var y: Double
  var z: Double
  var r: Double
  var white: Double
  var a: Double
}

struct OrbLine: Sendable {
  var x1: Double
  var y1: Double
  var x2: Double
  var y2: Double
  var white: Double
  var a: Double
  var w: Double
}

struct OrbFrame: Sendable {
  var dots: [OrbDot]
  var lines: [OrbLine]
}

enum OrbCore {
  static func lerp(_ a: Double, _ b: Double, _ f: Double) -> Double {
    a + (b - a) * f
  }

  static func frac(_ x: Double) -> Double {
    x - floor(x)
  }

  static func hashD(_ a: Double, _ b: Double) -> Double {
    let h = sin(a * 12.9898 + b * 78.233) * 43758.5453
    return h - floor(h)
  }

  static func vnoise(_ x: Double, _ y: Double) -> Double {
    let xi = floor(x)
    let yi = floor(y)
    var fx = x - xi
    var fy = y - yi
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    let a = hashD(xi, yi)
    let b = hashD(xi + 1, yi)
    let c = hashD(xi, yi + 1)
    let d = hashD(xi + 1, yi + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
  }

  static func fibDir(_ i: Double, _ n: Double) -> (Double, Double, Double) {
    let golden = Double.pi * (3 - sqrt(5))
    let y = 1 - (2 * (i + 0.5)) / n
    let rad = sqrt(1 - y * y)
    let a = i * golden
    return (rad * cos(a), y, rad * sin(a))
  }

  static func angleDelta(_ a: Double, _ b: Double) -> Double {
    atan2(sin(a - b), cos(a - b))
  }

  static func makeProj(
    yaw: Double,
    tilt: Double,
    cx: Double,
    cy: Double,
    scale: Double
  ) -> (Double, Double, Double) -> (Double, Double, Double) {
    let st = sin(tilt)
    let ct = cos(tilt)
    let sy = sin(yaw)
    let cyw = cos(yaw)
    return { x, y, z in
      let x1 = x * cyw + z * sy
      let z1 = -x * sy + z * cyw
      let y1 = y * ct - z1 * st
      let z2 = y * st + z1 * ct
      return (cx + x1 * scale, cy - y1 * scale, z2)
    }
  }

  static func radiusScale(_ size: Double, _ pow: Double) -> Double {
    (size / 300).pow(pow)
  }

  static func finalizeFrame(_ dots: [OrbDot], _ lines: [OrbLine], rMin: Double = 0.3) -> OrbFrame {
    var visible: [OrbDot] = []
    visible.reserveCapacity(dots.count)
    for var d in dots {
      if d.a < 0.02 { continue }
      d.r = max(rMin, d.r)
      visible.append(d)
    }
    visible.sort { lhs, rhs in
      if lhs.z == rhs.z { return false }
      return lhs.z < rhs.z
    }
    return OrbFrame(dots: visible, lines: lines.filter { $0.a >= 0.02 })
  }

  static func paint(_ frame: OrbFrame, dark: Bool, in context: inout GraphicsContext) {
    for line in frame.lines {
      let w = min(1, max(0, line.white))
      let g = dark ? 1 - w : w
      var path = Path()
      path.move(to: CGPoint(x: line.x1, y: line.y1))
      path.addLine(to: CGPoint(x: line.x2, y: line.y2))
      context.stroke(
        path,
        with: .color(Color(white: g, opacity: line.a)),
        lineWidth: line.w
      )
    }
    for d in frame.dots {
      let w = min(1, max(0, d.white))
      let g = dark ? 1 - w : w
      let rect = CGRect(x: d.x - d.r, y: d.y - d.r, width: d.r * 2, height: d.r * 2)
      context.fill(Path(ellipseIn: rect), with: .color(Color(white: g, opacity: d.a)))
    }
  }
}

private extension Double {
  func pow(_ exp: Double) -> Double { Foundation.pow(self, exp) }
}
