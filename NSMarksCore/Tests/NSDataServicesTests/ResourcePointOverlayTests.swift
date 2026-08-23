import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

@Suite("Labelling a mineral point")
struct ResourcePointLabelTests {
    @Test("An occurrence reads as its name and its commodities")
    func anOccurrenceNamesItsCommodities() {
        #expect(
            ResourcePointOverlay.label(
                for: .mineralOccurrences,
                properties: ["Name": .string("Gold Brook"), "Comm_list": .string("Au, Ag")]
            ) == "Gold Brook · Au, Ag"
        )
    }

    @Test("An empty commodity list falls back to the primary commodity")
    func anEmptyListStillNamesTheCommodity() {
        #expect(
            ResourcePointOverlay.label(
                for: .mineralOccurrences,
                properties: [
                    "Name": .string("Gold Brook"),
                    "Comm_list": .string("  "),
                    "Comm_prim": .string("Au"),
                ]
            ) == "Gold Brook · Au"
        )
    }

    @Test("A mine opening reads as its name and its hazard degree")
    func anOpeningNamesItsHazard() {
        #expect(
            ResourcePointOverlay.label(
                for: .abandonedMines,
                properties: ["Name": .string("Shaft 4"), "Degree_Haz": .string("High")]
            ) == "Shaft 4 · Hazard: High"
        )
    }

    @Test("A record with no name is still named for what it is")
    func anUnnamedRecordIsNotBlank() {
        #expect(
            ResourcePointOverlay.label(for: .mineralOccurrences, properties: [:])
                == "Mineral occurrence"
        )
        #expect(
            ResourcePointOverlay.label(for: .abandonedMines, properties: ["Name": .null])
                == "Abandoned mine opening"
        )
    }
}

@Suite("A tapped mineral point")
struct ResourcePointCalloutTests {
    private func record(
        _ properties: [String: MappedFeatureResponse.AttributeValue],
        layer: LayerID
    ) -> ResourcePointOverlay.Record {
        ResourcePointOverlay.Record(
            location: GeoPoint(lat: 45.1, lng: -61.2),
            label: ResourcePointOverlay.label(for: layer, properties: properties),
            properties: properties
        )
    }

    /// The card says what the web's hover line says, in two pieces.
    ///
    /// Tapping one of these dots used to produce nothing at all: the label was
    /// computed and then thrown away, so a reader could see a purple point and
    /// have no way to learn what was recorded there.
    @Test("An occurrence names itself and its commodities")
    func anOccurrenceIsReadable() {
        let callout = FeatureCallouts.resourcePoint(
            record(
                ["Name": .string("Gold Brook"), "Comm_list": .string("Au, Ag")],
                layer: .mineralOccurrences
            ),
            layer: .mineralOccurrences,
            layerName: "Mineral occurrences",
            caveat: "Recorded occurrences, not proof of a viable deposit",
            sourceURL: URL(string: "https://novascotia.ca/natr/meb/download/dp002.asp")
        )

        #expect(callout.title == "Gold Brook")
        #expect(callout.summary == "Au, Ag")
        #expect(callout.layerName == "Mineral occurrences")
        #expect(callout.caveat == "Recorded occurrences, not proof of a viable deposit")
        #expect(callout.linkLabel == "Official source")
    }

    /// A hazard grade is the one thing on this map that most needs its caveat.
    @Test("An opening names its hazard grade")
    func anOpeningIsReadable() {
        let callout = FeatureCallouts.resourcePoint(
            record(
                ["Name": .string("Old Shaft 4"), "Degree_Haz": .string("High")],
                layer: .abandonedMines
            ),
            layer: .abandonedMines,
            layerName: "Abandoned mine openings",
            caveat: "Provincial hazard inventory; locations and conditions may change",
            sourceURL: nil
        )

        #expect(callout.title == "Old Shaft 4")
        #expect(callout.summary == "Hazard: High")
        #expect(callout.caveat == "Provincial hazard inventory; locations and conditions may change")
        // Nothing to link to, so no link. An "Official source" button that went
        // nowhere would be worse than none.
        #expect(callout.linkLabel == nil)
    }

