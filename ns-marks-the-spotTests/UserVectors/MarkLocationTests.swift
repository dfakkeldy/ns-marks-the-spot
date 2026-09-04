import CoreLocation
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

    /// A fix CoreLocation returns to a request is held to the same rule as a
    /// cached one, and a mark is never built from one the rule refused.
    @Test("A requested fix that fails the rule is refused, and says which half")
    func aRequestedFixIsHeldToTheRule() {
        func location(_ ageSeconds: Double, accuracy: Double) -> CLLocation {
            CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: 45.80849, longitude: -61.47137),
                altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: -1,
                timestamp: now.addingTimeInterval(-ageSeconds)
            )
        }
        let good = MarkLocation.requestedFix(location(2, accuracy: 12), now: now)
        #expect(good.fix != nil)
        #expect(good.outcome == nil)
        let rough = MarkLocation.requestedFix(location(2, accuracy: 500), now: now)
        #expect(rough.fix == nil)
        #expect(rough.outcome == .poorFix(accuracyM: 500, reason: .rough))
        let old = MarkLocation.requestedFix(location(120, accuracy: 12), now: now)
        #expect(old.fix == nil)
        #expect(old.outcome == .poorFix(accuracyM: 12, reason: .old))
        // Ahead of the clock is not old: the clock is what is wrong.
        let ahead = MarkLocation.requestedFix(location(-3_600, accuracy: 12), now: now)
        #expect(ahead.outcome == .poorFix(accuracyM: 12, reason: .futureDated))
        #expect(ahead.outcome?.message.contains("ahead of this device's clock") == true)
        let invalid = MarkLocation.requestedFix(location(2, accuracy: -1), now: now)
        #expect(invalid.fix == nil)
        #expect(invalid.outcome == nil)
        // Off the globe is not a position, from a request or from a cache.
        let offGlobe = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 91, longitude: -61.47137),
            altitude: 0, horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: now
        )
        #expect(MarkLocation.requestedFix(offGlobe, now: now).fix == nil)
        #expect(
            MarkLocation.usableFix(
                among: [TrackFix(latitude: 91, longitude: -61.47137, accuracyM: 5, timestamp: now)], now: now
            ) == nil
        )
        #expect(rough.outcome?.message.contains("within 500 m") == true)
        // The label rounds up, never down: no positive radius reads as zero.
        #expect(MarkLocation.accuracyLabel(0.04) == "0.1")
        #expect(MarkLocation.accuracyLabel(6.74) == "6.8")
        #expect(MarkLocation.accuracyLabel(12.2) == "13")
    }

    /// The saved-mark toast, in the web's words, with a radius that never
    /// reads smaller than it was.
    @Test("A saved mark is said in the web's words")
    func aSavedMarkIsSaidInTheWebsWords() {
        #expect(
            MarkLocation.Outcome.marked(layerName: "Field notes", accuracyM: 5.2, layerShown: false).message
                == "Point saved to Field notes (±5.2 m)."
        )
        #expect(
            MarkLocation.Outcome.marked(layerName: "Field notes", accuracyM: 24, layerShown: true).message
                == "Point saved to Field notes (±24 m). Layer switched on."
        )
        #expect(
            MarkLocation.Outcome.marked(layerName: "Walk", accuracyM: 0.04, layerShown: false).message
                == "Point saved to Walk (±0.1 m)."
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

    /// Denied, restricted and Location Services off are three refusals, each
    /// with its own words; a grant is none.
    @Test("Each authorization refusal is its own outcome")
    func eachRefusalIsItsOwnOutcome() {
        #expect(MarkLocation.refusal(for: .denied) == .denied)
        #expect(MarkLocation.refusal(for: .denied, servicesEnabled: false) == .servicesOff)
        #expect(MarkLocation.refusal(for: .restricted) == .restricted)
        #expect(MarkLocation.refusal(for: .authorizedWhenInUse) == nil)
        #expect(MarkLocation.refusal(for: .notDetermined) == nil)
        #expect(!MarkLocation.Outcome.restricted.message.contains("not granted"))
        #expect(!MarkLocation.Outcome.servicesOff.message.contains("outdoors"))
        // A network failure is not the sky.
        #expect(!MarkLocation.Outcome.failed.message.contains("outdoors"))
        // The in-progress words are the web's.
        #expect(MarkLocation.acquiringMessage == "Saving a point at your location…")
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

    /// Two taps can overlap for the whole of the first attempt, not merely its
    /// write: with a usable cached fix to hand, `acquireFix` returns before
    /// `isAcquiring` is ever set, so the rail button is never disabled.
    @Test("A tap the reader has replaced does not answer for the one they are waiting on")
    func anOvertakenAttemptDoesNotSpeakForTheNewestOne() {
        let saved = MarkLocation.Outcome.marked(layerName: "Field notes", accuracyM: 5)
        // The finding: an older tap's success standing over a newer tap that
        // saved nothing.
        #expect(
            MapContainerView.markReport(
                attempt: 1, newest: 2, outcome: saved, carried: []
            ) == .silent
        )
        // The newest tap always answers.
        #expect(
            MapContainerView.markReport(
                attempt: 2, newest: 2, outcome: saved, carried: []
            ) == .say(saved)
        )
    }

    /// The mirror of the finding, which a plain newest-wins gate would create:
    /// a mark that was not kept stays unkept whoever tapped next.
    @Test("An overtaken failure is carried, not dropped")
    func anOvertakenFailureIsCarriedToWhoeverAnswersNext() {
        let refused = MarkLocation.Outcome.storageFailed("There was no room to save it.")
        #expect(
            MapContainerView.markReport(
                attempt: 1, newest: 2, outcome: refused, carried: []
            ) == .carry(refused.message)
        )

        let saved = MarkLocation.Outcome.marked(layerName: "Field notes", accuracyM: 5)
        let folded = MapContainerView.markReport(
            attempt: 2, newest: 2, outcome: saved, carried: [refused.message]
        )
        guard case .say(.storageFailed(let message)) = folded else {
            Issue.record("the carried failure was dropped: \(folded)")
            return
        }
        #expect(message.contains("Point saved to Field notes"))
        #expect(message.contains("There was no room to save it."))
    }

    /// A mark that was written to a layer that stayed switched off is a kept
    /// mark. Calling it a storage failure let the app produce the sentence
    /// "An earlier tap was not saved: The mark was saved…" about itself, and
    /// gave a successful newer tap an error buzz.
    @Test("A layer that did not switch on is not a lost mark")
    func aMarkWhoseLayerStayedOffIsStillAMark() {
        let kept = MarkLocation.Outcome.markedLayerNotShown(
            layerName: "Field notes", accuracyM: 5
        )
        #expect(!kept.isFailure)
        #expect(kept.message.contains("Point saved to Field notes"))
        #expect(kept.message.contains("could not be switched on"))
        // It is not carried into a later tap's message, because nothing about
        // it was lost.
        #expect(
            MapContainerView.markReport(
                attempt: 1, newest: 2, outcome: kept, carried: []
            ) == .silent
        )
        // And a genuine storage refusal still is.
        #expect(
            MapContainerView.markReport(
                attempt: 1,
                newest: 2,
                outcome: .storageFailed("There was no room."),
                carried: []
            ) == .carry("There was no room.")
        )
    }

    /// An unsaved mark from a tap that has been overtaken is still an unsaved
    /// mark, and a newer failure does not stand in for an older one — two taps
    /// that both failed are two marks that were not kept.
    @Test("A newer failure does not stand in for an older one")
    func everyOvertakenFailureIsStillSaid() {
        guard case .say(.storageFailed(let message)) = MapContainerView.markReport(
            attempt: 2,
            newest: 2,
            outcome: .storageFailed("The layer was deleted."),
            carried: ["There was no room to save it."]
        ) else {
            Issue.record("the earlier failure was dropped behind a newer one")
            return
        }
        #expect(message.contains("The layer was deleted."))
        #expect(message.contains("There was no room to save it."))

        // Three taps, two of them failed: both are counted and both are said.
        guard case .say(.storageFailed(let both)) = MapContainerView.markReport(
            attempt: 3,
            newest: 3,
            outcome: .marked(layerName: "Field notes", accuracyM: 5),
            carried: ["There was no room.", "The layer was deleted."]
        ) else {
            Issue.record("two carried failures were not both said")
            return
        }
        #expect(both.contains("2 earlier taps were not saved"))
        #expect(both.contains("There was no room."))
        #expect(both.contains("The layer was deleted."))
    }
}
