import SwiftUI

/// Shared calculator form — overlay sheet and first-class screen (CALC-US-1/2).
/// iPhone keeps this stacked ScrollView. iPad `PadCalcWorkspace` composes the
/// extracted editors in attacker | defender | visible-result panes.
struct CalculatorView: View {
  @Bindable var model: CalculatorViewModel
  var onExplain: ((String) -> Void)?
  var onExpand: (() -> Void)?
  var onDismiss: (() -> Void)?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
          CalcSideEditor(title: "Attacker", side: attackerBinding, model: model)
          CalcSideEditor(title: "Defender", side: defenderBinding, model: model)
          CalcMoveEditor(model: model)
          CalcFieldEditor(model: model)
          if model.investmentIsStatPoints {
            CalcStatPointsEditor(title: "Attacker", side: attackerBinding)
            CalcStatPointsEditor(title: "Defender", side: defenderBinding)
          }
          CalcResultBlock(model: model)
          CalcExplainActions(model: model, onExplain: onExplain, onExpand: onExpand)
        }
        .padding(Theme.Spacing.lg)
      }
      .background(Theme.canvas)
      .navigationTitle(model.presentation == .fullScreen ? "Calculator" : "Calc")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if model.presentation == .overlay {
          ToolbarItem(placement: .cancellationAction) {
            Button("Close") {
              model.dismiss()
              onDismiss?()
            }
          }
          .oakLidItem()
        } else {
          ToolbarItem(placement: .cancellationAction) {
            Button("Done") { onDismiss?() }
          }
          .oakLidItem()
        }
      }
      .task(id: calcEstimateKey(model)) {
        await model.recompute()
      }
    }
    .oakEnamelNav()
  }

  private var attackerBinding: Binding<CalcSide> {
    Binding(get: { model.scenario.attacker }, set: { model.scenario.attacker = $0 })
  }

  private var defenderBinding: Binding<CalcSide> {
    Binding(get: { model.scenario.defender }, set: { model.scenario.defender = $0 })
  }
}

// MARK: - Shared editors (iPhone stacked + iPad workspace)

@MainActor
func calcEstimateKey(_ model: CalculatorViewModel) -> String {
  let a = model.scenario.attacker
  let d = model.scenario.defender
  let field = model.scenario.field
  return [
    model.scenario.format.rawValue,
    a.species ?? "", a.item ?? "", a.ability ?? "", a.nature ?? "", a.tera ?? "",
    a.level.map(String.init) ?? "",
    calcEvKey(a.evs),
    d.species ?? "", d.item ?? "", d.ability ?? "", d.nature ?? "", d.tera ?? "",
    d.level.map(String.init) ?? "",
    calcEvKey(d.evs),
    model.scenario.move.slug ?? "", model.scenario.move.name ?? "",
    field?.weather?.rawValue ?? "",
    field?.reflect == true ? "R" : "",
    field?.lightScreen == true ? "LS" : "",
  ].joined(separator: "|")
}

func calcEvKey(_ evs: [String: Int]?) -> String {
  guard let evs else { return "" }
  return evs.keys.sorted().map { "\($0)=\(evs[$0] ?? 0)" }.joined(separator: ",")
}

func calcOptionalString(_ source: Binding<String?>) -> Binding<String> {
  Binding(
    get: { source.wrappedValue ?? "" },
    set: { source.wrappedValue = $0.isEmpty ? nil : $0 }
  )
}

struct CalcSideEditor: View {
  let title: String
  @Binding var side: CalcSide
  var model: CalculatorViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text(title)
        .font(Theme.display(.subheadline))
      TextField("Species", text: calcOptionalString($side.species))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      TextField("Item", text: calcOptionalString($side.item))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      TextField("Ability", text: calcOptionalString($side.ability))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      TextField("Nature", text: calcOptionalString($side.nature))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      if model.showsTeraField {
        TextField("Tera", text: calcOptionalString($side.tera))
          .textInputAutocapitalization(.never)
          .font(Theme.body(.body))
      }
      if model.showsLevelKnob {
        TextField(
          "Level",
          text: Binding(
            get: { side.level.map(String.init) ?? "" },
            set: { side.level = Int($0) }
          )
        )
        .keyboardType(.numberPad)
        .font(Theme.body(.body))
      } else {
        LabeledContent("Level", value: "50")
          .font(Theme.body(.body))
      }
    }
    .padding(Theme.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .oakCard(radius: Theme.Radius.md)
  }
}