    /// A record the source published without a name still opens.
    @Test("An unnamed record still has a title and no empty line under it")
    func anUnnamedRecordStillOpens() {
        let callout = FeatureCallouts.resourcePoint(
            record([:], layer: .abandonedMines),
            layer: .abandonedMines,
            layerName: "Abandoned mine openings",
            caveat: "Provincial hazard inventory; locations and conditions may change",
            sourceURL: nil
        )

        #expect(callout.title == "Abandoned mine opening")
        #expect(callout.summary == nil)
    }

    /// The card and the marker cannot drift: one builds the other's halves.
    @Test("The split pieces rejoin into the line the map draws")
    func theSplitMatchesTheLabel() {
        let properties: [String: MappedFeatureResponse.AttributeValue] = [
            "Name": .string("Gold Brook"), "Comm_prim": .string("Au"),
        ]
        let parts = ResourcePointOverlay.parts(
            for: .mineralOccurrences, properties: properties
        )
        #expect(
            [parts.name, parts.detail].joined(separator: " · ")
                == ResourcePointOverlay.label(
                    for: .mineralOccurrences, properties: properties
                )
        )
    }
}

@Suite("Fetching mineral points")
struct ResourcePointFetcherTests {
    private actor Service {
        private(set) var urls: [URL] = []
        private let body: Data

        init(_ body: Data) { self.body = body }

        func take(_ url: URL) -> Data {
            urls.append(url)
            return body
        }

        nonisolated var transport: HTTPTransport {
            HTTPTransport { request in
                let url = request.url!
                return (
                    await self.take(url),
                    HTTPURLResponse(
                        url: url, statusCode: 200, httpVersion: nil, headerFields: nil
                    )!
                )
            }
        }
    }

    @Test("The layer's own fields are asked for, keyed on geo_id")
    func theCatalogDecidesTheQuery() async throws {
        let service = Service(
            Data(
                """
                {"type":"FeatureCollection","features":[{"type":"Feature","id":"1",\
                "geometry":{"type":"Point","coordinates":[-61.35,45.65]},\
                "properties":{"Name":"Shaft 4","Degree_Haz":"Low"}}]}
                """.utf8
            )
        )
        let points = try await ResourcePointFetcher(transport: service.transport).points(
            for: .abandonedMines,
            in: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
            clearance: ProvinceLicenceClearance(allowsRestrictedLayers: false)
        )

        let query = try #require(await service.urls.first?.query(percentEncoded: false))
        #expect(query.contains("outFields=geo_id,ShaftID,Name,Opening_ty,Degree_Haz,Protection"))
        #expect(query.contains("orderByFields=geo_id"))
        #expect(points.records.map(\.label) == ["Shaft 4 · Hazard: Low"])
        #expect(points.records[0].location == GeoPoint(lat: 45.65, lng: -61.35))
        #expect(points.unreadable == 0)
    }

    @Test("A row that is not a point is counted, not quietly dropped")
    func aNonPointRowIsAGapInTheAnswer() async throws {
        let service = Service(
            Data(
                """
                {"type":"FeatureCollection","features":[\
                {"type":"Feature","id":"1","geometry":{"type":"LineString",\
                "coordinates":[[-61.35,45.65],[-61.34,45.66]]},"properties":{"Name":"Trench"}}]}
                """.utf8
            )
        )

        let points = try await ResourcePointFetcher(transport: service.transport).points(
            for: .abandonedMines,
            in: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
            clearance: ProvinceLicenceClearance(allowsRestrictedLayers: false)
        )

        // No openings drawn, but not an inventory with no openings in it.
        #expect(points.records.isEmpty)
        #expect(points.unreadable == 1)
    }

    @Test("A layer that is not a point inventory is refused, not queried")
    func onlyThePointInventoriesQualify() async {
        let service = Service(Data(#"{"features":[]}"#.utf8))

        await #expect(throws: FeatureOverlayFailure.refused(.noServiceURL)) {
            try await ResourcePointFetcher(transport: service.transport).points(
                for: .zoningHalifax,
                in: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
                clearance: ProvinceLicenceClearance(allowsRestrictedLayers: true)
            )
        }
        #expect(await service.urls.isEmpty)
    }
}
