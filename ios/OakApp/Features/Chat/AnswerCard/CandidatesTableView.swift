import SwiftUI

/// Renders the `candidates` block of an ``OakAnswer`` — the competitive workhorse
/// result set (`candidatesSchema` in `web/src/agent/schemas.ts`) — as a native,
/// horizontally-scrollable table.
///
/// Columns, left to right: **Pokémon** (sprite + name + dex no.) · **Types**
/// (badges) · the six **base stats** (HP/Atk/Def/SpA/SpD/Spe, monospaced and
/// right-aligned) · **Ability**. When the rows carry no `base_stats` — an older
/// `key_stats`-only payload (the schema keeps `base_stats` optional for exactly
/// this reason) — the stat columns fall back to the union of `key_stats` keys.
///
/// The active `sort` column is flagged with a directional caret **and** stronger
/// figures, so color is never the only signal (M-AC-UI9.3 / M-UI-US-9). When the
/// set is `truncated`, a footer states "Showing N of total" (M-AC-1.2 / M-AC-1.4).
/// Columns size to their content and the whole grid scrolls horizontally, so it
/// stays legible and never clips at large Dynamic Type (M-UI-US-1 / M-SUCCESS-3).
///
/// Renders **nothing** when there are no rows to show (field-absent rule).
///
/// Uses the phase-shared `SpriteImage(urlString:name:)` and `TypeBadge(type:)` helpers so
/// sprites and type pills stay consistent across the AnswerCard tree.
struct CandidatesTableView: View {
  let candidates: Candidates

  /// Opens a row's Pokémon profile in the artifact viewer when its row is tapped
  /// (the whole row except the type chips, mirroring the web table's row-click —
  /// AV-US-1). Carries the row's display `name`; the chat host routes it to
  /// ``ArtifactViewModel/openEntity(kind:query:)`` with `.pokemon`. No-op default
  /// so the table renders in isolation / previews.
  var onOpenPokemon: (String) -> Void = { _ in }

  /// Opens a tapped type chip's own Type profile (M-AC-A3.1), scoped to the chip so
  /// a type tap never also opens the row's Pokémon. No-op default.
  var onOpenType: (String) -> Void = { _ in }

  /// Sends a "show me all of them" follow-up turn when the set is `truncated` and
  /// the server did NOT ship the hidden rows (mirrors web's `CandidateTable` "Show
  /// all N" follow-up fallback). No-op default; the host wires it to send the
  /// follow-up. Ignored when `candidates.hiddenRows` is present — those expand
  /// locally with no new turn. When `nil` (and no hidden rows) the footer shows the
  /// count only.
  var onShowAll: (() -> Void)?

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Flips once, on this view instance's first appearance, to drive the one-shot
  /// row-stagger below.
  @State private var hasAppeared = false

  /// Set when the user taps "Show all N" and the server shipped the remaining rows
  /// in `candidates.hiddenRows` — the table then appends them in place with no
  /// follow-up turn (M-AC "Show all" local expansion).
  @State private var expanded = false

  /// Whether local expansion is even possible for this payload (the server shipped
  /// the withheld rows inline). Delegates to the pure model helper so the decision
  /// is unit-testable off the view.
  private var hasHiddenRows: Bool { candidates.canExpandLocally }

  /// The rows currently on screen: `shown`, plus the hidden rows once expanded.
  private var displayedRows: [CandidateRow] {
    expanded && hasHiddenRows ? candidates.allRows : candidates.shown
  }

  /// True once every row of the set is on screen (locally expanded), so the footer
  /// drops the "refine" nudge and the "Show all" control.
  private var isFullyShown: Bool { displayedRows.count >= candidates.totalCount }

