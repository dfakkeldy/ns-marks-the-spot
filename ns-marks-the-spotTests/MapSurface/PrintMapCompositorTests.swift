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
///
/// `nonisolated` because the app target runs with `-default-isolation=MainActor`
/// and every helper here is called from the `@Sendable` provider closures the
/// compositor invokes off the main actor.
nonisolated struct PrintMapCompositorTests {
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

    /// A flat 256px square, so the drawing path runs without a network.
    private static func tile(_ colour: UIColor) -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256))
        return renderer.image { context in
            colour.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
        }.pngData()!
    }

    private static let pixel: Data = tile(.red)

    private static func blankBaseMap(
        _ bounds: GeoBoundingBox, _ widthPx: Int, _ heightPx: Int, _ base: MapBaseType
    ) async throws -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: widthPx, height: heightPx))
        return renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: widthPx, height: heightPx))
        }
    }

    /// What one pixel of the finished raster actually is.
    ///
    /// Dimensions and outcomes can all be right while nothing was drawn, so the
    /// tests that care about placement, order and opacity read the pixels back.
    private static func colour(
        _ point: CGPoint, in data: Data
    ) -> (red: Double, green: Double, blue: Double)? {
        guard let image = UIImage(data: data)?.cgImage else { return nil }
        var sample = [UInt8](repeating: 0, count: 4)
        let context = sample.withUnsafeMutableBytes { buffer in
            CGContext(
                data: buffer.baseAddress,
                width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        }
        guard let context else { return nil }
        // A `CGContext` counts up from the bottom and the sample point counts
        // down from the top, so the image is shifted until the wanted pixel is
        // the only one inside the one-pixel context.
        context.translateBy(x: -point.x, y: point.y - CGFloat(image.height) + 1)
        context.draw(
            image,
            in: CGRect(x: 0, y: 0, width: image.width, height: image.height)
        )
        return (
            Double(sample[0]) / 255, Double(sample[1]) / 255, Double(sample[2]) / 255
        )
    }

    private static func isNear(
        _ sample: (red: Double, green: Double, blue: Double)?,
        _ expected: (red: Double, green: Double, blue: Double),
        tolerance: Double = 0.12
    ) -> Bool {
        guard let sample else { return false }
        return abs(sample.red - expected.red) < tolerance
            && abs(sample.green - expected.green) < tolerance
            && abs(sample.blue - expected.blue) < tolerance
    }

    private static func compose(
        layers: [MapLayerState],
        parcels: [ParcelShape] = [],
        renderProvider: @escaping PrintMapCompositor.RenderProvider = { _, _, _, _ in
            throw URLError(.unsupportedURL)
        },
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
            renderProvider: renderProvider,
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

    /// The map's tile path never throws — MapKit retries anything that does, so
    /// a source it could not reach comes back as a transparent square instead.
    /// If the compositor took those bytes at face value the page would carry a
    /// legend saying a source was consulted that was never reached, which is
    /// exactly the reading the whole evidence contract exists to prevent.
    @Test func tilesThatCameBackAsPlaceholdersDoNotCountAsDrawn() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            // Bytes and a failure, the way the overlay answers.
            (Self.tile(.clear), .failed)
        }

        let outcome = try #require(output.outcomes.first)
        guard case .failed = outcome.state else {
            Issue.record("Expected a failed layer, got \(outcome.state)")
            return
        }
    }

    /// A square the source answered for is drawn even when it is blank. Blank
    /// is a real answer — outside the Fletcher sheets, or a layer with nothing
    /// here — and demoting it would be the mirror of the error above.
    @Test func aBlankSquareTheSourceAnsweredForStillCounts() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            (Self.tile(.clear), .served)
        }

        #expect(output.outcomes.map(\.state) == [.drawn])
    }

    /// Part of a layer is worse than none of it: the page looks complete, and
    /// the hole is where the reader would have looked. The count travels so the
    /// page can say how much is missing.
    @Test func aPartlyFetchedLayerCarriesTheCountItIsMissing() async throws {
        // Fails exactly one square, wherever the plan puts it.
        let failing = Mutex(1)
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            if failing.take() { throw URLError(.timedOut) }
            return (Self.pixel, .served)
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
            return (Self.pixel, .served)
        }

        #expect(output.outcomes.map(\.id) == ["visible"])
        #expect(asked.value == 0)
    }

    /// Every layer that drew is accounted for, and the raster is the size that
    /// was asked for — the registration written into the PDF assumes exactly
    /// these pixels cover exactly these bounds.
    @Test func theRasterIsTheSizeTheRegistrationAssumes() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            (Self.pixel, .served)
        }

        #expect(output.widthPx == 600)
        #expect(output.heightPx == 400)
        #expect(!output.jpeg.isEmpty)
        #expect(output.outcomes.map(\.state) == [.drawn])

        let image = try #require(UIImage(data: output.jpeg))
        #expect(Int(image.size.width) == 600)
        #expect(Int(image.size.height) == 400)
    }

    /// The tiles reach the paper. Everything else here can pass with a page
    /// that is nothing but base map.
    @Test func theTilesAreActuallyDrawnOntoTheRaster() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            (Self.tile(.red), .served)
        }

        #expect(Self.isNear(Self.colour(CGPoint(x: 300, y: 200), in: output.jpeg), (1, 0, 0)))
        #expect(Self.isNear(Self.colour(CGPoint(x: 40, y: 40), in: output.jpeg), (1, 0, 0)))
    }

    /// Opacity is the user's answer to "how much of what is underneath do I
    /// still need to see", and a page that ignored it would hide the very
    /// thing they set it to keep.
    @Test func layerOpacityIsCarriedOntoThePage() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels", alpha: 0.5)]) { _, _ in
            (Self.tile(.red), .served)
        }

        // Half of red over the white base map, not red and not white.
        #expect(Self.isNear(Self.colour(CGPoint(x: 300, y: 200), in: output.jpeg), (1, 0.5, 0.5)))
    }

    /// The layer the user sees on top prints on top. The compositor takes the
    /// order it is given, and this is the test that says so.
    @Test func theLastLayerGivenIsTheOneOnTop() async throws {
        let output = try await Self.compose(
            layers: [Self.layer("under"), Self.layer("over")]
        ) { configuration, _ in
            (Self.tile(configuration.id == "over" ? .blue : .red), .served)
        }

        #expect(Self.isNear(Self.colour(CGPoint(x: 300, y: 200), in: output.jpeg), (0, 0, 1)))
    }

    /// A Province layer is one render of the frame, not one render per tile.
    /// These services render on demand, and a 300 dpi page asked tile by tile
    /// is a couple of hundred renders per layer landing on the service at once.
    @Test func aCataloguedLayerIsOneRenderOfTheFrame() async throws {
        let renders = Mutex(0)
        let tiles = Mutex(0)
        let layer = MapLayerState(
            configuration: TileLayerConfiguration(
                id: "roads", name: "Roads", source: .catalogExport(.roads)
            )
        )

        let output = try await Self.compose(
            layers: [layer],
            renderProvider: { _, _, widthPx, heightPx in
                _ = renders.take()
                #expect(widthPx == 600)
                #expect(heightPx == 400)
                return Self.tile(.green)
            }
        ) { _, _ in
            _ = tiles.take()
            return (Self.pixel, .served)
        }

        #expect(renders.value == 1)
        #expect(tiles.value == 0)
        #expect(output.outcomes.map(\.state) == [.drawn])
        // And the render is on the page, not merely counted.
        #expect(
            Self.isNear(Self.colour(CGPoint(x: 300, y: 200), in: output.jpeg), (0, 1, 0))
        )
    }

    /// A render that did not arrive is reported failed, like a tile layer that
    /// did not. It is the only thing standing between a blank patch of paper
    /// and a legend claiming the layer was consulted.
    @Test func aCataloguedLayerThatDidNotRenderIsReportedFailed() async throws {
        let layer = MapLayerState(
            configuration: TileLayerConfiguration(
                id: "roads", name: "Roads", source: .catalogExport(.roads)
            )
        )

        let output = try await Self.compose(
            layers: [layer],
            renderProvider: { _, _, _, _ in throw URLError(.badServerResponse) }
        ) { _, _ in (Self.pixel, .served) }

        let outcome = try #require(output.outcomes.first)
        guard case .failed = outcome.state else {
            Issue.record("Expected a failed layer, got \(outcome.state)")
            return
        }
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

    /// A hole in a parcel is a piece of ground that is not in it. Filling it
    /// would draw a boundary the record does not describe.
    @Test func aHoleInAParcelIsNotFilled() async throws {
        let parcel = ParcelShape(
            pid: "00000001",
            role: .taxSale,
            parts: [[
                Self.ring(west: -61.29, east: -61.25, south: 46.105, north: 46.135),
                Self.ring(west: -61.275, east: -61.265, south: 46.117, north: 46.123)
            ]]
        )

        let output = try await Self.compose(
            layers: [], parcels: [parcel]
        ) { _, _ in (Self.pixel, .served) }

        // Inside the outer ring, tinted by the tax-sale fill over white.
        let filled = try #require(Self.colour(CGPoint(x: 150, y: 200), in: output.jpeg))
        #expect(filled.blue < 0.96)
        // Inside the hole, still the base map.
        #expect(Self.isNear(Self.colour(CGPoint(x: 300, y: 200), in: output.jpeg), (1, 1, 1)))
    }

    /// The six-at-a-time limit is what keeps an export from being throttled by
    /// the service it is quoting, and it only holds if the group refills rather
    /// than starting every square at once.
    @Test func noMoreThanSixSquaresAreInFlightAtOnce() async throws {
        let gauge = Gauge()
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            gauge.entered()
            try? await Task.sleep(for: .milliseconds(5))
            gauge.left()
            return (Self.pixel, .served)
        }

        #expect(output.outcomes.map(\.state) == [.drawn])
        #expect(gauge.peak <= PrintMapCompositor.tileConcurrency)
        // And it did use the width it was given, or the ceiling proves nothing.
        #expect(gauge.peak > 1)
    }

    private static func ring(
        west: Double, east: Double, south: Double, north: Double
    ) -> [GeoPoint] {
        [
            GeoPoint(lat: north, lng: west),
            GeoPoint(lat: north, lng: east),
            GeoPoint(lat: south, lng: east),
            GeoPoint(lat: south, lng: west)
        ]
    }
}

/// A counter the concurrent tile fetches can share.
private nonisolated final class Mutex: @unchecked Sendable {
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

/// The most fetches that were ever in flight together.
private nonisolated final class Gauge: @unchecked Sendable {
    private let lock = NSLock()
    private var current = 0
    private var highest = 0

    var peak: Int { lock.withLock { highest } }

    func entered() {
        lock.withLock {
            current += 1
            highest = max(highest, current)
        }
    }

    func left() {
        lock.withLock { current -= 1 }
    }
}
