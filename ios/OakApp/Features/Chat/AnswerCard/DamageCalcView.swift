import SwiftUI

/// Renders an answer's `damage_calc` — Oak's worked damage figure (M-AC-1.2 /
/// M-SUCCESS-3). Damage output is **always non-authoritative** (`is_estimate` is
/// `true` by schema), so the readout is clearly and prominently marked an
/// estimate: a "ESTIMATE" capsule pairing a tint with the ± icon **and** the word,
/// reinforced by a warning-tinted card border — never color alone (M-AC-UI9.3).
///
/// Below the marker it shows the computed `result` (e.g. min/max damage), the
/// `assumptions` that produced it, and — when present — an optional `breakdown`
/// disclosure ("show the math"). The result/assumption tables are built from the
/// structured `[String: JSONScalar]` maps (not from markdown), with values in the
/// monospaced "precise data" face. Colors come from `Theme` and type uses
/// Dynamic-Type styles, so the card adapts to light/dark and reflows (never clips)
/// at large text sizes (M-AC-1.4, M-AC-6.2, M-UI-US-1, M-UI-US-9).
///
/// Mirrors the web `DamageReadout`. The free-form maps are unordered after decode,
/// so entries render in a stable key-sorted order.
struct DamageCalcView: View {
  let damageCalc: DamageCalc

  @State private var breakdownExpanded = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      header

      if !damageCalc.result.isEmpty {
        resultSection
      }

      if !damageCalc.assumptions.isEmpty {
        assumptionsSection
      }

      if let breakdown = trimmed(damageCalc.breakdown) {
        breakdownDisclosure(breakdown)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .oakCard(radius: Theme.Radius.md)
    // A warning-tinted gradient hairline in BOTH modes (oakCard's own stroke is
    // dark-mode-only and neutral) — the damage estimate always carries this cue.
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
        .strokeBorder(
          LinearGradient(
            colors: [Theme.warning.opacity(0.4), Theme.warning.opacity(0.15)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          ),
          lineWidth: 1
        )
    )
  }

  // MARK: Header

