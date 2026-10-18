import GeoCore
import NSDataServices
import Testing

@testable import ns_marks_the_spot

@Suite("Parcel selection")
struct ParcelSelectionTests {
    private static func triangle(offset: Double = 0) -> ParcelFeature.Boundary {
        .shape([[[
            GeoPoint(lat: 44.6 + offset, lng: -63.5),
            GeoPoint(lat: 44.6 + offset, lng: -63.4),
            GeoPoint(lat: 44.7 + offset, lng: -63.4),
        ]]])
    }

    private static func collection(_ features: ParcelFeature...) -> ParcelFeatureCollection {
        ParcelFeatureCollection(identifiedFeatures: features)
    }

    @Test func theSelectedParcelIsDrawnDifferentlyFromTheOnesAroundIt() {
        var selection = ParcelSelection()
        selection.merge(Self.collection(
            ParcelFeature(pid: "1", boundary: Self.triangle()),
            ParcelFeature(pid: "2", boundary: Self.triangle(offset: 0.2))
        ))
        selection.select("2")

        #expect(selection.shapes.map(\.role) == [.context, .selected])
    }

    @Test func theSameParcelArrivingTwiceIsNotLoadedTwice() {
        // `ParcelResponse.mappedAreaSquareMetres` sums across features, so a
        // parcel held twice is a property reported at twice its size.
        var selection = ParcelSelection()
        let feature = ParcelFeature(
            pid: "1", mappedAreaSquareMetres: 4046.86, boundary: Self.triangle()
        )
        selection.merge(Self.collection(feature))
        selection.merge(Self.collection(feature))

        #expect(selection.features.count == 1)
        #expect(ParcelResponse.mappedAreaSquareMetres(
            forPID: "1",
            in: ParcelFeatureCollection(identifiedFeatures: selection.features)
        ) == 4046.86)
    }

    @Test func aParcelSplitAcrossFeaturesKeepsBothHalves() {
        // Same PID, different shapes: a lot cut by a road. Deduplicating on the
        // identifier alone would lose half the property.
        var selection = ParcelSelection()
        selection.merge(Self.collection(
            ParcelFeature(pid: "1", boundary: Self.triangle()),
            ParcelFeature(pid: "1", boundary: Self.triangle(offset: 0.5))
        ))

        #expect(selection.features.count == 2)
        #expect(selection.shapes.count == 2)
    }

    @Test func aParcelWithNothingToDrawIsSaidRatherThanShown() {
        // The map shows the same blank space for "no parcel there" and "the
        // parcel is here and we have no outline for it". Only one of those is a
        // fact about the property, so the second one has to be words.
        var selection = ParcelSelection()
        selection.merge(Self.collection(ParcelFeature(pid: "1", boundary: .unreadable)))
        selection.select("1")

        #expect(selection.shapes.isEmpty)
        let notice = selection.boundaryNotice
        #expect(notice?.contains("could not read") == true)
        #expect(notice?.contains("1") == true)
    }

    @Test func aParcelTheServiceSentNoShapeForSaysThatInstead() {
        var selection = ParcelSelection()
        selection.merge(Self.collection(ParcelFeature(pid: "1", boundary: .notSupplied)))
        selection.select("1")

        #expect(selection.boundaryNotice?.contains("without a mapped boundary") == true)
    }

    @Test func aParcelOnlyPartlyDrawnSaysHowMuchOfItWasSearched() {
        // The worst of the three: an outline appears, every lookup below runs
        // inside it, and without this sentence nothing on screen says that a
        // piece of the parcel was never searched at all.
        var selection = ParcelSelection()
        selection.merge(Self.collection(
            ParcelFeature(pid: "1", boundary: Self.triangle()),
            ParcelFeature(pid: "1", boundary: .unreadable)
        ))
        selection.select("1")

        let notice = selection.boundaryNotice
        #expect(notice?.contains("2 pieces") == true)
        #expect(notice?.contains("1 of them") == true)
        #expect(notice?.contains("could not read") == true)
        #expect(notice?.contains("inside the pieces that are drawn") == true)
    }

    @Test func aParcelThatDrawsNeedsNoExplanation() {
        var selection = ParcelSelection()
        selection.merge(Self.collection(ParcelFeature(pid: "1", boundary: Self.triangle())))
        selection.select("1")

        #expect(selection.boundaryNotice == nil)
    }

    @Test func aParcelThatIsNotLoadedIsNotExplainedAway() {
        // Nothing is known about this PID yet — the lookup has not returned, or
        // returned nothing. Saying "came back without a mapped boundary" would
        // be describing a reply that never arrived.
        var selection = ParcelSelection()
        selection.select("1")

        #expect(selection.boundaryNotice == nil)
        #expect(selection.holds(pid: "1") == false)
    }

    @Test func focusingASplitParcelFramesEveryPartOfIt() {
        var selection = ParcelSelection()
        selection.merge(Self.collection(
            ParcelFeature(pid: "1", boundary: Self.triangle()),
            ParcelFeature(pid: "1", boundary: Self.triangle(offset: 0.5))
        ))
        selection.select("1")

        let bounds = selection.selectedBounds
        #expect(bounds?.minLatitude == 44.6)
        #expect(bounds?.maxLatitude == 45.2)
        #expect(bounds?.minLongitude == -63.5)
        #expect(bounds?.maxLongitude == -63.4)
    }

    @Test func aParcelWithNoShapeHasNothingToFocusOn() {
        var selection = ParcelSelection()
        selection.merge(Self.collection(ParcelFeature(pid: "1", boundary: .unreadable)))
        selection.select("1")

        #expect(selection.selectedBounds == nil)
    }
}
