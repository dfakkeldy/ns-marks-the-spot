import Foundation
import Testing

@testable import GeoCore

@Suite("Reading KML and GPX")
struct KmlGpxParseTests {
    private func kml(_ body: String) throws -> ParsedVector {
        try KmlParse.parse(Data("<kml xmlns=\"http://www.opengis.net/kml/2.2\">\(body)</kml>".utf8))
    }

    private func gpx(_ body: String) throws -> ParsedVector {
        try GpxParse.parse(Data("<gpx version=\"1.1\">\(body)</gpx>".utf8))
    }

    // MARK: - KML

    @Test func aPlacemarkBecomesAFeatureWithItsNameAndDescription() throws {
        let parsed = try kml(
            """
            <Document><Placemark>
              <name>Corner post</name>
              <description>Iron pin found</description>
              <Point><coordinates>-63.5,44.6,12</coordinates></Point>
            </Placemark></Document>
            """
        )
        #expect(parsed.featureCount == 1)
        let feature = try #require(parsed.features.first)
        #expect(feature.properties["name"] == .string("Corner post"))
        #expect(feature.properties["description"] == .string("Iron pin found"))
        guard case .point(let position)? = feature.geometry else {
            Issue.record("Expected a point.")
            return
        }
        #expect(position.lng == -63.5)
        #expect(position.lat == 44.6)
        #expect(position.altitude == 12)
    }

    /// KML writes longitude first inside a comma-separated tuple. Read the
    /// other way round the whole file lands in the wrong hemisphere without
    /// anything failing.
    @Test func kmlCoordinatesAreLongitudeFirst() throws {
        let parsed = try kml(
            """
            <Placemark><LineString><coordinates>
              -63.5,44.6 -63.4,44.7
            </coordinates></LineString></Placemark>
            """
        )
        guard case .lineString(let line)? = parsed.features.first?.geometry else {
            Issue.record("Expected a line.")
            return
        }
        #expect(line.count == 2)
        #expect(line[0].lng == -63.5)
        #expect(line[0].lat == 44.6)
    }

    @Test func aPolygonKeepsItsHoles() throws {
        let parsed = try kml(
            """
            <Placemark><Polygon>
              <outerBoundaryIs><LinearRing><coordinates>
                -63.0,44.0 -62.0,44.0 -62.0,45.0 -63.0,44.0
              </coordinates></LinearRing></outerBoundaryIs>
              <innerBoundaryIs><LinearRing><coordinates>
                -62.8,44.2 -62.4,44.2 -62.4,44.5 -62.8,44.2
              </coordinates></LinearRing></innerBoundaryIs>
            </Polygon></Placemark>
            """
        )
        guard case .polygon(let rings)? = parsed.features.first?.geometry else {
            Issue.record("Expected a polygon.")
            return
        }
        #expect(rings.count == 2)
        // The outer ring comes first: GeoJSON reads ring zero as the boundary
        // and the rest as holes, so a swap turns a woodlot into its own hole.
        #expect(rings[0][0].lng == -63.0)
        #expect(rings[1][0].lng == -62.8)
    }

    @Test func aMultiGeometryBecomesOneFeatureHoldingAllOfIt() throws {
        let parsed = try kml(
            """
            <Placemark><MultiGeometry>
              <Point><coordinates>-63,44</coordinates></Point>
              <LineString><coordinates>-63,44 -62,45</coordinates></LineString>
            </MultiGeometry></Placemark>
            """
        )
        guard case .collection(let parts)? = parsed.features.first?.geometry else {
            Issue.record("Expected a geometry collection.")
            return
        }
        #expect(parts.count == 2)
    }

    /// KML colours are `aabbggrr`: alpha first and the channels reversed from
    /// every other hex colour in this app. Copied straight across, a blue
    /// boundary is drawn red.
    @Test func kmlColoursAreReadInKmlsOrderAndWrittenInCssOrder() throws {
        let colour = try #require(KmlParse.color("7fb27200"))
        #expect(colour.hex == "#0072b2")
        #expect(abs(colour.opacity - 127.0 / 255) < 1e-9)
    }

    @Test(arguments: ["", "b27200", "zzzzzzzz", "7fb27200ff"])
    func aMalformedKmlColourIsNoColourAtAll(_ raw: String) {
        #expect(KmlParse.color(raw) == nil)
    }

