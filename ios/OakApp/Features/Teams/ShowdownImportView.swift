import SwiftUI

/// The Showdown-paste import sheet (history-and-teams.md M-TEAM-US-2; M-AC-T2.1/T2.3):
/// paste a Showdown team, pick its format, and import it into a new saved team. Native
/// paste is used for input; export (the share sheet) lives in the editor.
///
/// **Never fails wholesale** (resolve-or-clarify): the server resolves whatever it can
/// and returns the rest as ``ImportNote``s, which are shown here as advisories — the team
/// is still created from everything that resolved (M-AC-T2.1). The import action and the
/// list insert both live on the shared ``TeamsListViewModel`` so the new team appears in
/// the library immediately.
struct ShowdownImportView: View {
  @Environment(\.dismiss) private var dismiss
  let model: TeamsListViewModel

  @State private var format: Format
  @State private var paste: String = ""
  @State private var notes: [ImportNote] = []
  @State private var importedTeamName: String?
  @State private var importedMembers: [TeamMember] = []
  @State private var isImporting: Bool = false

  init(model: TeamsListViewModel) {
    self.model = model
    _format = State(initialValue: model.formatFilter ?? .scarletViolet)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Format") {
          Picker("Format", selection: $format) {
            ForEach(Format.knownCases, id: \.self) { format in
              Text(format.shortLabel).tag(format)
            }
          }
        }

        Section("Showdown paste") {
          TextEditor(text: $paste)
            .font(Theme.mono(.footnote))
            .frame(minHeight: 180)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .accessibilityLabel("Showdown paste")
          if paste.isEmpty {
            Text("Paste a team exported from Pokémon Showdown.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }

        if let importedTeamName {
          Section {
            Label("Imported \"\(importedTeamName)\" into your Teams.", systemImage: "checkmark.seal.fill")
              .foregroundStyle(Theme.success)
          }
        }

        if !importedMembers.isEmpty {
          Section("Parsed team") {
            ForEach(Array(importedMembers.enumerated()), id: \.offset) { index, member in
              ParsedMemberRow(member: member, index: index)
            }
          }
        }

        if !notes.isEmpty {
          Section("Import notes") {
            ForEach(notes) { note in
              ImportNoteRow(note: note)
            }
          }
        }
      }
      .navigationTitle("Import team")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .topBarTrailing) {
          if isImporting {
            ProgressView()
          } else if importedTeamName == nil {
            Button("Import") {
              Task { await runImport() }
            }
            .fontWeight(.semibold)
            .disabled(paste.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          } else {
            Button("Done") { dismiss() }
              .fontWeight(.semibold)
          }
        }
      }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          errorBanner(message)
        }
      }
    }
  }

  /// Runs the import. On success: if there were no notes, dismiss immediately; otherwise
  /// keep the sheet open so the user can read the resolve-or-clarify notes before
  /// dismissing.
  private func runImport() async {
    isImporting = true
    defer { isImporting = false }
    guard let result = await model.importPaste(paste, format: format) else { return }
    notes = result.notes
    importedTeamName = result.team.name
    importedMembers = result.team.members
    if result.notes.isEmpty {
      dismiss()
    }
  }

  private func errorBanner(_ message: String) -> some View {
    HStack(spacing: 8) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(.orange)
      Text(message)
        .font(.footnote)
      Spacer(minLength: 0)
      Button("Dismiss") { model.dismissError() }
        .font(.footnote)
    }
    .padding(12)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    .padding()
  }
}

/// One parsed-team preview row: the resolved species name, staggered in on first
/// appear once the import succeeds (Theme.Motion.staggered) so the roster reveals
/// itself one slot at a time rather than popping in all at once.
private struct ParsedMemberRow: View {
  let member: TeamMember
  let index: Int

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var hasAppeared = false

  var body: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(Theme.accent.opacity(0.4))
        .frame(width: 6, height: 6)
        .accessibilityHidden(true)
      Text(displayName)
        .font(.footnote)
      Spacer(minLength: 0)
    }
    .opacity(hasAppeared ? 1 : 0)
    .offset(y: hasAppeared ? 0 : 6)
    .onAppear {
      guard !hasAppeared else { return }
      if reduceMotion {
        hasAppeared = true
      } else {
        withAnimation(Theme.Motion.staggered(index)) {
          hasAppeared = true
        }
      }
    }
  }

  private var displayName: String {
    guard let species = member.species, !species.isEmpty else { return "Unknown" }
    return TeamBlocksView.titleizeNonNil(species)
  }
}

/// One import note: an info icon **and** the message text (M-AC-UI9.3 — never color
/// alone), with the raw paste text it concerns.
private struct ImportNoteRow: View {
  let note: ImportNote

  var body: some View {
    Label {
      VStack(alignment: .leading, spacing: 2) {
        Text(note.message)
          .font(.footnote)
          .foregroundStyle(Theme.textPrimary)
          .fixedSize(horizontal: false, vertical: true)
      }
    } icon: {
      Image(systemName: "info.circle")
        .foregroundStyle(Theme.info)
        .accessibilityHidden(true)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Import note: \(note.message)")
  }
}
