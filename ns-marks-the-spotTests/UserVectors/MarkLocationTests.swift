import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// The pure half of Mark My Location: which fix is used, and what a failure
/// says. The CoreLocation half needs a device.
@Suite("Mark My Location fix selection")
@MainActor
struct MarkLocationTests {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func fix(_ ageSeconds: Double, accuracy: Double) -> TrackFix {
        TrackFix(
            latitude: 45.80849, longitude: -61.47137, accuracyM: accuracy,
            timestamp: now.addingTimeInterval(-ageSeconds)
        )
    }

    /// The screenshot case: the recorder is not running, so its fix is nil,
    /// and the map is already drawing a dot from a fix of its own. That fix
    /// is used rather than a fresh request.
    @Test("The map's fix is used when the recorder has none")
    func theMapFixIsUsedWhenTheRecorderHasNone() {
        let map = fix(2, accuracy: 12)
        #expect(MarkLocation.usableFix(among: [nil, map], now: now) == map)
    }

    @Test("Candidates are tried in order and a stale one yields to a fresh one")
    func candidatesAreTriedInOrder() {
        let staleRecorder = fix(60, accuracy: 5)
        let map = fix(3, accuracy: 20)
        #expect(MarkLocation.usableFix(among: [staleRecorder, map], now: now) == map)
        let freshRecorder = fix(1, accuracy: 5)
        #expect(MarkLocation.usableFix(among: [freshRecorder, map], now: now) == freshRecorder)
    }

    /// The contract's 10 s / 50 m rule applies to every candidate; nothing
    /// usable means the caller asks CoreLocation.
    @Test("Stale or rough candidates are all refused")
    func staleOrRoughCandidatesAreRefused() {
        #expect(MarkLocation.usableFix(among: [fix(60, accuracy: 5), nil], now: now) == nil)
        #expect(MarkLocation.usableFix(among: [fix(1, accuracy: 80)], now: now) == nil)
        #expect(MarkLocation.usableFix(among: [fix(1, accuracy: -1)], now: now) == nil)
        #expect(MarkLocation.usableFix(among: [], now: now) == nil)
    }

    /// A full disk or an unreadable layer is not a GPS problem, and the toast
    /// must not send the reader outdoors to fix it.
    @Test("A storage failure is reported in the store's words")
    func aStorageFailureKeepsItsOwnWords() {
        let reason = "This layer's stored features could not be read on this device."
        let outcome = MarkLocation.Outcome.storageFailed(reason)
        #expect(outcome.message == reason)
        #expect(!outcome.message.contains("outdoors"))
        #expect(MarkLocation.Outcome.unavailable.message.contains("outdoors"))
    }
}
