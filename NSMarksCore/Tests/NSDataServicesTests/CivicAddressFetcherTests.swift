import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// What the Civic Address File is asked, and what is kept from its answers.
///
/// The contract is the same one the parcel lookups have: an empty list has to
/// mean the file was asked and had no civic point here, and every other outcome
/// has to be distinguishable from that.
@Suite("Civic address lookups")
struct CivicAddressFetcherTests {
    /// One civic point as the file sends it. Unset columns are omitted rather
    /// than sent empty, which is also what Socrata does.
    private static func point(
        _ pntid: String,
        lng: Double = -61.4,
        lat: Double = 46.0,
        _ columns: [String: String] = [:]
    ) -> String {
        let properties = columns.merging(["pntid": pntid]) { current, _ in current }
            .map { #""\#($0.key)":"\#($0.value)""# }
            .joined(separator: ",")
        return """
        {"type":"Feature","geometry":{"type":"Point","coordinates":[\(lng),\(lat)]},\
        "properties":{\(properties)}}
        """
    }

    private static func collection(_ points: [String]) -> StubTransport.Answer {
        .body(Data("""
        {"type":"FeatureCollection","features":[\(points.joined(separator: ","))]}
        """.utf8))
    }

    private static let nothing = collection([])

    /// A square from (0,0) to (2,2) — big enough that its bounding box is
    /// obviously its own, and simple enough to reason about by hand.
    private static let square: PolygonHitTest.PolygonPart = [[
        GeoPoint(lat: 0, lng: 0),
        GeoPoint(lat: 0, lng: 2),
        GeoPoint(lat: 2, lng: 2),
        GeoPoint(lat: 2, lng: 0),
        GeoPoint(lat: 0, lng: 0),
    ]]

    // MARK: - Searching

    @Test func aSearchReturnsEachPointOnceWithItsAddressWrittenOut() async throws {
        // The file repeats a point across pages often enough that the web
        // deduplicates too; two rows with one pntid are one address.
        let stub = StubTransport(Self.collection([
            Self.point("27700002", lng: -61.414138, lat: 46.059488, [
                "civicnum": "11064", "strname": "Highway 19",
                "comm": "Southwest Mabou", "mun": "Inverness County",
            ]),
            Self.point("27700002", lng: -61.414138, lat: 46.059488),
        ]))

        let results = try await CivicAddressFetcher(transport: stub.transport)
            .search("11064 Highway 19 Mabou")

        #expect(results.count == 1)
        #expect(results.first?.pntid == "27700002")
        #expect(results.first?.label == "11064 Highway 19, Southwest Mabou, Inverness County")
        #expect(results.first?.coordinate == GeoPoint(lat: 46.059488, lng: -61.414138))
    }

    @Test func aRoadTheProvinceSpellsWithInitialsIsFoundWithoutThem() async throws {
        // Typed `dr's`; the file writes `D.R.'s`. The second query is the same
        // words under the file's own conventions, and its results are still
        // ranked against what was actually typed — which is why the Pictou
        // road merely containing "D.R." does not come back.
        let stub = StubTransport(matching: [
            ("%24q=dr%27s", Self.collection([
                Self.point("68501173", [
                    "civicnum": "16", "strname": "Tanya", "strsuffix": "Dr",
                    "comm": "Glace Bay",
                ]),
            ])),
            ("%24q=D.R.%27s", Self.collection([
                Self.point("32300086", [
                    "civicnum": "20", "strname": "D.R.'s", "strsuffix": "Lane",
                    "comm": "Judique", "mun": "Inverness County",
                    "county": "Inverness County",
                ]),
                Self.point("400166262", [
                    "civicnum": "67", "strname": "Johnny D.R. #2", "strsuffix": "Dr",
                    "comm": "McArras Brook", "mun": "Pictou County",
                    "county": "Pictou County",
                ]),
            ])),
        ])

        let results = try await CivicAddressFetcher(transport: stub.transport).search("dr's")

        #expect(stub.log.count == 2)
        #expect(results.map(\.label) == ["20 D.R.'s Lane, Judique, Inverness County"])
    }

    @Test(arguments: ["hwy 19", "route 19"])
    func aHighwayIsFoundFromTheShorthandPeopleType(_ query: String) async throws {
        let stub = StubTransport(matching: [
            ("%24q=Highway+19", Self.collection([
                Self.point("34100031", [
                    "civicnum": "1307", "strname": "Highway 19",
                    "comm": "Troy", "mun": "Inverness County",
                    "county": "Inverness County",
                ]),
            ])),
            ("", Self.nothing),
        ])

        let results = try await CivicAddressFetcher(transport: stub.transport).search(query)

        #expect(stub.log.count == 2)
        #expect(results.map(\.label) == ["1307 Highway 19, Troy, Inverness County"])
    }

    @Test func aSearchTheProvinceWouldSpellTheSameWayIsAskedOnce() async throws {
        let stub = StubTransport(Self.nothing)

        let results = try await CivicAddressFetcher(transport: stub.transport)
            .search("Main Street")

        #expect(stub.log.count == 1)
        #expect(results.isEmpty)
    }

    @Test func aSearchTooShortToMeanAnythingIsRefusedRatherThanSent() async {
        let stub = StubTransport(Self.nothing)
        let fetcher = CivicAddressFetcher(transport: stub.transport)

        await #expect(throws: CivicAddressFailure.refused(.queryTooShort)) {
            try await fetcher.search("ab")
        }
        #expect(stub.log.count == 0)
    }