    @Test func aReferencedStyleBecomesTheSimplestylePropertiesTheMapAlreadyReads() throws {
        let parsed = try kml(
            """
            <Document>
              <Style id="boundary">
                <LineStyle><color>ff0072b2</color><width>3</width></LineStyle>
                <PolyStyle><color>400072b2</color></PolyStyle>
              </Style>
              <Placemark><styleUrl>#boundary</styleUrl>
                <LineString><coordinates>-63,44 -62,45</coordinates></LineString>
              </Placemark>
            </Document>
            """
        )
        let properties = try #require(parsed.features.first?.properties)
        #expect(properties["stroke"] == .string("#b27200"))
        #expect(properties["stroke-width"] == .number(3))
        #expect(properties["fill"] == .string("#b27200"))
        let style = VectorStyle.style(
            for: try #require(parsed.features.first), layerColorHex: "#d55e00"
        )
        #expect(style.strokeHex == "#b27200")
    }

    @Test func aStyleMapResolvesThroughItsNormalState() throws {
        let parsed = try kml(
            """
            <Document>
              <Style id="on"><LineStyle><color>ff00ff00</color></LineStyle></Style>
              <StyleMap id="pair">
                <Pair><key>normal</key><styleUrl>#on</styleUrl></Pair>
                <Pair><key>highlight</key><styleUrl>#off</styleUrl></Pair>
              </StyleMap>
              <Placemark><styleUrl>#pair</styleUrl>
                <Point><coordinates>-63,44</coordinates></Point>
              </Placemark>
            </Document>
            """
        )
        #expect(parsed.features.first?.properties["stroke"] == .string("#00ff00"))
    }

