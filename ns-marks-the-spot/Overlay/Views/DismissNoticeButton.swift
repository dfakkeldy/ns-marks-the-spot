import SwiftUI

/// The way to take down a notice that would otherwise stay: the ones that
/// carry a decision are not put on a timer, so they need a hand.
struct DismissNoticeButton: View {
    var onDismiss: () -> Void

    var body: some View {
        Button(action: onDismiss) {
            Text("Dismiss")
                .font(.footnote.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityHint("Takes this message down.")
    }
}
