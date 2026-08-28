import Foundation
import Testing

@testable import NSDataServices

/// The query and formatting halves of the Civic Address File port, checked
/// against the cases in the web's `civicAddresses.test.ts`. Where a value is
/// pinned to an exact string it is because the same text has to find the same
/// address, or read the same way, on both surfaces.
@Suite("Civic address queries")
struct CivicAddressQueryTests {
    /// A complete record as the file sends it, column names and all, so these
    /// cases exercise the same trimming the fetcher does rather than a
    /// pre-cleaned shortcut. The defaults are the web test's.
    private static func properties(
        pntid: String? = "100",
        civicnum: String? = "12",
        civsuffix: String? = nil,
        unit_num: String? = nil,
        add_loc: String? = "Unknown",
        strprefix: String? = nil,
        strname: String? = "Main",
        strsuffix: String? = "St",
        strdir: String? = nil,
        comm: String? = "Mabou",
        mun: String? = "Municipality of the County of Inverness",
        county: String? = "Inverness County"
    ) -> CivicAddressResponse.Properties {
        let columns: [String: String?] = [
            "pntid": pntid, "civicnum": civicnum, "civsuffix": civsuffix,
            "unit_num": unit_num, "add_loc": add_loc, "strprefix": strprefix,
            "strname": strname, "strsuffix": strsuffix, "strdir": strdir,
            "comm": comm, "mun": mun, "county": county,
        ]
        return CivicAddressResponse.Properties(
            columns.mapValues { $0.map { .string($0) } ?? .null }
        )
    }

    // MARK: - Search URLs

