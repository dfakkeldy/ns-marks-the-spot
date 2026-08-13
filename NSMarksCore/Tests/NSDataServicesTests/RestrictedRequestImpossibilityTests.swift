import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

/// The gate's whole claim, stated as tests: without an accepted Province
/// licence, no request to a Province service can be constructed — not refused
/// late, not constructed and dropped, but never brought into existence.
@Suite("Restricted requests are impossible without clearance")
struct RestrictedRequestImpossibilityTests {
    /// Tile coordinates over Inverness County at z13, inside every catalogued
    /// layer's zoom range that matters here.
    static let x = 2544
    static let y = 3005
    static let z = 13

    // MARK: - The refusal

    @Test("No restricted layer yields a request without clearance")
    func noRestrictedLayerYieldsARequestWithoutClearance() {
        for id in LayerCatalog.restrictedLayerIDs {
            #expect(
                throws: TileRequestFactory.Refusal.licenceNotAccepted(id),
                "\(id.rawValue) produced a request with no licence accepted"
            ) {
                try TileRequestFactory.tileRequest(
                    for: id, x: Self.x, y: Self.y, z: Self.z, clearance: .none
                )
            }
            #expect(throws: TileRequestFactory.Refusal.licenceNotAccepted(id)) {
                try TileRequestFactory.overlayTileRequest(
                    for: id, x: Self.x, y: Self.y, z: Self.z, clearance: .none
                )
            }
        }
    }

    /// The catch-all: sweep every layer at every zoom and confirm that no URL
    /// which comes back addresses a restricted layer's service.
    ///
    /// Deliberately not written against hosts. `nsgiwa` and `dawson` each serve
    /// restricted layers *and* Open-Government-Licence layers the web requests
    /// freely, so "no request reaches a Province host" is a stronger claim than
    /// the licence makes, and asserting it would mean gating open data. Service
    /// URLs are the right granularity: no service in the catalog is shared
    /// between a restricted layer and an open one.
    ///
    /// The value over the previous test is that this one starts from the URLs
    /// actually produced rather than from the restricted set, so a layer
    /// mislabelled as open still fails here.
    @Test("No restricted service is addressed by any request built without clearance")
    func noRestrictedServiceIsAddressedWithoutClearance() {
        let restrictedServices = Set(
            LayerCatalog.all
                .filter(\.requiresProvinceClearance)
                .compactMap(\.serviceURL)
                .map(\.absoluteString)
        )
        #expect(!restrictedServices.isEmpty, "the catalog lists no restricted services")

        for id in LayerID.allCases {
            for zoom in 0...23 {
                guard let url = try? TileRequestFactory.tileRequest(
                    for: id, x: Self.x, y: Self.y, z: zoom, clearance: .none
                ).url else { continue }
                let addressed = restrictedServices.first { url.absoluteString.hasPrefix($0) }
                #expect(
                    addressed == nil,
                    "\(id.rawValue) addressed \(addressed ?? "") at z\(zoom) with no licence"
                )
            }
        }
    }

    @Test("Restricted and open layers never share a service URL")
    func restrictedServicesAreNotSharedWithOpenLayers() {
        // The test above is only exact while this holds. If a future layer
        // shared a service with a restricted one, a service-prefix check would
        // start refusing open data — better to fail here and rethink than to
        // silently over-gate.
        var owner: [String: Bool] = [:]
        for layer in LayerCatalog.all {
            guard let service = layer.serviceURL?.absoluteString else { continue }
            if let existing = owner[service] {
                #expect(
                    existing == layer.requiresProvinceClearance,
                    "\(service) is shared by layers on both sides of the gate"
                )
            }
            owner[service] = layer.requiresProvinceClearance
        }
    }

    @Test("Clearance opens exactly the restricted rasters and nothing more")
    func clearanceOpensTheRestrictedRasters() {
        let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)
        for id in LayerCatalog.restrictedLayerIDs {
            guard let layer = LayerCatalog.descriptor(for: id), layer.isRaster else {
                // The derived parcel layer is restricted but draws no tiles.
                #expect(throws: TileRequestFactory.Refusal.notARasterLayer(id)) {
                    try TileRequestFactory.tileRequest(
                        for: id, x: Self.x, y: Self.y, z: Self.z, clearance: cleared
                    )
                }
                continue
            }
            let zoom = max(layer.minZoom, min(Self.z, layer.maxZoom))
            let request = try? TileRequestFactory.tileRequest(
                for: id, x: Self.x, y: Self.y, z: zoom, clearance: cleared
            )
            #expect(request != nil, "\(id.rawValue) still refused after acceptance")
            #expect(request?.layer == id)
        }
    }

    @Test("The licence is checked before the zoom, so a refusal cannot leak a URL")
    func licenceIsCheckedFirst() {
        // NSPRD starts at z15; asking at z2 is out of range *and* unlicensed.
        // If the range check ran first the caller would learn "wrong zoom",
        // which reads as "try a different zoom" rather than "accept the
        // licence" — and, worse, means ordering is not load-bearing.
        #expect(throws: TileRequestFactory.Refusal.licenceNotAccepted(.nsprd)) {
            try TileRequestFactory.tileRequest(
                for: .nsprd, x: 1, y: 1, z: 2, clearance: .none
            )
        }
    }

    // MARK: - Where clearance comes from

    @Test("A fresh install has no clearance")
    @MainActor
    func aFreshInstallHasNoClearance() {
        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage())
        #expect(store.state == .unknown)
        #expect(store.clearance == .none)
        #expect(store.needsDecision)
    }

    @Test("Declining is never persisted")
    @MainActor
    func decliningIsNeverPersisted() {
        let storage = InMemoryProvinceLicenceStorage()
        let store = ProvinceLicenceStore(storage: storage)
        store.decline()
        #expect(store.state == .declined)
        #expect(store.clearance == .none)
        // Nothing was written, so the next launch is a fresh install rather
        // than a permanent no.
        #expect(storage.loadState() == .unknown)
        #expect(ProvinceLicenceStore(storage: storage).state == .unknown)
    }

    @Test("Acceptance survives relaunch")
    @MainActor
    func acceptanceSurvivesRelaunch() {
        let storage = InMemoryProvinceLicenceStorage()
        let first = ProvinceLicenceStore(storage: storage)
        first.accept()
        #expect(storage.loadState() == .accepted)

        let relaunched = ProvinceLicenceStore(storage: storage)
        #expect(relaunched.state == .accepted)
        #expect(relaunched.clearance.allowsRestrictedLayers)
        #expect(!relaunched.needsDecision)
    }

    @Test("Revoking clearance stops future requests")
    @MainActor
    func revokingClearanceStopsFutureRequests() throws {
        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage())
        store.accept()
        let allowed = try TileRequestFactory.tileRequest(
            for: .nsprd, x: Self.x, y: Self.y, z: 15, clearance: store.clearance
        )
        #expect(allowed.url.host() == "nsgiwa2.novascotia.ca")

        store.revoke()
        #expect(store.state == .unknown)
        #expect(throws: TileRequestFactory.Refusal.licenceNotAccepted(.nsprd)) {
            try TileRequestFactory.tileRequest(
                for: .nsprd, x: Self.x, y: Self.y, z: 15, clearance: store.clearance
            )
        }
    }

    @Test("Only the accepted string in storage counts as acceptance")
    func storageReadsOnlyTheExactAcceptedValue() {
        let suiteName = "province-licence-storage-test"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            Issue.record("could not open a scratch UserDefaults suite")
            return
        }
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let storage = UserDefaultsProvinceLicenceStorage(defaults: defaults)
        let key = UserDefaultsProvinceLicenceStorage.storageKey

        for impostor in ["Accepted", "true", "yes", "declined", "", "accepted "] {
            defaults.set(impostor, forKey: key)
            #expect(storage.loadState() == .unknown, "\"\(impostor)\" read as acceptance")
        }
        defaults.set(true, forKey: key)
        #expect(storage.loadState() == .unknown, "a boolean read as acceptance")

        storage.save(.accepted)
        #expect(defaults.string(forKey: key) == "accepted")
        #expect(storage.loadState() == .accepted)

        storage.save(.declined)
        #expect(defaults.object(forKey: key) == nil, "declining wrote a value")
    }

    // MARK: - The type lock

    /// `URLSession` appears in exactly one source file in the package.
    ///
    /// The `TileRequest` lock only works if `URLSessionTileFetcher` is the only
    /// way out to the network. A second call site elsewhere in the package —
    /// added innocently, taking a plain `URL` — would leave the lock guarding a
    /// door with a hole beside it, and no other test would notice.
    @Test("URLSession is confined to the tile fetcher")
    func urlSessionIsConfinedToTheFetcher() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // NSDataServicesTests
            .deletingLastPathComponent()  // Tests
            .deletingLastPathComponent()  // NSMarksCore
            .appending(path: "Sources")

        let enumerator = FileManager.default.enumerator(
            at: sources, includingPropertiesForKeys: nil
        )
        let files = try #require(enumerator, "package sources are not readable")

        var offenders: [String] = []
        for case let url as URL in files where url.pathExtension == "swift" {
            guard let text = try? String(contentsOf: url, encoding: .utf8),
                  text.contains("URLSession")
            else { continue }
            if url.lastPathComponent != "TileRequest.swift" {
                offenders.append(url.lastPathComponent)
            }
        }
        #expect(
            offenders.isEmpty,
            "URLSession escaped TileRequest.swift into: \(offenders.sorted())"
        )
    }
}
