import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

@Suite("Styling the viewport feature layers")
struct VectorFeatureStyleTests {
    @Test("A surveyed well is solid; every coarser band is hollow and dashed")
    func accuracyIsVisible() {
        let surveyed = VectorFeatureStyles.wellLog(.surveyed)
        #expect(surveyed.fillOpacity == 0.95)
        #expect(surveyed.dashPattern == nil)
        #expect(surveyed.markerRadius == 5)

        for accuracy in WellLogOverlay.Accuracy.allCases where accuracy != .surveyed {
            let style = VectorFeatureStyles.wellLog(accuracy)
            // The whole point of the band: a record placed off a map sheet must
            // not draw like one a surveyor pinned.
            #expect(style.fillOpacity == 0.12)
            #expect(style.dashPattern == [2, 2])
            #expect(style.markerRadius == 4)
        }
    }

    @Test("A policy area this app could not classify is drawn dashed and fainter")
    func anUnknownStatusLooksUnknown() throws {
        let colors = try #require(LayerCatalog.forestryStatusColors(for: .oldGrowthPolicy))

        let confirmed = VectorFeatureStyles.oldGrowth(
            .confirmedOldGrowth, colors: colors, opacity: 0.85
        )
        let unknown = VectorFeatureStyles.oldGrowth(.unknown, colors: colors, opacity: 0.85)

        #expect(confirmed.fillHex == "#166534")
        #expect(confirmed.dashPattern == nil)
        #expect(unknown.fillHex == "#64748b")
        #expect(unknown.dashPattern == [4, 3])
        #expect(unknown.fillOpacity < confirmed.fillOpacity)
    }

    @Test("A derived mineral-proximity parcel is never drawn as a published outline")
    func theDerivationLooksDerived() {
        #expect(VectorFeatureStyles.mineralProximityParcel.dashPattern == [5, 3])
    }

    @Test("An abandoned-mine opening is drawn larger than an occurrence")
    func theHazardIsTheBiggerMarker() throws {
        let mines = try #require(LayerCatalog.resourcePointDetail(for: .abandonedMines))
        let occurrences = try #require(LayerCatalog.resourcePointDetail(for: .mineralOccurrences))

        #expect(VectorFeatureStyles.resourcePoint(mines, opacity: 1).markerRadius == 6)
        #expect(VectorFeatureStyles.resourcePoint(occurrences, opacity: 1).markerRadius == 5)
    }

    @Test("A zoning polygon takes its layer's declared colours")
    func zoningKeepsItsMunicipalColours() throws {
        let detail = try #require(LayerCatalog.zoningDetail(for: .zoningInverness))
        let style = VectorFeatureStyles.zoning(detail, opacity: 0.45)

        #expect(style.strokeHex == detail.strokeColor)
        #expect(style.fillHex == detail.fillColor)
        #expect(style.fillOpacity == 0.45)
        #expect(style.lineWidth == 1)
    }

    @Test("A hydro reach carries the pilot's own width and colour")
    func hydroStyleComesFromThePilot() {
        let style = VectorFeatureStyles.hydroReach(.over50kW, upstreamAreaKm2: 15)

        #expect(style.strokeHex == "#64748b")
        #expect(style.strokeOpacity == 0.72)
        #expect(style.lineWidth == HydroPotentialPilot.lineStyle(
            upstreamAreaKm2: 15, potentialClass: .over50kW
        ).width)
    }
}