struct CalcMoveEditor: View {
  @Bindable var model: CalculatorViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text("Move")
        .font(Theme.display(.subheadline))
      TextField(
        "Slug or name",
        text: Binding(
          get: { model.scenario.move.slug ?? model.scenario.move.name ?? "" },
          set: { model.scenario.move.slug = $0.isEmpty ? nil : $0 }
        )
      )
      .textInputAutocapitalization(.never)
      .font(Theme.body(.body))
    }
    .padding(Theme.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .oakCard(radius: Theme.Radius.md)
  }
}

struct CalcFieldEditor: View {
  @Bindable var model: CalculatorViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text("Field")
        .font(Theme.display(.subheadline))
      Picker(
        "Weather",
        selection: Binding(
          get: { model.scenario.field?.weather ?? .none },
          set: {
            var field = model.scenario.field ?? CalcField()
            field.weather = $0
            model.scenario.field = field
          }
        )
      ) {
        Text("None").tag(CalcWeather.none)
        Text("Sun").tag(CalcWeather.sun)
        Text("Rain").tag(CalcWeather.rain)
        Text("Sand").tag(CalcWeather.sand)
        Text("Snow").tag(CalcWeather.snow)
      }
      Toggle(
        "Reflect",
        isOn: Binding(
          get: { model.scenario.field?.reflect ?? false },
          set: {
            var field = model.scenario.field ?? CalcField()
            field.reflect = $0
            model.scenario.field = field
          }
        )
      )
      Toggle(
        "Light Screen",
        isOn: Binding(
          get: { model.scenario.field?.lightScreen ?? false },
          set: {
            var field = model.scenario.field ?? CalcField()
            field.lightScreen = $0
            model.scenario.field = field
          }
        )
      )
    }
    .padding(Theme.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .oakCard(radius: Theme.Radius.md)
  }
}

struct CalcStatPointsEditor: View {
  let title: String
  @Binding var side: CalcSide

  private let keys = ["hp", "atk", "def", "spa", "spd", "spe"]

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text("\(title) Stat Points")
        .font(Theme.display(.subheadline))
      ForEach(keys, id: \.self) { key in
        HStack {
          Text(key.uppercased())
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
            .frame(width: 36, alignment: .leading)
          TextField(
            "0",
            text: Binding(
              get: {
                guard let value = side.evs?[key] else { return "" }
                return String(value)
              },
              set: { raw in
                var evs = side.evs ?? [:]
                if let value = Int(raw), value >= 0 {
                  evs[key] = min(value, 32)
                } else if raw.isEmpty {
                  evs[key] = nil
                }
                side.evs = evs.isEmpty ? nil : evs
              }
            )
          )
          .keyboardType(.numberPad)
          .multilineTextAlignment(.trailing)
          .font(Theme.mono(.body))
        }
      }
    }
    .padding(Theme.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .oakCard(radius: Theme.Radius.md)
  }
}

struct CalcResultBlock: View {
  var model: CalculatorViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text("Estimate")
        .font(Theme.display(.subheadline))
      if model.displaysDamageRange, let min = model.displayedMinDamage, let max = model.displayedMaxDamage {
        Text("\(min)–\(max)")
          .font(Theme.display(.title2))
        if case .success(let ok) = model.result {
          Text("Estimate only — not an exact roll.")
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
          if !ok.applied.unsupported.isEmpty {
            Text("Not modeled: \(ok.applied.unsupported.joined(separator: ", "))")
              .font(Theme.body(.caption))
              .foregroundStyle(Theme.textSecondary)
          }
          if let caveat = ok.caveat, !caveat.isEmpty {
            Text(caveat)
              .font(Theme.body(.caption))
              .foregroundStyle(Theme.textSecondary)
          }
        }
      } else if model.isIncomplete {
        Text("Add both Pokémon and a move to see a range.")
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textSecondary)
      } else if case .failure(let miss) = model.result {
        Text(miss.detail ?? miss.error.rawValue.replacingOccurrences(of: "_", with: " "))
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textSecondary)
      } else {
        Text("No range yet.")
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textSecondary)
      }
    }
    .padding(Theme.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .oakCard(radius: Theme.Radius.md, tint: Theme.sunflower)
    .accessibilityElement(children: .combine)
  }
}

struct CalcExplainActions: View {
  var model: CalculatorViewModel
  var onExplain: ((String) -> Void)?
  var onExpand: (() -> Void)?

  var body: some View {
    VStack(spacing: Theme.Spacing.sm) {
      if let prompt = model.explainPrompt() {
        Button("Explain this calc") {
          onExplain?(prompt)
        }
        .buttonStyle(.oakSecondary)
      }
      if model.presentation == .overlay {
        Button("Expand") {
          model.expandToFullScreen()
          onExpand?()
        }
        .buttonStyle(.oakSecondary)
      }
    }
  }
}
