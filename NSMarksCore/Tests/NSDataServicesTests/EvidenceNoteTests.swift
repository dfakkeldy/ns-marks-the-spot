import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// The web's own evidence-note expectations, run against the Swift builder.
///
/// The assertions are about sentences rather than about structure on purpose:
/// the sentences are the product. A note that drops "does not prove absence"
/// has turned a screening result into a finding.
@Suite("Parcel evidence note")
struct EvidenceNoteTests {
    /// 2026-07-20T14:05:06Z, the web test's own instant.
    private static let generatedAt = Date(timeIntervalSince1970: 1_784_556_306)
    private static let shareURL = URL(string: "https://example.com/map/?pid=15234636")!

    private static func input(
        mode: MapShareState.Mode = .current,
        activeLayers: [EvidenceNoteInput.Source] = [],
        events: [EvidenceNoteInput.Event] = [],
        civicAddresses: [EvidenceNoteInput.Link] = [],
        assessments: EvidenceNoteInput.AssessmentEvidence,
        dwellings: EvidenceNoteInput.DwellingEvidence,
        resources: [EvidenceNoteInput.Result] = []
    ) -> EvidenceNoteInput {
        EvidenceNoteInput(
            generatedAt: generatedAt,
            pid: "15234636",
            mode: mode,
            shareURL: shareURL,
            position: MapPosition(latitude: 46.18845, longitude: -60.02123, zoom: 15),
            activeLayers: activeLayers,
            events: events,
            civicAddresses: civicAddresses,
            assessmentEvidence: assessments,
            dwellingEvidence: dwellings,
            resourceResults: resources
        )
    }

    private static func account(
        _ aan: String,
        _ records: [(year: Int, assessed: Double, taxable: Double)]
    ) -> PVSCAssessmentResponse.Account {
        PVSCAssessmentResponse.Account(
            aan: aan,
            records: records.map {
                PVSCAssessmentResponse.Record(
                    taxYear: $0.year,
                    assessedValue: $0.assessed,
                    taxableAssessedValue: $0.taxable,
                    coordinate: GeoPoint(lat: 46.071925, lng: -61.391318)
                )
            },
            onParcelBoundary: false
        )
    }

    private static let minerals = EvidenceNoteInput.Result(
        name: "Mineral occurrences",
        sourceURL: URL(string: "https://example.com/minerals")!,
        status: .ready,
        results: ["A01-002 · Nearby occurrence · Within 1 km · Placer · Au"],
        emptyMessage: """
        No published mineral occurrence was returned on or within 1 km of this parcel; a \
        returned-empty result does not prove absence.
        """
    )

