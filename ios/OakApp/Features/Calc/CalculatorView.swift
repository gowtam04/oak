import SwiftUI

/// Shared calculator form — overlay sheet and first-class screen (CALC-US-1/2).
struct CalculatorView: View {
  @Bindable var model: CalculatorViewModel
  var onExplain: ((String) -> Void)?
  var onExpand: (() -> Void)?
  var onDismiss: (() -> Void)?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
          sideEditor(title: "Attacker", side: attackerBinding)
          sideEditor(title: "Defender", side: defenderBinding)
          moveEditor
          fieldEditor
          if model.investmentIsStatPoints {
            statPointsEditor(title: "Attacker", side: attackerBinding)
            statPointsEditor(title: "Defender", side: defenderBinding)
          }
          resultBlock
          actions
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
        } else {
          ToolbarItem(placement: .cancellationAction) {
            Button("Done") { onDismiss?() }
          }
        }
      }
      .task(id: estimateKey) {
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

  private var estimateKey: String {
    let a = model.scenario.attacker
    let d = model.scenario.defender
    let field = model.scenario.field
    return [
      model.scenario.format.rawValue,
      a.species ?? "", a.item ?? "", a.ability ?? "", a.nature ?? "", a.tera ?? "",
      a.level.map(String.init) ?? "",
      evKey(a.evs),
      d.species ?? "", d.item ?? "", d.ability ?? "", d.nature ?? "", d.tera ?? "",
      d.level.map(String.init) ?? "",
      evKey(d.evs),
      model.scenario.move.slug ?? "", model.scenario.move.name ?? "",
      field?.weather?.rawValue ?? "",
      field?.reflect == true ? "R" : "",
      field?.lightScreen == true ? "LS" : "",
    ].joined(separator: "|")
  }

  @ViewBuilder
  private func sideEditor(title: String, side: Binding<CalcSide>) -> some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text(title)
        .font(Theme.display(.subheadline))
      TextField("Species", text: optionalString(side.species))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      TextField("Item", text: optionalString(side.item))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      TextField("Ability", text: optionalString(side.ability))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      TextField("Nature", text: optionalString(side.nature))
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      if model.showsTeraField {
        TextField("Tera", text: optionalString(side.tera))
          .textInputAutocapitalization(.never)
          .font(Theme.body(.body))
      }
      if model.showsLevelKnob {
        TextField(
          "Level",
          text: Binding(
            get: { side.wrappedValue.level.map(String.init) ?? "" },
            set: { side.wrappedValue.level = Int($0) }
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

  private var moveEditor: some View {
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

  private var fieldEditor: some View {
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

  private func statPointsEditor(title: String, side: Binding<CalcSide>) -> some View {
    let keys = ["hp", "atk", "def", "spa", "spd", "spe"]
    return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
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
                guard let value = side.wrappedValue.evs?[key] else { return "" }
                return String(value)
              },
              set: { raw in
                var evs = side.wrappedValue.evs ?? [:]
                if let value = Int(raw), value >= 0 {
                  evs[key] = min(value, 32)
                } else if raw.isEmpty {
                  evs[key] = nil
                }
                side.wrappedValue.evs = evs.isEmpty ? nil : evs
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

  @ViewBuilder
  private var resultBlock: some View {
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

  private var actions: some View {
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

  private func evKey(_ evs: [String: Int]?) -> String {
    guard let evs else { return "" }
    return evs.keys.sorted().map { "\($0)=\(evs[$0] ?? 0)" }.joined(separator: ",")
  }

  private func optionalString(_ source: Binding<String?>) -> Binding<String> {
    Binding(
      get: { source.wrappedValue ?? "" },
      set: { source.wrappedValue = $0.isEmpty ? nil : $0 }
    )
  }
}
