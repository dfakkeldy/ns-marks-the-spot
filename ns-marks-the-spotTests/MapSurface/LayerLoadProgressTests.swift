import Foundation
import Testing
@testable import ns_marks_the_spot

struct LayerLoadProgressTests {
    @Test func aLayerNobodyHasAskedAboutIsIdle() {
        let progress = LayerLoadProgressBox()

        #expect(progress.phase(for: "crown-lands") == .idle)
    }

    @Test func aRequestInFlightIsLoading() {
        let progress = LayerLoadProgressBox()

        progress.began("crown-lands")

        #expect(progress.phase(for: "crown-lands") == .loading)
    }

    @Test func aLayerStaysLoadingUntilTheLastRequestSettles() {
        // MapKit asks for every tile in view at once, so a layer is loading
        // until all of them are back — not until the first one is.
        let progress = LayerLoadProgressBox()

        let first = progress.began("crown-lands")
        let second = progress.began("crown-lands")
        progress.finished(first, .served)

        #expect(progress.phase(for: "crown-lands") == .loading)

        progress.finished(second, .served)

        #expect(progress.phase(for: "crown-lands") == .ready)
    }

    @Test func aFailedRequestLeavesTheLayerFailing() {
        let progress = LayerLoadProgressBox()

        progress.finished(progress.began("crown-lands"), .failed)

        #expect(progress.phase(for: "crown-lands") == .failing)
    }

    @Test func oneFailureAmongManyIsStillAFailure() {
        // A viewport with one square missing is a viewport the user cannot
        // trust; reporting "Ready" because most of it arrived would be the map
        // claiming completeness it does not have.
        let progress = LayerLoadProgressBox()

        let first = progress.began("crown-lands")
        let second = progress.began("crown-lands")
        progress.finished(first, .served)
        progress.finished(second, .failed)

        #expect(progress.phase(for: "crown-lands") == .failing)
    }

    @Test func aCancelledRequestCountsForNeitherSide() {
        // Panning away mid-load cancels the tiles for the viewport being left.
        // Counting that as a failure would put "Source temporarily unavailable"
        // under a source that answered every request it was allowed to finish.
        let progress = LayerLoadProgressBox()

        let served = progress.began("crown-lands")
        let abandoned = progress.began("crown-lands")
        progress.finished(served, .served)
        progress.finished(abandoned, .cancelled)

        #expect(progress.phase(for: "crown-lands") == .ready)
    }

    @Test func aCycleOfNothingButCancellationsIsBackWhereItStarted() {
        // Nothing arrived and nothing failed, so the honest report is the one
        // for a layer that has not been asked yet — not a claim either way.
        let progress = LayerLoadProgressBox()

        progress.finished(progress.began("crown-lands"), .cancelled)

        #expect(progress.phase(for: "crown-lands") == .idle)
    }

    @Test func theNextCycleClearsTheLastCyclesFailure() {
        // What makes a transient outage transient: the pan that recovers starts
        // a new run of requests, and nothing has to remember to clear the old
        // one.
        let progress = LayerLoadProgressBox()

        progress.finished(progress.began("crown-lands"), .failed)
        #expect(progress.phase(for: "crown-lands") == .failing)

        let retry = progress.began("crown-lands")
        #expect(progress.phase(for: "crown-lands") == .loading)

        progress.finished(retry, .served)
        #expect(progress.phase(for: "crown-lands") == .ready)
    }

    @Test func resetReturnsTheLayerToIdle() {
        let progress = LayerLoadProgressBox()

        progress.finished(progress.began("crown-lands"), .served)
        progress.reset("crown-lands")

        #expect(progress.phase(for: "crown-lands") == .idle)
    }

    @Test func aRequestFromBeforeAResetCannotSettleTheCycleAfterIt() {
        // The scenario is switching a layer off with tiles still in the air and
        // switching it straight back on. Without the generation on the token,
        // the abandoned request comes back and decrements the *new* cycle's
        // count to zero, reporting the layer finished — with the old request's
        // outcome — while its real tiles are still being fetched.
        let progress = LayerLoadProgressBox()

        let abandoned = progress.began("crown-lands")
        progress.reset("crown-lands")

        let current = progress.began("crown-lands")
        progress.finished(abandoned, .failed)

        #expect(progress.phase(for: "crown-lands") == .loading)

        progress.finished(current, .served)

        #expect(progress.phase(for: "crown-lands") == .ready)
    }

    @Test func settlingTheSameRequestTwiceDoesNotStrandTheLayerOnLoading() {
        // `loadTile` settles each token exactly once, so this is a guard rather
        // than a case that happens today. It is here because the cost of the
        // guard being absent is a count wrapped below zero, and a layer that
        // says "Loading visible area…" for the rest of the session.
        let progress = LayerLoadProgressBox()

        let token = progress.began("crown-lands")
        progress.finished(token, .served)
        progress.finished(token, .served)

        #expect(progress.phase(for: "crown-lands") == .ready)
    }