    @Test func aLeadingCivicNumberIsAskedAsAColumnRatherThanAsText() throws {
        // Socrata's full-text index ranks 11064 no higher than 110640, so the
        // number is pulled out and matched exactly while the rest stays text.
        let url = try CivicAddressQuery.searchURL("  11064 Highway 19   Mabou  ")

        #expect(url.absoluteString.contains("%24q=Highway+19+Mabou"))
        #expect(url.absoluteString.contains("%24where=civicnum%3D11064"))
        #expect(url.absoluteString.contains("%24order=pntid"))
        #expect(url.absoluteString.contains("%24limit=12"))
        #expect(url.absoluteString.contains(
            "%24select=" + CivicAddressQuery.fields.joined(separator: "%2C")
        ))
    }

    @Test func aSearchWithoutALeadingCivicNumberIsEntirelyText() throws {
        let url = try CivicAddressQuery.searchURL("Highway 19 Mabou")

        #expect(url.absoluteString.contains("%24q=Highway+19+Mabou"))
        #expect(!url.absoluteString.contains("%24where"))
    }

    @Test func aCivicNumberWithALetterKeepsTheLetterAsItsOwnCondition() throws {
        let url = try CivicAddressQuery.searchURL("12a Main Street")

        #expect(url.absoluteString.contains(
            "%24where=civicnum%3D12+AND+upper%28civsuffix%29%3D%27A%27"
        ))
        #expect(url.absoluteString.contains("%24q=Main+Street"))
    }

    @Test func aBareNumberStaysAFullTextSearch() throws {
        // "11064" alone names no street. The full-text index is the only thing
        // that can say which one it belongs to, so nothing is split off.
        let url = try CivicAddressQuery.searchURL("11064")

        #expect(url.absoluteString.contains("%24q=11064"))
        #expect(!url.absoluteString.contains("%24where"))
    }

    @Test(arguments: ["ab", " a ", ""])
    func tooShortToSearchIsRefusedRatherThanSent(_ query: String) {
        // Two characters match half the province; the file would answer with
        // whichever twelve rows sorted first, which is not a search result.
        #expect(throws: CivicAddressQuery.Refusal.queryTooShort) {
            try CivicAddressQuery.searchURL(query)
        }
    }

    // MARK: - Bounded queries

    @Test func aBoundedQueryIsEncodedInNorthWestSouthEastOrder() throws {
        let url = try CivicAddressQuery.boundedQueryURL(
            .init(north: 46.4, west: -61.2, south: 46.3, east: -61.1),
            limit: 25,
            offset: 50
        )

        #expect(url.absoluteString.contains(
            "%24where=within_box%28the_geom%2C46.4%2C-61.2%2C46.3%2C-61.1%29"
        ))
        #expect(url.absoluteString.contains("%24limit=25"))
        #expect(url.absoluteString.contains("%24offset=50"))
        // Socrata reads an unencoded `within_box(` as a malformed clause and
        // answers with a 400, so the encoding is not cosmetic.
        #expect(!url.absoluteString.contains("within_box(the_geom,"))
    }

    // MARK: - Official spellings

    @Test(arguments: [
        ("hwy 19", "Highway 19"),
        ("route 19", "Highway 19"),
        ("dr's", "D.R.'s"),
        ("HWY 19 Mabou", "Highway 19 Mabou"),
    ])
    func theProvincesOwnSpellingIsOfferedAsASecondTry(_ typed: String, official: String) {
        #expect(CivicAddressQuery.officialSpelling(of: typed) == official)
    }

    @Test(arguments: ["Highway 19", "Main Street", "route number"])
    func textAlreadySpelledTheProvincesWayHasNoSecondTry(_ typed: String) {
        // `route number` has no digits after it, so it is a road called Route,
        // not a shorthand for a highway.
        #expect(CivicAddressQuery.officialSpelling(of: typed) == nil)
    }

    // MARK: - Formatting

    @Test func everyComponentIsWrittenOutOnceWithoutPlaceholders() {
        #expect(CivicAddressResponse.format(Self.properties(
            civicnum: " 12 ",
            civsuffix: " A ",
            unit_num: " 4 ",
            add_loc: "Unknown",
            strprefix: " N ",
            strname: " Main ",
            strsuffix: " St ",
            strdir: " W ",
            comm: " Mabou ",
            mun: "Mabou",
            county: " Inverness County "
        )) == "Unit 4, 12A N Main St W, Mabou, Inverness County")
    }

    @Test func aRecordWithNoAddressComponentsFormatsAsNothing() {
        // Not "Unknown", and not the placement text: this record has a location
        // and no address, and inventing words for it would be inventing an
        // address.
        #expect(CivicAddressResponse.format(Self.properties(
            civicnum: nil,
            add_loc: "Community Hall",
            strname: nil,
            strsuffix: nil,
            comm: nil,
            mun: nil,
            county: nil
        )).isEmpty)
    }

    @Test func whereThePointWasPlacedIsNotPartOfTheAddress() {
        // `add_loc` describes the dot — "Building Centroid" — not the property.
        #expect(CivicAddressResponse.format(Self.properties(
            civicnum: "11064",
            add_loc: "Building Centroid",
            strname: "Highway 19",
            strsuffix: nil,
            comm: "Southwest Mabou",
            mun: "Inverness County"
        )) == "11064 Highway 19, Southwest Mabou, Inverness County")
    }

    @Test func aUnitIsLabelledOnlyWhenTheFileHasNotLabelledItAlready() {
        #expect(CivicAddressResponse.format(Self.properties(unit_num: "Unit B"))
            .hasPrefix("Unit B, "))
        #expect(CivicAddressResponse.format(Self.properties(unit_num: "B"))
            .hasPrefix("Unit B, "))
    }

    @Test func theRoadNameIsAvailableSeparatelyForAccessContext() {
        #expect(Self.properties(
            strprefix: "West", strname: "Lawrencetown", strsuffix: "Road"
        ).roadName == "West Lawrencetown Road")
        #expect(Self.properties(
            strname: nil, strsuffix: nil
        ).roadName == nil)
    }

    // MARK: - Decoding

    @Test func aColumnHoldingTheFilesEmptyMarkerIsEmpty() {
        // NSCAF writes "-" where a component does not apply. Printing it would
        // put a hyphen in the middle of somebody's address.
        #expect(CivicAddressResponse.clean(.string(" - ")) == nil)
        #expect(CivicAddressResponse.clean(.string("  ")) == nil)
        #expect(CivicAddressResponse.clean(.string(",Mabou,")) == "Mabou")
        #expect(CivicAddressResponse.clean(.string("Main   St")) == "Main St")
        #expect(CivicAddressResponse.clean(.number(11_064)) == "11064")
        #expect(CivicAddressResponse.clean(.null) == nil)
    }

    @Test func aPointWithNoIdentifierOrNoPlaceIsNotAnAddress() throws {
        // Both are unusable rather than wrong: without a pntid there is nothing
        // to deduplicate on, and without a coordinate there is nowhere to draw.
        let page = try CivicAddressResponse.page(from: Data("""
        {"type":"FeatureCollection","features":[
          {"geometry":{"type":"Point","coordinates":[-61.4,46.0]},"properties":{"strname":"Main"}},
          {"geometry":null,"properties":{"pntid":"2","strname":"Main"}},
          {"geometry":{"type":"Point","coordinates":[-61.4,46.0]},"properties":{"pntid":"3"}}
        ]}
        """.utf8))

        #expect(page.addresses.map(\.pntid) == ["3"])
        // Still three rows, because the row count is what says whether Socrata
        // has another page.
        #expect(page.rowCount == 3)
    }

    @Test func aRecordWithNoWritableAddressIsStillAPointOnTheMap() throws {
        let page = try CivicAddressResponse.page(from: Data("""
        {"type":"FeatureCollection","features":[
          {"geometry":{"type":"Point","coordinates":[-61.4,46.0]},"properties":{"pntid":"3"}}
        ]}
        """.utf8))

        #expect(page.addresses.first?.label == "Mapped civic point")
        #expect(page.addresses.first?.coordinate.lat == 46.0)
        #expect(page.addresses.first?.coordinate.lng == -61.4)
    }

    @Test(arguments: [
        #"{"type":"Feature","features":[]}"#,
        #"{"features":[]}"#,
        #"{"type":"FeatureCollection"}"#,
        "<html>502</html>",
    ])
    func aReplyThatIsNotAFeatureCollectionIsNotAnEmptyOne(_ body: String) {
        #expect(throws: CivicAddressResponse.Failure.malformed) {
            try CivicAddressResponse.page(from: Data(body.utf8))
        }
    }

    // MARK: - Attribution

    /// The licence and the dataset are two documents.
    ///
    /// Both surfaces print the licence's name beside the source, and a name
    /// that opens the dataset instead leaves a reader believing they have read
    /// terms they were never shown.
    @Test func theLicenceLinkIsTheLicenceAndNotTheDatasetPage() {
        #expect(CivicAddressQuery.licenceURL != CivicAddressQuery.datasetURL)
        #expect(CivicAddressQuery.licenceURL.absoluteString.contains("licence"))
        // The words the licence itself requires, not a paraphrase.
        #expect(
            CivicAddressQuery.attribution
                == "Contains information licensed under the Open Government Licence – Nova Scotia."
        )
    }

    // MARK: - Ranking

    @Test func punctuationAndAccentsDoNotDecideWhetherARoadIsFound() {
        #expect(CivicAddressResponse.matchKey("D.R.'s Lane") == "drs lane")
        #expect(CivicAddressResponse.matchKey("D.R.\u{2019}s Lane") == "drs lane")
        #expect(CivicAddressResponse.matchKey("Chéticamp") == "cheticamp")
        #expect(CivicAddressResponse.matchKey("hwy 19") == "highway 19")
    }
}
