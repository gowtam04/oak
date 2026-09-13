import CoreGraphics
import SwiftUI

/// Pure Calc-workspace policy (P-CALC-US-1, P-CALC-AC-1.1–1.3, P-SHELL-BR-5).
enum PadCalcChrome {
  /// Calculator is a workspace, not a sidebar row (P-SHELL-BR-5, P-CALC-AC-1.1).
  static func isSidebarItem() -> Bool { false }

  /// Estimate stays on-screen while editing sides / field (P-CALC-AC-1.2,
  /// P-CALC-AC-1.3, P-WF-AC-5.1). Layout contract — not a snapshot.
  static func resultVisibleWithoutScrollingOff() -> Bool { true }

  /// Wide landscape keeps attacker | defender | trailing result.
  static func showsTrailingResultColumn(mode: PadLayoutMode, isPortrait: Bool) -> Bool {
    mode == .regular && !isPortrait
  }

  /// Landscape (including medium) places attacker | defender side by side.
  static func showsSideBySideEditors(mode: PadLayoutMode, isPortrait: Bool) -> Bool {
    !isPortrait && mode != .compact
  }

  /// PadRootView overlay controls are 44pt + `Theme.Spacing.sm`.
  static let overlayControlInset: CGFloat = 56
}

/// iPad Calc workspace: attacker | defender | visible result/field (P-CALC-US-1).
/// Same ``CalculatorViewModel`` as iPhone; Done returns via ``PadShellModel/closeCalc``.
struct PadCalcWorkspace: View {
  var shell: PadShellModel
  var chatModel: ChatViewModel
  var layoutMode: PadLayoutMode
  var scenario: CalcScenario?
  var onClose: () -> Void

  @Environment(\.services) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var model: CalculatorViewModel?

  var body: some View {
    let _ = shell.destination
    let _ = shell.companionOpen
    let _ = model?.scenario
    let _ = model?.result
    applyLifecycle(to: root)
  }