    @Test func aTimestampedSourceLinkedNoteCarriesItsLimitations() {
        let note = EvidenceNote.build(
            Self.input(
                activeLayers: [
                    EvidenceNoteInput.Source(
                        name: "NS Property Boundaries",
                        sourceURL: URL(string: "https://example.com/nsprd")!,
                        sourceDate: "Live service checked July 20, 2026"
                    )
                ],
                events: [
                    EvidenceNoteInput.Event(
                        name: "CBRM — July 21, 2026",
                        sources: [
                            EvidenceNoteInput.Link(
                                label: "Official notice",
                                sourceURL: URL(string: "https://example.com/notice")!
                            )
                        ]
                    )
                ],
                civicAddresses: [
                    EvidenceNoteInput.Link(
                        label: "16 Centre St, Reserve Mines",
                        sourceURL: URL(string: "https://example.com/civic")!
                    )
                ],
                assessments: .ready(
                    PVSCAssessmentResponse.Result(
                        matchMethod: .noticeAAN,
                        accounts: [
                            Self.account(
                                "00603988",
                                [
                                    (2026, 41_000, 39_500),
                                    (2025, 40_000, 40_000),
                                ]
                            )
                        ],
                        unreadableRows: 0
                    )
                ),
                dwellings: .ready([
                    PVSCDwellingResponse.Account(
                        aan: "00603988",
                        dwellings: [
                            PVSCDwellingResponse.Dwelling(
                                yearBuilt: 2018,
                                style: "Manufactured Home",
                                squareFeetLivingArea: 1056,
                                livingUnits: 1,
                                bathrooms: 2,
                                garage: false,
                                underConstruction: false
                            ),
                            PVSCDwellingResponse.Dwelling(
                                yearBuilt: 1962,
                                style: "1 Storey",
                                squareFeetLivingArea: 480,
                                livingUnits: 1,
                                bathrooms: 0,
                                garage: nil,
                                underConstruction: nil
                            ),
                        ]
                    )
                ]),
                resources: [Self.minerals]
            )
        )

        #expect(note.filename == "ns-marks-evidence-15234636-2026-07-20T14-05-06Z.md")
        #expect(note.markdown.contains("Generated: 2026-07-20T14:05:06.000Z"))
        #expect(
            note.markdown.contains(
                "[Open this map state](https://example.com/map/?pid=15234636)"
            )
        )
        #expect(note.markdown.contains("[Official notice](https://example.com/notice)"))
        #expect(
            note.markdown.contains("[Mineral occurrences source](https://example.com/minerals)")
        )
        #expect(note.markdown.contains("not proof of ownership, access, occupancy"))
        #expect(note.markdown.contains("Within 1 km"))
        #expect(note.markdown.contains("proximity to a published record"))
        #expect(note.markdown.contains("A returned-empty result does not prove absence."))
        #expect(note.markdown.contains("does not prove mineralization"))
        #expect(note.markdown.contains("## PVSC assessment accounts"))
        #expect(note.markdown.contains("AAN 00603988"))
        #expect(note.markdown.contains("2026: assessed $41,000.00; taxable assessed $39,500.00"))
        #expect(note.markdown.contains("2025: assessed $40,000.00; taxable assessed $40,000.00"))
        #expect(note.markdown.contains("matched directly from the municipal notice AAN"))
        #expect(note.markdown.contains("not a current market appraisal or sale price"))
        #expect(note.markdown.contains("Open Data & Information Government Licence"))
        #expect(note.markdown.contains("## PVSC residential dwelling records"))
        #expect(
            note.markdown.contains(
                "- built 2018 · Manufactured Home · 1,056 sq ft living area · "
                    + "1 living unit · 2 bathrooms · no garage"
            )
        )
        #expect(
            note.markdown.contains(
                "- built 1962 · 1 Storey · 480 sq ft living area · 1 living unit · 0 bathrooms"
            )
        )
        #expect(note.markdown.contains("not a building census"))
    }

    /// An empty answer is written in the source's own words, and each of the
    /// three sources says what it looked for.
    @Test func anEmptyAnswerIsBoundedToWhatWasAsked() {
        let note = EvidenceNote.build(
            Self.input(
                assessments: .ready(
                    PVSCAssessmentResponse.Result(
                        matchMethod: .spatial,
                        accounts: [],
                        unreadableRows: 0
                    )
                ),
                dwellings: .ready([]),
                resources: [
                    EvidenceNoteInput.Result(
                        name: Self.minerals.name,
                        sourceURL: Self.minerals.sourceURL,
                        status: .ready,
                        results: [],
                        emptyMessage: Self.minerals.emptyMessage
                    )
                ]
            )
        )

        #expect(
            note.markdown.contains(
                "No published mineral occurrence was returned on or within 1 km of this parcel; "
                    + "a returned-empty result does not prove absence."
            )
        )
        #expect(
            note.markdown.contains(
                "No PVSC assessment account point was returned inside the mapped parcel geometry."
            )
        )
        #expect(
            note.markdown.contains(
                "No residential dwelling record was returned for the matched assessment accounts."
            )
        )
    }

    /// Two accounts on one parcel stay two accounts. Summing them would print a
    /// parcel value no assessor published.
    @Test func multipleAccountsAreKeptSeparate() {
        let note = EvidenceNote.build(
            Self.input(
                mode: .historical,
                assessments: .ready(
                    PVSCAssessmentResponse.Result(
                        matchMethod: .spatial,
                        accounts: [
                            Self.account("00000001", [(2026, 100_000, 90_000)]),
                            Self.account("00000002", [(2026, 200_000, 180_000)]),
                        ],
                        unreadableRows: 0
                    )
                ),
                dwellings: .ready([])
            )
        )

        #expect(note.markdown.contains("Mode: Historical records"))
        #expect(note.markdown.contains("AAN 00000001"))
        #expect(note.markdown.contains("AAN 00000002"))
        #expect(note.markdown.contains("kept separate and are not summed"))
        #expect(note.markdown.contains("$300,000") == false)
    }

    /// A source that failed and a source that was never asked are different
    /// sentences. Neither is an empty result.
    @Test func aFailureAndAnUnaskedSourceReadDifferently() {
        let note = EvidenceNote.build(
            Self.input(assessments: .error, dwellings: .blocked)
        )

        #expect(note.markdown.contains("PVSC assessment source unavailable at export time."))
        #expect(
            note.markdown.contains(
                "Dwelling records were not looked up because no PVSC assessment account could "
                    + "be resolved."
            )
        )
        let dwellingFailure = EvidenceNote.build(
            Self.input(
                assessments: .ready(
                    PVSCAssessmentResponse.Result(
                        matchMethod: .spatial,
                        accounts: [],
                        unreadableRows: 0
                    )
                ),
                dwellings: .error
            )
        )
        #expect(
            dwellingFailure.markdown
                .contains("PVSC residential dwelling source unavailable at export time.")
        )
    }

    /// Nothing was asked, so nothing is claimed — including about the layers.
    @Test func anUnsourcedParcelSaysSoInEverySection() {
        let note = EvidenceNote.build(
            Self.input(assessments: .error, dwellings: .blocked)
        )

        #expect(note.markdown.contains("- No optional map layers enabled."))
        #expect(
            note.markdown.contains("- No mapped civic address point returned inside the parcel.")
        )
        #expect(
            note.markdown.contains(
                "No included municipal event is associated with this parcel in the selected mode."
            )
        )
    }

    @Test func thePositionIsWrittenToFiveDecimals() {
        let note = EvidenceNote.build(
            Self.input(assessments: .error, dwellings: .blocked)
        )

        #expect(note.markdown.contains("Map position: 46.18845, -60.02123 at zoom 15"))
    }
}

@Suite("ViewPoint parcel links")
struct ViewPointLinkTests {
    @Test func anEightDigitPIDGetsALink() {
        #expect(
            PlaceLinks.viewpointParcelURL(pid: "15234636")?.absoluteString
                == "https://www.viewpoint.ca/show/property/15234636"
        )
    }

    /// A short, long, or non-numeric PID gets no link. A truncated one would
    /// open somebody else's parcel and look like it worked.
    @Test(arguments: ["", "1523463", "152346365", "1523463x", "15 234 636", "١٥٢٣٤٦٣٦"])
    func anythingElseGetsNoLink(pid: String) {
        #expect(PlaceLinks.viewpointParcelURL(pid: pid) == nil)
    }
}
