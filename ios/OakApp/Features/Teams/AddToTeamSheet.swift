import SwiftUI
import Observation

private struct ShowsAddToTeamKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Signed-in only. Guests never see Add-to-team (AUTH-BR-1).
  var showsAddToTeam: Bool {
    get { self[ShowsAddToTeamKey.self] }
    set { self[ShowsAddToTeamKey.self] = newValue }
  }
}

/// Species-only incoming for a sprite / row / comparison cell (ADD-BR-2).
func incomingTeamMember(
  species: String,
  ability: String? = nil,
  item: String? = nil,
  moves: [String] = [],
  nature: String? = nil,
  teraType: String? = nil,
  level: Int = 50
) -> TeamMember {
  let slug = species
    .trimmingCharacters(in: .whitespacesAndNewlines)
    .lowercased()
    .replacingOccurrences(of: " ", with: "-")
  return TeamMember(
    species: slug.isEmpty ? nil : slug,
    ability: ability,
    item: item,
    moves: moves,
    nature: nature,
    evs: StatSpread(hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0),
    ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
    teraType: teraType,
    level: level,
    nickname: nil,
    gender: nil,
    shiny: nil
  )
}

/// Compact Add-to-team verb. Renders nothing for guests.
struct AddToTeamButton: View {
  let incoming: TeamMember
  var compact: Bool = false

  @Environment(\.showsAddToTeam) private var showsAddToTeam

  var body: some View {
    if showsAddToTeam, incoming.species?.isEmpty == false {
      AddToTeamButtonInner(incoming: incoming, compact: compact)
    }
  }
}

private struct AddToTeamButtonInner: View {
  let incoming: TeamMember
  var compact: Bool = false
  @Environment(AppState.self) private var appState

  var body: some View {
    if compact {
      Button {
        appState.pendingAddToTeam = incoming
      } label: {
        Label("Add to team", systemImage: "plus")
          .font(Theme.body(.caption, weight: .medium))
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Add to team")
    } else {
      Button {
        appState.pendingAddToTeam = incoming
      } label: {
        Label("Add to team", systemImage: "plus.square.on.square")
          .font(Theme.display(.footnote))
      }
      .buttonStyle(.oakSecondary)
      .accessibilityLabel("Add to team")
    }
  }
}

/// Picker + first-empty / replace / create-new (ADD-US-1–4). Guests never see
/// the sheet (AUTH-BR-1).
@MainActor
@Observable
final class AddToTeamViewModel {
  private(set) var isPresented: Bool
  private(set) var teams: [TeamSummary] = []
  private(set) var replaceCandidates: [TeamMember]?
  private(set) var openedTeamId: String?
  private(set) var focusedSlot: Int?
  private(set) var errorMessage: String?

  var showsAddToTeam: Bool { isSignedIn }
  var canCreateNewTeam: Bool { isSignedIn }

  private let teamService: any TeamService
  private let isSignedIn: Bool
  private let conversationFormat: Format
  private let incoming: TeamMember
  private var replaceTeamId: String?

  init(
    teams: any TeamService,
    isSignedIn: Bool,
    conversationFormat: Format,
    incoming: TeamMember
  ) {
    self.teamService = teams
    self.isSignedIn = isSignedIn
    self.conversationFormat = conversationFormat
    self.incoming = incoming
    self.isPresented = isSignedIn
  }

  func load() async {
    guard isSignedIn else { return }
    do {
      teams = try await teamService.list(format: nil)
    } catch {
      errorMessage = "Couldn't load teams."
      teams = []
    }
  }

  func selectTeam(id: String) async {
    guard isSignedIn else { return }
    errorMessage = nil
    do {
      let loaded = try await teamService.get(id: id)
      switch placeSpeciesOnTeam(loaded.team.members, incoming: incoming, target: .firstEmpty) {
      case .full:
        replaceCandidates = padMembers(loaded.team.members)
        replaceTeamId = id
      case .ok(let members, let slot):
        try await write(id: id, members: members, slot: slot)
      }
    } catch {
      openedTeamId = nil
      focusedSlot = nil
      errorMessage = "Couldn't add to that team. Try again."
    }
  }

