import SwiftUI
import UIKit

/// Live share links + revoke (SHARE-US-4 / ADR-11). Signed-in only.
struct SharedByMeView: View {
  @Environment(\.services) private var services
  @State private var model: SharedByMeViewModel

  init(shares: any ShareService) {
    _model = State(initialValue: SharedByMeViewModel(shares: shares))
  }

  var body: some View {
    List {
      if model.shares.isEmpty, !model.isLoading {
        Text("You haven't shared any answers yet.")
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textSecondary)
          .listRowBackground(Color.clear)
      } else {
        ForEach(model.shares) { share in
          VStack(alignment: .leading, spacing: 4) {
            Text(share.conversationTitle)
              .font(Theme.body(.subheadline, weight: .semibold))
            Text(share.url)
              .font(Theme.mono(.caption))
              .foregroundStyle(Theme.textMuted)
              .lineLimit(1)
            Text(Date(timeIntervalSince1970: Double(share.createdAt) / 1000).formatted(date: .abbreviated, time: .shortened))
              .font(Theme.body(.caption))
              .foregroundStyle(Theme.textSecondary)
          }
          .swipeActions {
            Button(role: .destructive) {
              Task { await model.revoke(share) }
            } label: {
              Label("Revoke", systemImage: "link.badge.plus")
            }
          }
          .contextMenu {
            Button {
              UIPasteboard.general.string = share.url
            } label: {
              Label("Copy link", systemImage: "doc.on.doc")
            }
            Button(role: .destructive) {
              Task { await model.revoke(share) }
            } label: {
              Label("Revoke", systemImage: "xmark.circle")
            }
          }
        }
      }
    }
    .navigationTitle("Shared by me")
    .task { await model.reload() }
    .refreshable { await model.reload() }
  }
}

@MainActor
@Observable
final class SharedByMeViewModel {
  private(set) var shares: [ShareSummary] = []
  private(set) var isLoading = false
  private let sharesService: any ShareService

  init(shares: any ShareService) {
    self.sharesService = shares
  }

  func reload() async {
    isLoading = true
    defer { isLoading = false }
    shares = (try? await sharesService.list()) ?? []
  }

  func revoke(_ share: ShareSummary) async {
    do {
      try await sharesService.revoke(id: share.id)
      shares.removeAll { $0.id == share.id }
    } catch {
      // Keep the row; a failed revoke must not pretend it worked.
    }
  }
}
