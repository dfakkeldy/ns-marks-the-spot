import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

/// Well outside every published study area, and a convenient unit square.
private let square: [PolygonHitTest.PolygonPart] = [
    [
        [
            GeoPoint(lat: 0, lng: 0),
            GeoPoint(lat: 0, lng: 1),
            GeoPoint(lat: 1, lng: 1),
            GeoPoint(lat: 1, lng: 0),
        ]
    ]
]

/// Inside the Truro study-area extent.
private let inTruro: [PolygonHitTest.PolygonPart] = [
    [
        [
            GeoPoint(lat: 45.36, lng: -63.30),
            GeoPoint(lat: 45.36, lng: -63.29),
            GeoPoint(lat: 45.37, lng: -63.29),
            GeoPoint(lat: 45.37, lng: -63.30),
        ]
    ]
]

private let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)
private let notCleared = ProvinceLicenceClearance(allowsRestrictedLayers: false)

/// Answers by URL substring, first match wins.
private actor Service {
    private(set) var urls: [URL] = []
    private let replies: [(needle: String, body: Data, status: Int)]

    init(_ replies: [(needle: String, body: Data, status: Int)]) {
        self.replies = replies
    }

    func take(_ url: URL) -> (Data, Int) {
        urls.append(url)
        let match = replies.first { url.absoluteString.contains($0.needle) }
        return (match?.body ?? Data(#"{"features":[]}"#.utf8), match?.status ?? 200)
    }

    nonisolated var transport: HTTPTransport {
        HTTPTransport { request in
            let url = request.url!
            let (data, status) = await self.take(url)
            return (
                data,
                HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
            )
        }
    }
}

/// A decoder that ignores the bytes and returns a raster whose alpha is set on
/// the fraction of pixels named by the body it was handed.
private func stubDecoder(
    width: Int = 4, height: Int = 4, drawnPixels: Int = 0
) -> RasterDecoder {
    RasterDecoder { _ in
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        for index in 0..<min(drawnPixels, width * height) {
            rgba[index * 4 + 3] = 255
        }
        return RasterDecoder.Raster(rgba: rgba, width: width, height: height)
    }
}

@Suite("Flood hazard queries")
struct FloodHazardQueryTests {
    @Test("A parcel with no rings is refused rather than reported as dry")
    func noBoundaryIsNotADryParcel() {
        #expect(throws: FloodHazardQuery.Refusal.noBoundary) {
            try FloodHazardQuery.plan(for: [], clearance: cleared)
        }
    }

    @Test("A parcel outside every study area is asked no river question at all")
    func outsideTheStudyAreasNothingIsAsked() throws {
        let plan = try FloodHazardQuery.plan(for: square, clearance: cleared)

        #expect(try plan.river.get().isEmpty)
    }

    @Test("A parcel in a study area is asked that area's two sublayers")
    func aStudyAreaIsAskedItsOwnSublayers() throws {
        let plan = try FloodHazardQuery.plan(for: inTruro, clearance: cleared)
        let requests = try plan.river.get()

        #expect(requests.map(\.layer.sublayer) == [16, 18])
        #expect(requests.map(\.layer.place) == ["Truro", "Truro"])
        #expect(requests.map(\.layer.relationship) == [.boundary, .area])
        #expect(
            requests[0].url.absoluteString
                == "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/"
                    + "flood_risk_areas/MapServer/16/query"
        )
        #expect(requests[0].body.contains("spatialRel=esriSpatialRelIntersects"))
        #expect(requests[0].body.contains("outFields=OBJECTID"))
    }

    /// A square parcel needs no fitting, so this is also the web's request byte
    /// for byte. Non-square parcels deliberately differ — see `coastalSample`.
    @Test("The coastal export is the web's request where the two can agree")
    func theCoastalExportMatchesTheWeb() throws {
        let plan = try FloodHazardQuery.plan(for: square, clearance: cleared)
        let request = try plan.coastal[0].get()

        #expect(request.scenario == .current)
        #expect(
            request.url.absoluteString
                == "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/"
                    + "OCN_Projected_Current_Day_Flooding_UT83/MapServer/export?"
                    + "f=image&bbox=0%2C0%2C1%2C1&bboxSR=4326&imageSR=4326"
                    + "&size=384%2C384&format=png32&transparent=true"
        )
    }

    @Test("Neither side of the sample grid runs past the cap")
    func theLongSideGetsTheFullGrid() {
        let tall = GeoBoundingBox(south: 45, west: -63, north: 46, east: -62.5)
        let wide = GeoBoundingBox(south: 45, west: -63, north: 45.5, east: -62)

        #expect(FloodHazardQuery.coastalSample(for: tall).heightPx == 384)
        #expect(FloodHazardQuery.coastalSample(for: tall).widthPx == 192)
        #expect(FloodHazardQuery.coastalSample(for: wide).widthPx == 384)
        #expect(FloodHazardQuery.coastalSample(for: wide).heightPx == 192)
    }

    /// The service redraws a mismatched extent without saying so, and the
    /// sampler reads pixels against the box it asked for — so the box and the
    /// grid have to be the same shape or every percentage is against the wrong
    /// ground.
    @Test("The rendered box has exactly the shape of the pixel grid")
    func theBoxAndTheGridAgree() {
        for box in [
            GeoBoundingBox(south: 45, west: -63, north: 46, east: -62.5),
            GeoBoundingBox(south: 45, west: -63, north: 45.001, east: -62),
            GeoBoundingBox(south: 45, west: -63, north: 45.0003, east: -62.9999),
            GeoBoundingBox(south: 45, west: -63, north: 45, east: -63),
        ] {
            let sample = FloodHazardQuery.coastalSample(for: box)
            let boxRatio = (sample.bounds.east - sample.bounds.west)
                / (sample.bounds.north - sample.bounds.south)
            let gridRatio = Double(sample.widthPx) / Double(sample.heightPx)

            #expect(abs(boxRatio - gridRatio) < 1e-9)
            // Grown outward only: the parcel never falls outside what is drawn.
            #expect(sample.bounds.west <= box.west)
            #expect(sample.bounds.east >= box.east)
            #expect(sample.bounds.south <= box.south)
            #expect(sample.bounds.north >= box.north)
        }
    }

    @Test("The restricted river layer is gated and the open coastal layers are not")
    func theLicenceGateFollowsTheCatalog() throws {
        let plan = try FloodHazardQuery.plan(for: inTruro, clearance: notCleared)

        #expect(plan.river == .failure(.licenceNotAccepted))
        #expect(plan.coastal.allSatisfy { (try? $0.get()) != nil })
    }
}

