import Foundation
import Testing

@testable import GeoCore

@Suite("Reading a zipped shapefile")
struct ShapefileParseTests {
    /// A real zipped shapefile: one square parcel in NAD83 / UTM zone 20N with
    /// a two-column attribute table and a full ESRI `.prj`. Deflated by the
    /// `zip` tool, so this exercises the archive reader as well.
    private static let zip = Data(
        base64Encoded: """
            UEsDBBQAAAAIAGJrD11pWUl7PAAAAOwAAAALAAAAcGFyY2Vscy5zaHBjYFDnYsAOyl4wMzCwQjkN\
            06QdQbTCnSAwHTAPwp8L5RMAjEDsQIxZIIWsSBrR1cL4c3G4A8ZHVw/iAwBQSwMEFAAAAAgAYmsP\
            XdZJOss2AAAAgQAAAAsAAABwYXJjZWxzLmRiZmOuY2RkZGBgSGSQZ8AG/Bx9XaFMZxAhgibvGOTq\
            CFMKIrjQ5HkVwvPzU3LySxQwgZGpnoEUAFBLAwQUAAAACABiaw9d5NJQevcAAABtAQAACwAAAHBh\
            cmNlbHMucHJqbY/LasMwFER/xdy1murhR7Q0sXAc8ANZXhRjjHBEY6hlUNwW+vVVCs3KyzszzLnT\
            yPpyanuo0uzIgtegU2Xws1oTUFwBykWdP11AWaq60l+r225juhg3T9qOmd4+l5HwR6JtzkLWRdZD\
            LtvAaxhQzJIjYQmi/HigUUIpJZigtFPnWhbqrQfRtDkgSDDhMAw7TkzjP6eRRSn8A7kzxn7P0w0Q\
            HlBXFaqHq3n3qhcOmCRhxCinEeE8ZGyvMXw21hdxUkVd9aCctvcv4+5mLI2b9LY68IlUpqVQQvYw\
            Gbs5/TE+hl9nbQG9xOyfv5jNeTzZo3kYxR73C1BLAQIUAxQAAAAIAGJrD11pWUl7PAAAAOwAAAAL\
            AAAAAAAAAAAAAACkgQAAAABwYXJjZWxzLnNocFBLAQIUAxQAAAAIAGJrD13WSTrLNgAAAIEAAAAL\
            AAAAAAAAAAAAAACkgWUAAABwYXJjZWxzLmRiZlBLAQIUAxQAAAAIAGJrD13k0lB69wAAAG0BAAAL\
            AAAAAAAAAAAAAACkgcQAAABwYXJjZWxzLnByalBLBQYAAAAAAwADAKsAAADkAQAAAAA=
            """,
        options: .ignoreUnknownCharacters
    )!

    /// The projection is the whole point. shpjs passes coordinates through
    /// untouched when a `.prj` is missing, which drops a UTM shapefile in the
    /// Gulf of Guinea; here the eastings have to come back as Nova Scotia.
    @Test func aUtmShapefileArrivesInNovaScotia() throws {
        let layers = try ShapefileParse.parse(zip: Self.zip)
        #expect(layers.count == 1)
        let layer = try #require(layers.first)
        #expect(layer.name == "parcels")
        #expect(layer.note == nil)
        let box = try #require(layer.parsed.bbox)
        #expect(box.west > -64.0 && box.west < -63.0)
        #expect(box.south > 44.5 && box.south < 45.0)
        // Half a kilometre square on the ground stays about half a kilometre.
        #expect(abs((box.north - box.south) * 111_320 - 500) < 20)
    }

    @Test func theAttributeTableArrivesWithIt() throws {
        let layers = try ShapefileParse.parse(zip: Self.zip)
        let properties = try #require(layers.first?.parsed.features.first?.properties)
        #expect(properties["NAME"] == .string("Woodlot"))
        // A numeric column comes back a number, not the text of one.
        #expect(properties["AREA"] == .number(25))
    }

    @Test func aPolygonComesBackAsAPolygon() throws {
        let layers = try ShapefileParse.parse(zip: Self.zip)
        guard case .polygon(let rings)? = layers.first?.parsed.features.first?.geometry else {
            Issue.record("Expected a polygon.")
            return
        }
        #expect(rings.count == 1)
        #expect(rings[0].count == 5)
    }

    // MARK: - Rings

    private func ring(_ points: [(Double, Double)]) -> [GeoJsonPosition] {
        points.map { GeoJsonPosition(lng: $0.0, lat: $0.1) }
    }

    /// A shapefile carries every ring flat, and only the winding says which is
    /// a boundary and which a hole. Read the wrong way round this does not
    /// fail — it draws one parcel as a hole in its neighbour.
    @Test func aClockwiseRingIsABoundaryAndAcounterClockwiseOneIsAHole() throws {
        let outer = ring([(0, 0), (0, 10), (10, 10), (10, 0), (0, 0)])
        let hole = ring([(2, 2), (8, 2), (8, 8), (2, 8), (2, 2)])
        guard case .polygon(let rings)? = ShapefileParse.polygon(from: [outer, hole]) else {
            Issue.record("Expected one polygon with a hole.")
            return
        }
        #expect(rings.count == 2)
        #expect(rings[0] == outer)
    }