  func replaceSlot(_ index: Int) async {
    guard isSignedIn, let teamId = replaceTeamId else { return }
    errorMessage = nil
    do {
      let loaded = try await teamService.get(id: teamId)
      switch placeSpeciesOnTeam(loaded.team.members, incoming: incoming, target: .replace(index: index)) {
      case .ok(let members, let slot):
        replaceCandidates = nil
        replaceTeamId = nil
        try await write(id: teamId, members: members, slot: slot)
      case .full:
        errorMessage = "That team is full."
      }
    } catch {
      openedTeamId = nil
      focusedSlot = nil
      errorMessage = "Couldn't replace that slot. Try again."
    }
  }

  func cancelReplace() {
    replaceCandidates = nil
    replaceTeamId = nil
  }

  func createNewTeam(name: String) async {
    guard isSignedIn else { return }
    errorMessage = nil
    switch placeSpeciesOnTeam([], incoming: incoming, target: .firstEmpty) {
    case .ok(let members, let slot):
      do {
        let created = try await teamService.create(
          format: conversationFormat,
          name: name,
          members: members
        )
        openedTeamId = created.team.id
        focusedSlot = slot
      } catch {
        openedTeamId = nil
        focusedSlot = nil
        errorMessage = "Couldn't create that team. Try again."
      }
    case .full:
      errorMessage = "Couldn't create that team."
    }
  }

  func dismiss() {
    isPresented = false
    replaceCandidates = nil
    replaceTeamId = nil
  }

  private func write(id: String, members: [TeamMember], slot: Int) async throws {
    _ = try await teamService.update(id: id, name: nil, members: members)
    openedTeamId = id
    focusedSlot = slot
  }

  private func padMembers(_ members: [TeamMember]) -> [TeamMember] {
    var next = members
    while next.count < 6 { next.append(blankTeamMember()) }
    return Array(next.prefix(6))
  }
}

struct AddToTeamSheet: View {
  @Bindable var model: AddToTeamViewModel
  var onOpened: ((String, Int) -> Void)?

  @State private var newName = ""

  var body: some View {
    NavigationStack {
      List {
        if model.teams.isEmpty {
          Text("No saved teams yet.")
            .font(Theme.body(.body))
            .foregroundStyle(Theme.textSecondary)
        }
        ForEach(model.teams) { team in
          Button {
            Task {
              await model.selectTeam(id: team.id)
              if let id = model.openedTeamId, let slot = model.focusedSlot {
                onOpened?(id, slot)
              }
            }
          } label: {
            VStack(alignment: .leading, spacing: 2) {
              Text(team.name)
                .font(Theme.body(.body, weight: .medium))
              Text(team.format.displayLabel)
                .font(Theme.body(.caption))
                .foregroundStyle(Theme.textSecondary)
            }
          }
        }
        if model.canCreateNewTeam {
          Section("New team") {
            TextField("Name", text: $newName)
            Button("Create new team") {
              Task {
                await model.createNewTeam(name: newName.isEmpty ? "New team" : newName)
                if let id = model.openedTeamId, let slot = model.focusedSlot {
                  onOpened?(id, slot)
                }
              }
            }
          }
        }
      }
      .navigationTitle("Add to team")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { model.dismiss() }
        }
      }
      .task { await model.load() }
      .alert("Replace a member?", isPresented: replacePresented) {
        if let candidates = model.replaceCandidates {
          ForEach(Array(candidates.enumerated()), id: \.offset) { index, member in
            Button(member.species ?? "Empty slot \(index + 1)") {
              Task {
                await model.replaceSlot(index)
                if let id = model.openedTeamId, let slot = model.focusedSlot {
                  onOpened?(id, slot)
                }
              }
            }
          }
        }
        Button("Cancel", role: .cancel) { model.cancelReplace() }
      } message: {
        Text("This team is full. Choose a member to replace.")
      }
    }
    .oakEnamelNav()
  }

  private var replacePresented: Binding<Bool> {
    Binding(
      get: { model.replaceCandidates != nil },
      set: { if !$0 { model.cancelReplace() } }
    )
  }
}