  var body: some View {
    if candidates.shown.isEmpty {
      EmptyView()
    } else {
      VStack(alignment: .leading, spacing: 10) {
        caption
        table
        if candidates.truncated {
          footer
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: Caption

  private var caption: some View {
    HStack(spacing: 6) {
      Image(systemName: "tablecells")
        .imageScale(.small)
        .foregroundStyle(Theme.accent)
      Text("Candidates")
        .font(Theme.display(.subheadline))
        .foregroundStyle(Theme.textPrimary)
      if let sortColumnLabel {
        Text("· sorted by \(sortColumnLabel)")
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
      }
      Spacer(minLength: 0)
    }
  }

  // MARK: Table

  private var table: some View {
    ScrollView(.horizontal, showsIndicators: true) {
      Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
        headerRow
        separatorRow
        ForEach(Array(displayedRows.enumerated()), id: \.offset) { index, row in
          dataRow(row, index: index)
        }
      }
    }
    .background(Theme.surface)
    .oakCard(radius: Theme.Radius.md)
    // A trailing fade hints there's more to scroll to; a plain static overlay is
    // fine here — it just dims when the content already fits (no measurement).
    .overlay(alignment: .trailing) { scrollFade }
    .onAppear { hasAppeared = true }
  }

  /// A ~24pt clear→surface gradient on the trailing edge, signaling horizontal
  /// scroll affordance without a dependency on measuring content width.
  private var scrollFade: some View {
    LinearGradient(
      colors: [Theme.surface.opacity(0), Theme.surface],
      startPoint: .leading,
      endPoint: .trailing
    )
    .frame(width: 24)
    .allowsHitTesting(false)
  }

  private var headerRow: some View {
    GridRow {
      cell(background: headerBackground, alignment: .leading) {
        headerLabel("Pokémon")
      }
      cell(background: headerBackground, alignment: .leading) {
        headerLabel("Types")
      }
      ForEach(statColumns) { column in
        let isSorted = column.id == sortedColumnID
        cell(background: headerBackground, accentWash: isSorted, alignment: .trailing) {
          headerStatLabel(column)
        }
      }
      if showsAbility {
        cell(background: headerBackground, alignment: .leading) {
          headerLabel("Ability")
        }
      }
    }
  }

  /// A full-width hairline under the header (spans every column).
  private var separatorRow: some View {
    GridRow {
      Rectangle()
        .fill(Theme.separator)
        .frame(height: 1)
        .gridCellUnsizedAxes(.horizontal)
        .gridCellColumns(columnCount)
    }
  }

  private func dataRow(_ row: CandidateRow, index: Int) -> some View {
    let background = rowBackground(index)
    // The whole row (every cell except the types cell) opens that Pokémon's
    // profile (AV-US-1). The types cell owns its own per-chip taps, so a type tap
    // stays scoped to the type — SwiftUI has no event bubbling, so this is the
    // native equivalent of the web's row-click + type-link stopPropagation.
    let openPokemon = { onOpenPokemon(row.name) }
    return GridRow {
      cell(background: background, alignment: .leading) {
        // A real Button (not a bare tap gesture) so VoiceOver exposes the default
        // activation action — matching SubjectsView / the movepool rows. The label
        // fills the cell so the whole name band is a tap target.
        Button(action: openPokemon) {
          pokemonCell(row)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens \(row.name)")
      }
      cell(background: background, alignment: .leading) {
        typesCell(row)
      }
      ForEach(statColumns) { column in
        let isSorted = column.id == sortedColumnID
        cell(background: background, accentWash: isSorted, alignment: .trailing) {
          Text(column.value(row))
            .font(Theme.mono(.footnote, weight: isSorted ? .medium : .regular))
            .monospacedDigit()
            .foregroundStyle(isSorted ? Theme.textPrimary : Theme.textSecondary)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: openPokemon)
      }
      if showsAbility {
        cell(background: background, alignment: .leading) {
          abilityCell(row)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: openPokemon)
      }
    }
    .opacity(hasAppeared ? 1 : 0)
    .offset(y: hasAppeared ? 0 : 6)
    .animation(reduceMotion ? nil : Theme.Motion.staggered(index), value: hasAppeared)
  }

  // MARK: Cells

  private func pokemonCell(_ row: CandidateRow) -> some View {
    HStack(spacing: 8) {
      SpriteImage(urlString: row.spriteUrl, name: row.name, size: 32)
      VStack(alignment: .leading, spacing: 1) {
        Text(row.name)
          .font(Theme.body(.subheadline, weight: .semibold))
          .foregroundStyle(Theme.textPrimary)
          .fixedSize(horizontal: false, vertical: true)
        if let dexNumber = row.dexNumber {
          Text(dexLabel(dexNumber))
            .font(Theme.mono(.caption2))
            .foregroundStyle(Theme.textSecondary)
        }
      }
    }
  }

  private func typesCell(_ row: CandidateRow) -> some View {
    HStack(spacing: 6) {
      ForEach(row.types, id: \.self) { type in
        Button {
          onOpenType(type)
        } label: {
          TypeBadge(type: type)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens the \(type.capitalized) type")
      }
    }
  }

  private func abilityCell(_ row: CandidateRow) -> some View {
    let hasAbility = !(row.ability ?? "").isEmpty
    return Text(hasAbility ? row.ability! : "—")
      .font(Theme.body(.subheadline))
      .foregroundStyle(hasAbility ? Theme.textPrimary : Theme.textMuted)
      .fixedSize(horizontal: false, vertical: true)
  }

  // MARK: Header labels

  private func headerLabel(_ text: String) -> some View {
    Text(text)
      .font(Theme.mono(.caption, weight: .medium))
      .foregroundStyle(Theme.textSecondary)
  }

  private func headerStatLabel(_ column: StatColumn) -> some View {
    let isSorted = column.id == sortedColumnID
    return HStack(spacing: 2) {
      Text(column.label)
      if isSorted {
        // The caret + emphasized weight carry the sort, not color alone.
        Image(systemName: sortAscending ? "chevron.up" : "chevron.down")
          .imageScale(.small)
      }
    }
    // instrumentLabel is JBM SemiBold; the caret + ink color carry the sort
    // (custom mono doesn't take an extra weight bump).
    .font(Theme.mono(.caption, weight: .medium))
    .foregroundStyle(isSorted ? Theme.textPrimary : Theme.textSecondary)
  }

  // MARK: Footer

  private var footer: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Label(footerCountText, systemImage: "line.3.horizontal.decrease.circle")
        .font(Theme.body(.caption))
        .foregroundStyle(Theme.textSecondary)
        .labelStyle(.titleAndIcon)

      Spacer(minLength: 0)

      showAllButton
    }
  }

  /// "Showing N of M — refine to narrow." while the set is still capped; flips to
  /// "Showing all M." once the hidden rows have been expanded in place.
  private var footerCountText: String {
    if isFullyShown {
      return "Showing all \(candidates.totalCount)."
    }
    return "Showing \(displayedRows.count) of \(candidates.totalCount) — refine to narrow."
  }

  /// The trailing control. Two distinct behaviours, decided by the payload:
  /// - **Hidden rows shipped** (`candidates.hiddenRows` non-empty): "Show all N"
  ///   appends them in place — pure local `@State`, no follow-up turn — and the
  ///   button then disappears (nothing left to reveal).
  /// - **Hidden rows absent** (old answers in history, >200-row sets): fall back to
  ///   today's behaviour — `onShowAll` sends the "list every result" follow-up turn.
  @ViewBuilder
  private var showAllButton: some View {
    if hasHiddenRows {
      if !expanded {
        Button("Show all \(candidates.totalCount)") {
          withAnimation(reduceMotion ? nil : Theme.Motion.smooth) { expanded = true }
        }
        .font(Theme.display(.caption))
        .buttonStyle(.borderless)
        .tint(Theme.accent)
        .accessibilityHint("Shows every result here")
      }
    } else if let onShowAll {
      Button("Show all \(candidates.totalCount)", action: onShowAll)
        .font(Theme.display(.caption))
        .buttonStyle(.borderless)
        .tint(Theme.accent)
        .accessibilityHint("Asks Oak to list every result")
    }
  }

  // MARK: Layout helper

  /// One table cell: consistent padding, fills its grid **column and row** (so the
  /// zebra/header wash reads as one continuous band with `horizontalSpacing: 0`
  /// and `verticalSpacing: 0`), and aligns its content. Without `maxHeight:
  /// .infinity`, short cells (type badges) only paint content height while tall
  /// sibling cells (sprite + name + dex) fill the row — zebra bands break into
  /// left-only gray strips. Same lesson as web/Android painting the whole row,
  /// and as GFM table cells filling their column width.
  /// `accentWash` layers a faint accent tint on top of `background` (not a
  /// replacement) for the actively-sorted column, so the sort is legible without
  /// depending on the header caret alone.
  @ViewBuilder
  private func cell<Content: View>(
    background: Color,
    accentWash: Bool = false,
    alignment: Alignment,
    @ViewBuilder content: () -> Content
  ) -> some View {
    content()
      .padding(.horizontal, Theme.Spacing.md)
      .padding(.vertical, Theme.Spacing.sm)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
      .background {
        ZStack {
          background
          if accentWash {
            Theme.accent.opacity(0.06)
          }
        }
      }
  }

  // MARK: Columns

  /// The stat columns to render: the fixed six base stats when any row carries
  /// `base_stats`, otherwise the alphabetical union of `key_stats` keys.
  private var statColumns: [StatColumn] {
    if displayedRows.contains(where: { $0.baseStats != nil }) {
      return [
        StatColumn(id: "hp", label: "HP") { formatStat($0.baseStats?.hp) },
        StatColumn(id: "attack", label: "Atk") { formatStat($0.baseStats?.atk) },
        StatColumn(id: "defense", label: "Def") { formatStat($0.baseStats?.def) },
        StatColumn(id: "special_attack", label: "SpA") { formatStat($0.baseStats?.spa) },
        StatColumn(id: "special_defense", label: "SpD") { formatStat($0.baseStats?.spd) },
        StatColumn(id: "speed", label: "Spe") { formatStat($0.baseStats?.spe) },
      ]
    }

    var keys = Set<String>()
    for row in displayedRows {
      if let keyStats = row.keyStats {
        keys.formUnion(keyStats.keys)
      }
    }
    return keys.sorted().map { key in
      StatColumn(id: key.lowercased(), label: prettyKey(key)) { row in
        formatScalar(row.keyStats?[key])
      }
    }
  }

  private var showsAbility: Bool {
    displayedRows.contains { !($0.ability ?? "").isEmpty }
  }

  private var columnCount: Int {
    2 + statColumns.count + (showsAbility ? 1 : 0)
  }

  // MARK: Sort

  /// The id of the stat column the result set is sorted by, if any. The wire
  /// `sort` is a free-form string (e.g. `"speed"`, `"special_defense desc"`); a
  /// column matches when it equals the column key or is that key plus a trailing
  /// direction word — exact matching so `special_defense` never lights up `Def`.
  private var sortedColumnID: String? {
    guard let sort = candidates.sort?.lowercased(), !sort.isEmpty else { return nil }
    return statColumns.first { sort == $0.id || sort.hasPrefix($0.id + " ") }?.id
  }

  private var sortAscending: Bool {
    candidates.sort?.lowercased().contains("asc") == true
  }

  /// A human label for the sorted column, for the caption (falls back to the raw
  /// `sort` string when it doesn't map to a visible column).
  private var sortColumnLabel: String? {
    guard let sort = candidates.sort, !sort.isEmpty else { return nil }
    if let column = statColumns.first(where: { $0.id == sortedColumnID }) {
      return column.label
    }
    return sort
  }

  // MARK: Backgrounds (theme-adaptive washes, legible in light & dark)

  private var headerBackground: Color {
    Theme.textPrimary.opacity(0.06)
  }

  private func rowBackground(_ index: Int) -> Color {
    index.isMultiple(of: 2) ? Color.clear : Theme.textPrimary.opacity(0.04)
  }
}

// MARK: - Supporting column descriptor

/// One stat column: a stable `id` (the lowercased stat key, used for sort
/// matching), a display `label`, and how to read its cell text from a row.
private struct StatColumn: Identifiable {
  let id: String
  let label: String
  let value: (CandidateRow) -> String
}

// MARK: - Formatting (Foundation-free)

private func formatStat(_ value: Int?) -> String {
  value.map(String.init) ?? "—"
}

private func formatScalar(_ value: JSONScalar?) -> String {
  switch value {
  case .some(.string(let string)):
    return string
  case .some(.int(let int)):
    return String(int)
  case .some(.double(let double)):
    if double == double.rounded() {
      return String(Int(double))
    }
    return String((double * 100).rounded() / 100)
  case .some(.bool(let bool)):
    return bool ? "Yes" : "No"
  case .some(.null), .none:
    return "—"
  }
}

/// Zero-padded national dex number, e.g. `6 → "#0006"` (design-system sprite-card
/// dex style).
private func dexLabel(_ number: Int) -> String {
  let digits = String(number)
  let padding = String(repeating: "0", count: max(0, 4 - digits.count))
  return "#" + padding + digits
}

/// Turns a `key_stats` key into a readable header (`"special_attack" → "Special
/// Attack"`) without depending on Foundation.
private func prettyKey(_ key: String) -> String {
  key
    .split(whereSeparator: { $0 == "_" || $0 == " " })
    .map { word in
      guard let first = word.first else { return "" }
      return first.uppercased() + word.dropFirst()
    }
    .joined(separator: " ")
}

#if DEBUG
#Preview("Candidates — base stats, truncated") {
  ScrollView {
    CandidatesTableView(
      candidates: Candidates(
        totalCount: 23,
        truncated: true,
        sort: "speed desc",
        shown: [
          CandidateRow(
            name: "Dragapult",
            dexNumber: 887,
            spriteUrl: "https://example.com/dragapult.png",
            types: ["dragon", "ghost"],
            baseStats: BaseStats(hp: 88, atk: 120, def: 75, spa: 100, spd: 75, spe: 142),
            keyStats: nil,
            ability: "Clear Body"
          ),
          CandidateRow(
            name: "Garchomp",
            dexNumber: 445,
            spriteUrl: "https://example.com/garchomp.png",
            types: ["dragon", "ground"],
            baseStats: BaseStats(hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102),
            keyStats: nil,
            ability: "Rough Skin"
          ),
          CandidateRow(
            name: "Tyranitar",
            dexNumber: 248,
            spriteUrl: "https://example.com/tyranitar.png",
            types: ["rock", "dark"],
            baseStats: BaseStats(hp: 100, atk: 134, def: 110, spa: 95, spd: 100, spe: 61),
            keyStats: nil,
            ability: "Sand Stream"
          ),
        ]
      )
    )
    .padding(16)
  }
}

#Preview("Candidates — hidden rows, local expand") {
  ScrollView {
    CandidatesTableView(
      candidates: Candidates(
        totalCount: 4,
        truncated: true,
        sort: "speed desc",
        shown: [
          CandidateRow(
            name: "Kartana",
            dexNumber: 798,
            spriteUrl: nil,
            types: ["grass", "steel"],
            baseStats: BaseStats(hp: 59, atk: 181, def: 131, spa: 59, spd: 31, spe: 109),
            keyStats: nil,
            ability: "Beast Boost"
          ),
          CandidateRow(
            name: "Bisharp",
            dexNumber: 625,
            spriteUrl: nil,
            types: ["dark", "steel"],
            baseStats: BaseStats(hp: 65, atk: 125, def: 100, spa: 60, spd: 70, spe: 70),
            keyStats: nil,
            ability: "Defiant"
          ),
        ],
        hiddenRows: [
          CandidateRow(
            name: "Excadrill",
            dexNumber: 530,
            spriteUrl: nil,
            types: ["ground", "steel"],
            baseStats: BaseStats(hp: 110, atk: 135, def: 60, spa: 50, spd: 65, spe: 88),
            keyStats: nil,
            ability: "Mold Breaker"
          ),
          CandidateRow(
            name: "Metagross",
            dexNumber: 376,
            spriteUrl: nil,
            types: ["steel", "psychic"],
            baseStats: BaseStats(hp: 80, atk: 135, def: 130, spa: 95, spd: 90, spe: 70),
            keyStats: nil,
            ability: "Clear Body"
          ),
        ]
      ),
      // A no-op follow-up: with hidden rows present the button expands locally and
      // never calls this.
      onShowAll: {}
    )
    .padding(16)
  }
}

#Preview("Candidates — key_stats fallback") {
  CandidatesTableView(
    candidates: Candidates(
      totalCount: 2,
      truncated: false,
      sort: nil,
      shown: [
        CandidateRow(
          name: "Iron Bundle",
          dexNumber: 991,
          spriteUrl: nil,
          types: ["ice", "water"],
          baseStats: nil,
          keyStats: ["speed": .int(136), "special_attack": .int(124)],
          ability: "Quark Drive"
        ),
        CandidateRow(
          name: "Flutter Mane",
          dexNumber: 987,
          spriteUrl: nil,
          types: ["ghost", "fairy"],
          baseStats: nil,
          keyStats: ["speed": .int(135), "special_attack": .int(135)],
          ability: nil
        ),
      ]
    )
  )
  .padding(16)
}
#endif

