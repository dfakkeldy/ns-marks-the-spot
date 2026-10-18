import Foundation
import GeoCore
import Testing

@testable import NSDataServices

@Suite("Drawing a hydro reach")
struct HydroLineStyleTests {
    @Test("Width follows the log of the area, clamped at both ends")
    func widthIsClamped() {
        let smallest = HydroPotentialPilot.lineStyle(upstreamAreaKm2: 0, potentialClass: .kW1to5)
        let largest = HydroPotentialPilot.lineStyle(
            upstreamAreaKm2: 100_000, potentialClass: .kW1to5
        )
        let middle = HydroPotentialPilot.lineStyle(upstreamAreaKm2: 15, potentialClass: .kW1to5)

        #expect(smallest.width == 1.75)
        #expect(largest.width == 6.5)
        #expect(abs(middle.width - (1.1 + log2(16.0) * 0.55)) < 1e-9)
    }

    @Test("A negative or unusable area still draws the thinnest line, not a crash")
    func anUnusableAreaIsClampedToo() {
        #expect(
            HydroPotentialPilot.lineStyle(upstreamAreaKm2: -4, potentialClass: .kW1to5).width
                == 1.75
        )
        #expect(
            HydroPotentialPilot.lineStyle(upstreamAreaKm2: .nan, potentialClass: .kW1to5).width
                == 1.75
        )
    }

    @Test("The band above 50 kW is drawn back, as the web draws it")
    func theTopBandIsMuted() {
        #expect(
            HydroPotentialPilot.lineStyle(upstreamAreaKm2: 10, potentialClass: .over50kW).opacity
                == 0.72
        )
        #expect(
            HydroPotentialPilot.lineStyle(upstreamAreaKm2: 10, potentialClass: .kW30to50).opacity
                == 0.92
        )
    }

    @Test("Print separates every band by dash and width, never by colour alone")
    func printIsGreyscaleSafe() {
        let styles = HydroPotentialPilot.PotentialClass.allCases
            .map(HydroPotentialPilot.printLineStyle(for:))

        #expect(Set(styles.map(\.colorHex)) == ["#222222"])
        #expect(Set(styles.map(\.width)).count == HydroPotentialPilot.PotentialClass.allCases.count)
        #expect(styles.last?.dashPattern == nil)
    }
}

@Suite("Reading the bundled hydro pilot")
struct HydroPotentialCollectionTests {
    @Test("The shipped file decodes, and its rows match its own reach count")
    func theShippedFileIsTheOneTheCodeReads() throws {
        let collection = try HydroPotentialPilot.bundledCollection()

        #expect(collection.reaches.count == collection.metadata.reachCount)
        #expect(collection.metadata.watershedCount == 13)
        #expect(collection.reaches.allSatisfy { !$0.geometry.positions.isEmpty })
        #expect(collection.reaches.contains { $0.potentialClass == .kW5to15 })
    }

    @Test("A reach with no qualifying drop carries no drop figures at all")
    func anUnqualifiedReachCarriesNothingInvented() throws {
        let collection = try HydroPotentialPilot.bundledCollection()
        let unqualified = try #require(
            collection.reaches.first { $0.potentialClass == .notQualified }
        )

        #expect(unqualified.dropThresholdMetres == nil)
        #expect(unqualified.downstreamRouteLengthKm == nil)
        #expect(unqualified.indicativePowerKw == nil)
    }

    @Test("A band this code does not know is a packaging fault, not a blank reach")
    func anUnknownBandIsRefused() {
        #expect(throws: HydroPotentialPilot.LoadFailure.unreadable) {
            try HydroPotentialPilot.collection(from: fixture(potentialClass: "kw-500"))
        }
    }

    @Test("A point where a reach should be is refused rather than drawn")
    func onlyLinearGeometryIsAReach() {
        #expect(throws: HydroPotentialPilot.LoadFailure.unreadable) {
            try HydroPotentialPilot.collection(
                from: fixture(geometry: #"{"type":"Point","coordinates":[-61.1,46.1]}"#)
            )
        }
    }

    @Test("The endpoint is read longitude first")
    func theEndpointKeepsGeoJSONOrder() throws {
        let collection = try HydroPotentialPilot.collection(from: fixture())
        let endpoint = try #require(collection.reaches.first?.downstreamEndpoint)

        #expect(endpoint.lng == -60.653184)
        #expect(endpoint.lat == 46.876009)
    }

    private func fixture(
        potentialClass: String = "kw-5-15",
        geometry: String = #"{"type":"MultiLineString","coordinates":[[[-61.1,46.1],[-61.2,46.2]]]}"#
    ) -> Data {
        Data(
            """
            {"type":"FeatureCollection",
             "metadata":{"title":"t","retrievedOn":"2026-07-21","watershedCount":1,
              "reachCount":1,"qualifyingReachCount":1,"maxDownstreamDistanceKm":3,
              "nominalSpecificDischargeLitresPerSecondPerKm2":8,
              "nominalSystemEfficiency":0.6,"method":"m","limitations":"l"},
             "features":[{"type":"Feature","geometry":\(geometry),
              "properties":{"watershedCode":"1FC-10","watershedName":"Blair R.",
               "catchmentResolution":"tertiary","networkRole":"trunk",
               "upstreamAreaKm2":10.2,"dropThresholdMetres":20,
               "downstreamRouteLengthKm":0.52,"averageMappedFallMetresPerKm":38.2,
               "nominalFlowLitresPerSecond":81.6,"indicativePowerKw":9.61,
               "screeningValue":18.329,"downstreamEndpoint":[-60.653184,46.876009],
               "sourceSegmentId":"11:347418:0","potentialClass":"\(potentialClass)"}}]}
            """.utf8
        )
    }
}
