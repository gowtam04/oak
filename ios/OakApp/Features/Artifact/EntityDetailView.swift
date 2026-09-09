import SwiftUI

/// Renders one resolved entity artifact (`ok` arm) as a full, grounded profile — the native
/// mirror of the web entity-detail panes (artifact-viewer.md M-ART-US-1, M-AC-A1.1/A4.2,
/// M-BR-ART-4). One view, five kinds: Pokémon, move, ability, item, and type, each switched on
/// ``EntityArtifactOk/data``.
///
/// Consistent with answers (M-AC-A4.2 — grounded, cited, format-tagged, never an un-sourced data
/// dump): every profile carries the format + generation grounding chrome, an `is_fallback` pill +
/// note when the data is a pre-Gen-9 fallback, and the artifact's `citations`. Type chips use the
/// shared ``TypeBadge`` (color **and** label, never color alone — M-AC-UI9.3) and sprites the
/// shared ``SpriteImage``.
///
/// Drilling deeper (M-ART-US-3 / M-AC-A3.1): the entities **inside** a profile are tappable —
/// a Pokémon's movepool moves and matchup types, a move/type's matchup types, an ability's
/// holders, an item's wild holders — each calling ``onOpen`` to push a new artifact onto the
/// viewer's back stack.
private enum PokemonArtifactTab: String, CaseIterable {
  case summary
  case usage
}

struct EntityDetailView: View {
  let artifact: EntityArtifactOk

  /// Requested lookup scope. Champions-first: leftover values are ignored and
  /// National Dex fallback chrome is not shown.
  var requestFormat: Format?

  /// Pushes another entity onto the viewer's back stack when one inside this profile is tapped.
  /// Defaults to a no-op so the view renders in isolation / previews.
  var onOpen: (EntityKind, String) -> Void = { _, _ in }