    /// Descriptions come through CDATA as the author wrote them. Nothing
    /// downstream renders a property as markup, so keeping it verbatim shows
    /// the user their own text rather than a rewritten sentence.
    @Test func aCdataDescriptionArrivesWhole() throws {
        let parsed = try kml(
            """
            <Placemark>
              <description><![CDATA[<b>Deeded</b> 1911]]></description>
              <Point><coordinates>-63,44</coordinates></Point>
            </Placemark>
            """
        )
        #expect(
            parsed.features.first?.properties["description"] == .string("<b>Deeded</b> 1911")
        )
    }

    @Test func extendedDataBecomesProperties() throws {
        let parsed = try kml(
            """
            <Placemark>
              <ExtendedData>
                <Data name="PID"><value>40012345</value></Data>
                <SchemaData><SimpleData name="AAN">01234567</SimpleData></SchemaData>
              </ExtendedData>
              <Point><coordinates>-63,44</coordinates></Point>
            </Placemark>
            """
        )
        let properties = try #require(parsed.features.first?.properties)
        #expect(properties["PID"] == .string("40012345"))
        #expect(properties["AAN"] == .string("01234567"))
    }

    /// Placemarks keep the order the file wrote them in. That order decides
    /// which feature gets which generated id and what draws over what.
    @Test func placemarksKeepTheirDocumentOrder() throws {
        let parsed = try kml(
            """
            <Document>
              <Folder>
                <Placemark><name>one</name><Point><coordinates>-63,44</coordinates></Point></Placemark>
                <Placemark><name>two</name><Point><coordinates>-63,45</coordinates></Point></Placemark>
              </Folder>
              <Placemark><name>three</name><Point><coordinates>-63,46</coordinates></Point></Placemark>
            </Document>
            """
        )
        #expect(
            parsed.features.map { $0.properties["name"] }
                == [.string("one"), .string("two"), .string("three")]
        )
    }

    @Test func aKmlWithNoPlacemarksIsRefusedAsEmpty() throws {
        do {
            _ = try kml("<Document><name>Nothing here</name></Document>")
            Issue.record("Expected a refusal.")
        } catch let refusal as UserMapImportRefusal {
            #expect(refusal.code == .emptyFile)
        }
    }

    @Test func malformedXmlIsRefusedAsCorrupt() {
        #expect(throws: UserMapImportRefusal.self) {
            try KmlParse.parse(Data("<kml><Placemark>".utf8))
        }
    }

    // MARK: - GPX

    @Test func waypointsBecomePointsAndTracksBecomeLines() throws {
        let parsed = try gpx(
            """
            <wpt lat="44.6" lon="-63.5"><name>Gate</name><ele>15</ele></wpt>
            <trk><name>Walk in</name><trkseg>
              <trkpt lat="44.60" lon="-63.50"/>
              <trkpt lat="44.61" lon="-63.49"/>
            </trkseg></trk>
            """
        )
        #expect(parsed.featureCount == 2)
        guard case .point(let waypoint)? = parsed.features[0].geometry else {
            Issue.record("Expected a point.")
            return
        }
        // lat and lon are named attributes in GPX, so a swap here is a
        // different mistake from the coordinate-order one KML can make.
        #expect(waypoint.lat == 44.6)
        #expect(waypoint.lng == -63.5)
        #expect(waypoint.altitude == 15)
        #expect(parsed.features[1].properties["name"] == .string("Walk in"))
        guard case .lineString(let line)? = parsed.features[1].geometry else {
            Issue.record("Expected a line.")
            return
        }
        #expect(line.count == 2)
    }

    /// A paused-and-resumed recording is several segments of one track. Joined
    /// into one line, the map draws a straight path across ground the user
    /// never walked.
    @Test func aTracksSegmentsStaySeparate() throws {
        let parsed = try gpx(
            """
            <trk>
              <trkseg><trkpt lat="44.6" lon="-63.5"/><trkpt lat="44.61" lon="-63.5"/></trkseg>
              <trkseg><trkpt lat="44.7" lon="-63.4"/><trkpt lat="44.71" lon="-63.4"/></trkseg>
            </trk>
            """
        )
        guard case .multiLineString(let segments)? = parsed.features.first?.geometry else {
            Issue.record("Expected a multi-line.")
            return
        }
        #expect(segments.count == 2)
    }

    @Test func aRouteBecomesALine() throws {
        let parsed = try gpx(
            """
            <rte><name>Planned</name>
              <rtept lat="44.6" lon="-63.5"/><rtept lat="44.7" lon="-63.4"/>
            </rte>
            """
        )
        guard case .lineString(let line)? = parsed.features.first?.geometry else {
            Issue.record("Expected a line.")
            return
        }
        #expect(line.count == 2)
    }

    /// A single-point track cannot be drawn as a line, and a line of one point
    /// is not a line. Dropped rather than promoted to a point, which would put
    /// a marker where the user recorded a walk.
    @Test func aTrackWithOnePointIsNotDrawnAsSomethingElse() throws {
        do {
            _ = try gpx(#"<trk><trkseg><trkpt lat="44.6" lon="-63.5"/></trkseg></trk>"#)
            Issue.record("Expected a refusal.")
        } catch let refusal as UserMapImportRefusal {
            #expect(refusal.code == .emptyFile)
        }
    }

    // MARK: - Routing

    @Test func theRootElementDecidesTheFormat() throws {
        let kmlBytes = Data(
            #"<kml><Placemark><Point><coordinates>-63,44</coordinates></Point></Placemark></kml>"#
                .utf8
        )
        #expect(try XmlVectorParse.parse(kmlBytes).source == .kml)
        let gpxBytes = Data(#"<gpx><wpt lat="44" lon="-63"/></gpx>"#.utf8)
        #expect(try XmlVectorParse.parse(gpxBytes).source == .gpx)
    }

    /// A namespace that is missing, misspelled or invented is common in real
    /// exports, so routing reads the root element instead.
    @Test func aKmlWithNoNamespaceStillRoutesAsKml() throws {
        let bytes = Data(
            #"<kml><Placemark><Point><coordinates>-63,44</coordinates></Point></Placemark></kml>"#
                .utf8
        )
        #expect(try XmlVectorParse.parse(bytes).source == .kml)
    }

    @Test func otherXmlSaysWhichXmlFormatsAreRead() throws {
        let refusal = try #require(routingRefusal("<svg><rect/></svg>"))
        #expect(refusal.code == .unsupportedType)
        #expect(refusal.userMessage.contains("KML"))
        #expect(refusal.userMessage.contains("GPX"))
    }

    private func routingRefusal(_ xml: String) -> UserMapImportRefusal? {
        do {
            _ = try XmlVectorParse.parse(Data(xml.utf8))
            return nil
        } catch {
            return error
        }
    }
}
