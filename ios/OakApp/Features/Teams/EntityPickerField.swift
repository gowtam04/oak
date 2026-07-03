import SwiftUI

/// One picker suggestion — a slug/display-name pair, optionally with a secondary hint line
/// (a nature's +/- stat summary, or a move's type/category/power). Mirrors `PickerOption`
/// in `web/src/components/teams/dex-constants.ts`.
struct PickerOption: Identifiable, Equatable, Sendable {
  let slug: String
  let displayName: String
  var hint: String?

  init(slug: String, displayName: String, hint: String? = nil) {
    self.slug = slug
    self.displayName = displayName
    self.hint = hint
  }

  var id: String { slug }
}

/// Where an ``EntityPickerRow`` gets its suggestions from — mirrors `EntityPicker.tsx`'s two
/// suggestion sources (a `kind`-scoped network search vs. a static `options` list).
enum PickerSource: Sendable {
  /// Debounced `GET /api/search`, scoped to one entity kind + the editor's fixed format.
  case search(EntityKind)
  /// A static, locally-filtered option list (a species' legal abilities/movepool).
  case options([PickerOption])
}

/// A require-selection entity field: a tappable row showing the current (titleized) value,
/// opening ``EntityPickerSheet`` to search/browse and commit a new slug. This is iOS's native
/// rendering of `EntityPicker.tsx`'s combobox — a full-screen searchable list stands in for
/// the web inline dropdown, which doesn't translate well inside a scrolling `Form`. Slugs are
/// stored/committed exactly as `EntityPicker.tsx` does; only the interaction shape differs.
struct EntityPickerRow: View {
  let title: String
  /// The committed slug; `""` = empty/unset.
  let value: String
  let source: PickerSource
  var placeholder: String = "Not set"
  var disabled: Bool = false
  /// A friendly label for the current `value` when no richer data (e.g. a resolved sprite
  /// display name) is available — callers pass a titleized slug by default.
  var displayName: ((String) -> String)? = nil
  /// Backs a `.search` source — routed through the owning view model
  /// (``TeamEditorViewModel/searchEntities(kind:query:)``) so this view never touches
  /// ``DexLookupService`` directly.
  let search: (EntityKind, String) async -> [PickerOption]
  let onChange: (String) -> Void

  @State private var isPresented = false

  private var label: String {
    guard !value.isEmpty else { return placeholder }
    return displayName?(value) ?? TeamBlocksView.titleizeNonNil(value)
  }

  var body: some View {
    Button {
      isPresented = true
    } label: {
      LabeledContent(title) {
        Text(label)
          .foregroundStyle(value.isEmpty || disabled ? Theme.textMuted : Theme.textPrimary)
      }
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .sheet(isPresented: $isPresented) {
      EntityPickerSheet(
        title: title,
        source: source,
        currentValue: value,
        search: search,
        onSelect: { slug in
          onChange(slug)
          isPresented = false
        }
      )
    }
  }
}

/// The full-screen search/browse sheet an ``EntityPickerRow`` opens. Debounces network
/// search (mirrors `EntityPicker.tsx`'s 150ms `DEBOUNCE_MS`) and filters a static option list
/// locally with no debounce. A blank query browses the full list (search) or the full static
/// set (options) — mirrors the web picker's on-focus behavior.
struct EntityPickerSheet: View {
  let title: String
  let source: PickerSource
  let currentValue: String
  let search: (EntityKind, String) async -> [PickerOption]
  let onSelect: (String) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var results: [PickerOption] = []
  @State private var searchTask: Task<Void, Never>?

  /// Mirrors `EntityPicker.tsx`'s `DEBOUNCE_MS` — snappy without spamming `/api/search`.
  private static let debounceNanoseconds: UInt64 = 150_000_000

  var body: some View {
    NavigationStack {
      List {
        if !currentValue.isEmpty {
          Button(role: .destructive) {
            onSelect("")
          } label: {
            Label("Clear selection", systemImage: "xmark.circle")
          }
        }
        if results.isEmpty {
          ContentUnavailableView("No matches", systemImage: "magnifyingglass")
            .listRowSeparator(.hidden)
        } else {
          ForEach(results) { option in
            Button {
              onSelect(option.slug)
            } label: {
              HStack {
                VStack(alignment: .leading, spacing: 2) {
                  Text(option.displayName)
                    .foregroundStyle(Theme.textPrimary)
                  if let hint = option.hint {
                    Text(hint)
                      .font(.caption)
                      .foregroundStyle(Theme.textSecondary)
                  }
                }
                Spacer(minLength: 8)
                if option.slug == currentValue {
                  Image(systemName: "checkmark")
                    .foregroundStyle(Theme.accent)
                }
              }
            }
          }
        }
      }
      .searchable(text: $query, prompt: "Search")
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
      .task { await runSearch(query) }
      .onChange(of: query) { _, newValue in scheduleSearch(newValue) }
    }
  }

  private func scheduleSearch(_ q: String) {
    searchTask?.cancel()
    searchTask = Task {
      if case .search = source {
        try? await Task.sleep(nanoseconds: Self.debounceNanoseconds)
      }
      guard !Task.isCancelled else { return }
      await runSearch(q)
    }
  }

  private func runSearch(_ q: String) async {
    let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
    switch source {
    case .options(let options):
      let lower = trimmed.lowercased()
      results =
        lower.isEmpty
        ? options
        : options.filter {
          $0.displayName.lowercased().contains(lower) || $0.slug.lowercased().contains(lower)
        }
    case .search(let kind):
      let matches = await search(kind, trimmed)
      guard !Task.isCancelled else { return }
      results = matches
    }
  }
}
