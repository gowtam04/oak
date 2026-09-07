import SwiftUI

/// Renders an answer's `damage_calc` as a two-column Enamel fact table
/// (JetBrains Mono 12/13, hairline between rows). Rows come only from the
/// structured `result` / `assumptions` maps — never invented from markdown.
///
/// Damage output is always non-authoritative (`is_estimate` is true by schema),
/// so a mute warning caption marks it an estimate. The optional `breakdown`
/// stays a disclosure. Mirrors the web `DamageReadout` data, restyled.
struct DamageCalcView: View {
  let damageCalc: DamageCalc

  @State private var breakdownExpanded = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header

      ForEach(tableRows) { entry in
        factRow(label: entry.label, value: entry.value)
      }

      if let breakdown = trimmed(damageCalc.breakdown) {
        breakdownDisclosure(breakdown)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Header

  private var header: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text("Damage")
        .font(Theme.body(.subheadline, weight: .semibold))
        .foregroundStyle(Theme.textPrimary)
      Spacer(minLength: 8)
      Text("Estimate")
        .font(Theme.body(.caption, weight: .medium))
        .foregroundStyle(Theme.warning)
        .accessibilityLabel("Estimate — not an exact value")
    }
    .padding(.bottom, 6)
  }

  // MARK: Rows

  /// Result rows first (key-sorted), then assumptions (key-sorted). Decoded
  /// maps have no inherent order; sorting keeps rendering deterministic.
  /// Prefixed ids so a shared key in both maps never collides.
  private var tableRows: [FactRow] {
    sortedEntries(damageCalc.result).map {
      FactRow(id: "result/\($0.key)", label: humanize($0.key), value: $0.value.displayText)
    } + sortedEntries(damageCalc.assumptions).map {
      FactRow(id: "assumption/\($0.key)", label: humanize($0.key), value: $0.value.displayText)
    }
  }

  private struct FactRow: Identifiable {
    let id: String
    let label: String
    let value: String
  }

  private func factRow(label: String, value: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Text(label)
        .font(Theme.mono(.caption, weight: .medium))
        .foregroundStyle(Theme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 8)
      Text(value)
        .font(Theme.mono(.footnote, weight: .regular))
        .monospacedDigit()
        .foregroundStyle(Theme.textPrimary)
        .multilineTextAlignment(.trailing)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.vertical, 6)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(Theme.separator)
        .frame(height: 1)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(label): \(value)")
  }

  // MARK: Breakdown

  private func breakdownDisclosure(_ breakdown: String) -> some View {
    DisclosureGroup(isExpanded: $breakdownExpanded) {
      Text(breakdown)
        .font(Theme.mono(.footnote))
        .foregroundStyle(Theme.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
        .padding(.top, 6)
    } label: {
      Text("Show the math")
        .font(Theme.body(.footnote, weight: .medium))
        .foregroundStyle(Theme.textSecondary)
    }
    .tint(Theme.textSecondary)
    .padding(.top, 6)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(Theme.separator)
        .frame(height: 1)
    }
    .animation(reduceMotion ? nil : Theme.Motion.smooth, value: breakdownExpanded)
  }

  // MARK: Helpers

  private func sortedEntries(
    _ map: [String: JSONScalar]
  ) -> [(key: String, value: JSONScalar)] {
    map.sorted { $0.key < $1.key }
  }

  /// `max_damage` → `max damage` for display; the value is rendered verbatim.
  private func humanize(_ key: String) -> String {
    key.replacingOccurrences(of: "_", with: " ")
  }

  private func trimmed(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

/// Display formatting for a `JSONScalar` cell. `private` (file-scoped) so it never
/// collides with a sibling AnswerCard view that formats the same maps.
private extension JSONScalar {
  var displayText: String {
    switch self {
    case .string(let value): return value
    case .int(let value): return String(value)
    case .double(let value): return String(value)
    case .bool(let value): return value ? "true" : "false"
    case .null: return "—"
    }
  }
}

#if DEBUG
#Preview("Damage estimate") {
  DamageCalcView(
    damageCalc: DamageCalc(
      assumptions: [
        "level": .int(50),
        "power": .int(120),
        "attack_stat": .int(182),
        "defense_stat": .int(115),
        "stab": .bool(true),
        "type_effectiveness": .double(2.0),
      ],
      result: [
        "min_damage": .int(162),
        "max_damage": .int(192),
        "percent_of_hp": .string("78–92%"),
      ],
      isEstimate: true,
      breakdown:
        "((2*50/5+2)*120*182/115)/50 + 2 = 86; ×1.5 STAB ×2 effectiveness; "
        + "85–100% roll → 162–192."
    )
  )
  .padding()
}

#Preview("No breakdown") {
  DamageCalcView(
    damageCalc: DamageCalc(
      assumptions: ["type_effectiveness": .double(0.5)],
      result: ["min_damage": .int(40), "max_damage": .int(48)],
      isEstimate: true,
      breakdown: nil
    )
  )
  .padding()
}
#endif