/// Shown-set table tools (TBL-US-1–4). Sort / filter / row-pin / TSV operate
/// only on the currently shown rows — never the hidden remainder (TBL-BR-1).
struct CandidatesTableState: Equatable, Sendable {
  enum SortKey: Equatable, Sendable {
    case spe
    case hp
    case atk
    case def
    case spa
    case spd
    case name
  }

  private let source: Candidates
  private var typeFilter: String?
  private var nameQuery: String = ""
  private var pinnedNames: [String] = []
  private var sortKey: SortKey?

  init(candidates: Candidates) {
    self.source = candidates
  }

  var shownCount: Int { source.shown.count }
  var totalCount: Int { source.totalCount }

  var visibleRows: [CandidateRow] {
    let pinned = source.shown.filter { pinnedNames.contains($0.name) }
    var working = source.shown
    if let sortKey {
      working = sortRows(working, by: sortKey)
    }
    var filtered = working.filter { row in
      if pinnedNames.contains(row.name) { return false }
      if let typeFilter, !row.types.contains(where: { $0.caseInsensitiveCompare(typeFilter) == .orderedSame }) {
        return false
      }
      if !nameQuery.isEmpty, !row.name.localizedCaseInsensitiveContains(nameQuery) {
        return false
      }
      return true
    }
    let pinnedVisible = pinned.filter { row in
      source.shown.contains(where: { $0.name == row.name })
    }
    return pinnedVisible + filtered
  }

