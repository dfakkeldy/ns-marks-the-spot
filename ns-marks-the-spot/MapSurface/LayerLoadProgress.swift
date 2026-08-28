import Foundation

/// Where a layer's tiles are in their current load cycle.
///
/// This is only about fetching. Whether the layer is switched on, whether the
/// licence has been answered, and whether the map is zoomed far enough in are
/// all knowable without asking the network, and the panel decides those before
/// it ever looks at this.
nonisolated enum TileLoadPhase: Equatable, Sendable {
    /// Installed, with nothing requested since the last cycle finished.
    case idle
    case loading
    case ready
    /// At least one tile in this cycle failed for a reason other than "there is
    /// no tile here" — a 404 from a Fletcher sheet with no ink in that square
    /// is a complete answer, not an outage.
    case failing
}

/// What became of one tile request.
nonisolated enum TileLoadOutcome: Equatable, Sendable {
    /// Answered, whether from the network, the cache, or as a legitimate blank.
    case served
    /// The source could not be reached, or answered with something that was not
    /// a tile.
    case failed
    /// Abandoned before it could be either. MapKit cancels the tiles for a
    /// viewport the user has panned away from, which is the map working, so a
    /// cancellation counts for neither side — it only settles the request it
    /// belongs to.
    case cancelled

    /// Whether a thrown error means the request was abandoned or that the
    /// source failed.
    ///
    /// Both shapes have to be checked. Structured cancellation surfaces as
    /// `CancellationError`, but a `URLSession` task already in flight when its
    /// task is cancelled reports `URLError.cancelled` instead, and that is the
    /// common case here: MapKit cancels tiles mid-fetch on every fast pan.
    /// Reading either as an outage would put "Source temporarily unavailable"
    /// under a source that was never asked to finish.
    init(classifying error: any Error) {
        if error is CancellationError {
            self = .cancelled
        } else if let error = error as? URLError, error.code == .cancelled {
            self = .cancelled
        } else {
            self = .failed
        }
    }
}

/// What is actually in a square, which is a different question from whether
/// producing it went wrong.
///
/// The screen does not need this: every one of these draws as a transparent
/// square and looks the same. A printed page does, because it makes claims in
/// words. A layer whose every square came back `outsideCoverage` put no ink on
/// the page, so crediting its licence would be a claim that it did, and a
/// legend naming it would tell the reader the ground was surveyed and found
/// empty. "The survey does not reach here" and "the survey found nothing here"
/// are different statements about the same blank paper.
nonisolated enum TileSubstance: Equatable, Sendable {
    /// Bytes a source produced, from the network or the cache. Blank ink is
    /// included on purpose: a source that answers with an empty square has
    /// answered, and the page may say so.
    case source
    /// No sheet or service covers this square, so nobody was asked. Known
    /// locally, before any request.
    case outsideCoverage
    /// The licence for this layer has not been accepted, so it was not fetched.
    case licenceRefused
    /// A stand-in for an answer that did not arrive. Pairs with a `.failed` or
    /// `.cancelled` outcome; MapKit treats a thrown error as a tile to retry,
    /// so a failure has to come back as bytes.
    case placeholder
}

/// A request the box has been told about, returned by `began` and handed back
/// to `finished`.
///
/// Carries the layer's generation so a request that was in flight when the
/// layer was switched off cannot settle the cycle that started when it was
/// switched back on.
nonisolated struct TileRequestToken: Sendable {
    let layerID: String
    fileprivate let generation: Int
}