@Suite("Flood hazard replies")
struct FloodHazardResponseTests {
    @Test("A study-area sublayer with a feature over the parcel reads as a hit")
    func aFeatureIsAHit() throws {
        #expect(try FloodHazardResponse.riverIntersects(from: Data(#"{"features":[{}]}"#.utf8)))
        #expect(try !FloodHazardResponse.riverIntersects(from: Data(#"{"features":[]}"#.utf8)))
    }

    @Test("An ArcGIS error inside a 200 is a failure, not a parcel outside the zone")
    func aServiceErrorIsNotAMiss() {
        #expect(throws: FloodHazardResponse.Failure.serviceError(code: 400, message: "nope")) {
            try FloodHazardResponse.riverIntersects(
                from: Data(#"{"error":{"code":400,"message":"nope"}}"#.utf8)
            )
        }
    }

    @Test("A reply with neither features nor an error is unreadable")
    func anUnrecognisedReplyIsNotAMiss() {
        #expect(throws: FloodHazardResponse.Failure.malformed) {
            try FloodHazardResponse.riverIntersects(from: Data("{}".utf8))
        }
    }

    /// A 2×2 raster over a box whose lower-left quarter is the parcel. Only one
    /// pixel centre falls inside it, so the sample is one pixel wide and the
    /// answer is all-or-nothing.
    @Test("Only the pixels inside the outline are counted")
    func pixelsOutsideTheParcelAreNotCounted() throws {
        let bounds = GeoBoundingBox(south: 0, west: 0, north: 2, east: 2)
        let lowerLeft: [PolygonHitTest.PolygonPart] = [
            [
                [
                    GeoPoint(lat: 0, lng: 0),
                    GeoPoint(lat: 0, lng: 1),
                    GeoPoint(lat: 1, lng: 1),
                    GeoPoint(lat: 1, lng: 0),
                ]
            ]
        ]
        // Row 0 is the top of the image; the parcel is the bottom-left pixel,
        // which is index 2 of four.
        var rgba = [UInt8](repeating: 0, count: 2 * 2 * 4)
        rgba[2 * 4 + 3] = 255

        let summary = try FloodHazardResponse.summarizeRasterAlpha(
            rgba: rgba, width: 2, height: 2, bounds: bounds,
            parts: lowerLeft, mappedAreaSquareMetres: 4_000
        )

        #expect(summary.sampledParcelPixels == 1)
        #expect(summary.floodedParcelPixels == 1)
        #expect(summary.approximateAffectedPercent == 100)
        #expect(summary.approximateAffectedSquareMetres == 4_000)
        #expect(summary.intersects)
    }

    @Test("A sample that landed no pixels inside the parcel measured nothing")
    func anUnsampledParcelIsNotZeroPercent() throws {
        // A sliver in one corner of the box: no pixel centre lands in it.
        let sliver: [PolygonHitTest.PolygonPart] = [
            [
                [
                    GeoPoint(lat: 0, lng: 0),
                    GeoPoint(lat: 0, lng: 0.01),
                    GeoPoint(lat: 0.01, lng: 0.01),
                    GeoPoint(lat: 0.01, lng: 0),
                ]
            ]
        ]
        let summary = try FloodHazardResponse.summarizeRasterAlpha(
            rgba: [UInt8](repeating: 255, count: 2 * 2 * 4), width: 2, height: 2,
            bounds: GeoBoundingBox(south: 0, west: 0, north: 2, east: 2),
            parts: sliver, mappedAreaSquareMetres: 4_000
        )

        #expect(summary.wasSampled == false)
        // Not zero: nothing was measured, and a zero here would read as a
        // finding that the scenario does not reach the lot.
        #expect(summary.approximateAffectedPercent == nil)
        #expect(summary.approximateAffectedSquareMetres == nil)
    }

    @Test("A parcel with no mapped area gets a percentage and no square metres")
    func noMappedAreaIsNoDerivedArea() throws {
        let summary = try FloodHazardResponse.summarizeRasterAlpha(
            rgba: [0, 0, 0, 255, 0, 0, 0, 0], width: 2, height: 1,
            bounds: GeoBoundingBox(south: 0, west: 0, north: 1, east: 2),
            parts: [
                [
                    [
                        GeoPoint(lat: 0, lng: 0),
                        GeoPoint(lat: 0, lng: 2),
                        GeoPoint(lat: 1, lng: 2),
                        GeoPoint(lat: 1, lng: 0),
                    ]
                ]
            ],
            mappedAreaSquareMetres: nil
        )

        #expect(summary.approximateAffectedPercent == 50)
        #expect(summary.approximateAffectedSquareMetres == nil)
    }

    @Test("An abandoned parcel stops the pixel count instead of finishing it")
    func aCancelledSampleReportsNothing() async {
        // The count is pure CPU with no suspension point, so cancellation has
        // to be checked inside the loop or the work simply outlives the ask —
        // which is exactly how abandoned parcel searches once kept the pool
        // pinned for an hour. Cancelling the task before the call makes the
        // first row check fire deterministically.
        let square: [PolygonHitTest.PolygonPart] = [
            [
                [
                    GeoPoint(lat: 0, lng: 0),
                    GeoPoint(lat: 0, lng: 2),
                    GeoPoint(lat: 2, lng: 2),
                    GeoPoint(lat: 2, lng: 0),
                ]
            ]
        ]
        let threw = await Task {
            withUnsafeCurrentTask { $0?.cancel() }
            do throws(CancellationError) {
                _ = try FloodHazardResponse.summarizeRasterAlpha(
                    rgba: [UInt8](repeating: 255, count: 4 * 4 * 4),
                    width: 4, height: 4,
                    bounds: GeoBoundingBox(south: 0, west: 0, north: 2, east: 2),
                    parts: square, mappedAreaSquareMetres: nil
                )
                return false
            } catch {
                return true
            }
        }.value
        #expect(threw)
    }

    /// A tripwire for the cost, shaped like the failure: a shoreline-sized
    /// outline under a full-size export. Row-scan sampling finishes this in
    /// milliseconds; the per-pixel containment it replaced took minutes of
    /// debug CPU here and would time the suite out, so the test's assertions
    /// are about the count being right, and its completing at all is the
    /// performance claim.
    @Test("A many-vertex shoreline outline samples in row time, not pixel time")
    func aShorelineSizedOutlineStaysCheap() throws {
        var seed: UInt64 = 0x0C0A_57A1
        func jitter() -> Double {
            seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Double(seed >> 11) / Double(1 << 53)
        }
        let vertexCount = 4_000
        let ring = (0..<vertexCount).map { step -> GeoPoint in
            let angle = 2 * Double.pi * Double(step) / Double(vertexCount)
            let radius = 0.5 + 0.45 * jitter()
            return GeoPoint(
                lat: 44.5 + 0.01 * radius * sin(angle),
                lng: -63.5 + 0.01 * radius * cos(angle)
            )
        }
        let width = FloodHazardQuery.coastalSampleWidthPx
        let height = FloodHazardQuery.coastalSampleWidthPx

        let summary = try FloodHazardResponse.summarizeRasterAlpha(
            rgba: [UInt8](repeating: 255, count: width * height * 4),
            width: width, height: height,
            bounds: GeoBoundingBox(
                south: 44.49, west: -63.51, north: 44.51, east: -63.49
            ),
            parts: [[ring]], mappedAreaSquareMetres: nil
        )

        // Every sampled pixel is flooded — the raster is solid ink — and the
        // outline covers roughly half its own bounding box, so the sample size
        // lands in a broad middle band. Exact pixel counts belong to the
        // equivalence tests in GeoCore, not here.
        #expect(summary.approximateAffectedPercent == 100)
        let fraction = Double(summary.sampledParcelPixels) / Double(width * height)
        #expect(fraction > 0.2 && fraction < 0.8)
    }
}

