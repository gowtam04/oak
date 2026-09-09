import Foundation
import Testing
@testable import OakApp

/// Golden-vector check against thinking-orbs 0.3.1 (trimmed fixture).
struct OrbEngineTests {
  @Test
  func goldenFixtureMatchesWithinTolerance() throws {
    let data = try Fixtures.data("orbs-golden.fixture.json")
    let fixture = try JSONDecoder().decode(GoldenFixture.self, from: data)
    #expect(!fixture.cases.isEmpty)
    let eps = fixture.tolerance
    for c in fixture.cases {
      guard let state = OrbState(rawValue: c.state), let size = OrbSize(rawValue: c.size) else {
        Issue.record("unknown state/size \(c.key)")
        continue
      }
      let frame = OrbEngine.frame(state: state, size: size, t: c.t)
      if state == .connecting {
        #expect(abs(frame.dots.count - c.dotCount) <= 1, Comment(rawValue: "\(c.key) dots"))
        #expect(abs(frame.lines.count - c.lineCount) <= 2, Comment(rawValue: "\(c.key) lines"))
        continue
      }
      #expect(frame.dots.count == c.dotCount, Comment(rawValue: c.key))
      #expect(frame.lines.count == c.lineCount, Comment(rawValue: c.key))
      let gotDots = frame.dots.flatMap { [$0.x, $0.y, $0.z, $0.r, $0.white, $0.a] }
      let gotLines = frame.lines.flatMap { [$0.x1, $0.y1, $0.x2, $0.y2, $0.white, $0.a, $0.w] }
      #expect(gotDots.count == c.dots.count, Comment(rawValue: "\(c.key) dots"))
      #expect(gotLines.count == c.lines.count, Comment(rawValue: "\(c.key) lines"))
      for i in 0..<min(gotDots.count, c.dots.count) {
        #expect(abs(gotDots[i] - c.dots[i]) <= eps, Comment(rawValue: "\(c.key) dots[\(i)]"))
      }
      for i in 0..<min(gotLines.count, c.lines.count) {
        #expect(abs(gotLines[i] - c.lines[i]) <= eps, Comment(rawValue: "\(c.key) lines[\(i)]"))
      }
    }
  }
}

private struct GoldenFixture: Decodable {
  var tolerance: Double
  var cases: [GoldenCase]
}

private struct GoldenCase: Decodable {
  var key: String
  var state: String
  var size: Int
  var t: Double
  var dotCount: Int
  var lineCount: Int
  var dots: [Double]
  var lines: [Double]
}