/// Counts tile requests per layer and reports the phase changes.
///
/// Lives on the same side of the isolation boundary as `LicenceClearanceBox`
/// and for the same reason: MapKit calls `loadTile` on its own queues, so the
/// counting has to happen where it can be counted, and only the resulting phase
/// transitions cross to the main actor. A layer being panned across Cape Breton
/// produces hundreds of tile requests and a handful of transitions, so
/// reporting transitions rather than requests is what keeps the panel from
/// being invalidated once per tile.
///
/// A cycle is a run of requests with no gap: the counters reset when a request
/// arrives for a layer that had none outstanding. That is what makes a failure
/// clear itself — the pan that recovers starts a new cycle, and the layer
/// reports `ready` again without anything having to remember to reset it.
nonisolated final class LayerLoadProgressBox: Sendable {
    private struct Counters {
        /// Bumped by `reset`. Requests carry the generation they began in, and
        /// a request from an older one no longer counts for anything.
        var generation = 0
        var inFlight = 0
        var succeeded = 0
        var failed = 0

        var phase: TileLoadPhase {
            if inFlight > 0 { return .loading }
            if failed > 0 { return .failing }
            if succeeded > 0 { return .ready }
            return .idle
        }
    }

    private let lock = NSLock()
    private nonisolated(unsafe) var counters: [String: Counters] = [:]
    private nonisolated(unsafe) var published: [String: TileLoadPhase] = [:]
    private nonisolated(unsafe) var observer: (@Sendable (String) -> Void)?

    init() {}

    /// Who to tell when a layer's phase changes. Replacing an existing observer
    /// is deliberate: there is one panel.
    ///
    /// The observer is handed the layer id and nothing else, on purpose. It has
    /// to read the phase back through `phase(for:)` rather than be given one,
    /// because two tile queues can transition the same layer moments apart and
    /// their notifications are delivered outside the lock and then hopped to
    /// the main actor — neither step preserves order. A notification carrying
    /// `loading` could therefore arrive after one carrying `ready` and leave
    /// the panel saying "Loading visible area…" over a finished layer. A
    /// re-read cannot: every late notification converges on the same current
    /// answer.
    func observe(_ observer: @escaping @Sendable (String) -> Void) {
        lock.withLock { self.observer = observer }
    }

    func phase(for layerID: String) -> TileLoadPhase {
        lock.withLock { counters[layerID]?.phase ?? .idle }
    }

    /// Records a request starting, and returns the token that settles it.
    @discardableResult
    func began(_ layerID: String) -> TileRequestToken {
        var generation = 0
        report(layerID) { counters in
            if counters.inFlight == 0 {
                counters.succeeded = 0
                counters.failed = 0
            }
            counters.inFlight += 1
            generation = counters.generation
        }
        return TileRequestToken(layerID: layerID, generation: generation)
    }

    func finished(_ token: TileRequestToken, _ outcome: TileLoadOutcome) {
        report(token.layerID) { counters in
            // A request that began before the layer was reset settles nothing.
            // Without this, a fetch still running when the user switched a layer
            // off would come back and decrement the count belonging to the
            // *next* time they switched it on — reporting that cycle finished,
            // with that request's outcome, while its own tiles were still in
            // the air.
            guard counters.generation == token.generation else { return }

            // Guarded rather than trusted: `loadTile` pairs its calls, but a
            // count that wrapped below zero would leave the layer saying
            // "Loading visible area…" for the rest of the session, and that is
            // too cheap to prevent to leave to a caller's discipline.
            if counters.inFlight > 0 {
                counters.inFlight -= 1
            }
            switch outcome {
            case .served: counters.succeeded += 1
            case .failed: counters.failed += 1
            case .cancelled: break
            }
        }
    }

    /// Forgets a layer's cycle, so a layer switched off and on again does not
    /// re-open on the phase it was left in — and so the requests still in the
    /// air from before cannot report into what happens after.
    func reset(_ layerID: String) {
        report(layerID) { $0 = Counters(generation: $0.generation + 1) }
    }

    private func report(_ layerID: String, _ mutate: (inout Counters) -> Void) {
        // The observer is called outside the lock. It hops to the main actor,
        // and holding a lock across a hop invites the tile queues to wait on
        // whatever the main actor is doing.
        let send: (@Sendable (String) -> Void)? = lock.withLock {
            var current = counters[layerID] ?? Counters()
            mutate(&current)
            counters[layerID] = current

            let phase = current.phase
            guard published[layerID] != phase, let observer else { return nil }
            published[layerID] = phase
            return observer
        }
        send?(layerID)
    }
}