    // MARK: - Addresses on a parcel

    @Test func aPointInsideTheBoxButOutsideTheParcelIsNotOnIt() async throws {
        // Socrata can only be asked for a rectangle. Keeping everything it
        // returned would put the neighbour's address on this parcel.
        let triangle: PolygonHitTest.PolygonPart = [[
            GeoPoint(lat: 0, lng: 0),
            GeoPoint(lat: 0, lng: 2),
            GeoPoint(lat: 2, lng: 0),
            GeoPoint(lat: 0, lng: 0),
        ]]
        let stub = StubTransport(Self.collection([
            Self.point("inside", lng: 0.5, lat: 0.5),
            Self.point("in-the-box-only", lng: 1.9, lat: 1.9),
        ]))

        let addresses = try await CivicAddressFetcher(transport: stub.transport)
            .addresses(inside: [triangle])

        #expect(addresses.map(\.pntid) == ["inside"])
    }

    @Test func aPointInAHoleIsNotOnTheParcelButAPointOnTheLineIs() async throws {
        // A hole is land the parcel does not include. A point exactly on a ring
        // counts as inside, the same way a tap on a shared boundary identifies
        // the parcel rather than falling through it.
        let withHole: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 0), GeoPoint(lat: 0, lng: 4),
                GeoPoint(lat: 4, lng: 4), GeoPoint(lat: 4, lng: 0),
                GeoPoint(lat: 0, lng: 0),
            ],
            [
                GeoPoint(lat: 1, lng: 1), GeoPoint(lat: 1, lng: 3),
                GeoPoint(lat: 3, lng: 3), GeoPoint(lat: 3, lng: 1),
                GeoPoint(lat: 1, lng: 1),
            ],
        ]
        let stub = StubTransport(Self.collection([
            Self.point("in-the-hole", lng: 2, lat: 2),
            Self.point("on-the-hole-edge", lng: 2, lat: 1),
            Self.point("in-the-parcel", lng: 0.5, lat: 0.5),
        ]))

        let addresses = try await CivicAddressFetcher(transport: stub.transport)
            .addresses(inside: [withHole])

        #expect(addresses.map(\.pntid) == ["on-the-hole-edge", "in-the-parcel"])
    }

    @Test func everyPartOfAMultiPolygonParcelIsAskedAboutOnce() async throws {
        // A parcel in two pieces is one parcel. Both boxes are asked, and a
        // point returned by both is still one address.
        let far: PolygonHitTest.PolygonPart = [[
            GeoPoint(lat: 0, lng: 10), GeoPoint(lat: 0, lng: 12),
            GeoPoint(lat: 2, lng: 12), GeoPoint(lat: 2, lng: 10),
            GeoPoint(lat: 0, lng: 10),
        ]]
        let stub = StubTransport(Self.collection([
            Self.point("shared", lng: 1, lat: 1),
            Self.point("far-side", lng: 11, lat: 1),
        ]))

        let addresses = try await CivicAddressFetcher(transport: stub.transport)
            .addresses(inside: [Self.square, far])

        #expect(stub.log.count == 2)
        #expect(addresses.map(\.pntid) == ["shared", "far-side"])
    }

    @Test func aParcelWithNoBoundaryIsRefusedRatherThanAnsweredWithNothing() async {
        let stub = StubTransport(Self.nothing)
        let fetcher = CivicAddressFetcher(transport: stub.transport)

        await #expect(throws: CivicAddressFailure.refused(.noBoundary)) {
            try await fetcher.addresses(inside: [])
        }
        #expect(stub.log.count == 0)
    }

    @Test func aParcelWithNoCivicPointOnItComesBackEmpty() async throws {
        // The one honest empty: the file was asked and had nothing here.
        let addresses = try await CivicAddressFetcher(transport: StubTransport(Self.nothing).transport)
            .addresses(inside: [Self.square])

        #expect(addresses.isEmpty)
    }

    /// The other kind of nothing. Rows came back and none of them could be
    /// read, which is a failure to read the file — reporting it as an empty
    /// result would say the Province has no civic address here on the strength
    /// of a parsing defect.
    @Test func aPageWhoseEveryRowIsUnreadableIsNotAnEmptyResult() async {
        let unusable = """
        {"type":"Feature","geometry":{"type":"Point","coordinates":[-61.4,46.0]},\
        "properties":{"civicnum":"11064"}}
        """
        let stub = StubTransport(Self.collection([unusable, unusable]))
        let fetcher = CivicAddressFetcher(transport: stub.transport)

        await #expect(throws: CivicAddressFailure.unreadable(.unusableRows(2))) {
            try await fetcher.addresses(inside: [Self.square])
        }
        await #expect(throws: CivicAddressFailure.unreadable(.unusableRows(2))) {
            try await fetcher.search("11064 Highway 19")
        }
    }

    @Test func aPageWithSomeUnreadableRowsKeepsTheOnesItCouldRead() async throws {
        // The complement, and the reason the rule is "every row": what was read
        // is real, and refusing the page would hide addresses that are there.
        let unusable = """
        {"type":"Feature","geometry":{"type":"Point","coordinates":[1,1]},\
        "properties":{"civicnum":"11064"}}
        """
        let stub = StubTransport(Self.collection([unusable, Self.point("kept", lng: 1, lat: 1)]))

        let addresses = try await CivicAddressFetcher(transport: stub.transport)
            .addresses(inside: [Self.square])

        #expect(addresses.map(\.pntid) == ["kept"])
    }

    // MARK: - Paging

    @Test func aFullPageMeansThereMayBeMoreAndTheRunContinues() async throws {
        let firstPage = (1...CivicAddressQuery.pageSize).map {
            Self.point("first-\($0)", lng: 1, lat: 1)
        }
        let stub = StubTransport(matching: [
            ("%24offset=0", Self.collection(firstPage)),
            ("%24offset=1000", Self.collection([Self.point("last", lng: 1, lat: 1)])),
        ])

        let addresses = try await CivicAddressFetcher(transport: stub.transport)
            .addresses(inside: [Self.square])

        #expect(stub.log.count == 2)
        #expect(addresses.count == CivicAddressQuery.pageSize + 1)
        #expect(addresses.last?.pntid == "last")
    }

    @Test func aFullPageOfRowsIsStillFullWhenSomeOfThemAreUnusable() async throws {
        // The row count decides whether there is another page. Counting only
        // the usable rows would stop here and lose everything after it.
        let firstPage = (1...CivicAddressQuery.pageSize).map { index in
            index == 1
                ? #"{"type":"Feature","geometry":null,"properties":{"pntid":"broken"}}"#
                : Self.point("first-\(index)", lng: 1, lat: 1)
        }
        let stub = StubTransport(matching: [
            ("%24offset=0", Self.collection(firstPage)),
            ("%24offset=1000", Self.collection([Self.point("last", lng: 1, lat: 1)])),
        ])

        let addresses = try await CivicAddressFetcher(transport: stub.transport)
            .addresses(inside: [Self.square])

        #expect(stub.log.count == 2)
        #expect(addresses.last?.pntid == "last")
    }

    // MARK: - Not getting an answer

    @Test func aServiceThatIsDownIsNotAParcelWithoutAnAddress() async {
        let fetcher = CivicAddressFetcher(transport: StubTransport(.status(503)).transport)

        await #expect(throws: CivicAddressFailure.invalidHTTPStatus(503)) {
            try await fetcher.addresses(inside: [Self.square])
        }
    }

    @Test func aReplyThatIsNotAFeatureCollectionIsNotAnEmptyOne() async {
        let stub = StubTransport(.body(Data("<html>502</html>".utf8)))
        let fetcher = CivicAddressFetcher(transport: stub.transport)

        await #expect(throws: CivicAddressFailure.unreadable(.malformed)) {
            try await fetcher.addresses(inside: [Self.square])
        }
    }

    @Test(arguments: [
        StubTransport.Answer.failure(URLError(.cancelled)),
        .failure(CancellationError()),
    ])
    func abandoningALookupIsNotAnOutage(answer: StubTransport.Answer) async {
        let fetcher = CivicAddressFetcher(transport: StubTransport(answer).transport)

        await #expect(throws: CivicAddressFailure.cancelled) {
            try await fetcher.addresses(inside: [Self.square])
        }
    }

    @Test func aNetworkThatIsGoneIsReportedAsUnreachable() async {
        let stub = StubTransport(.failure(URLError(.notConnectedToInternet)))
        let fetcher = CivicAddressFetcher(transport: stub.transport)

        await #expect(throws: CivicAddressFailure.unreachable(.notConnectedToInternet)) {
            try await fetcher.search("Main Street")
        }
    }
}
