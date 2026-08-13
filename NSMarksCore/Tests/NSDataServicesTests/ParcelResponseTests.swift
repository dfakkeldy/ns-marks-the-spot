import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// Reading NSPRD's replies is where an evidence boundary is easiest to lose:
/// every way of failing to get an answer looks, to a careless reader, exactly
/// like being told there is nothing there.
@Suite("NSPRD replies")
struct ParcelResponseTests {
    private func json(_ string: String) -> Data {
        Data(string.utf8)
    }

    @Test func aParcelIsReadWithItsIdentifierAreaAndShape() throws {
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "type": "Feature",
              "properties": {
                "PID": "50334317",
                "UPDAT_DATE": 1700000000000,
                "SHAPE.AREA": 11057.27135
              },
              "geometry": {
                "type": "Polygon",
                "coordinates": [[[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]]]
              }
            }
          ]
        }
        """))

        let parcel = try #require(collection.identifiedFeatures.first)
        #expect(parcel.pid == "50334317")
        #expect(parcel.mappedAreaSquareMetres == 11057.27135)
        #expect(parcel.updatedAtEpochMilliseconds == 1_700_000_000_000)
        #expect(parcel.updatedAt == Date(timeIntervalSince1970: 1_700_000_000))
        // The whole ring, not its first corner: an outline that kept only its
        // first point would satisfy any count-and-first-coordinate check while
        // describing a different piece of ground.
        //
        // GeoJSON is [longitude, latitude], and getting that backwards puts
        // Nova Scotia in the Indian Ocean.
        #expect(parcel.boundary == .shape([[[
            GeoPoint(lat: 44.6, lng: -63.5),
            GeoPoint(lat: 44.6, lng: -63.4),
            GeoPoint(lat: 44.7, lng: -63.4),
            GeoPoint(lat: 44.6, lng: -63.5),
        ]]]))
    }

    @Test func aQueryThatMatchedNothingIsAnAnswer() throws {
        // The distinction the whole type exists for: this is `returned-empty`,
        // and it is the only state that means the service looked and found no
        // parcel. Every `Failure` means it never looked.
        let collection = try ParcelResponse.decode(json("""
        {"type": "FeatureCollection", "features": []}
        """))

        #expect(collection.isEmpty)
        #expect(collection.identifiedFeatures.isEmpty)
    }

    @Test func anErrorBodyIsNotAnEmptyResult() {
        // ArcGIS answers a rejected query with HTTP 200 and this. A reader that
        // only checked the status code would report "no parcel here" for a
        // question the service refused to run.
        #expect(throws: ParcelResponse.Failure.serviceError(
            code: 400, message: "Unable to complete operation."
        )) {
            try ParcelResponse.decode(json("""
            {"error": {"code": 400, "message": "Unable to complete operation.", "details": []}}
            """))
        }
    }

    @Test func anErrorBodyBeatsAMissingFeatureList() {
        // Reported as what the service said rather than as a shape problem: an
        // error payload has no `features`, and checking the shape first would
        // throw away the service's own account of what went wrong.
        #expect(throws: ParcelResponse.Failure.serviceError(code: 498, message: "Invalid token.")) {
            try ParcelResponse.decode(json("""
            {"type": "FeatureCollection", "error": {"code": 498, "message": "Invalid token."}}
            """))
        }
    }

    @Test func somethingThatIsNotAFeatureCollectionIsRefused() {
        #expect(throws: ParcelResponse.Failure.notAFeatureCollection) {
            try ParcelResponse.decode(json("""
            {"type": "Feature", "properties": {"PID": "50334317"}}
            """))
        }
    }

    @Test func bytesThatAreNotJSONAreRefused() {
        #expect(throws: ParcelResponse.Failure.malformedJSON) {
            try ParcelResponse.decode(json("<html><body>502 Bad Gateway</body></html>"))
        }
    }

    @Test func aShapeWithNoReadablePIDIsCountedRatherThanDropped() throws {
        // Dropping it in silence would let "the service returned something we
        // could not identify" arrive at the user as "there is no parcel here".
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {"properties": {"PID": null, "SHAPE.AREA": 800}, "geometry": null},
            {"properties": {"SHAPE.AREA": 900}, "geometry": null}
          ]
        }
        """))

        #expect(collection.identifiedFeatures.isEmpty)
        #expect(collection.unidentifiedFeatureCount == 2)
        #expect(collection.isEmpty == false)
    }

    @Test func aNumericPIDIsNotCoercedIntoAnIdentifier() throws {
        // `01234567` read as a number and written back is `1234567` — seven
        // digits, and if it were padded back out it would name a different real
        // parcel. An id we cannot read is safer than one we repaired.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [{"properties": {"PID": 1234567}, "geometry": null}]
        }
        """))

        #expect(collection.identifiedFeatures.isEmpty)
        #expect(collection.unidentifiedFeatureCount == 1)
    }

    @Test func anUnreadableFieldCostsThatFieldAndNotTheParcel() throws {
        // A parcel with a readable id and an unreadable area is still a parcel
        // worth showing; refusing the whole reply would turn a cosmetic anomaly
        // into an outage.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [{"properties": {"PID": "50334317", "SHAPE.AREA": "n/a"}, "geometry": null}]
        }
        """))

        let parcel = try #require(collection.identifiedFeatures.first)
        #expect(parcel.pid == "50334317")
        #expect(parcel.mappedAreaSquareMetres == nil)
    }

    @Test func anAreaOfZeroIsNotAnArea() throws {
        // Rendering "0.00 acres" reads as a measurement. It is the absence of
        // one, and the web treats it that way too.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {"properties": {"PID": "1", "SHAPE.AREA": 0}, "geometry": null},
            {"properties": {"PID": "2", "SHAPE.AREA": -5}, "geometry": null}
          ]
        }
        """))

        #expect(collection.identifiedFeatures.allSatisfy { $0.mappedAreaSquareMetres == nil })
        #expect(ParcelResponse.mappedAreaSquareMetres(forPID: "1", in: collection) == nil)
    }

    @Test func aMultiPartParcelKeepsEveryPart() throws {
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "50334317"},
              "geometry": {
                "type": "MultiPolygon",
                "coordinates": [
                  [[[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]]],
                  [[[-63.3, 44.6], [-63.2, 44.6], [-63.2, 44.7], [-63.3, 44.6]]]
                ]
              }
            }
          ]
        }
        """))

        // Both parts, each with its own outline: two copies of the first part
        // would pass a count check while moving half the property.
        #expect(collection.identifiedFeatures.first?.boundary == .shape([
            [[
                GeoPoint(lat: 44.6, lng: -63.5),
                GeoPoint(lat: 44.6, lng: -63.4),
                GeoPoint(lat: 44.7, lng: -63.4),
                GeoPoint(lat: 44.6, lng: -63.5),
            ]],
            [[
                GeoPoint(lat: 44.6, lng: -63.3),
                GeoPoint(lat: 44.6, lng: -63.2),
                GeoPoint(lat: 44.7, lng: -63.2),
                GeoPoint(lat: 44.6, lng: -63.3),
            ]],
        ]))
    }

    @Test func aHoleIsKeptAsAHoleRatherThanBecomingTheOutline() throws {
        // Rings are positional: the first is the outline and the rest are cut
        // out of it. Reordering or losing one changes which ground the parcel
        // covers.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "50334317"},
              "geometry": {
                "type": "Polygon",
                "coordinates": [
                  [[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]],
                  [[-63.47, 44.62], [-63.45, 44.62], [-63.45, 44.64], [-63.47, 44.62]]
                ]
              }
            }
          ]
        }
        """))

        let parcel = try #require(collection.identifiedFeatures.first)
        #expect(parcel.boundary.parts.first?.count == 2)
        #expect(parcel.boundary.parts.first?.first?.first == GeoPoint(lat: 44.6, lng: -63.5))
        #expect(parcel.boundary.parts.first?.last?.first == GeoPoint(lat: 44.62, lng: -63.47))
    }

    @Test func aRingWithAPositionThatIsNotACoordinateCondemnsTheWholeBoundary() throws {
        // Keeping the good positions would hand back a closed shape with a
        // different outline from the one the service sent — a boundary nobody
        // drew, on a map people use to decide where a boundary is.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "50334317"},
              "geometry": {
                "type": "Polygon",
                "coordinates": [[[-63.5, 44.6], [-63.4, 991.0], [-63.4, 44.7], [-63.5, 44.6]]]
              }
            }
          ]
        }
        """))

        let parcel = try #require(collection.identifiedFeatures.first)
        #expect(parcel.pid == "50334317")
        // Unreadable, not absent. The record still exists and the PID is still
        // evidence; what is missing is a shape, and saying so is different from
        // showing a parcel the service never drew.
        #expect(parcel.boundary == .unreadable)
    }

    @Test func anUnreadableOutlineIsNotReplacedByItsHole() throws {
        // The failure this shape is built for: drop the bad outline and keep
        // the good hole, and the hole — a piece of ground explicitly *not* in
        // the parcel — becomes the parcel.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "50334317"},
              "geometry": {
                "type": "Polygon",
                "coordinates": [
                  [[-63.5, 44.6], [-63.4, 991.0], [-63.4, 44.7], [-63.5, 44.6]],
                  [[-63.47, 44.62], [-63.45, 44.62], [-63.45, 44.64], [-63.47, 44.62]]
                ]
              }
            }
          ]
        }
        """))

        #expect(collection.identifiedFeatures.first?.boundary == .unreadable)
    }

    @Test func anUnreadableHoleIsNotQuietlyFilledIn() throws {
        // The mirror image: keep the outline, lose the hole, and the map claims
        // land the service cut out of the parcel.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "50334317"},
              "geometry": {
                "type": "Polygon",
                "coordinates": [
                  [[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]],
                  [[-63.47, 44.62], [-63.45, "44.62"], [-63.45, 44.64], [-63.47, 44.62]]
                ]
              }
            }
          ]
        }
        """))

        #expect(collection.identifiedFeatures.first?.boundary == .unreadable)
    }

    @Test func oneUnreadablePartCondemnsTheOtherParts() throws {
        // Keeping the readable half of a parcel split by a road would show one
        // side of the road as the whole property.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "50334317"},
              "geometry": {
                "type": "MultiPolygon",
                "coordinates": [
                  [[[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]]],
                  [[[-63.3, 44.6], [-63.2, null], [-63.2, 44.7], [-63.3, 44.6]]]
                ]
              }
            }
          ]
        }
        """))

        #expect(collection.identifiedFeatures.first?.boundary == .unreadable)
    }

    @Test func aRunOfPositionsTooShortToEncloseAnythingIsNotABoundary() throws {
        // `PolygonHitTest` closes every ring with a modulo index, so two points
        // would become a line that answers "inside" to a click landing on it,
        // and one point a spot that does. Either is a parcel hit where the
        // service drew no parcel.
        for coordinates in [
            "[[[-63.5, 44.6], [-63.4, 44.6]]]",
            "[[[-63.5, 44.6]]]",
            "[[[-63.5, 44.6], [-63.4, 44.6], [-63.5, 44.6]]]",
            "[[]]",
            "[]",
        ] {
            let collection = try ParcelResponse.decode(json("""
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "properties": {"PID": "50334317"},
                  "geometry": {"type": "Polygon", "coordinates": \(coordinates)}
                }
              ]
            }
            """))

            #expect(collection.identifiedFeatures.first?.boundary == .unreadable)
        }
    }

    @Test func aShapeThisReaderCannotUseIsNotTheSameAsNoShape() throws {
        // A parcel layer answering with a GeometryCollection is an anomaly, and
        // the web — which hands whatever arrived to Leaflet — may still draw it.
        // Reporting "no shape" would hide a disagreement between the two
        // surfaces about the same bytes.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "1"},
              "geometry": {
                "type": "GeometryCollection",
                "geometries": [
                  {
                    "type": "Polygon",
                    "coordinates": [[[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]]]
                  }
                ]
              }
            },
            {"properties": {"PID": "2"}, "geometry": null}
          ]
        }
        """))

        #expect(collection.identifiedFeatures.first?.boundary == .unreadable)
        #expect(collection.identifiedFeatures.last?.boundary == .notSupplied)
        // Both draw nothing, and only one of them is the service saying it has
        // no shape for this record.
        #expect(collection.identifiedFeatures.allSatisfy { $0.boundary.parts.isEmpty })
    }

    @Test func areasThatOverflowWhenAddedAreNotATotal() throws {
        // Each of these passes the per-feature finite check and the sum does
        // not. An infinite total rendered as acres is a number nobody measured.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {"properties": {"PID": "1", "SHAPE.AREA": 1.5e308}, "geometry": null},
            {"properties": {"PID": "1", "SHAPE.AREA": 1.5e308}, "geometry": null}
          ]
        }
        """))

        #expect(ParcelResponse.mappedAreaSquareMetres(forPID: "1", in: collection) == nil)
    }

    @Test func aParcelSplitAcrossFeaturesHasItsAreaSummed() throws {
        // A parcel cut by a road comes back as several shapes under one PID.
        // Reading the area off the first one would under-report the property.
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [
            {"properties": {"PID": "50334317", "SHAPE.AREA": 100000}, "geometry": null},
            {"properties": {"PID": "50334317", "SHAPE.AREA": 11057.27135}, "geometry": null},
            {"properties": {"PID": "50203256", "SHAPE.AREA": 728.4341}, "geometry": null}
          ]
        }
        """))

        let area = try #require(
            ParcelResponse.mappedAreaSquareMetres(forPID: "50334317", in: collection)
        )
        #expect(area == 111_057.27135)
        // The web's `mappedAreaForPid` on the same numbers.
        #expect(ParcelResponse.acres(fromSquareMetres: area) == 27.44)
    }

    @Test func anotherParcelsAreaIsNeverBorrowed() throws {
        let collection = try ParcelResponse.decode(json("""
        {
          "type": "FeatureCollection",
          "features": [{"properties": {"PID": "50334317", "SHAPE.AREA": 1000}, "geometry": null}]
        }
        """))

        #expect(ParcelResponse.mappedAreaSquareMetres(forPID: "50334318", in: collection) == nil)
        #expect(ParcelResponse.mappedAreaSquareMetres(forPID: "5033431", in: collection) == nil)
    }
}