  var tsv: String { candidatesToTsv(visibleRows) }

  mutating func sort(by key: SortKey) {
    sortKey = key
  }

  mutating func filter(type: String) {
    typeFilter = type
  }

  mutating func search(name: String) {
    nameQuery = name
  }

  mutating func pinRow(named name: String) {
    if !pinnedNames.contains(name) { pinnedNames.append(name) }
  }

  mutating func unpinRow(named name: String) {
    pinnedNames.removeAll { $0 == name }
  }

  mutating func clearFilters() {
    typeFilter = nil
    nameQuery = ""
  }

  private func sortRows(_ rows: [CandidateRow], by key: SortKey) -> [CandidateRow] {
    rows.sorted { lhs, rhs in
      switch key {
      case .spe: return (lhs.baseStats?.spe ?? 0) > (rhs.baseStats?.spe ?? 0)
      case .hp: return (lhs.baseStats?.hp ?? 0) > (rhs.baseStats?.hp ?? 0)
      case .atk: return (lhs.baseStats?.atk ?? 0) > (rhs.baseStats?.atk ?? 0)
      case .def: return (lhs.baseStats?.def ?? 0) > (rhs.baseStats?.def ?? 0)
      case .spa: return (lhs.baseStats?.spa ?? 0) > (rhs.baseStats?.spa ?? 0)
      case .spd: return (lhs.baseStats?.spd ?? 0) > (rhs.baseStats?.spd ?? 0)
      case .name: return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
      }
    }
  }
}
