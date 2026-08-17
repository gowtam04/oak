import UIKit

/// Present a system share sheet (export files + public share URLs).
enum SystemShare {
  @MainActor
  static func present(items: [Any]) {
    let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
    guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
    let root = scene.keyWindow?.rootViewController ?? scene.windows.first?.rootViewController
    root?.present(sheet, animated: true)
  }
}
