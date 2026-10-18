import ActivityKit
import Foundation

/// What the Lock Screen is told about a walk in progress.
///
/// Compiled into both the app and the widget extension — the app writes it,
/// the extension draws it — which is why it holds no `GeoCore` type and does
/// no formatting: the two processes must agree on the numbers, and they can
/// only do that if the numbers are plain.
///
/// It carries **no coordinates**. A Live Activity is rendered outside this app
/// by a system process and can be seen on a locked screen by whoever is
/// holding the phone; where the reader is standing is not something to put
/// there. Elapsed time and distance walked describe the recording, not the
/// place.
// `nonisolated`, because the project's default actor isolation is MainActor
// and ActivityKit hands this type to a system process: a main-actor-isolated
// conformance cannot cross into the concurrent context where the activity is
// requested and updated. It is plain data with no identity to protect.
nonisolated struct TrackActivityAttributes: ActivityAttributes {
    nonisolated struct ContentState: Codable, Hashable {
        /// When the running clock started from zero, so the Lock Screen can
        /// count without this app waking to tell it. Nil while paused, which
        /// is what freezes the clock at `elapsedSeconds`.
        var runningSince: Date?
        /// Seconds already banked before `runningSince`. The whole elapsed
        /// time while paused; the part before the current run while going.
        var elapsedSeconds: TimeInterval
        /// Metres along the ground, after the contract's filter — the same
        /// number the HUD shows, never a raw sum of every fix.
        var distanceMetres: Double
        /// Whether fixes are being taken in right now.
        var isRecording: Bool
        /// Why they are not, when they are not. Nil when nothing is wrong.
        var refusalText: String?
        /// Why the walk will not survive the phone going in a pocket, when the
        /// system says it will not.
        ///
        /// Its own field, and not folded into `refusalText`: fixes arriving now
        /// and fixes arriving in a pocket are different facts, and a Lock
        /// Screen that says "Recording a track" over a session iOS has refused
        /// merges *blocked* into *working* — which is the one thing this app's
        /// evidence rules do not permit.
        var backgroundNotice: String?
        /// Set on an activity this app did not close: the process was
        /// terminated with a walk running, and the Lock Screen was left saying
        /// so. What it ends up saying instead is that the recording stopped —
        /// never that it completed, because nobody knows whether it did.
        var endedByTermination = false
    }

    /// Nothing. The walk has no name until it is saved, and inventing one for
    /// the Lock Screen would be inventing a record.
    var startedAt: Date
}

/// The Lock Screen's own number formatting.
///
/// Here rather than `Geodesy`, because this file is compiled into the widget
/// extension and that extension must not link the app's geometry package: a
/// widget that pulls in the whole of `GeoCore` to round a distance is a widget
/// that fails to launch for a reason nobody will find on a Lock Screen.
///
/// It must nevertheless say exactly what the HUD says — the same walk, two
/// screens, one number — so it copies `Geodesy.formatDistance` rule for rule:
/// metres below a kilometre, kilometres to two decimals at and above, en_CA,
/// and half-away-from-zero because that is what `Intl.NumberFormat` does and
/// the web is where this rounding came from. `TrackActivityFormatTests` is
/// what keeps the copy honest.
nonisolated enum TrackActivityFormat {
    private static let locale = Locale(identifier: "en_CA")

    static func distance(_ metres: Double) -> String {
        if metres < 1_000 {
            return "\(format(metres, fractionDigits: 0)) m"
        }
        return "\(format(metres / 1_000, fractionDigits: 2)) km"
    }

    private static func format(_ value: Double, fractionDigits: Int) -> String {
        value.formatted(
            .number
                .precision(.fractionLength(fractionDigits))
                .rounded(rule: .toNearestOrAwayFromZero)
                .locale(locale)
        )
    }
}