  /// Title + the always-present estimate marker.
  private var header: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Label("Damage", systemImage: "bolt.fill")
        .font(Theme.display(.subheadline))
        .foregroundStyle(Theme.textPrimary)
      Spacer(minLength: 8)
      estimateBadge
    }
  }

  /// The "ESTIMATE" capsule — tint + ± icon + word together carry the meaning, so
  /// the signal survives color-blindness and grayscale (M-AC-UI9.3).
  private var estimateBadge: some View {
    Label {
      Text("ESTIMATE")
        .font(Theme.body(.caption2, weight: .bold))
    } icon: {
      Image(systemName: "plusminus")
        .imageScale(.small)
    }
    .foregroundStyle(Theme.warning)
    .padding(.horizontal, 8)
    .padding(.vertical, 3)
    .background(Theme.warning.opacity(0.15), in: Capsule())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Estimate — not an exact value")
  }

  // MARK: Result

  /// The computed figure(s) — an inset readout (soul.md "well" elevation): a
  /// sunken panel holding mono caption labels and tabular numerals. Whole
  /// numbers (the min/max damage figures) get the emphasized title3 face with a
  /// one-shot count-up; a percent scalar (e.g. `"78–92%"`) is the headline figure
  /// and reads at the same large size; any other scalar renders at body size.
  private var resultSection: some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(sortedEntries(damageCalc.result), id: \.key) { entry in
        HStack(alignment: .firstTextBaseline, spacing: 12) {
          Text(humanize(entry.key))
            .font(Theme.mono(.caption, weight: .medium))
            .foregroundStyle(Theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 8)
          resultValue(entry.value)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(humanize(entry.key)): \(entry.value.displayText)")
      }
    }
    .padding(Theme.Spacing.md)
    .oakInsetWell(cornerRadius: Theme.Radius.md)
  }

  @ViewBuilder
  private func resultValue(_ value: JSONScalar) -> some View {
    if case .int(let intValue) = value {
      CountUpIntText(value: intValue)
        .multilineTextAlignment(.trailing)
    } else if case .string(let stringValue) = value, stringValue.contains("%") {
      // The percent-of-HP figure is the readout's headline — same emphasized
      // size as the count-up integers, just no count-up animation (it's a range).
      Text(stringValue)
        .font(Theme.mono(.title3, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(Theme.textPrimary)
        .multilineTextAlignment(.trailing)
        .fixedSize(horizontal: false, vertical: true)
    } else {
      Text(value.displayText)
        .font(Theme.mono(.body, weight: .semibold))
        .foregroundStyle(Theme.textPrimary)
        .multilineTextAlignment(.trailing)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  // MARK: Assumptions

  /// Every assumption that fed the estimate, shown inline (no disclosure) so the
  /// basis of the number is always visible (M-SUCCESS-3 — reasoning is surfaced).
  private var assumptionsSection: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Assumptions")
        .font(Theme.body(.caption, weight: .semibold))
        .foregroundStyle(Theme.textSecondary)

      ForEach(sortedEntries(damageCalc.assumptions), id: \.key) { entry in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(humanize(entry.key))
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 8)
          Text(entry.value.displayText)
            .font(Theme.mono(.caption))
            .foregroundStyle(Theme.textPrimary)
            .multilineTextAlignment(.trailing)
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(humanize(entry.key)): \(entry.value.displayText)")
      }
    }
  }

  // MARK: Breakdown

  /// The optional worked breakdown, collapsed by default to avoid clutter. Shown
  /// in the monospaced face (it's a formula trace) and selectable for copy.
  private func breakdownDisclosure(_ breakdown: String) -> some View {
    DisclosureGroup(isExpanded: $breakdownExpanded) {
      Text(breakdown)
        .font(Theme.mono(.footnote))
        .foregroundStyle(Theme.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
        .padding(10)
        .background(
          Theme.textPrimary.opacity(0.05),
          in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
        )
        .padding(.top, 6)
    } label: {
      Label("Show the math", systemImage: "function")
        .font(Theme.body(.footnote, weight: .medium))
        .foregroundStyle(Theme.textSecondary)
    }
    .tint(Theme.textSecondary)
    .animation(reduceMotion ? nil : Theme.Motion.smooth, value: breakdownExpanded)
  }

  // MARK: Helpers

  /// Stable, key-sorted entries — decoded `[String: JSONScalar]` maps have no
  /// inherent order, so sorting keeps rendering deterministic across re-decodes.
  private func sortedEntries(
    _ map: [String: JSONScalar]
  ) -> [(key: String, value: JSONScalar)] {
    map.sorted { $0.key < $1.key }
  }

  /// `max_damage` → `max damage` for display; the value is rendered verbatim.
  private func humanize(_ key: String) -> String {
    key.replacingOccurrences(of: "_", with: " ")
  }

  /// A non-empty, whitespace-trimmed string, or `nil` (render-if-present rule).
  private func trimmed(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

/// A `damage_calc` integer result (e.g. `min_damage`), rendered in the emphasized
/// title3 mono face with a one-shot count-up from 0 on first appear — `.numericText()`
/// rolls the digits as the backing state animates to its final value. Reduce Motion
/// skips straight to the final value (no roll).
private struct CountUpIntText: View {
  let value: Int

  @State private var displayed = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Text("\(displayed)")
      .font(Theme.mono(.title3, weight: .semibold))
      .foregroundStyle(Theme.textPrimary)
      .contentTransition(.numericText())
      .fixedSize(horizontal: false, vertical: true)
      .onAppear {
        if reduceMotion {
          displayed = value
        } else {
          withAnimation(Theme.Motion.smooth) {
            displayed = value
          }
        }
      }
  }
}

/// Display formatting for a `JSONScalar` cell. `private` (file-scoped) so it never
/// collides with a sibling AnswerCard view that formats the same maps.
private extension JSONScalar {
  /// A human-readable rendering of the scalar. Integers and strings render
  /// verbatim; a true fractional keeps its precision; a null shows an em dash.
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
