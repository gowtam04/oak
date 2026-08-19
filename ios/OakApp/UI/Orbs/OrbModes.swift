import Foundation

/// thinking-orbs 0.3.1 mode frames.

enum OrbModes {
  static func frame(mode: OrbMode, size: Double, t: Double, opts: [String: Double]) -> OrbFrame {
    switch mode {
    case .orbits: return orbits(size, t, opts)
    case .globe: return globe(size, t, opts)
    case .rubik: return rubik(size, t, opts)
    case .wave: return wave(size, t, opts)
    case .web: return web(size, t, opts)
    case .braid: return braid(size, t, opts)
    case .ribbon, .ring: return ribbon(size, t, opts)
    case .morph: return morph(size, t, opts)
    }
  }

  // MARK: Orbits

  private static func orbits(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let cx = size / 2
    let cy = size / 2
    let R = (size / 2) * 0.82
    let pt = OrbCore.makeProj(yaw: t * 0.12, tilt: 0.3, cx: cx, cy: cy, scale: 1)
    let rs = OrbCore.radiusScale(size, o["rsPow"] ?? 0.6)
    var dots: [OrbDot] = []
    let orbitN = Int(o["orbitN"] ?? 12)
    let ghostN = Int(o["ghostN"] ?? 40)
    let particles = Int(o["particles"] ?? 3)
    if orbitN <= 0 { return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3) }
    for orb in 0..<orbitN {
      let h1 = OrbCore.hashD(Double(orb), 1.7)
      let h2 = OrbCore.hashD(Double(orb), 5.2)
      let h3 = OrbCore.hashD(Double(orb), 8.9)
      let ro = R * (0.45 + 0.52 * h1)
      let th = h1 * 2 * Double.pi
      let phi = acos(2 * h2 - 1)
      let nx = sin(phi) * cos(th)
      let ny = cos(phi)
      let nz = sin(phi) * sin(th)
      var ux = -ny
      var uy = nx
      let uz = 0.0
      let ul = max(1e-6, sqrt(ux * ux + uy * uy))
      ux /= ul
      uy /= ul
      let vx = ny * uz - nz * uy
      let vy = nz * ux - nx * uz
      let vz = nx * uy - ny * ux
      let speed = (0.25 + 0.55 * h3) * (h3 > 0.5 ? 1.0 : -1.0)
      if ghostN > 0 {
        for k in 0..<ghostN {
          let a = (Double(k) / Double(ghostN)) * 2 * Double.pi
          let (px, py, z) = pt(
            (ux * cos(a) + vx * sin(a)) * ro,
            (uy * cos(a) + vy * sin(a)) * ro,
            (uz * cos(a) + vz * sin(a)) * ro
          )
          let depth = (z / ro + 1) / 2
          dots.append(OrbDot(
            x: px, y: py, z: z, r: (o["ghostR"] ?? 0.9) * rs,
            white: 0.72, a: (o["ghostA"] ?? 0.5) * (0.4 + 0.6 * depth)
          ))
        }
      }
      if particles > 0 {
        for m in 0..<particles {
          let a = t * speed + (Double(m) / Double(particles)) * 2 * Double.pi + h2 * 6
          let (px, py, z) = pt(
            (ux * cos(a) + vx * sin(a)) * ro,
            (uy * cos(a) + vy * sin(a)) * ro,
            (uz * cos(a) + vz * sin(a)) * ro
          )
          let depth = (z / ro + 1) / 2
          dots.append(OrbDot(
            x: px, y: py, z: z,
            r: ((o["partR"] ?? 1.2) + (o["partRDepth"] ?? 1.6) * depth) * rs,
            white: 0.3 - 0.22 * depth, a: 1
          ))
        }
      }
    }
    return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3)
  }

  // MARK: Globe

  private static func globe(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let spin = 0.5
    let cx = size / 2
    let cy = size / 2
    let radius = (size / 2) * 0.82
    let tilt = 0.4 + 0.06 * sin(t * 0.35)
    let pt = OrbCore.makeProj(yaw: t * spin, tilt: tilt, cx: cx, cy: cy, scale: radius)
    let scan = t * (spin + (1.7 - spin) * (o["scanMul"] ?? 1))
    let rs = OrbCore.radiusScale(size, o["rsPow"] ?? 0.6)
    let dimBase = o["dimBase"] ?? 1
    var dots: [OrbDot] = []
    let latRings = o["latRings"] ?? 17
    let lonDensity = o["lonDensity"] ?? 44
    var li = 0.0
    while li <= latRings {
      let lat = -Double.pi / 2 + (li / latRings) * Double.pi
      let cosLat = cos(lat)
      let sinLat = sin(lat)
      let lonCount = max(1, Int((abs(cosLat) * lonDensity).rounded()))
      for lj in 0..<lonCount {
        let lon = (Double(lj) / Double(lonCount)) * 2 * Double.pi
        let (px, py, z) = pt(cosLat * cos(lon), sinLat, cosLat * sin(lon))
        let depth = (z + 1) / 2
        let d = OrbCore.angleDelta(lon + t * spin, scan)
        let boost = exp(-(d * d) / 0.18) * max(0, z)
        dots.append(OrbDot(
          x: px, y: py, z: z,
          r: ((o["rBase"] ?? 0.6) + (o["rDepth"] ?? 1.7) * depth + (o["rBoost"] ?? 1) * boost) * rs,
          white: (o["inkFar"] ?? 0.62) - (o["inkSpan"] ?? 0.54) * depth,
          a: dimBase + (1 - dimBase) * min(1, boost)
        ))
      }
      li += 1
    }
    return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3)
  }

  // MARK: Rubik

  private struct Move {
    var axis: Int
    var lo: Double
    var hi: Double
    var ang: Double
  }

  private static func solveCycle(time: Double, count: Int, slotDur: Double, rest: Double) -> (amount: [Double], active: Int) {
    let cyc = 2 * Double(count) * slotDur + rest
    let tc = time.truncatingRemainder(dividingBy: cyc)
    var amount = Array(repeating: 0.0, count: count)
    var active = -1
    if tc < 2 * Double(count) * slotDur {
      let slot = Int(floor(tc / slotDur))
      let p = (tc - Double(slot) * slotDur) / slotDur
      let cl = min(1, p / 0.7)
      let ep = 1 - pow(1 - cl, 3)
      if slot < count {
        if slot > 0 { for i in 0..<slot { amount[i] = 1 } }
        amount[slot] = ep
        active = slot
      } else {
        let u = 2 * count - 1 - slot
        if u > 0 { for i in 0..<u { amount[i] = 1 } }
        if u >= 0 && u < count {
          amount[u] = 1 - ep
          active = u
        }
      }
    }
    return (amount, active)
  }

  private static func makeMoves(_ count: Int) -> [Move] {
    (0..<count).map { i in
      let axis = min(2, Int(floor(OrbCore.hashD(Double(i), 2.3) * 3)))
      let lo = -1.0 + 0.5 * Double(min(3, Int(floor(OrbCore.hashD(Double(i), 5.9) * 4))))
      let dir: Double = OrbCore.hashD(Double(i), 7.7) < 0.5 ? 1 : -1
      return Move(axis: axis, lo: lo, hi: lo + 0.5, ang: (dir * Double.pi) / 2)
    }
  }

  private static func applyMoves(
    _ pt3: (Double, Double, Double),
    _ moves: [Move],
    _ amount: [Double],
    _ active: Int
  ) -> (Double, Double, Double, Bool) {
    var (x, y, z) = pt3
    var inActive = false
    for i in 0..<moves.count {
      if amount[i] <= 0 { continue }
      let mv = moves[i]
      let coord = mv.axis == 0 ? x : mv.axis == 1 ? y : z
      if coord < mv.lo || coord >= mv.hi { continue }
      if i == active { inActive = true }
      let a = mv.ang * amount[i]
      let ca = cos(a)
      let sa = sin(a)
      if mv.axis == 0 {
        let y2 = y * ca - z * sa
        z = y * sa + z * ca
        y = y2
      } else if mv.axis == 1 {
        let x2 = x * ca + z * sa
        z = -x * sa + z * ca
        x = x2
      } else {
        let x2 = x * ca - y * sa
        y = x * sa + y * ca
        x = x2
      }
    }
    return (x, y, z, inActive)
  }

  private static func rubik(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let cx = size / 2
    let cy = size / 2
    let R = (size / 2) * 0.82
    let pt = OrbCore.makeProj(yaw: t * 0.55, tilt: 0.35 + 0.1 * sin(t * 0.9), cx: cx, cy: cy, scale: R)
    let rs = OrbCore.radiusScale(size, o["rsPow"] ?? 0.6)
    let moveCount = Int(o["moveCount"] ?? 14)
    let moves = makeMoves(moveCount)
    let sc = solveCycle(time: t, count: moveCount, slotDur: 0.42, rest: 1.2)
    var dots: [OrbDot] = []
    let latRings = o["latRings"] ?? 15
    let lonDensity = o["lonDensity"] ?? 40
    var li = 0.0
    while li <= latRings {
      let lat = -Double.pi / 2 + (li / latRings) * Double.pi
      let cosLat = cos(lat)
      let sinLat = sin(lat)
      let lonCount = max(1, Int((abs(cosLat) * lonDensity).rounded()))
      for lj in 0..<lonCount {
        let lon = (Double(lj) / Double(lonCount)) * 2 * Double.pi
        let (x, y, z, inActive) = applyMoves(
          (cosLat * cos(lon), sinLat, cosLat * sin(lon)),
          moves, sc.amount, sc.active
        )
        let (px, py, zr) = pt(x, y, z)
        let depth = (zr + 1) / 2
        dots.append(OrbDot(
          x: px, y: py, z: zr,
          r: ((o["rBase"] ?? 0.6) + (o["rDepth"] ?? 1.7) * depth + (inActive ? (o["rActive"] ?? 0.3) : 0)) * rs,
          white: (o["inkFar"] ?? 0.62) - (o["inkSpan"] ?? 0.54) * depth - (inActive ? 0.14 : 0),
          a: 1
        ))
      }
      li += 1
    }
    return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3)
  }

  // MARK: Wave

  private static func wave(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let cx = size / 2
    let cy = size / 2
    let R = (size / 2) * 0.874
    let pt = OrbCore.makeProj(yaw: t * 0.18, tilt: 0.38, cx: cx, cy: cy, scale: 1)
    let rs = OrbCore.radiusScale(size, o["rsPow"] ?? 0.6)
    var dots: [OrbDot] = []
    let rings = o["rings"] ?? 15
    let lonDensity = o["lonDensity"] ?? 40
    var ri = 0.0
    while ri <= rings {
      let lat = -Double.pi / 2 + (ri / rings) * Double.pi
      let cosLat = cos(lat)
      let sinLat = sin(lat)
      let w = 0.62 * sin(t * 2.1 - ri * 0.52) + 0.38 * sin(t * 1.27 + ri * 0.83)
      let rr = R * (0.88 + 0.105 * w)
      let lonCount = max(1, Int((abs(cosLat) * lonDensity).rounded()))
      for lj in 0..<lonCount {
        let lon = (Double(lj) / Double(lonCount)) * 2 * Double.pi
        let (px, py, z) = pt(cosLat * cos(lon) * rr, sinLat * rr, cosLat * sin(lon) * rr)
        let depth = (z / R + 1) / 2
        let crest = max(0, w)
        dots.append(OrbDot(
          x: px, y: py, z: z,
          r: ((o["rBase"] ?? 0.6) + (o["rDepth"] ?? 1.7) * depth) * (1 + 0.4 * crest) * rs,
          white: 0.66 - 0.56 * depth - 0.1 * crest, a: 1
        ))
      }
      ri += 1
    }
    return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3)
  }

  // MARK: Web

  private static func web(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let cx = size / 2
    let cy = size / 2
    let R = (size / 2) * 0.8 * (o["spread"] ?? 1)
    let pt = OrbCore.makeProj(yaw: t * 0.12, tilt: 0.32, cx: cx, cy: cy, scale: R)
    let rs = OrbCore.radiusScale(size, o["rsPow"] ?? 0.6)
    let nodeN = Int(o["nodeN"] ?? 30)
    let thr = o["thr"] ?? 0.72
    let nodeR = o["nodeR"] ?? 1.4
    let nodeRDepth = o["nodeRDepth"] ?? 1.8
    var nodes: [(Double, Double, Double)] = []
    if nodeN > 0 {
      for i in 0..<nodeN {
        let d = OrbCore.fibDir(Double(i), Double(nodeN))
        let x = d.0 + 0.3 * (OrbCore.vnoise(Double(i) * 0.31 + 9, t * 0.24) - 0.5) * 2
        let y = d.1 + 0.3 * (OrbCore.vnoise(Double(i) * 0.53 + 27, t * 0.21) - 0.5) * 2
        let z = d.2 + 0.3 * (OrbCore.vnoise(Double(i) * 0.77 + 55, t * 0.27) - 0.5) * 2
        let l = sqrt(x * x + y * y + z * z)
        nodes.append((x / l, y / l, z / l))
      }
    }
    var lines: [OrbLine] = []
    var dots: [OrbDot] = []
    if nodeN > 1 {
      for i in 0..<nodeN {
        for j in (i + 1)..<nodeN {
          let dx = nodes[i].0 - nodes[j].0
          let dy = nodes[i].1 - nodes[j].1
          let dz = nodes[i].2 - nodes[j].2
          let dist = sqrt(dx * dx + dy * dy + dz * dz)
          if dist >= thr { continue }
          let (x1, y1, z1) = pt(nodes[i].0, nodes[i].1, nodes[i].2)
          let (x2, y2, z2) = pt(nodes[j].0, nodes[j].1, nodes[j].2)
          let depth = ((z1 + z2) / 2 + 1) / 2
          lines.append(OrbLine(
            x1: x1, y1: y1, x2: x2, y2: y2, white: 0.42,
            a: (1 - dist / thr) * (0.3 + 0.55 * depth),
            w: max(0.6, (o["lineW"] ?? 0.8) * rs)
          ))
        }
      }
    }
    if nodeN > 0 {
      for i in 0..<nodeN {
        let (px, py, z) = pt(nodes[i].0, nodes[i].1, nodes[i].2)
        let depth = (z + 1) / 2
        let pulse = 1 + 0.25 * sin(t * 1.4 + Double(i) * 2.7)
        dots.append(OrbDot(
          x: px, y: py, z: z, r: (nodeR + nodeRDepth * depth) * pulse * rs,
          white: 0.55 - 0.45 * depth, a: 1
        ))
      }
    }
    let signals = Int(o["signals"] ?? 5)
    if signals > 0, nodeN > 0 {
      for s in 0..<signals {
        let seg = floor(t * 0.55 + Double(s) * 7.31)
        let a = Int(floor(OrbCore.hashD(seg, Double(s) * 3.1 + 1.7) * Double(nodeN)))
        let b = Int(floor(OrbCore.hashD(seg, Double(s) * 5.7 + 4.2) * Double(nodeN)))
        if a == b { continue }
        let f = OrbCore.frac(t * 0.55 + Double(s) * 7.31)
        let x = OrbCore.lerp(nodes[a].0, nodes[b].0, f)
        let y = OrbCore.lerp(nodes[a].1, nodes[b].1, f)
        let z = OrbCore.lerp(nodes[a].2, nodes[b].2, f)
        let l = max(1e-6, sqrt(x * x + y * y + z * z))
        let (px, py, zr) = pt(x / l, y / l, z / l)
        let depth = (zr + 1) / 2
        dots.append(OrbDot(
          x: px, y: py, z: zr, r: (nodeR * 1.5 + nodeRDepth * depth) * rs,
          white: 0.05, a: 0.5 + 0.5 * depth
        ))
      }
    }
    return OrbCore.finalizeFrame(dots, lines, rMin: o["rMin"] ?? 0.3)
  }

  // MARK: Braid

  private static func braid(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let cx = size / 2
    let cy = size / 2
    let R = (size / 2) * 0.76
    let pt = OrbCore.makeProj(yaw: t * 0.4, tilt: 0.3, cx: cx, cy: cy, scale: 1)
    let rs = OrbCore.radiusScale(size, o["rsPow"] ?? 0.6)
    var dots: [OrbDot] = []
    let ghostN = Int(o["ghostN"] ?? 150)
    if ghostN > 0 {
      for i in 0..<ghostN {
        let d = OrbCore.fibDir(Double(i), Double(ghostN))
        let (px, py, z) = pt(d.0 * R, d.1 * R, d.2 * R)
        let depth = (z / R + 1) / 2
        dots.append(OrbDot(x: px, y: py, z: z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth))
      }
    }
    let strandN = Int(o["strandN"] ?? 52)
    let turns = o["turns"] ?? 3
    if strandN > 0 {
      for s in 0..<3 {
        let phase = (Double(s) / 3) * 2 * Double.pi
        for i in 0..<strandN {
          let u = (OrbCore.frac(Double(i) / Double(strandN) + t * 0.045) * 2 - 1) * 0.96
          let surf = sqrt(max(0, 1 - u * u))
          let endFade = min(1, (1 - abs(u)) / 0.1)
          let a = u * Double.pi * turns + phase
          let weave = 1 + 0.075 * sin(u * Double.pi * turns * 2 + phase * 2 + t * 0.8)
          let rr = surf * R * weave
          let (px, py, zr) = pt(cos(a) * rr, u * R * weave, sin(a) * rr)
          let depth = (zr / R + 1) / 2
          dots.append(OrbDot(
            x: px, y: py, z: zr,
            r: ((o["rBase"] ?? 1.2) + (o["rDepth"] ?? 1.8) * depth) * rs,
            white: 0.55 - 0.45 * depth,
            a: endFade * (0.45 + 0.55 * depth)
          ))
        }
      }
    }
    return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3)
  }

  // MARK: Ribbon / ring

  private static func ribbon(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let cx = size / 2
    let cy = size / 2
    let R = (size / 2) * 0.78
    let spin = o["spin"] ?? 1
    let camTilt = 0.3
    let pt = OrbCore.makeProj(yaw: t * 0.1 * spin, tilt: camTilt, cx: cx, cy: cy, scale: 1)
    let rs = OrbCore.radiusScale(size, o["rsPow"] ?? 0.6)
    var dots: [OrbDot] = []
    let ghostN = Int(o["ghostN"] ?? 150)
    if ghostN > 0 {
      for i in 0..<ghostN {
        let d = OrbCore.fibDir(Double(i), Double(ghostN))
        let (px, py, z) = pt(d.0 * R, d.1 * R, d.2 * R)
        let depth = (z / R + 1) / 2
        dots.append(OrbDot(x: px, y: py, z: z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth))
      }
    }
    let faceOn = (o["faceOn"] ?? 0) != 0
    let ya = t * 0.24 * spin
    let ta = faceOn ? -camTilt : 0.55 + 0.3 * sin(t * 0.18) * spin
    let ux = cos(ya)
    let uy = 0.0
    let uz = sin(ya)
    let vx = -uz * sin(ta)
    let vy = cos(ta)
    let vz = ux * sin(ta)
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    let wobAmp = 0.23 * (o["wobMul"] ?? 1)
    let baseR = faceOn ? R / (1 + 0.85 * wobAmp) : R
    let baseLanes = o["lanes"] ?? 5
    let segs = Int(o["segs"] ?? 88)
    let lanes = max(1, Int((baseLanes * (o["bandMul"] ?? 1)).rounded()))
    if segs > 0 {
      for w in 0..<lanes {
        let laneOff = (Double(w) - Double(lanes - 1) / 2) * 0.075
        let edge = abs(Double(w) - Double(lanes - 1) / 2) / max(1, Double(lanes - 1) / 2)
        for k in 0..<segs {
          let a = (Double(k) / Double(segs)) * 2 * Double.pi
          let wobMul = o["wobMul"] ?? 1
          let wob = (0.16 * sin(a * 3 - t * 1.7 + Double(w) * 0.22) + 0.07 * sin(a * 5 + t * 1.1)) * wobMul
          let radial = faceOn ? 1 + wob : 1
          let off = faceOn ? laneOff : laneOff + wob
          let x = ux * cos(a) + vx * sin(a) + nx * off
          let y = uy * cos(a) + vy * sin(a) + ny * off
          let z = uz * cos(a) + vz * sin(a) + nz * off
          let l = sqrt(x * x + y * y + z * z)
          let rr = baseR * radial
          let (px, py, zr) = pt((x / l) * rr, (y / l) * rr, (z / l) * rr)
          let depth = (zr / R + 1) / 2
          dots.append(OrbDot(
            x: px, y: py, z: zr,
            r: ((o["rBase"] ?? 1.1) + (o["rDepth"] ?? 1.7) * depth) * (1 - 0.25 * edge) * rs,
            white: 0.52 - 0.44 * depth + 0.18 * edge,
            a: 0.4 + 0.6 * depth
          ))
        }
      }
    }
    return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3)
  }

  // MARK: Morph

  private static func smoothE(_ x: Double) -> Double { x * x * (3 - 2 * x) }

  private static func polyPath(_ verts: [(Double, Double)]) -> (Double) -> (Double, Double) {
    let V = verts.count
    var L: [Double] = []
    var total = 0.0
    for i in 0..<V {
      let a = verts[i]
      let b = verts[(i + 1) % V]
      let l = hypot(b.0 - a.0, b.1 - a.1)
      L.append(l)
      total += l
    }
    return { f in
      var target = f * total
      var i = 0
      while target > L[i] && i < V - 1 {
        target -= L[i]
        i += 1
      }
      let a = verts[i]
      let b = verts[(i + 1) % V]
      let ff = L[i] != 0 ? min(1, target / L[i]) : 0
      return (a.0 + (b.0 - a.0) * ff, a.1 + (b.1 - a.1) * ff)
    }
  }

  private static func circle(_ f: Double) -> (Double, Double) {
    let a = -Double.pi / 2 + f * 2 * Double.pi
    return (cos(a) * 0.24, sin(a) * 0.24)
  }

  private static func triangle(_ f: Double) -> (Double, Double) {
    polyPath([(0.0, -0.26), (0.24, 0.16), (-0.24, 0.16)])(f)
  }

  private static func square(_ f: Double) -> (Double, Double) {
    polyPath([(0, -0.2), (0.2, -0.2), (0.2, 0.2), (-0.2, 0.2), (-0.2, -0.2)])(f)
  }

  private static func morph(_ size: Double, _ t: Double, _ o: [String: Double]) -> OrbFrame {
    let cycle: [(Double) -> (Double, Double)] = [circle, triangle, square]
    let K = cycle.count
    let hold = 1.4
    let morphDur = 0.9
    let seg = hold + morphDur
    let tc = t.truncatingRemainder(dividingBy: seg * Double(K))
    let k = Int(floor(tc / seg))
    let local = tc - Double(k) * seg
    let m = local > hold ? smoothE((local - hold) / morphDur) : 0
    let sprd = o["spread"] ?? 1
    let pA = cycle[k]
    let pB = cycle[(k + 1) % K]
    let M = 160
    var pts: [(Double, Double)] = []
    for i in 0..<M {
      let f = Double(i) / Double(M)
      let a = pA(f)
      let b = pB(f)
      pts.append(((a.0 + (b.0 - a.0) * m) * sprd, (a.1 + (b.1 - a.1) * m) * sprd))
    }
    var L: [Double] = []
    var total = 0.0
    for i in 0..<M {
      let a = pts[i]
      let b = pts[(i + 1) % M]
      let l = hypot(b.0 - a.0, b.1 - a.1)
      L.append(l)
      total += l
    }
    let n = max(6, Int((34 * (o["iconD"] ?? 1)).rounded()))
    let re = (o["rDot"] ?? 0.021) * 1.35 * sprd
    let pulse = 1 + 0.02 * sin(local * 3.1)
    var dots: [OrbDot] = []
    let c2 = size / 2
    var segI = 0
    var acc = 0.0
    for k2 in 0..<n {
      let target = (Double(k2) / Double(n)) * total
      while acc + L[segI] < target && segI < M - 1 {
        acc += L[segI]
        segI += 1
      }
      let a = pts[segI]
      let b = pts[(segI + 1) % M]
      let f = L[segI] != 0 ? min(1, (target - acc) / L[segI]) : 0
      let x = (a.0 + (b.0 - a.0) * f) * pulse
      let y = (a.1 + (b.1 - a.1) * f) * pulse
      dots.append(OrbDot(
        x: c2 + x * size, y: c2 + y * size, z: 0,
        r: max(0.35, re * size), white: 0.1, a: 1
      ))
    }
    return OrbCore.finalizeFrame(dots, [], rMin: o["rMin"] ?? 0.3)
  }
}