    @Test func layersAreCountedSeparately() {
        let progress = LayerLoadProgressBox()

        progress.began("crown-lands")
        progress.finished(progress.began("roads"), .failed)

        #expect(progress.phase(for: "crown-lands") == .loading)
        #expect(progress.phase(for: "roads") == .failing)
    }

    @Test func cancellationIsToldApartFromAnOutage() {
        // MapKit's cancellation reaches the overlay as an error like any other,
        // and both shapes it can take have to be recognised: a task cancelled
        // before its fetch starts throws `CancellationError`, and one already
        // in flight comes back as `URLError.cancelled`.
        #expect(TileLoadOutcome(classifying: CancellationError()) == .cancelled)
        #expect(TileLoadOutcome(classifying: URLError(.cancelled)) == .cancelled)
        #expect(TileLoadOutcome(classifying: URLError(.timedOut)) == .failed)
        #expect(TileLoadOutcome(classifying: TileFetcherError.invalidHTTPStatus(503)) == .failed)
    }

    @Test func onlyTransitionsAreReported() {
        // The panel is invalidated once per report. A pan across Cape Breton is
        // hundreds of tiles and should be two: loading, then ready.
        let recorder = PhaseRecorder()
        let progress = LayerLoadProgressBox()
        progress.observe { layerID in
            recorder.record(layerID, progress.phase(for: layerID))
        }

        let tokens = (0..<50).map { _ in progress.began("crown-lands") }
        for token in tokens {
            progress.finished(token, .served)
        }

        #expect(recorder.phases == [.loading, .ready])
        #expect(recorder.layerIDs == ["crown-lands", "crown-lands"])
    }

    @Test func theObserverIsToldWhichLayerAndNothingElse() {
        // Deliberately no phase in the notification: it would be a value from
        // one moment delivered at another, and the panel would publish whichever
        // hop happened to land last rather than what is true now.
        let recorder = PhaseRecorder()
        let progress = LayerLoadProgressBox()
        progress.observe { layerID in
            recorder.record(layerID, progress.phase(for: layerID))
        }

        progress.finished(progress.began("roads"), .served)

        #expect(recorder.phases.last == progress.phase(for: "roads"))
    }

    /// Time-limited because the failure mode is a deadlock rather than a wrong
    /// answer: `NSLock` is not recursive, so reporting while holding it hangs
    /// the tile queue instead of returning something this could assert on.
    @Test(.timeLimit(.minutes(1)))
    func theObserverIsNotCalledWhileTheLockIsHeld() {
        // An observer that reaches back into the box would deadlock if the
        // report were made while the lock was held. It hops to the main actor
        // in the app, which is worse than re-entrant — it is a tile queue
        // waiting on whatever the main actor is doing.
        let progress = LayerLoadProgressBox()
        let recorder = PhaseRecorder()
        progress.observe { layerID in
            recorder.record(layerID, progress.phase(for: layerID))
        }

        progress.began("crown-lands")

        #expect(recorder.phases == [.loading])
    }

    @Test func concurrentRequestsSettleOnTheRealPhase() async {
        // Tiles are requested from several queues at once, so the counters are
        // incremented and decremented concurrently. A lost update here leaves
        // `inFlight` above zero forever and the panel stuck on "Loading visible
        // area…" over a layer that finished.
        //
        // The recorder's *order* is deliberately not asserted: an observer can
        // read the phase and be preempted before it records, so its sequence is
        // not a fact about the box. That is exactly why the app re-reads rather
        // than publishing whatever a notification carried.
        let progress = LayerLoadProgressBox()
        let recorder = PhaseRecorder()
        progress.observe { layerID in
            recorder.record(layerID, progress.phase(for: layerID))
        }

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<32 {
                group.addTask {
                    progress.finished(progress.began("crown-lands"), .served)
                }
            }
        }

        #expect(progress.phase(for: "crown-lands") == .ready)
        #expect(recorder.phases.isEmpty == false)
    }

    /// Collects reported phases from whichever queue reports them.
    ///
    /// `nonisolated` because the box reports from MapKit's queues, which is the
    /// whole point of it being lock-guarded; a main-actor recorder could only be
    /// written from the one place that does not need testing.
    private nonisolated final class PhaseRecorder: @unchecked Sendable {
        private let lock = NSLock()
        private var recorded: [(String, TileLoadPhase)] = []

        func record(_ layerID: String, _ phase: TileLoadPhase) {
            lock.withLock { recorded.append((layerID, phase)) }
        }

        var phases: [TileLoadPhase] {
            lock.withLock { recorded.map(\.1) }
        }

        var layerIDs: [String] {
            lock.withLock { recorded.map(\.0) }
        }
    }
}