@Suite("Flood hazard lookups")
struct FloodHazardFetcherTests {
    private func hazard(
        _ service: Service,
        parts: [PolygonHitTest.PolygonPart] = square,
        clearance: ProvinceLicenceClearance = cleared,
        decoder: RasterDecoder = stubDecoder(),
        mappedAreaSquareMetres: Double? = nil
    ) async throws -> ParcelFloodHazard {
        try await FloodHazardFetcher(transport: service.transport, decoder: decoder)
            .hazard(
                for: parts,
                mappedAreaSquareMetres: mappedAreaSquareMetres,
                clearance: clearance
            )
    }

    @Test("Nowhere near a study area is not a finding that the parcel is dry")
    func outsideTheStudyAreasIsItsOwnAnswer() async throws {
        let service = Service([])
        let result = try await hazard(service)

        #expect(result.river == .outsidePublishedExtents)
        // Three coastal exports and no river query.
        #expect(await service.urls.count == 3)
    }

    @Test("Inside a study area with nothing mapped is a real negative")
    func aSurveyedMissIsAMiss() async throws {
        let service = Service([])
        let result = try await hazard(service, parts: inTruro)

        #expect(result.river == .withinPublishedExtentWithNoIntersection)
        #expect(await service.urls.count == 5)
    }

