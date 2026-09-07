import SwiftUI
import UIKit

/// Public share viewer: `GET /api/shares/public/:id` then a native AnswerCard.
/// Does not scrape HTML (ADR-13). No retry/edit/share/pin/fork.
struct ShareSnapshotView: View {
  let shareId: String
  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState
  @Environment(\.dismiss) private var dismiss

  @State private var snapshot: PublicShare?
  @State private var loadError: String?
  @State private var isLoading = true
  @State private var didCopy = false
  @State private var importError: String?
  @State private var showingSignIn = false
  @State private var pendingImportAfterSignIn = false

  var body: some View {
    NavigationStack {
      Group {
        if let snapshot {
          ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
              Text(snapshot.conversationTitle)
                .font(Theme.display(.title3))
                .foregroundStyle(Theme.textStrong)
              Text(snapshot.question)
                .font(Theme.body(.body))
                .foregroundStyle(Theme.textPrimary)
              AnswerCardView(answer: snapshot.answer)
              Button {
                copyHuman(snapshot.answer)
              } label: {
                Label(didCopy ? "Copied" : "Copy as human text", systemImage: "doc.on.doc")
              }
              .buttonStyle(.oakSecondary)
              openInOakButton(snapshot)
            }
            .padding(Theme.Spacing.lg)
          }
        } else if isLoading {
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          ContentUnavailableView {
            Label("Share unavailable", systemImage: "link.badge.plus")
          } description: {
            Text(loadError ?? "This share is no longer available.")
          }
        }
      }
      .background(Theme.canvas)
      .navigationTitle("Shared answer")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
      }
    }
    .oakEnamelNav()
    .task { await load() }
    .sheet(isPresented: $showingSignIn) {
      AuthView(model: AuthViewModel(auth: services.auth, appState: appState))
    }
    .onChange(of: appState.authState) { _, newValue in
      if case .signedIn = newValue, pendingImportAfterSignIn {
        pendingImportAfterSignIn = false
        showingSignIn = false
        if let snapshot {
          Task { await importProposedTeam(snapshot) }
        }
      }
    }
    .alert("Couldn't import", isPresented: Binding(
      get: { importError != nil },
      set: { if !$0 { importError = nil } }
    )) {
      Button("OK", role: .cancel) { importError = nil }
    } message: {
      Text(importError ?? "")
    }
  }

  @ViewBuilder
  private func openInOakButton(_ snapshot: PublicShare) -> some View {
    Button {
      Task { await openInOak(snapshot) }
    } label: {
      Label("Open in Oak", systemImage: "arrow.right.circle")
    }
    .buttonStyle(.oakPrimary)
  }

  private func load() async {
    isLoading = true
    defer { isLoading = false }
    do {
      snapshot = try await services.shares.getPublic(id: shareId)
    } catch {
      loadError = "This share is no longer available."
    }
  }

  private func copyHuman(_ answer: OakAnswer) {
    UIPasteboard.general.string = OakAnswerHumanMarkdown.build(answer)
    didCopy = true
  }

  private func openInOak(_ snapshot: PublicShare) async {
    if snapshot.answer.proposedTeam == nil {
      dismiss()
      return
    }
    if case .guest = appState.authState {
      pendingImportAfterSignIn = true
      showingSignIn = true
      return
    }
    await importProposedTeam(snapshot)
  }

  private func importProposedTeam(_ snapshot: PublicShare) async {
    do {
      let teamId = try await services.shares.importTeam(id: snapshot.id)
      dismiss()
      appState.pendingDestination = .team(id: teamId)
    } catch {
      importError = "Couldn't import that team. Please try again."
    }
  }
}
