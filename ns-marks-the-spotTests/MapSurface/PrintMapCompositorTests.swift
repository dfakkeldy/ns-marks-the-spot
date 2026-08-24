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

    private static let mapFrame = PdfTemplate.template(.landscape).mapFrame

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
        // Every use of the pointer stays inside the closure. A `CGContext` built
        // on `buffer.baseAddress` and returned from here would outlive the
        // borrow it was made from, and would only work for as long as `Array`
        // happens to keep its storage put.
        let drawn = sample.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            // A `CGContext` counts up from the bottom and the sample point
            // counts down from the top, so the image is shifted until the
            // wanted pixel is the only one inside the one-pixel context.
            context.translateBy(x: -point.x, y: point.y - CGFloat(image.height) + 1)
            context.draw(
                image,
                in: CGRect(x: 0, y: 0, width: image.width, height: image.height)
            )
            return true
        }
        guard drawn else { return nil }
        return (
            Double(sample[0]) / 255, Double(sample[1]) / 255, Double(sample[2]) / 255
        )
    }

    private static func isNear(
        _ sample: (red: Double, green: Double, blue: Double)?,
        _ expected: (red: Double, green: Double, blue: Double),
        // Tight enough to fail an opacity that is wrong rather than noisy. At
        // 0.12 a nominally half-opaque layer could land anywhere from 0.39 to
        // 0.61 and pass, which is a fifth of the user's setting; JPEG at 0.92
        // over these large flat fields does not need that much room.
        tolerance: Double = 0.04
    ) -> Bool {
        guard let sample else { return false }
        return abs(sample.red - expected.red) < tolerance
            && abs(sample.green - expected.green) < tolerance
            && abs(sample.blue - expected.blue) < tolerance
    }

    private static func compose(
        layers: [MapLayerState],
        parcels: [ParcelShape] = [],
        features: [FeatureShape] = [],
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
            features: features,
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
            (Self.tile(.clear), .failed, .placeholder)
        }

        let outcome = try #require(output.outcomes.first)
        guard case .failed = outcome.state else {
            Issue.record("Expected a failed layer, got \(outcome.state)")
            return
        }
    }

    /// A square the source answered for is drawn even when it is blank: a
    /// source with nothing at this square has answered, and demoting that would
    /// be the mirror of the error above.
    ///
    /// This is bytes from a source, which is what `.source` says. A square no
    /// source was asked for is a different case and is not drawn — see the
    /// coverage test below.
    @Test func aBlankSquareTheSourceAnsweredForStillCounts() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            (Self.tile(.clear), .served, .source)
        }

        #expect(output.outcomes.map(\.state) == [.drawn])
    }

    /// A layer whose every square lies outside its source's extent put nothing
    /// on the page, and must not be reported as though it had.
    ///
    /// This is the Fletcher case away from the surveyed sheets: nothing is
    /// fetched, nothing fails, and a transparent square comes back for each
    /// one. Called `.drawn` it would earn a legend row saying the survey was
    /// consulted here and an attribution crediting a licence for pixels nobody
    /// drew — and blank paper the reader would take for surveyed ground with
    /// nothing on it.
    @Test func aLayerThatReachesNoneOfThisGroundIsNotDrawn() async throws {
        let output = try await Self.compose(layers: [Self.layer("fletcher")]) { _, _ in
            (Self.tile(.clear), .served, .outsideCoverage)
        }

        #expect(output.outcomes.map(\.state) == [.outsideCoverage])
    }

    /// And the other side of it: a sheet edge crossing the frame is ink on the
    /// page. One real square makes the layer drawn, because the squares past
    /// the sheet's edge are ground the survey never reached rather than squares
    /// that went missing.
    @Test func oneRealSquareIsEnoughToCountAsDrawn() async throws {
        let real = Mutex(1)
        let output = try await Self.compose(layers: [Self.layer("fletcher")]) { _, _ in
            real.take()
                ? (Self.tile(.red), .served, .source)
                : (Self.tile(.clear), .served, .outsideCoverage)
        }

        #expect(output.outcomes.map(\.state) == [.drawn])
    }

    /// A layer left unfetched because its licence is unanswered says that, and
    /// says it separately from having no coverage. The remedies differ: one is
    /// answered by accepting the licence, the other by nothing at all.
    @Test func aLayerItsLicenceHasNotClearedSaysSoRatherThanShowingAsEmpty() async throws {
        let output = try await Self.compose(layers: [Self.layer("province")]) { _, _ in
            (Self.tile(.clear), .served, .licenceRefused)
        }

        #expect(output.outcomes.map(\.state) == [.licenceBlocked])
    }

    /// Part of a layer is worse than none of it: the page looks complete, and
    /// the hole is where the reader would have looked. The count travels so the
    /// page can say how much is missing.
    @Test func aPartlyFetchedLayerCarriesTheCountItIsMissing() async throws {
        // Fails exactly one square, wherever the plan puts it.
        let failing = Mutex(1)
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            if failing.take() { throw URLError(.timedOut) }
            return (Self.pixel, .served, .source)
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
            return (Self.pixel, .served, .source)
        }

        #expect(output.outcomes.map(\.id) == ["visible"])
        #expect(asked.value == 0)
    }

    /// Every layer that drew is accounted for, and the raster is the size that
    /// was asked for — the registration written into the PDF assumes exactly
    /// these pixels cover exactly these bounds.
    @Test func theRasterIsTheSizeTheRegistrationAssumes() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, _ in
            (Self.pixel, .served, .source)
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
            (Self.tile(.red), .served, .source)
        }

        #expect(Self.isNear(Self.colour(CGPoint(x: 300, y: 200), in: output.jpeg), (1, 0, 0)))
        #expect(Self.isNear(Self.colour(CGPoint(x: 40, y: 40), in: output.jpeg), (1, 0, 0)))
    }

    /// Each square lands where its coordinates say.
    ///
    /// The test above cannot show this: every tile is the same red, so swapped
    /// x and y, reversed rows, or one tile stretched across the whole frame all
    /// produce the same full-red page. Here the colour depends on the tile
    /// *column* alone, which makes the page vertically striped — so a scan
    /// across it changes colour and a scan down it does not. Transposing the
    /// coordinates turns the stripes horizontal and fails both assertions at
    /// once.
    @Test func eachSquareLandsWhereItsCoordinatesSay() async throws {
        let columns = Tally()
        let rows = Tally()
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, path in
            columns.add(path.x)
            rows.add(path.y)
            return (Self.tile(path.x.isMultiple(of: 2) ? .red : .blue), .served, .source)
        }

        // The fixture itself, asserted: with one column of tiles the stripe
        // test below would be vacuously true, and with one row the vertical
        // scan would prove nothing.
        #expect(columns.distinct > 1)
        #expect(rows.distinct > 1)

        func reddish(_ x: Double, _ y: Double) -> Bool? {
            guard let sample = Self.colour(CGPoint(x: x, y: y), in: output.jpeg) else {
                return nil
            }
            return sample.red > sample.blue
        }
        let across = stride(from: 5.0, to: 600, by: 5).map { reddish($0, 200) }
        let down = stride(from: 5.0, to: 400, by: 5).map { reddish(300, $0) }
        #expect(Set(across.map { $0 ?? false }).count == 2)
        #expect(Set(down.map { $0 ?? false }).count == 1)
    }

    /// North is at the top of the page.
    ///
    /// Neither test above can show this. Vertical stripes stay vertical when
    /// the rows are reversed, and a page turned upside down has the same four
    /// corners on the same four coordinates as one the right way up, so every
    /// extent still checks out. The only thing that tells them apart is which
    /// ground the ink at the top of the sheet came from.
    ///
    /// It matters more here than anywhere else in the app: the export is what
    /// a user carries into the field, and a mirrored one sends them the wrong
    /// way up a road with a map that agrees with itself.
    @Test func theNorthOfTheFrameIsAtTheTopOfThePage() async throws {
        let rows = Tally()
        let output = try await Self.compose(layers: [Self.layer("parcels")]) { _, path in
            rows.add(path.y)
            return (Self.tile(path.y.isMultiple(of: 2) ? .red : .blue), .served, .source)
        }
        // Web Mercator tile y counts southward, so the smallest one asked for
        // is the row of squares covering the north edge of the frame.
        let northmost = try #require(rows.smallest)
        #expect(rows.distinct > 1)

        func reddish(_ x: Double, _ y: Double) -> Bool? {
            guard let sample = Self.colour(CGPoint(x: x, y: y), in: output.jpeg) else {
                return nil
            }
            return sample.red > sample.blue
        }
        // Horizontal stripes this time, which is the transpose check the other
        // way round.
        let across = stride(from: 5.0, to: 600, by: 5).map { reddish($0, 200) }
        let down = stride(from: 5.0, to: 400, by: 5).map { reddish(300, $0) }
        #expect(Set(across.map { $0 ?? false }).count == 1)
        #expect(Set(down.map { $0 ?? false }).count == 2)

        // And the band at the top of the page is the northern one. Reverse the
        // rows and this is the assertion that fails.
        #expect(reddish(300, 4) == northmost.isMultiple(of: 2))
    }

    /// Opacity is the user's answer to "how much of what is underneath do I
    /// still need to see", and a page that ignored it would hide the very
    /// thing they set it to keep.
    @Test func layerOpacityIsCarriedOntoThePage() async throws {
        let output = try await Self.compose(layers: [Self.layer("parcels", alpha: 0.5)]) { _, _ in
            (Self.tile(.red), .served, .source)
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
            (Self.tile(configuration.id == "over" ? .blue : .red), .served, .source)
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
            return (Self.pixel, .served, .source)
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
        ) { _, _ in (Self.pixel, .served, .source) }

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
        ) { _, _ in (Self.pixel, .served, .source) }

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
            return (Self.pixel, .served, .source)
        }

        #expect(output.outcomes.map(\.state) == [.drawn])
        #expect(gauge.peak <= PrintMapCompositor.tileConcurrency)
        // And it did use the width it was given, or the ceiling proves nothing.
        #expect(gauge.peak > 1)
    }

    /// The parcel marks are the only ink on the page that no layer row
    /// accounts for. Four colours of boundary with no key is a page a reader
    /// cannot use, and the two tax-sale colours are the pair they most need
    /// told apart: one is a parcel advertised now, the other one sold years ago.
    @Test func everyParcelMarkOnThePageIsNamedAndKeyedByColour() {
        let entries = PrintMapCompositor.parcelLegend(
            for: [
                Self.parcel("1", .context),
                Self.parcel("2", .historicalTaxSale),
                Self.parcel("3", .selected),
                Self.parcel("4", .taxSale)
            ],
            within: Self.bounds, mapFrame: Self.mapFrame
        )

        #expect(
            entries.map(\.name) == [
                "Selected parcel",
                "In a current tax-sale notice",
                "In a published past tax-sale record",
                "Nearby parcel boundary"
            ]
        )
        // The swatch is read back from the stroke the compositor uses, so the
        // key matches the ink rather than a colour written down twice.
        #expect(entries.map(\.swatchColour) == ["#9F2F24", "#BE4D3C", "#5A4385", "#0A7180"])
        // One row per mark, however many parcels carry it.
        #expect(entries.count == 4)
    }

    /// The print frame is drawn by hand and can be nowhere near the selection.
    /// A key to a colour that is not on the page describes ink the page does
    /// not carry.
    @Test func aParcelMarkOutsideTheFrameIsNotKeyed() {
        let elsewhere = ParcelShape(
            pid: "9",
            role: .selected,
            parts: [[Self.ring(west: -63.5, east: -63.4, south: 44.6, north: 44.7)]]
        )

        #expect(PrintMapCompositor.parcelLegend(for: [elsewhere], within: Self.bounds, mapFrame: Self.mapFrame).isEmpty)
    }

    /// The selection is drawn as an outline and nothing else. A parcel big
    /// enough to hold the whole frame strokes its boundary kilometres off the
    /// page, so a key row for it points at a colour the reader cannot find —
    /// and, worse, invites them to read the frame's ground as unselected ink.
    @Test func aParcelTooLargeToShowItsOutlineIsNotKeyed() {
        let ring = Self.ring(west: -62, east: -60, south: 45, north: 47)
        let outlined = ParcelShape(pid: "10", role: .selected, parts: [[ring]])

        #expect(PrintMapCompositor.parcelLegend(for: [outlined], within: Self.bounds, mapFrame: Self.mapFrame).isEmpty)

        // The filled marks are the other way round: a tax-sale parcel that
        // surrounds the frame tints every inch of it, which is when its key
        // matters most.
        let filled = ParcelShape(pid: "11", role: .taxSale, parts: [[ring]])
        #expect(
            PrintMapCompositor.parcelLegend(for: [filled], within: Self.bounds, mapFrame: Self.mapFrame).map(\.name)
                == ["In a current tax-sale notice"]
        )
    }

    /// A boundary that crosses the frame without leaving a vertex in it is on
    /// the page, and a box test and an edge test agree here. The reason to walk
    /// the edges is the case above, not this one.
    @Test func anOutlineCrossingTheFrameIsKeyed() {
        let across = ParcelShape(
            pid: "12",
            role: .selected,
            parts: [[Self.ring(west: -62, east: -60, south: 46.11, north: 47)]]
        )

        #expect(PrintMapCompositor.parcelLegend(for: [across], within: Self.bounds, mapFrame: Self.mapFrame).count == 1)
    }

    /// The attribution asks the same question the legend does, and has to get
    /// the same answer. A page framed away from the selection carries no
    /// Province boundary; crediting NSPRD on it names a source the page took
    /// nothing from, which is the mirror image of the omission the credit
    /// exists to prevent.
    @Test func parcelsHeldButNotPrintedAreNotCredited() {
        let elsewhere = ParcelShape(
            pid: "13",
            role: .selected,
            parts: [[Self.ring(west: -63.5, east: -63.4, south: 44.6, north: 44.7)]]
        )

        #expect(
            !PrintMapCompositor.drawsParcels(
                [elsewhere], within: Self.bounds, mapFrame: Self.mapFrame
            )
        )
        #expect(
            PrintMapCompositor.drawsParcels(
                [elsewhere, Self.parcel("14", .taxSale)],
                within: Self.bounds,
                mapFrame: Self.mapFrame
            )
        )
        #expect(
            !PrintMapCompositor.drawsParcels(
                [], within: Self.bounds, mapFrame: Self.mapFrame
            )
        )
    }

    /// The stroke is centred on the boundary. A selected parcel whose east
    /// edge stands within two page points of the frame lays part of its
    /// four-point stroke on the page, and the key and the credit must both
    /// own that sliver; past the reach there is no sliver to own.
    @Test("A boundary grazing the frame is keyed and credited for its stroke's reach")
    func aBoundaryGrazingTheFrameIsKeyedAndCreditedForItsStrokesReach() {
        // Two points of this 736-point frame is 0.000163 degrees of this
        // ground; the near edge stands 0.00008 off the frame, the far 0.0004.
        let grazing = ParcelShape(
            pid: "15", role: .selected,
            parts: [[Self.ring(west: -61.35, east: -61.30008, south: 46.11, north: 46.13)]]
        )
        #expect(
            PrintMapCompositor.parcelLegend(
                for: [grazing], within: Self.bounds, mapFrame: Self.mapFrame
            ).map(\.name) == ["Selected parcel"]
        )
        #expect(
            PrintMapCompositor.drawsParcels(
                [grazing], within: Self.bounds, mapFrame: Self.mapFrame
            )
        )

        let clear = ParcelShape(
            pid: "16", role: .selected,
            parts: [[Self.ring(west: -61.35, east: -61.3004, south: 46.11, north: 46.13)]]
        )
        #expect(
            PrintMapCompositor.parcelLegend(
                for: [clear], within: Self.bounds, mapFrame: Self.mapFrame
            ).isEmpty
        )
        #expect(
            !PrintMapCompositor.drawsParcels(
                [clear], within: Self.bounds, mapFrame: Self.mapFrame
            )
        )
    }

    /// The join is the reason the ink predicates may pad by half a line
    /// width. A miter tip at this corner survives the default limit and would
    /// spike twenty-five raster pixels onto the page; bevel keeps the whole
    /// stroke within half a width of its centre line, so a vertex off the
    /// page leaves the page blank.
    @Test func anAcuteCornerJustOffThePageLeavesNoInkOnIt() async throws {
        // A vee pointing east at the page, arms open fourteen degrees.
        func vee(vertexLng: Double) -> FeatureShape {
            FeatureShape(
                id: "vee",
                layer: .zoningHalifax,
                geometry: .lineString([
                    GeoPoint(lat: 46.1248, lng: -61.34),
                    GeoPoint(lat: 46.12, lng: vertexLng),
                    GeoPoint(lat: 46.1152, lng: -61.34)
                ]),
                style: VectorFeatureStyle(strokeHex: "#166534", lineWidth: 6),
                title: "vee",
                subtitle: nil
            )
        }

        // Vertex twelve pixels west of the page's edge: the stroke reaches six
        // pixels from its centre line, a mitered tip would have reached
        // thirty-seven.
        let off = try await Self.compose(
            layers: [], features: [vee(vertexLng: -61.3012)]
        ) { _, _ in (Self.pixel, .served, .source) }
        for x: Double in [2, 15, 30] {
            #expect(Self.isNear(Self.colour(CGPoint(x: x, y: 200), in: off.jpeg), (1, 1, 1)))
        }

        // The same corner on the page draws, so the blank above is the join,
        // not a feature that never rendered.
        let on = try await Self.compose(
            layers: [], features: [vee(vertexLng: -61.297)]
        ) { _, _ in (Self.pixel, .served, .source) }
        #expect(
            Self.isNear(
                Self.colour(CGPoint(x: 30, y: 200), in: on.jpeg),
                (0x16 / 255.0, 0x65 / 255.0, 0x34 / 255.0)
            )
        )
    }

    /// The title asks the compositor's own padded question, held beside the
    /// legend's here so the two cannot drift apart again: a grazing boundary
    /// that is keyed and credited is named, one past its reach is neither.
    /// And the one place they part on purpose: a page wholly inside the
    /// selected parcel is that parcel's ground, so the title names what the
    /// unfilled selection leaves unkeyed.
    @Test func theTitleNamesExactlyWhatTheLegendKeysForAGrazingBoundary() {
        let grazing = ParcelShape(
            pid: "15", role: .selected,
            parts: [[Self.ring(west: -61.35, east: -61.30008, south: 46.11, north: 46.13)]]
        )
        #expect(
            OverlayViewModel.titleNamesParcel(
                grazing, within: Self.bounds, mapFrame: Self.mapFrame
            )
        )
        let clear = ParcelShape(
            pid: "16", role: .selected,
            parts: [[Self.ring(west: -61.35, east: -61.3004, south: 46.11, north: 46.13)]]
        )
        #expect(
            !OverlayViewModel.titleNamesParcel(
                clear, within: Self.bounds, mapFrame: Self.mapFrame
            )
        )
        let county = ParcelShape(
            pid: "17", role: .selected,
            parts: [[Self.ring(west: -61.5, east: -61.0, south: 46.0, north: 46.3)]]
        )
        #expect(
            OverlayViewModel.titleNamesParcel(
                county, within: Self.bounds, mapFrame: Self.mapFrame
            )
        )
        #expect(
            PrintMapCompositor.parcelLegend(
                for: [county], within: Self.bounds, mapFrame: Self.mapFrame
            ).isEmpty
        )
    }

    private static func parcel(_ pid: String, _ role: ParcelShape.Role) -> ParcelShape {
        ParcelShape(
            pid: pid,
            role: role,
            parts: [[Self.ring(west: -61.29, east: -61.25, south: 46.105, north: 46.135)]]
        )
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
/// Distinct values a provider was asked for, across the concurrent fetches.
private nonisolated final class Tally: @unchecked Sendable {
    private let lock = NSLock()
    private var seen = Set<Int>()

    func add(_ value: Int) {
        lock.withLock { _ = seen.insert(value) }
    }

    var distinct: Int {
        lock.withLock { seen.count }
    }

    var smallest: Int? {
        lock.withLock { seen.min() }
    }
}

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