    @Test func twoBoundariesBecomeTwoPolygons() throws {
        let first = ring([(0, 0), (0, 10), (10, 10), (10, 0), (0, 0)])
        let second = ring([(20, 0), (20, 10), (30, 10), (30, 0), (20, 0)])
        guard case .multiPolygon(let polygons)? = ShapefileParse.polygon(from: [first, second])
        else {
            Issue.record("Expected two polygons.")
            return
        }
        #expect(polygons.count == 2)
        #expect(polygons[0].count == 1)
        #expect(polygons[1].count == 1)
    }

    /// A hole with no boundary before it is malformed. Drawn as its own shape
    /// rather than dropped: either way the file is wrong, and this way the
    /// user can see where their ground is.
    @Test func aHoleWithNothingToBelongToIsStillDrawn() throws {
        let hole = ring([(2, 2), (8, 2), (8, 8), (2, 8), (2, 2)])
        #expect(ShapefileParse.polygon(from: [hole]) != nil)
    }

    @Test func aRingWithTooFewPointsIsNotAPolygon() {
        #expect(ShapefileParse.polygon(from: [ring([(0, 0), (1, 1), (0, 0)])]) == nil)
        #expect(ShapefileParse.polygon(from: []) == nil)
    }

    // MARK: - Coordinate systems

    @Test func theAuthorityCodeIsReadFromTheOutermostSystem() {
        let wkt = """
            PROJCS["NAD83 / UTM zone 20N",GEOGCS["NAD83",DATUM["North_American_Datum_1983",\
            SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],\
            AUTHORITY["EPSG","6269"]],AUTHORITY["EPSG","4269"]],AUTHORITY["EPSG","26920"]]
            """
        // The inner authorities name the spheroid, the datum and the geographic
        // base. Reading one of those would call a UTM file geographic and hand
        // its eastings to the map as degrees.
        #expect(ShapefileParse.epsgName(inWkt: wkt) == "EPSG:26920")
    }

    /// ESRI writes `.prj` files with no authority block at all, so the names
    /// have to be matched directly.
    @Test(arguments: [
        ("PROJCS[\"NAD_1983_UTM_Zone_20N\",GEOGCS[\"GCS_North_American_1983\"]]", "EPSG:26920"),
        ("GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\"]]", "EPSG:4326"),
        ("PROJCS[\"NAD_1983_CSRS_UTM_Zone_20N\"]", "EPSG:2961"),
    ])
    func esriNamesAreRecognisedWithoutAnAuthority(_ wkt: String, _ expected: String) {
        #expect(ShapefileParse.epsgName(inWkt: wkt) == expected)
    }

    /// A projected file whose WKT also contains its geographic base must not
    /// match the geographic name first — that reads metres as degrees.
    @Test func aProjectedFileIsNeverMistakenForItsGeographicBase() {
        let wkt = "PROJCS[\"NAD_1983_UTM_Zone_20N\",GEOGCS[\"GCS_North_American_1983\"]]"
        #expect(ShapefileParse.epsgName(inWkt: wkt) == "EPSG:26920")
    }

    @Test(arguments: [
        "PROJCS[\"Lambert_Conformal_Conic\",AUTHORITY[\"EPSG\",\"3347\"]]",
        "not a projection at all",
        "",
    ])
    func aSystemThisAppDoesNotReadIsNotGuessedAt(_ wkt: String) {
        #expect(ShapefileParse.epsgName(inWkt: wkt) == nil)
    }

    /// The same shapefile with its `.prj` left out. This is the file shpjs
    /// would pass through untouched, dropping a UTM parcel into the Gulf of
    /// Guinea; nothing in the bytes distinguishes metres from degrees, so it
    /// is refused before any geometry is read.
    private static let withoutProjection = Data(
        base64Encoded: """
            UEsDBBQAAAAIAGJrD11pWUl7PAAAAOwAAAALAAAAcGFyY2Vscy5zaHBjYFDnYsAOyl4wMzCwQjkN\
            06QdQbTCnSAwHTAPwp8L5RMAjEDsQIxZIIWsSBrR1cL4c3G4A8ZHVw/iAwBQSwMEFAAAAAgAYmsP\
            XdZJOss2AAAAgQAAAAsAAABwYXJjZWxzLmRiZmOuY2RkZGBgSGSQZ8AG/Bx9XaFMZxAhgibvGOTq\
            CFMKIrjQ5HkVwvPzU3LySxQwgZGpnoEUAFBLAQIUAxQAAAAIAGJrD11pWUl7PAAAAOwAAAALAAAA\
            AAAAAAAAAACkgQAAAABwYXJjZWxzLnNocFBLAQIUAxQAAAAIAGJrD13WSTrLNgAAAIEAAAALAAAA\
            AAAAAAAAAACkgWUAAABwYXJjZWxzLmRiZlBLBQYAAAAAAgACAHIAAADEAAAAAAA=
            """,
        options: .ignoreUnknownCharacters
    )!

    @Test func aShapefileThatDoesNotSayWhatSystemItUsesIsRefused() throws {
        var refused: UserMapImportRefusal?
        do {
            _ = try ShapefileParse.parse(zip: Self.withoutProjection)
            Issue.record("Expected a refusal.")
        } catch {
            refused = error
        }
        let refusal = try #require(refused)
        #expect(refusal.code == .unsupportedCrs)
        #expect(refusal.userMessage.contains(".prj"))
    }
}
