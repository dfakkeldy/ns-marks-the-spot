import UIKit

/// The app's haptics, in one place and warmed.
///
/// Two things a scattered `UIImpactFeedbackGenerator(style:).impactOccurred()`
/// gets wrong. It fires cold: a generator warms the Taptic Engine when it is
/// prepared, and one created and fired in the same statement has had no chance
/// to, so the tap lands late or, under load, not at all. And it leaves the
/// vocabulary to whoever wrote the call site — which is how the app came to
/// tick when a snap target was merely resolved and say nothing at all when a
/// shape was finished.
///
/// The vocabulary, and it is short:
///
///   - `placed()` — a coordinate landed. A corner placed, a snap taken, a mark
///     saved. Light, because it happens often and is a confirmation rather than
///     an event.
///   - `modeChanged()` — the app is doing something different now. A recording
///     started, paused, resumed or stopped; a shape finished. Medium, because
///     it is rare and worth feeling.
///   - `refused()` — nothing happened, and the reader should look. The system
///     error pattern, not an impact, because it is the one that does not read
///     as a confirmation.
///
/// Anything that did not happen gets no tap at all: a haptic for a refused
/// write is a confirmation of a write.
@MainActor
enum MapHaptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let notice = UINotificationFeedbackGenerator()

    /// Warms the engine so the next tap is not the one that pays for it.
    /// Called when a surface that uses them appears.
    static func warmUp() {
        light.prepare()
        medium.prepare()
    }

    static func placed() {
        light.impactOccurred()
        // Re-warmed straight away: the next corner is usually seconds behind.
        light.prepare()
    }

    static func modeChanged() {
        medium.impactOccurred()
        medium.prepare()
    }

    static func refused() {
        notice.notificationOccurred(.error)
    }

    /// A mark was written. The system's success pattern rather than an impact:
    /// this is the one place the app knows how a mark ended, and the pattern a
    /// reader already associates with "it worked" is the honest one to use.
    static func saved() {
        notice.notificationOccurred(.success)
    }
}
