import Foundation
import Testing

@testable import NSDataServices

@Suite("Mapped feature replies")
struct MappedFeatureResponseTests {
    private static let roadLayer = MappedFeatureQuery.Layer(
        layerID: .roads, sublayer: 8, fallbackKind: "Road or trail",
        fields: "FEAT_DESC,STREET,RTE_NO,ROADC_DESC"
    )

    private static func reply(_ attributes: String) -> Data {
        Data(#"{"features":[{"attributes":\#(attributes)}]}"#.utf8)
    }

    private static func features(
        _ attributes: String,
        relationship: MappedFeatureQuery.Relationship = .intersects
    ) throws -> [MappedFeatureResponse.MappedFeature] {
        try MappedFeatureResponse.features(
            from: reply(attributes), layer: roadLayer, relationship: relationship
        )
    }

    @Test func aNamedRoadIsCalledByItsName() throws {
        let features = try Self.features(
            #"{"STREET":"Trunk 19","FEAT_DESC":"Road - Paved, undivided","ROADC_DESC":"Arterial"}"#
        )

        #expect(features == [
            .init(name: "Trunk 19", kind: "Arterial", relationship: .intersects)
        ])
    }

    @Test func anUnnamedRoadIsCalledByWhatTheServiceSaysItIs() throws {
        let features = try Self.features(#"{"FEAT_DESC":"Road - Paved, undivided"}"#)

        // The qualifier after the dash is dropped and the rest sentence-cased,
        // and the description becomes the name — so it is not also repeated as
        // the kind.
        #expect(features == [
            .init(name: "Road", kind: "Road or trail", relationship: .intersects)
        ])
    }

    @Test func aFeatureTheServiceDescribesInNoWayIsNamedForTheSublayerThatAnsweredIt() throws {
        // "Road or trail" is a fact — that sublayer returned it. Anything more
        // specific would be this reader deciding what the feature is.
        let features = try Self.features(#"{"FEAT_DESC":null,"STREET":"  "}"#)

        #expect(features == [
            .init(name: "Road or trail", kind: "Road or trail", relationship: .intersects)
        ])
    }

    @Test(arguments: [
        ("Watercourse line", "Watercourse"),
        ("Shoreline point", "Shoreline"),
        ("Wetland polygon", "Wetland"),
        ("BRIDGE - MULTI SPAN", "Bridge"),
        ("Road - Paved, undivided", "Road"),
        ("Culvert", "Culvert"),
    ])
    func aDescriptionIsReducedToTheFeatureItself(raw: String, expected: String) throws {
        let features = try Self.features(#"{"FEAT_DESC":"\#(raw)"}"#)

        #expect(features.first?.name == expected)
    }

    @Test func aSuffixInsideAWordIsNotAGeometryType() throws {
        // The web's suffix rule requires whitespace before "line", so a name
        // ending in it survives. Trimming by substring instead would turn a
        // shoreline into a "Shore".
        let features = try Self.features(#"{"FEAT_DESC":"Pipeline"}"#)

        #expect(features.first?.name == "Pipeline")
    }

    @Test func aLoneHyphenIsAnEmptyField() throws {
        // NSTDB writes "-" where it has nothing. Taken literally it becomes a
        // road called "-".
        let features = try Self.features(#"{"STREET":"-","FEAT_DESC":"Road - Paved"}"#)

        #expect(features.first?.name == "Road")
    }

    @Test func aRouteNumberSentAsANumberIsNotAName() throws {
        // The web's `cleanValue` takes strings only, so a numeric RTE_NO is
        // ignored there. Reading it here would give the two surfaces different
        // names for the same road.
        let features = try Self.features(#"{"RTE_NO":19,"FEAT_DESC":"Road - Paved"}"#)

        #expect(features.first?.name == "Road")
    }

    @Test func theSameFeatureFoundTwiceIsListedOnceAsCrossing() {
        // Roads come back from both the intersecting and the adjacent query.
        // Keeping the first is what makes a road that crosses the parcel say so
        // rather than being demoted to "nearby".
        let crossing = MappedFeatureResponse.MappedFeature(
            name: "Trunk 19", kind: "Arterial", relationship: .intersects
        )
        let nearby = MappedFeatureResponse.MappedFeature(
            name: "trunk 19", kind: "arterial", relationship: .adjacent
        )

        #expect(MappedFeatureResponse.unique([crossing, nearby]) == [crossing])
    }

    @Test func twoDifferentRoadsAreBothKept() {
        let first = MappedFeatureResponse.MappedFeature(
            name: "Trunk 19", kind: "Arterial", relationship: .intersects
        )
        let second = MappedFeatureResponse.MappedFeature(
            name: "Trunk 19", kind: "Local", relationship: .intersects
        )

        #expect(MappedFeatureResponse.unique([first, second]).count == 2)
    }

    @Test func aServiceErrorUnderA200IsNotAnEmptyList() {
        // The same ArcGIS habit the parcel reader guards against. Read as an
        // empty feature list, it becomes "nothing is mapped on this parcel".
        #expect(throws: MappedFeatureResponse.Failure.serviceError(
            code: 400, message: "Unable to complete operation."
        )) {
            try MappedFeatureResponse.features(
                from: Data(#"{"error":{"code":400,"message":"Unable to complete operation."}}"#.utf8),
                layer: Self.roadLayer,
                relationship: .intersects
            )
        }
    }

    @Test func aReplyWithNeitherFeaturesNorAnErrorIsNotAnEmptyList() {
        // A shape this reader does not recognise. Treating a missing `features`
        // key as an empty array would report "nothing mapped here" for a reply
        // that never said so.
        #expect(throws: MappedFeatureResponse.Failure.malformed) {
            try MappedFeatureResponse.features(
                from: Data(#"{"displayFieldName":"FEAT_DESC"}"#.utf8),
                layer: Self.roadLayer,
                relationship: .intersects
            )
        }
    }

    @Test func aReplyThatIsNotJSONIsNotAnEmptyList() {
        #expect(throws: MappedFeatureResponse.Failure.malformed) {
            try MappedFeatureResponse.features(
                from: Data("<html>502 Bad Gateway</html>".utf8),
                layer: Self.roadLayer,
                relationship: .intersects
            )
        }
    }

    @Test func anEmptyFeatureListIsAnAnswer() throws {
        // The one honest empty: the service looked at this parcel and had
        // nothing mapped on it.
        let features = try MappedFeatureResponse.features(
            from: Data(#"{"features":[]}"#.utf8),
            layer: Self.roadLayer,
            relationship: .intersects
        )

        #expect(features.isEmpty)
    }
}
