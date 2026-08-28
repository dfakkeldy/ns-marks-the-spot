import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

/// What a tapped feature says about itself, against the web popups it ports.
@Suite("Describing a tapped feature")
struct FeatureCalloutTests {
    @Test("Zoning leads with the zone and offers the by-law that governs it")
    func zoningCarriesTheBylaw() throws {
        let detail = try #require(LayerCatalog.zoningDetail.first)
        let callout = FeatureCallouts.zoning(
            .init(code: "R-1", name: "Residential Single Unit", planArea: "Port Hood"),
            detail: detail,
            layerName: "Inverness zoning"
        )

        #expect(callout.layerName == "Inverness zoning")
        #expect(callout.title.contains("R-1"))
        #expect(callout.summary == "Plan area: Port Hood")
        #expect(callout.linkURL == detail.bylawURL)
        #expect(callout.caveat.contains("not for legal purposes"))
    }

    /// A zone with no plan area is common; the line is dropped rather than
    /// rendered empty, which would read as a plan area the service lost.
    @Test("A zone with no plan area says nothing about one")
    func zoningWithoutAPlanArea() throws {
        let detail = try #require(LayerCatalog.zoningDetail.first)
        let callout = FeatureCallouts.zoning(
            .init(code: "R-1", name: nil, planArea: nil), detail: detail, layerName: "Zoning"
        )
        #expect(callout.summary == nil)
    }

    @Test("An old-growth area reports the source's own hectares, not a measurement")
    func oldGrowthReportsPublishedArea() {
        let callout = FeatureCallouts.oldGrowth(
            .init(
                geometry: .polygon([]), status: .confirmedOldGrowth, hectares: 1_234.567,
                selectionMethod: "Field verified"
            ),
            layerName: "Old-growth policy",
            sourceURL: URL(string: "https://example.invalid/policy")
        )

        #expect(callout.rows.first?.value == "1,234.57 ha")
        #expect(callout.rows.last == .init(label: "Selection method", value: "Field verified"))
        #expect(callout.caveat.contains("not a complete inventory"))
        #expect(callout.linkLabel == "Official policy layer")
    }

    @Test("An area the source did not measure shows no area row")
    func oldGrowthWithoutHectares() {
        let callout = FeatureCallouts.oldGrowth(
            .init(geometry: .polygon([]), status: .unknown, hectares: nil, selectionMethod: nil),
            layerName: "Old-growth policy",
            sourceURL: nil
        )
        #expect(callout.rows.isEmpty)
        #expect(callout.linkURL == nil)
        #expect(callout.linkLabel == nil)
    }

    /// The proximity layer is a distance between two records. The card carries
    /// the publisher's PID so the parcel can be opened, and says in the caveat
    /// that nearness is not a finding about the ground.
    @Test("Mineral proximity offers the parcel and disclaims the inference")
    func mineralProximityCarriesThePID() {
        let callout = FeatureCallouts.mineralProximity(
            pid: "50123456", distanceKm: 1, layerName: "Mineral proximity", sourceURL: nil
        )
        #expect(callout.pid == "50123456")
        #expect(callout.summary == "Within 1 km of a recorded mineral occurrence")
        #expect(callout.caveat.contains("not a finding about this property"))
    }

    /// The web prints every well row whether or not the driller filled it in,
    /// because a missing row would read as a reading this app failed to load.
    @Test("A well log lists all seven rows, saying which were not recorded")
    func wellLogAlwaysListsEveryRow() {
        let callout = FeatureCallouts.wellLog(
            .init(
                location: GeoPoint(lat: 45.6, lng: -61.3), wellNumber: "12345",
                completedOn: "1998-06-11", depthMetres: 42, casingMetres: nil,
                bedrockDepthMetres: nil, staticLevelMetres: -1.5, yieldLitresPerMinute: 18.25,
                accuracyMetres: 30, accuracy: .surveyed, coordinateSource: "GPS"
            ),
            layerName: "NS well logs · DP ME 430",
            sourceURL: nil
        )

        #expect(callout.rows.count == 7)
        #expect(callout.title == "Well 12345")
        #expect(callout.rows[1] == .init(label: "Depth", value: "42.0 m"))
        #expect(callout.rows[2] == .init(label: "Casing", value: "Not recorded"))
        // A flowing well stands above ground. The negative reading is real and
        // must survive to the card rather than being cleaned up as bad data.
        #expect(callout.rows[4] == .init(label: "Static level", value: "-1.5 m"))
        #expect(callout.rows[5] == .init(label: "Yield", value: "18.3 L/min"))
        #expect(callout.caveat == FeatureCallouts.wellLogCaveat)
    }

    @Test("An unnumbered well is still identified as a record")
    func wellLogWithoutANumber() {
        let callout = FeatureCallouts.wellLog(
            .init(
                location: GeoPoint(lat: 45.6, lng: -61.3), wellNumber: nil, completedOn: nil,
                depthMetres: nil, casingMetres: nil, bedrockDepthMetres: nil,
                staticLevelMetres: nil, yieldLitresPerMinute: nil, accuracyMetres: nil,
                accuracy: .community, coordinateSource: nil
            ),
            layerName: "NS well logs", sourceURL: nil
        )
        #expect(callout.title == "Well record")
        #expect(callout.rows.allSatisfy { $0.value == "Not recorded" })
    }

    @Test("A hydro reach quotes the pilot's own scenario constants")
    func hydroQuotesItsAssumptions() throws {
        let collection = try HydroPotentialPilot.bundledCollection()
        let reach = try #require(collection.reaches.first { $0.indicativePowerKw != nil })
        let callout = FeatureCallouts.hydroReach(
            reach, metadata: collection.metadata, layerName: "Inverness point-screen pilot"
        )

        #expect(callout.rows.map(\.label).contains("Indicative scale"))
        #expect(callout.rows.last?.label == "Opportunity band")
        #expect(callout.caveat.contains("L/s/km²"))
        #expect(callout.caveat.contains("not measured flow"))
    }

    /// A reach with no qualifying drop says so in one row rather than dropping
    /// five: five missing rows would read as figures that failed to load.
    @Test("A reach with no qualifying drop says there is none")
    func hydroWithoutADrop() throws {
        let collection = try HydroPotentialPilot.bundledCollection()
        guard let reach = collection.reaches.first(where: { $0.dropThresholdMetres == nil }) else {
            return
        }
        let callout = FeatureCallouts.hydroReach(
            reach, metadata: collection.metadata, layerName: "Inverness point-screen pilot"
        )
        #expect(callout.rows.contains(.init(label: "Bounded drop", value: "No 5 m drop within 3 km")))
        #expect(!callout.rows.map(\.label).contains("Indicative scale"))
    }
}