    @Test("Hits are grouped by probability and relationship, keeping the place")
    func hitsAreGroupedTheWayTheWebGroupsThem() async throws {
        let service = Service([("flood_risk_areas", Data(#"{"features":[{}]}"#.utf8), 200)])
        let result = try await hazard(service, parts: inTruro)

        #expect(
            result.river == .publishedIntersection([
                RiverAEPIntersection(
                    annualExceedanceProbabilityPercent: 5, relationship: .boundary,
                    places: ["Truro"]
                ),
                RiverAEPIntersection(
                    annualExceedanceProbabilityPercent: 1, relationship: .area, places: ["Truro"]
                ),
            ])
        )
    }

    /// The river answer is assembled from every sublayer at once. A list missing
    /// the 1% layer looks exactly like a parcel that is only in the 5% zone.
    @Test("One study sublayer failing takes down the whole river answer")
    func aPartialRiverAnswerIsNotAnAnswer() async throws {
        let service = Service([("MapServer/18/query", Data(), 503)])
        let result = try await hazard(service, parts: inTruro)

        #expect(result.river == .unavailable(.invalidHTTPStatus(503)))
    }

    @Test("One coastal scenario failing leaves the other two standing")
    func oneScenarioFailingIsNotThreeFailing() async throws {
        let service = Service([("2050", Data(), 503)])
        let result = try await hazard(service, decoder: stubDecoder(drawnPixels: 16))

        #expect(result.coastal.map(\.scenario) == [.current, .year2050, .year2100])
        #expect(result.coastal[0].sample.map(\.intersects) == .success(true))
        #expect(result.coastal[1].sample == .failure(.invalidHTTPStatus(503)))
        #expect(result.coastal[2].sample.map(\.intersects) == .success(true))
    }

    @Test("Bytes that are not an image are unreadable, not an empty raster")
    func anUndecodableExportIsNotADryParcel() async throws {
        let service = Service([])
        let result = try await hazard(
            service,
            decoder: RasterDecoder { _ throws(RasterDecoder.UndecodableRaster) in
                throw RasterDecoder.UndecodableRaster()
            }
        )

        #expect(result.coastal[0].sample == .failure(.unreadable(.undecodableRaster)))
    }

    @Test("Declining the Province licence silences the river layer and nothing else")
    func theRestrictedHalfIsTheOnlyGatedHalf() async throws {
        let service = Service([])
        let result = try await hazard(service, parts: inTruro, clearance: notCleared)

        #expect(result.river == .unavailable(.refused(.licenceNotAccepted)))
        #expect(result.coastal.allSatisfy { (try? $0.sample.get()) != nil })
        // The restricted service was never contacted.
        #expect(await service.urls.allSatisfy { !$0.absoluteString.contains("fletcher") })
    }
}
