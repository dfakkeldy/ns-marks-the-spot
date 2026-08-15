import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// The compositor is where the printed page stops being a live map and becomes
/// a fixed claim about what was there. These cover the part of that which can
/// go wrong quietly: a layer that did not draw.
struct PrintMapCompositorTests {
    private static let bounds = GeoBoundingBox(
        south: 46.10, west: -61.30, north: 46.14, east: -61.24
    )

    private static func layer(_ id: String, alpha: CGFloat = 1) -> MapLayerState {
        MapLayerState(
            configuration: TileLayerConfiguration(
                id: id,
                name: id.capitalized,
                source: .tile(URL(string: "https://example.invalid/{z}/{x}/{y}")!),
                minZoom: 0,
                maxZoom: 14,
                cacheIdentifier: id
            ),
            opacity: alpha,
            isVisible: alpha > 0
        )
    }

    /// A one-pixel tile, so the drawing path runs without a network.
    private static let pixel: Data = {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256))
        return renderer.image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
        }.pngData()!
    }()

    private static func blankBaseMap(
        _ bounds: GeoBoundingBox, _ widthPx: Int, _ heightPx: Int, _ base: MapBaseType
    ) async throws -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: widthPx, height: heightPx))
        return renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: widthPx, height: heightPx))
        }
    }

    private static func compose(
        layers: [MapLayerState],
        parcels: [ParcelShape] = [],
        tileProvider: @escaping PrintMapCompositor.TileProvider
    ) async throws -> PrintMapCompositor.Output {
        try await PrintMapCompositor.compose(
            bounds: bounds,
            widthPx: 600,
            heightPx: 400,
            baseMap: .standard,
            layers: layers,
            parcels: parcels,
            lineScale: 2,
            tileProvider: tileProvider,
            baseMapProvider: blankBaseMap
        )
    }

    /// A source that could not be reached must not be reported as drawn. Both
    /// produce the same blank pixels, and only one of them means the source had
    /// nothing to say here.
    @Test func aLayerThatFetchedNothingIsReportedAsFailedRatherThanDrawn() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            throw URLError(.notConnectedToInternet)
        }

        let outcome = try #require(output.outcomes.first)
        #expect(outcome.id == "parcels")
        guard case .failed = outcome.state else {
            Issue.record("Expected a failed layer, got \(outcome.state)")
            return
        }
    }

    /// Part of a layer is worse than none of it: the page looks complete, and
    /// the hole is where the reader would have looked. The count travels so the
    /// page can say how much is missing.
    @Test func aPartlyFetchedLayerCarriesTheCountItIsMissing() async throws {
        // Fails exactly one square, wherever the plan puts it.
        let failing = Mutex(1)
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            if failing.take() { throw URLError(.timedOut) }
            return Self.pixel
        }

        let outcome = try #require(output.outcomes.first)
        guard case .partial(let missing, let total) = outcome.state else {
            Issue.record("Expected a partial layer, got \(outcome.state)")
            return
        }
        #expect(missing == 1)
        #expect(total > 1)
    }

    /// A layer switched off is not fetched, and does not appear in the outcomes
    /// — so nothing downstream can put it in the legend of a page it is not on.
    @Test func aHiddenLayerIsNeitherFetchedNorReported() async throws {
        let asked = Mutex(0)
        let output = try await Self.compose(
            layers: [Self.layer("visible"), Self.layer("hidden", alpha: 0)]
        ) { configuration, _ in
            if configuration.id == "hidden" { _ = asked.take() }
            return Self.pixel
        }

        #expect(output.outcomes.map(\.id) == ["visible"])
        #expect(asked.value == 0)
    }

    /// Every layer that drew is accounted for, and the raster is the size that
    /// was asked for — the registration written into the PDF assumes exactly
    /// these pixels cover exactly these bounds.
    @Test func theRasterIsTheSizeTheRegistrationAssumes() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            Self.pixel
        }

        #expect(output.widthPx == 600)
        #expect(output.heightPx == 400)
        #expect(!output.jpeg.isEmpty)
        #expect(output.outcomes.map(\.state) == [.drawn])

        let image = try #require(UIImage(data: output.jpeg))
        #expect(Int(image.size.width) == 600)
        #expect(Int(image.size.height) == 400)
    }

    /// Exporting must not become a second, ungated route to a source. A layer
    /// the map is not holding an overlay for fails rather than being fetched
    /// around the clearance the screen is honouring.
    @Test func aLayerWithNoOverlayIsRefusedRatherThanRefetched() async throws {
        let provider = PrintMapCompositor.provider(overlays: [:])

        await #expect(throws: PrintMapCompositor.TileProviderFailure.noOverlayForLayer("parcels")) {
            _ = try await provider(
                Self.layer("parcels").configuration,
                MKTileOverlayPath(x: 0, y: 0, z: 0, contentScaleFactor: 1)
            )
        }
    }
}

/// A counter the concurrent tile fetches can share.
private final class Mutex: @unchecked Sendable {
    private let lock = NSLock()
    private var count: Int
    private let limit: Int

    init(_ limit: Int) {
        self.limit = limit
        count = 0
    }

    var value: Int {
        lock.withLock { count }
    }

    /// True for the first `limit` callers, false after.
    func take() -> Bool {
        lock.withLock {
            count += 1
            return count <= limit
        }
    }
}