  @ViewBuilder
  private var root: some View {
    GeometryReader { geo in
      let portrait = geo.size.height > geo.size.width
      let trailingResult = PadCalcChrome.showsTrailingResultColumn(
        mode: layoutMode, isPortrait: portrait)
      let sideBySide = PadCalcChrome.showsSideBySideEditors(
        mode: layoutMode, isPortrait: portrait)
      VStack(spacing: 0) {
        header
        if let model {
          @Bindable var model = model
          workspace(
            model: model,
            trailingResult: trailingResult,
            sideBySide: sideBySide
          )
        } else {
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-calc-workspace")
  }

  private func applyLifecycle<Content: View>(to view: Content) -> some View {
    view
      .onAppear {
        ensureModel()
        syncCalcChip()
      }
      .onChange(of: scenario) { _, newScenario in
        if let newScenario {
          model?.applyPrefill(newScenario)
        }
      }
      .onChange(of: shell.companionOpen) { _, open in
        if open { syncCalcChip() }
      }
      .task(id: model.map { calcEstimateKey($0) } ?? "") {
        await model?.recompute()
      }
  }

  // MARK: Header

  private var header: some View {
    HStack(spacing: Theme.Spacing.sm) {
      Text("Calculator")
        .font(Theme.display(.headline))
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
      Button("Done") {
        onClose()
      }
      .font(Theme.display(.footnote, weight: .semibold))
      .buttonStyle(.borderless)
      .tint(Theme.accent)
      .frame(minHeight: 44)
      .accessibilityLabel("Done")
    }
    .padding(.leading, headerLeadingInset)
    .padding(.trailing, headerTrailingInset)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.xs)
  }

  private var headerLeadingInset: CGFloat {
    layoutMode == .compact ? PadCalcChrome.overlayControlInset : Theme.Spacing.lg
  }

  private var headerTrailingInset: CGFloat {
    PadCalcChrome.overlayControlInset
  }

  // MARK: Layout

  @ViewBuilder
  private func workspace(
    model: CalculatorViewModel,
    trailingResult: Bool,
    sideBySide: Bool
  ) -> some View {
    if trailingResult {
      HStack(spacing: 0) {
        sideColumn(title: "Attacker", side: attackerBinding(model), model: model)
        columnSeparator
        sideColumn(title: "Defender", side: defenderBinding(model), model: model)
        columnSeparator
        resultColumn(model: model, scrollsField: true)
          .frame(width: resultColumnWidth)
          .frame(maxHeight: .infinity)
      }
    } else if sideBySide {
      VStack(spacing: 0) {
        HStack(spacing: 0) {
          sideColumn(title: "Attacker", side: attackerBinding(model), model: model)
          columnSeparator
          sideColumn(title: "Defender", side: defenderBinding(model), model: model)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        rowSeparator
        resultBand(model: model)
      }
    } else {
      VStack(spacing: 0) {
        ScrollView {
          VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            CalcSideEditor(title: "Attacker", side: attackerBinding(model), model: model)
            if model.investmentIsStatPoints {
              CalcStatPointsEditor(title: "Attacker", side: attackerBinding(model))
            }
            CalcSideEditor(title: "Defender", side: defenderBinding(model), model: model)
            if model.investmentIsStatPoints {
              CalcStatPointsEditor(title: "Defender", side: defenderBinding(model))
            }
          }
          .padding(Theme.Spacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        rowSeparator
        resultBand(model: model)
      }
    }
  }

  private var resultColumnWidth: CGFloat {
    max(PadLayout.inspectorMinWidth, 280)
  }

  private func sideColumn(
    title: String,
    side: Binding<CalcSide>,
    model: CalculatorViewModel
  ) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
        CalcSideEditor(title: title, side: side, model: model)
        if model.investmentIsStatPoints {
          CalcStatPointsEditor(title: title, side: side)
        }
      }
      .padding(Theme.Spacing.lg)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
  }

  /// Trailing column: move, field, estimate, Explain — always on the canvas.
  private func resultColumn(model: CalculatorViewModel, scrollsField: Bool) -> some View {
    VStack(spacing: 0) {
      if scrollsField {
        ScrollView {
          VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            CalcMoveEditor(model: model)
            CalcFieldEditor(model: model)
          }
          .padding(Theme.Spacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      CalcResultBlock(model: model)
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.bottom, Theme.Spacing.sm)
      CalcExplainActions(
        model: model,
        onExplain: { explain(prompt: $0) },
        onExpand: nil
      )
      .padding(.horizontal, Theme.Spacing.lg)
      .padding(.bottom, Theme.Spacing.lg)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Theme.canvas)
    .accessibilityIdentifier("pad-calc-result")
  }

  /// Pinned estimate with field knobs in a scroll, matching the trailing column
  /// (P-CALC-AC-1.3). Used in portrait and medium landscape.
  private func resultBand(model: CalculatorViewModel) -> some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
          CalcMoveEditor(model: model)
          CalcFieldEditor(model: model)
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.top, Theme.Spacing.lg)
        .padding(.bottom, Theme.Spacing.sm)
      }
      .frame(maxHeight: 220)
      CalcResultBlock(model: model)
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.bottom, Theme.Spacing.sm)
      CalcExplainActions(
        model: model,
        onExplain: { explain(prompt: $0) },
        onExpand: nil
      )
      .padding(.horizontal, Theme.Spacing.lg)
      .padding(.bottom, Theme.Spacing.lg)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.canvas)
    .accessibilityIdentifier("pad-calc-result")
  }

  private var columnSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(width: 1)
  }

  private var rowSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(height: 1)
  }

  // MARK: Bindings / hops / chip

  private func attackerBinding(_ model: CalculatorViewModel) -> Binding<CalcSide> {
    Binding(
      get: { model.scenario.attacker },
      set: { model.scenario.attacker = $0 }
    )
  }

  private func defenderBinding(_ model: CalculatorViewModel) -> Binding<CalcSide> {
    Binding(
      get: { model.scenario.defender },
      set: { model.scenario.defender = $0 }
    )
  }

  private func ensureModel() {
    guard model == nil else { return }
    let vm = CalculatorViewModel(
      calc: services.calc,
      format: .champions,
      presentation: .fullScreen
    )
    if let scenario {
      vm.applyPrefill(scenario)
    }
    model = vm
  }

  /// Explain sends into the live thread and reveals companion with the calc chip
  /// without dismissing the workspace (P-CALC-AC-1.4, P-WF-AC-5.2).
  private func explain(prompt: String) {
    chatModel.composerText = prompt
    chatModel.send()
    shell.revealCompanion()
    shell.setContextChip(.calc(explainPrompt: prompt))
  }

  private func syncCalcChip() {
    guard case .calc = shell.destination, shell.companionOpen else { return }
    guard let prompt = model?.explainPrompt() else { return }
    shell.setContextChip(.calc(explainPrompt: prompt))
  }
}
