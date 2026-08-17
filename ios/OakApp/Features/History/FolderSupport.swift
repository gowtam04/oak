import SwiftUI

/// Organize chrome for the history list: folder filter, archive, bulk.
/// Guest history is already hidden (the list is signed-in only).
enum FolderSupport {
  static func filterLabel(
    showingArchive: Bool,
    folderFilter: String?,
    folders: [ConversationFolder]
  ) -> String {
    if showingArchive { return "Archive" }
    if folderFilter == "unfiled" { return "Unfiled" }
    if let folderFilter, let folder = folders.first(where: { $0.id == folderFilter }) {
      return folder.name
    }
    return "All"
  }
}
