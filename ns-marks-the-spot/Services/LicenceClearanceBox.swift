import Foundation
import NSDataServices

/// Carries the current Province clearance to the tile-loading queues.
///
/// `ProvinceLicenceStore` is `@MainActor`, deliberately: the licence sheet and
/// every layer toggle read it during view updates. MapKit asks for tiles on its
/// own background queues and will not wait for the main actor, so the tile path
/// needs a value it can read where it is.
///
/// A box rather than a copy handed to each overlay at install time, because the
/// store documents the difference: the clearance is "derived on every read
/// rather than cached, so revoking takes effect at the next tile rather than at
/// the next relaunch". An overlay holding a snapshot from launch would keep
/// fetching a restricted layer for the rest of the session after the user
/// revoked — and, more immediately, would still be refusing every tile of a
/// layer the user accepted a moment ago, since every overlay is installed
/// before the sheet has been answered.
///
/// It cannot manufacture permission: `ProvinceLicenceClearance` has no public
/// initialiser, so the only values that ever reach `update` are ones the store
/// produced from an actual acceptance. The starting value is `.none`.
nonisolated final class LicenceClearanceBox: Sendable {
    private let lock = NSLock()
    private nonisolated(unsafe) var stored: ProvinceLicenceClearance = .none

    init(_ initial: ProvinceLicenceClearance = .none) {
        stored = initial
    }

    var clearance: ProvinceLicenceClearance {
        lock.withLock { stored }
    }

    func update(_ clearance: ProvinceLicenceClearance) {
        lock.withLock { stored = clearance }
    }
}