  @State private var pokemonTab: PokemonArtifactTab = .summary

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
        kindBody
        if showsGrounding {
          groundingSection
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Theme.Spacing.lg)
      .oakCard()
      .padding(.horizontal, Theme.Spacing.sm)
      .padding(.vertical, Theme.Spacing.sm)
    }
    .background(Theme.canvas)
    .onChange(of: artifact.resolved.slug) { _, _ in
      pokemonTab = .summary
    }
  }

  private var showsGrounding: Bool {
    if case .pokemon = artifact.data, pokemonTab == .usage {
      return false
    }
    return true
  }

  // MARK: Kind dispatch

  private var pokemonTabs: some View {
    Picker("Profile section", selection: $pokemonTab) {
      Text("Summary").tag(PokemonArtifactTab.summary)
      Text("Usage").tag(PokemonArtifactTab.usage)
    }
    .pickerStyle(.segmented)
    .accessibilityLabel("Pokémon profile")
  }

  @ViewBuilder
  private var kindBody: some View {
    switch artifact.data {
    case .pokemon(let data):
      pokemonTabs
      if pokemonTab == .summary {
        pokemonBody(data)
      } else {
        PokemonUsagePane(slug: artifact.resolved.slug, onOpen: onOpen)
      }
    case .move(let data):
      moveBody(data)
    case .ability(let data):
      abilityBody(data)
    case .item(let data):
      itemBody(data)
    case .type(let data):
      typeBody(data)
    case .unsupported:
      unsupportedBody
    }
  }

  /// Graceful state for an entity kind this app build doesn't recognize yet (a widened
  /// wire). Mirrors the honest-miss styling — a symbol, a title, and a plain-language
  /// note — so the sheet stays open instead of showing an empty or broken profile.
  @ViewBuilder
  private var unsupportedBody: some View {
    VStack(spacing: 12) {
      Image(systemName: "questionmark.square.dashed")
        .font(.system(size: 40))
        .foregroundStyle(Theme.textMuted)
      Text(artifact.resolved.displayName)
        .font(Theme.display(.title3))
        .foregroundStyle(Theme.textPrimary)
        .multilineTextAlignment(.center)
      Text("Oak can't display this kind of entity in the app yet. Ask about it in chat instead.")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 24)
    .padding(.horizontal, 16)
  }

  // MARK: Pokémon

  @ViewBuilder
  private func pokemonBody(_ data: PokemonArtifactData) -> some View {
    pokemonHeader(data)

    abilitiesSection(data.abilities)
    baseStatsSection(data.baseStats, total: data.baseStatTotal, primaryType: data.types.first ?? "normal")
    matchupsSection(data.matchups)
    movepoolSection(data.movepool)
  }

  /// Pokémon hero: artwork in a paper well, display name, mono dex, and
  /// tappable type chips. Chips carry typing as color **and** label (M-AC-UI9.3).
  private func pokemonHeader(_ data: PokemonArtifactData) -> some View {
    VStack(spacing: 12) {
      SpriteImage(urlString: data.artworkUrl, name: data.displayName, size: 112)
        .padding(Theme.Spacing.md)
        .background(
          Theme.surfaceSunken,
          in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
        )
        .overlay {
          RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
            .strokeBorder(Theme.separator, lineWidth: 1)
        }
      VStack(spacing: 6) {
        Text(data.displayName)
          .font(Theme.display(.title))
          .foregroundStyle(Theme.textPrimary)
          .multilineTextAlignment(.center)
        Text(Self.dexLabel(data.nationalDexNumber))
          .instrumentLabel(.caption)
          .foregroundStyle(Theme.textMuted)
        typeChips(data.types)
        AddToTeamButton(
          incoming: incomingTeamMember(
            species: artifact.resolved.slug,
            ability: data.abilities.slot1
          )
        )
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 20)
    .padding(.horizontal, 16)
    .background(
      Theme.surface,
      in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
        .strokeBorder(Theme.separator, lineWidth: 1)
    }
  }

  /// Paper header band for non-Pokémon kinds — title (and, for a move, its
  /// type/damage-class chips) on `--surface` + hairline. Radius matches the
  /// Pokémon hero (`Radius.lg`).
  private func headerBand<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(
      Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
        .strokeBorder(Theme.separator, lineWidth: 1)
    }
  }

  private func abilitiesSection(_ abilities: Abilities) -> some View {
    let rows: [(String, String)] = {
      var out: [(String, String)] = [("Ability", Self.titleize(abilities.slot1))]
      if let slot2 = abilities.slot2, !slot2.isEmpty {
        out.append(("Ability", Self.titleize(slot2)))
      }
      if let hidden = abilities.hidden, !hidden.isEmpty {
        out.append(("Hidden", Self.titleize(hidden)))
      }
      return out
    }()
    // No "Abilities" section head: each row already self-labels
    // ("Ability"/"Hidden"), so a head above them would just repeat it
    // (instrumentLabel prune, Phase 3).
    return VStack(alignment: .leading, spacing: 6) {
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        infoRow(label: row.0, value: row.1)
      }
    }
  }

  private func baseStatsSection(_ stats: BaseStats, total: Int, primaryType: String) -> some View {
    let rows: [(String, Int)] = [
      ("HP", stats.hp), ("Atk", stats.atk), ("Def", stats.def),
      ("SpA", stats.spa), ("SpD", stats.spd), ("Spe", stats.spe),
    ]
    return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      sectionHeader("Base stats", systemImage: "chart.bar")
      ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
        StatBar(label: row.0, value: row.1, primaryType: primaryType, index: index)
      }
      // BST summary in the instrument/mono voice — reinforces the data register.
      HStack(alignment: .firstTextBaseline) {
        Text("BST")
          .font(Theme.mono(.caption, weight: .semibold))
          .foregroundStyle(Theme.textSecondary)
        Spacer(minLength: Theme.Spacing.md)
        Text(String(total))
          .font(Theme.mono(.caption, weight: .semibold))
          .monospacedDigit()
          .foregroundStyle(Theme.textPrimary)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("Base stat total \(total)")
    }
  }

  @ViewBuilder
  private func matchupsSection(_ matchups: DefensiveProfile) -> some View {
    let quadWeak = Set(matchups.quadWeakTo ?? [])
    let quadResist = Set(matchups.quadResists ?? [])
    if !matchups.weakTo.isEmpty || !matchups.resists.isEmpty || !matchups.immuneTo.isEmpty {
      // No "Defensive matchups" section head: "Weak to"/"Resists"/"Immune to"
      // below are already self-explanatory, and a Pokémon profile has no
      // adjacent Offensive section to disambiguate against (instrumentLabel
      // prune, Phase 3).
      VStack(alignment: .leading, spacing: 10) {
        matchupRow("Weak to", matchups.weakTo, marked: quadWeak, mark: "×4")
        matchupRow("Resists", matchups.resists, marked: quadResist, mark: "×¼")
        matchupRow("Immune to", matchups.immuneTo, marked: [], mark: "")
      }
    }
  }

  @ViewBuilder
  private func matchupRow(_ label: String, _ types: [String], marked: Set<String>, mark: String) -> some View {
    if !types.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        Text(label)
          .font(Theme.body(.caption, weight: .semibold))
          .foregroundStyle(Theme.textSecondary)
        flow {
          ForEach(types, id: \.self) { type in
            tappableType(type, quadMark: marked.contains(type) ? mark : nil)
          }
        }
      }
    }
  }

  @ViewBuilder
  private func movepoolSection(_ groups: [MovepoolGroup]) -> some View {
    if !groups.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        sectionHeader("Movepool", systemImage: "list.bullet")
        if groups.allSatisfy({ $0.moves.isEmpty }) {
          Text("No moves recorded for this format.")
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
        } else {
          ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
            if !group.moves.isEmpty {
              VStack(alignment: .leading, spacing: 6) {
                Text(Self.titleize(group.method))
                  .font(Theme.body(.caption, weight: .semibold))
                  .foregroundStyle(Theme.textSecondary)
                // A wrapping chip grid (web parity — PokemonArtifact.tsx) rather than a
                // vertical list of full-width rows (TestFlight ANFj2FD).
                flow(minimum: 104) {
                  ForEach(Array(Self.sortMovesByType(group.moves).enumerated()), id: \.offset) { _, move in
                    moveChip(move)
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /// One movepool move as a tappable chip: a type-colored dot (color-only, so the
  /// accessibility label carries the type in words) plus the move's display name in a
  /// raised capsule — the ability-holder chip idiom, tap opens the move's artifact.
  private func moveChip(_ move: MovepoolMove) -> some View {
    Button {
      onOpen(.move, move.slug)
    } label: {
      HStack(spacing: 6) {
        Circle()
          .fill(Theme.type(move.type))
          .frame(width: 8, height: 8)
        Text(move.displayName)
          .font(Theme.body(.caption, weight: .semibold))
          .foregroundStyle(Theme.textPrimary)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 4)
      .background(Theme.surfaceRaised, in: Capsule())
    }
    .buttonStyle(OakPressableButtonStyle())
    .accessibilityLabel("\(move.displayName), \(move.type) type")
    .accessibilityHint("Opens \(move.displayName)")
  }

  // MARK: Move

  @ViewBuilder
  private func moveBody(_ data: MoveArtifactData) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      headerBand {
        Text(data.displayName)
          .font(Theme.display(.title2))
          .foregroundStyle(Theme.textPrimary)
        HStack(spacing: 8) {
          tappableType(data.type, quadMark: nil)
          damageClassBadge(data.damageClass)
        }
      }
      VStack(alignment: .leading, spacing: 6) {
        infoRow(label: "Power", value: data.power.map(String.init) ?? "—")
        infoRow(label: "Accuracy", value: data.accuracy.map { "\($0)%" } ?? "—")
        infoRow(label: "PP", value: data.pp.map(String.init) ?? "—")
        infoRow(label: "Priority", value: Self.signed(data.priority))
        infoRow(label: "Target", value: Self.titleize(data.target))
        if let learners = data.gen9LearnerCount {
          infoRow(label: "Gen 9 learners", value: String(learners))
        }
      }
      effectSection(short: data.effectShort, full: data.effectFull)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Ability

  @ViewBuilder
  private func abilityBody(_ data: AbilityArtifactData) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      headerBand {
        Text(data.displayName)
          .font(Theme.display(.title2))
          .foregroundStyle(Theme.textPrimary)
      }
      effectSection(short: data.effectShort, full: data.effectFull)
      if !data.learnedBy.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          sectionHeader("Pokémon with this ability", systemImage: "person.3")
          flow {
            ForEach(Array(data.learnedBy.enumerated()), id: \.offset) { _, holder in
              Button {
                onOpen(.pokemon, holder.slug)
              } label: {
                Text(holder.displayName)
                  .font(Theme.body(.caption, weight: .semibold))
                  .padding(.horizontal, 10)
                  .padding(.vertical, 4)
                  .foregroundStyle(Theme.textPrimary)
                  .background(Theme.surfaceRaised, in: Capsule())
              }
              .buttonStyle(.plain)
              .accessibilityHint("Opens \(holder.displayName)")
            }
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Item

  @ViewBuilder
  private func itemBody(_ data: ItemArtifactData) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      headerBand {
        Text(data.displayName)
          .font(Theme.display(.title2))
          .foregroundStyle(Theme.textPrimary)
      }
      effectSection(short: data.effectShort, full: data.effectFull)
      if let holders = data.heldByWild, !holders.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          sectionHeader("Held in the wild", systemImage: "leaf")
          ForEach(Array(holders.enumerated()), id: \.offset) { _, holder in
            infoRow(label: Self.titleize(holder.pokemon), value: Self.percent(holder.rarityPercent))
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Type

  @ViewBuilder
  private func typeBody(_ data: TypeArtifactData) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      headerBand {
        flow {
          ForEach(data.types, id: \.self) { type in
            TypeBadge(type: type)
          }
        }
      }
      if let offensive = data.offensive {
        VStack(alignment: .leading, spacing: 10) {
          sectionHeader("Offensive", systemImage: "bolt")
          matchupRow("Super effective", offensive.superEffectiveAgainst, marked: [], mark: "")
          matchupRow("Not very effective", offensive.notVeryEffectiveAgainst, marked: [], mark: "")
          matchupRow("No effect", offensive.noEffectAgainst, marked: [], mark: "")
        }
      }
      VStack(alignment: .leading, spacing: 10) {
        sectionHeader("Defensive", systemImage: "shield.lefthalf.filled")
        matchupRow("Weak to", data.defensive.weakTo, marked: Set(data.defensive.quadWeakTo ?? []), mark: "×4")
        matchupRow("Resists", data.defensive.resists, marked: Set(data.defensive.quadResists ?? []), mark: "×¼")
        matchupRow("Immune to", data.defensive.immuneTo, marked: [], mark: "")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Grounding chrome (format / generation / fallback / citations)

  private var groundingSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      Divider()
      HStack(spacing: 8) {
        formatBadge(artifact.format)
        Text(artifact.generation)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
        Spacer(minLength: 0)
      }
      if !artifact.citations.isEmpty {
        ForEach(Array(artifact.citations.enumerated()), id: \.offset) { _, citation in
          Label {
            // Real reading text (a citation sentence) — bumped from the faintest
            // tier to `textSecondary` for dark-mode AA (Phase 3 §6: `textMuted`
            // is web's `--text-faint`, correct only for decorative glyphs/labels,
            // not body-critical prose).
            Text("\(displayCitationSource(citation.source)) — \(citation.detail)")
              .font(Theme.body(.caption2))
              .foregroundStyle(Theme.textSecondary)
              .fixedSize(horizontal: false, vertical: true)
          } icon: {
            Image(systemName: "doc.text")
              .imageScale(.small)
              .foregroundStyle(Theme.textMuted)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Shared building blocks

  /// Section label in the instrument voice — `BASE STATS`, `MATCHUPS`, `MOVEPOOL`, etc.
  /// Rendered as mono semibold caps so data-section heads read as engraved instrument
  /// output across every entity kind (strategy §4.09, item 3).
  private func sectionHeader(_ title: String, systemImage: String) -> some View {
    Label(title, systemImage: systemImage)
      .instrumentLabel()
      .foregroundStyle(Theme.textSecondary)
  }

  private func infoRow(label: String, value: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label)
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
      Spacer(minLength: 12)
      Text(value)
        .font(Theme.body(.subheadline, weight: .semibold))
        .foregroundStyle(Theme.textPrimary)
        .multilineTextAlignment(.trailing)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func effectSection(short: String, full: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      if !short.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        MarkdownText(short)
          .font(Theme.body(.body, weight: .medium))
          .foregroundStyle(Theme.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if !full.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, full != short {
        MarkdownText(full)
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  private func typeChips(_ types: [String]) -> some View {
    HStack(spacing: 6) {
      ForEach(types, id: \.self) { type in
        tappableType(type, quadMark: nil)
      }
    }
  }

  /// A type chip that opens the type's own artifact when tapped (M-AC-A3.1), with an optional
  /// quad-multiplier mark (`×4` / `×¼`). A press style + light haptic make the chip feel tappable
  /// (Reduce Motion drops the scale, keeping the opacity dim — see `OakPressableButtonStyle`).
  private func tappableType(_ type: String, quadMark: String?) -> some View {
    Button {
      Haptics.tap()
      onOpen(.type, type)
    } label: {
      HStack(spacing: 4) {
        TypeBadge(type: type)
        if let quadMark {
          Text(quadMark)
            .font(Theme.body(.caption2, weight: .bold))
            .foregroundStyle(Theme.textSecondary)
        }
      }
    }
    .buttonStyle(OakPressableButtonStyle())
    .accessibilityHint("Opens the \(type.capitalized) type")
  }

  private func damageClassBadge(_ damageClass: DamageClass) -> some View {
    Text(damageClass.rawValue.capitalized)
      .font(Theme.body(.caption2, weight: .semibold))
      .padding(.horizontal, 10)
      .padding(.vertical, 3)
      .foregroundStyle(Theme.textSecondary)
      .background(Theme.surfaceRaised, in: Capsule())
  }

  private func formatBadge(_ format: Format) -> some View {
    Text(format.shortLabel)
      .font(Theme.body(.caption2, weight: .semibold))
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .foregroundStyle(Theme.textSecondary)
      .background(Theme.surfaceRaised, in: Capsule())
  }

  /// A simple wrapping container for chips. Uses an adaptive grid so chips reflow at large
  /// Dynamic Type without horizontal clipping (no third-party flow-layout — ADR-5). The
  /// `minimum` column width defaults to type-badge width; movepool chips (name + dot) pass
  /// a wider minimum so they don't crowd two-to-a-column.
  private func flow<Content: View>(
    minimum: CGFloat = 64, @ViewBuilder _ content: () -> Content
  ) -> some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: minimum), spacing: 6, alignment: .leading)],
      alignment: .leading,
      spacing: 6
    ) {
      content()
    }
  }

  // MARK: Formatting helpers

  private static func dexLabel(_ number: Int) -> String {
    String(format: "#%04d", number)
  }

  private static func signed(_ value: Int) -> String {
    value > 0 ? "+\(value)" : String(value)
  }

  private static func percent(_ value: Double) -> String {
    value == value.rounded() ? "\(Int(value))%" : "\((value * 10).rounded() / 10)%"
  }

  /// Order a group's moves by type in display order, then alphabetically by name
  /// within each type, so same-type moves cluster together and their colored
  /// badges read as type groups — the native mirror of the web's `sortMovesByType`
  /// (PokemonArtifact.tsx). Untyped moves sort last (`typeDisplayIndex` → `Int.max`).
  private static func sortMovesByType(_ moves: [MovepoolMove]) -> [MovepoolMove] {
    moves.sorted { a, b in
      let ia = Theme.typeDisplayIndex(a.type)
      let ib = Theme.typeDisplayIndex(b.type)
      if ia != ib { return ia < ib }
      return a.displayName.localizedCaseInsensitiveCompare(b.displayName) == .orderedAscending
    }
  }

  private static func titleize(_ slug: String) -> String {
    slug
      .split(whereSeparator: { $0 == "-" || $0 == " " || $0 == "_" })
      .map { $0.prefix(1).uppercased() + $0.dropFirst() }
      .joined(separator: " ")
  }

}

// MARK: - Stat bar

/// One base-stat row: a label, a value, and a proportional bar. The numeric value carries the
/// data; the bar's length is reinforcement, so meaning never rests on it alone (M-AC-UI9.3) —
/// VoiceOver reads the plain `"\(label) \(value)"`.
///
/// On first appearance the bar fills from 0 to its value and the number counts up
/// (`.numericText()`), staggered per row so the six stats cascade (`Theme.Motion.staggered`).
/// Track and fill are tinted by the entity's PRIMARY TYPE color (soul.md Phase 2 type-light —
/// content carries color, not a value-banded traffic-light ramp): a faint type wash over the
/// sunken well reads as the channel, a full-chroma type fill reads as the readout. The old
/// value-band semantics (danger < 60, warning 60–89, success 90–119, azure ≥ 120) still carry
/// real "how good is this stat" information for a battle-math reader, so they survive as a tiny
/// threshold-colored dot beside the numeral rather than owning the whole bar. Under Reduce
/// Motion (constraint 2) the bar and number snap to their final state with no fill animation or
/// count-up.
private struct StatBar: View {
  let label: String
  let value: Int
  let primaryType: String
  var index: Int = 0

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var fillFraction: Double = 0
  @State private var displayValue: Int = 0

  /// Bars are normalized against a generous ceiling so even very high base stats (e.g. 255 HP)
  /// stay on-scale.
  private static let ceiling = 255.0

  /// The at-a-glance value band, demoted to a small dot marker beside the numeral now that the
  /// bar itself carries the type color — reinforcement only; the number is the source of truth.
  private var thresholdColor: Color {
    switch value {
    case ..<60: return Theme.danger
    case 60..<90: return Theme.warning
    case 90..<120: return Theme.success
    default: return Theme.azure
    }
  }

  var body: some View {
    HStack(spacing: Theme.Spacing.sm) {
      Text(label)
        .font(Theme.body(.caption, weight: .semibold))
        .foregroundStyle(Theme.textSecondary)
        .frame(width: 40, alignment: .leading)
      HStack(spacing: 4) {
        // Numeral in mono footnote; `.monospacedDigit()` locks width so numerals
        // never jump between 1-digit and 3-digit values (M-AC-UI9.3).
        Text(String(displayValue))
          .font(Theme.mono(.footnote))
          .monospacedDigit()
          .contentTransition(.numericText())
          .foregroundStyle(Theme.textPrimary)
          .frame(width: 30, alignment: .trailing)
        // The old value-band color, kept as a small marker (not the whole bar) so
        // the "is this stat good" signal survives (M-AC-UI9.3: color + a distinct
        // shape/position, never color alone).
        Circle()
          .fill(thresholdColor)
          .frame(width: 5, height: 5)
          .accessibilityHidden(true)
      }
      .frame(width: 42, alignment: .trailing)
      GeometryReader { proxy in
        ZStack(alignment: .leading) {
          // Sunken well is the channel; a faint type wash over it reads as the
          // type-lit track (soul.md Phase 2 — content carries color).
          Capsule().fill(Theme.surfaceSunken)
          Capsule().fill(Theme.type(primaryType).opacity(0.16))
          // Full-chroma type fill by value — the readout itself.
          Capsule()
            .fill(Theme.type(primaryType))
            .frame(width: proxy.size.width * fillFraction)
        }
      }
      .frame(height: 8)
    }
    .onAppear(perform: animateIn)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(label) \(value)")
  }

  /// Fills the bar and counts the number up on first appearance; snaps instantly under Reduce
  /// Motion. The per-row `index` staggers the six stats into a cascade.
  private func animateIn() {
    let target = min(Double(value), Self.ceiling) / Self.ceiling
    if reduceMotion {
      fillFraction = target
      displayValue = value
    } else {
      withAnimation(Theme.Motion.staggered(index)) {
        fillFraction = target
        displayValue = value
      }
    }
  }
}

#if DEBUG
/// Decodes a sample `ok` Pokémon artifact for the preview from the same shape the entity
/// endpoint returns. File-scoped so the `#Preview` body stays a plain expression.
private func previewPokemonArtifact() -> EntityArtifactOk? {
  let json = """
    {
      "status": "ok", "kind": "pokemon", "format": "scarlet-violet",
      "resolved": { "slug": "garchomp", "display_name": "Garchomp" },
      "generation": "Gen 9 (Scarlet/Violet)", "is_fallback": false,
      "citations": [{ "source": "pokemon/garchomp", "detail": "Base stats and typing." }],
      "data": {
        "display_name": "Garchomp", "national_dex_number": 445,
        "types": ["dragon", "ground"],
        "abilities": { "slot1": "sand-veil", "hidden": "rough-skin" },
        "base_stats": { "hp": 108, "attack": 130, "defense": 95, "special_attack": 80, "special_defense": 85, "speed": 102 },
        "base_stat_total": 600,
        "sprite_url": "https://example.test/garchomp.png", "artwork_url": "https://example.test/garchomp.png",
        "forms": ["garchomp"], "is_gen9_native": true,
        "matchups": { "weak_to": ["ice", "dragon", "fairy"], "resists": ["rock", "fire", "poison", "electric"], "immune_to": ["electric"], "quad_weak_to": ["ice"], "quad_resists": [] },
        "movepool": [{ "method": "level-up", "moves": [{ "slug": "dragon-claw", "display_name": "Dragon Claw", "type": "dragon" }] }]
      }
    }
    """
  guard
    let artifact = try? JSONDecoder().decode(EntityArtifact.self, from: Data(json.utf8)),
    case let .ok(ok) = artifact
  else {
    return nil
  }
  return ok
}

#Preview("Pokémon profile") {
  if let ok = previewPokemonArtifact() {
    EntityDetailView(artifact: ok)
      .oakServices(.preview())
  } else {
    Text("decode failed")
  }
}
#endif
