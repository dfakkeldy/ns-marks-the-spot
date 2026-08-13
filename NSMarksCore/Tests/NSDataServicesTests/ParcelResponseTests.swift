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

        let parcel = try #require(collection.features.first)
        #expect(parcel.pid == "50334317")
        #expect(parcel.mappedAreaSquareMetres == 11057.27135)
        #expect(parcel.updatedAtEpochMilliseconds == 1_700_000_000_000)
        #expect(parcel.updatedAt == Date(timeIntervalSince1970: 1_700_000_000))
        #expect(parcel.parts.count == 1)
        // GeoJSON is [longitude, latitude], and getting that backwards puts
        // Nova Scotia in the Indian Ocean.
        #expect(parcel.parts.first?.first?.first == GeoPoint(lat: 44.6, lng: -63.5))
    }

    @Test func aQueryThatMatchedNothingIsAnAnswer() throws {
        // The distinction the whole type exists for: this is `returned-empty`,
        // and it is the only state that means the service looked and found no
        // parcel. Every `Failure` means it never looked.
        let collection = try ParcelResponse.decode(json("""
        {"type": "FeatureCollection", "features": []}
        """))

        #expect(collection.isEmpty)
        #expect(collection.features.isEmpty)
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

        #expect(collection.features.isEmpty)
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

        #expect(collection.features.isEmpty)
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

        let parcel = try #require(collection.features.first)
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

        #expect(collection.features.allSatisfy { $0.mappedAreaSquareMetres == nil })
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

        #expect(collection.features.first?.parts.count == 2)
    }

    @Test func aRingWithAPositionThatIsNotACoordinateIsDropped() throws {
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

        let parcel = try #require(collection.features.first)
        #expect(parcel.pid == "50334317")
        #expect(parcel.parts.isEmpty)
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
