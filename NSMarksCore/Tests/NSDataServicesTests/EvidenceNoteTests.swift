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
        taxSaleEnabled: Bool = true,
        mode: MapShareState.Mode = .current,
        activeLayers: [EvidenceNoteInput.Source] = [],
        events: [EvidenceNoteInput.Event] = [],
        civicAddresses: [EvidenceNoteInput.Link] = [],
        civicShortfall: String? = nil,
        mappedArea: String? = nil,
        boundaryNotice: String? = nil,
        buildings: [EvidenceNoteInput.Result] = [],
        context: [EvidenceNoteInput.Result] = [],
        flood: [EvidenceNoteInput.Result] = [],
        assessments: EvidenceNoteInput.AssessmentEvidence,
        dwellings: EvidenceNoteInput.DwellingEvidence,
        resources: [EvidenceNoteInput.Result] = [],
        resourceNotice: String? = nil
    ) -> EvidenceNoteInput {
        EvidenceNoteInput(
            generatedAt: generatedAt,
            pid: "15234636",
            taxSaleEnabled: taxSaleEnabled,
            mode: mode,
            shareURL: shareURL,
            position: MapPosition(latitude: 46.18845, longitude: -60.02123, zoom: 15),
            activeLayers: activeLayers,
            events: events,
            civicAddresses: civicAddresses,
            civicShortfall: civicShortfall,
            mappedArea: mappedArea,
            boundaryNotice: boundaryNotice,
            buildingResults: buildings,
            contextResults: context,
            floodResults: flood,
            assessmentEvidence: assessments,
            dwellingEvidence: dwellings,
            resourceResults: resources,
            resourceNotice: resourceNotice
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
                dwellings: .ready(PVSCDwellingResponse.Result(accounts: [
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
                ])),
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
                dwellings: .ready(PVSCDwellingResponse.Result(accounts: [])),
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
                dwellings: .ready(PVSCDwellingResponse.Result(accounts: []))
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

    /// The four mapped-evidence sections the panel shows and the note used to
    /// leave out. A note that simply omitted the flood section read as a parcel
    /// nobody had asked about flooding.
    @Test func theMappedEvidenceSectionsCarryTheirOwnCaveats() {
        let source = URL(string: "https://nsgiwa.novascotia.ca/arcgis")!
        let note = EvidenceNote.build(
            Self.input(
                mappedArea: "1.82 ha (4.5 ac)",
                buildings: [
                    EvidenceNoteInput.Result(
                        name: "Buildings", sourceURL: source, status: .ready,
                        results: ["2 mapped building features"]
                    )
                ],
                context: [
                    EvidenceNoteInput.Result(
                        name: "Roads, trails & culverts", sourceURL: source, status: .ready,
                        results: [], emptyMessage: "No mapped road was listed for this parcel."
                    )
                ],
                flood: [
                    EvidenceNoteInput.Result(
                        name: "Published river flood mapping", sourceURL: source,
                        status: .ready, results: [],
                        emptyMessage: "Outside the extents of the four published river-flood "
                            + "study areas."
                    )
                ],
                assessments: .error,
                dwellings: .blocked
            )
        )

        #expect(note.markdown.contains("## Mapped parcel area"))
        #expect(note.markdown.contains("- 1.82 ha (4.5 ac)"))
        #expect(note.markdown.contains("is not a survey"))
        #expect(note.markdown.contains("- Buildings: 2 mapped building features"))
        #expect(note.markdown.contains("not a building census"))
        #expect(
            note.markdown.contains(
                "- Roads, trails & culverts: No mapped road was listed for this parcel."
            )
        )
        #expect(note.markdown.contains("does not establish legal"))
        #expect(note.markdown.contains("## Flood evidence"))
        #expect(note.markdown.contains("Outside the extents"))
        #expect(note.markdown.contains("not a finding of no flood hazard"))
    }

    /// A source that failed says why, in its own words. "Unavailable" over a
    /// licence that was never accepted would read as an outage.
    @Test func aFailedMappedSourceKeepsItsOwnReason() {
        let source = URL(string: "https://nsgiwa.novascotia.ca/arcgis")!
        let note = EvidenceNote.build(
            Self.input(
                flood: [
                    EvidenceNoteInput.Result(
                        name: "Nova Scotia Coastal Hazard Map", sourceURL: source,
                        status: .error, results: [],
                        errorMessage: "The coastal scenario render could not be read. "
                            + "No absence is inferred."
                    )
                ],
                assessments: .error,
                dwellings: .blocked
            )
        )

        #expect(
            note.markdown.contains(
                "- Nova Scotia Coastal Hazard Map: The coastal scenario render could not be "
                    + "read. No absence is inferred."
            )
        )
        #expect(!note.markdown.contains("Coastal Hazard Map: source unavailable"))
    }

    /// A section notice speaks for a whole lookup, and the sources under it
    /// each speak for themselves. When both are there the sources win: a reader
    /// left with one sentence has no name to ask again about and no link to ask
    /// it at.
    @Test func namedSourcesOutrankASectionNotice() {
        let source = URL(string: "https://gis.novascotia.ca/arcgis")!
        let waiting = "This source had not answered when the note was written."
        let note = EvidenceNote.build(
            Self.input(
                assessments: .error,
                dwellings: .error,
                resources: ["Mineral occurrences", "Mineral tenure", "Abandoned mine openings"]
                    .map { name in
                        EvidenceNoteInput.Result(
                            name: name, sourceURL: source, status: .error, results: [],
                            errorMessage: waiting
                        )
                    },
                resourceNotice: waiting
            )
        )

        #expect(note.markdown.contains("- Mineral tenure: \(waiting)"))
        #expect(note.markdown.contains("- Abandoned mine openings: \(waiting)"))
    }

    /// With nothing to list, the notice is all there is, and the section still
    /// has to say the silence is not an answer.
    @Test func aSectionNoticeSpeaksWhenNoSourceCan() {
        let note = EvidenceNote.build(
            Self.input(
                assessments: .error,
                dwellings: .error,
                resourceNotice: "The geology sources could not be reached."
            )
        )

        #expect(
            note.markdown.contains(
                "- The geology sources could not be reached. No absence is inferred."
            )
        )
    }

    /// A finding drags its credit and its licence along with it. The appendix
    /// gets torn out and pasted elsewhere, and an obligation printed a page
    /// away from the data does not travel with it.
    @Test func aSourcesCreditAndLicencePrintBesideItsFinding() {
        let note = EvidenceNote.build(
            Self.input(
                flood: [
                    EvidenceNoteInput.Result(
                        name: "Nova Scotia Coastal Hazard Map",
                        sourceURL: URL(string: "https://example.test/coastal")!,
                        status: .ready,
                        results: ["2100: approximately 4% of the mapped parcel area"],
                        attribution: "Reproduced with the permission of the Department.",
                        licenceURL: URL(string: "https://example.test/licence")!
                    )
                ],
                assessments: .error,
                dwellings: .blocked
            )
        )

        #expect(note.markdown.contains("- Reproduced with the permission of the Department."))
        #expect(
            note.markdown.contains(
                "- [Nova Scotia Coastal Hazard Map licence](https://example.test/licence)"
            )
        )
    }

    /// No mapped area is said out loud, because a section that vanishes reads
    /// as a question nobody asked.
    @Test func aParcelWithNoMappedAreaSaysSo() {
        let note = EvidenceNote.build(
            Self.input(assessments: .error, dwellings: .blocked)
        )

        #expect(note.markdown.contains("- No mapped parcel area returned."))
    }

    @Test func thePositionIsWrittenToFiveDecimals() {
        let note = EvidenceNote.build(
            Self.input(assessments: .error, dwellings: .blocked)
        )

        #expect(note.markdown.contains("Map position: 46.18845, -60.02123 at zoom 15"))
    }

    // MARK: - A note taken from a map that was not showing tax sales

    /// No mode line, no event section, and above all no sentence saying no
    /// event is associated with the parcel.
    ///
    /// That sentence is the damaging one. Written on a note from a map that
    /// never asked, it reads months later as a municipal record having been
    /// checked and come back clear.
    @Test func aNoteFromAMapWithoutTaxSalesMakesNoTaxSaleFinding() {
        let note = EvidenceNote.build(
            Self.input(taxSaleEnabled: false, assessments: .error, dwellings: .blocked)
        )

        #expect(note.markdown.contains("Mode:") == false)
        #expect(note.markdown.contains("## Event") == false)
        #expect(note.markdown.contains("No included municipal event") == false)
        #expect(note.markdown.contains("Tax-sale notices and results are dated") == false)
        // Still a note about a parcel, with everything that was asked.
        #expect(note.markdown.contains("PID: 15234636"))
        #expect(
            note.markdown.contains(
                "NSPRD geometry and mapped area are approximate and are not a legal survey."
            )
        )
    }

    /// An event handed in anyway is not printed, because the map was not
    /// showing tax sales when the reader took the note.
    @Test func anEventDoesNotSurviveTheMasterSwitchBeingOff() {
        let note = EvidenceNote.build(
            Self.input(
                taxSaleEnabled: false,
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
                assessments: .error,
                dwellings: .blocked
            )
        )

        #expect(note.markdown.contains("CBRM — July 21, 2026") == false)
    }

    /// And with the switch on, the tax-sale sentences are all still there.
    @Test func aNoteFromATaxSaleMapKeepsItsVerificationSentence() {
        let note = EvidenceNote.build(
            Self.input(assessments: .error, dwellings: .blocked)
        )

        #expect(note.markdown.contains("Mode: Current notices"))
        #expect(note.markdown.contains("## Event"))
        #expect(
            note.markdown.contains(
                "Tax-sale notices and results are dated source records and require current "
                    + "verification with the municipality."
            )
        )
    }

    /// The panel says a piece of the parcel could not be drawn and that every
    /// lookup ran inside the pieces that could. The note is the copy that
    /// leaves the app, and without the same sentence it reads as findings for
    /// the whole property.
    @Test func aParcelWithAPieceItCouldNotDrawSaysSoInTheNote() {
        let note = EvidenceNote.build(
            Self.input(
                mappedArea: "1.20 acres",
                boundaryNotice: "PID 15234636 came back as 2 pieces, and 1 of them "
                    + "carried a boundary this app could not read. Everything below was "
                    + "looked up inside the pieces that are drawn.",
                assessments: .ready(PVSCAssessmentResponse.Result(matchMethod: .spatial, accounts: [])),
                dwellings: .ready(PVSCDwellingResponse.Result(accounts: []))
            )
        )

        #expect(note.markdown.contains("came back as 2 pieces"))
        #expect(note.markdown.contains("looked up inside the pieces that are drawn"))
    }

    /// A list of addresses with rows missing from it is a floor, not a count,
    /// and the note has to say which it is.
    @Test func addressesThatCouldNotBePlacedAreCountedInTheNote() {
        let note = EvidenceNote.build(
            Self.input(
                civicAddresses: [
                    EvidenceNoteInput.Link(
                        label: "12 Main St", sourceURL: URL(string: "https://example.com/civic")!
                    )
                ],
                civicShortfall: "2 more mapped points here could not be read, so they are "
                    + "not listed.",
                assessments: .ready(PVSCAssessmentResponse.Result(matchMethod: .spatial, accounts: [])),
                dwellings: .ready(PVSCDwellingResponse.Result(accounts: []))
            )
        )

        #expect(note.markdown.contains("12 Main St"))
        #expect(note.markdown.contains("2 more mapped points here could not be read"))
    }

    /// Every row unreadable is not an empty file. The note must print the
    /// count rather than the sentence that says no address is mapped here.
    @Test func addressRowsThatCouldNotBeReadAreNotAnEmptyParcelInTheNote() {
        let note = EvidenceNote.build(
            Self.input(
                civicShortfall: "3 mapped points here could not be read. Whether an "
                    + "address is mapped inside this parcel is unknown.",
                assessments: .ready(PVSCAssessmentResponse.Result(matchMethod: .spatial, accounts: [])),
                dwellings: .ready(PVSCDwellingResponse.Result(accounts: []))
            )
        )

        #expect(note.markdown.contains("3 mapped points here could not be read"))
        #expect(!note.markdown.contains("No mapped civic address point returned inside the parcel."))
    }

    /// Rows the PVSC reply carried and this build could not parse. The panel
    /// counts them; a note that dropped the count would present a short list
    /// as the whole record.
    @Test func pvscRowsThatCouldNotBeReadAreCountedInTheNote() {
        let note = EvidenceNote.build(
            Self.input(
                assessments: .ready(
                    PVSCAssessmentResponse.Result(
                        matchMethod: .spatial,
                        accounts: [Self.account("00603988", [(2026, 41_000, 39_500)])],
                        unreadableRows: 2
                    )
                ),
                dwellings: .ready(
                    PVSCDwellingResponse.Result(
                        accounts: [
                            PVSCDwellingResponse.Account(
                                aan: "00603988",
                                dwellings: [
                                    PVSCDwellingResponse.Dwelling(
                                        yearBuilt: 2018,
                                        style: "1 Storey",
                                        squareFeetLivingArea: 900,
                                        livingUnits: 1,
                                        bathrooms: 1,
                                        garage: false,
                                        underConstruction: false
                                    )
                                ]
                            )
                        ],
                        unreadableRows: 1
                    )
                )
            )
        )

        #expect(note.markdown.contains("2 rows in the PVSC reply could not be read"))
        #expect(note.markdown.contains("1 row in the PVSC reply could not be read"))
    }

    /// Nothing readable came back, which is not the same as nothing being
    /// recorded. Neither section may print its no-record sentence.
    @Test func aPVSCReplyNothingCouldBeReadInIsNotEvidenceOfNoRecord() {
        let note = EvidenceNote.build(
            Self.input(
                assessments: .ready(
                    PVSCAssessmentResponse.Result(
                        matchMethod: .spatial, accounts: [], unreadableRows: 3
                    )
                ),
                dwellings: .ready(
                    PVSCDwellingResponse.Result(accounts: [], unreadableRows: 4)
                )
            )
        )

        #expect(note.markdown.contains("Whether an assessment account is recorded here is unknown"))
        #expect(note.markdown.contains("Whether a dwelling record exists here is unknown"))
        #expect(!note.markdown.contains("No PVSC assessment account point was returned"))
        #expect(!note.markdown.contains("This does not prove no building exists"))
    }

    /// A map drawn with its background switched off has no tile provider to
    /// credit, and Apple's licence under "no base map" would name a source
    /// that drew nothing.
    @Test func aMapWithNoBackgroundIsNotCreditedToATileProvider() {
        let note = EvidenceNote.build(
            Self.input(
                activeLayers: [
                    EvidenceNoteInput.Source(
                        name: "no base map",
                        sourceURL: nil,
                        sourceDate: "no background tiles were drawn"
                    )
                ],
                assessments: .ready(PVSCAssessmentResponse.Result(matchMethod: .spatial, accounts: [])),
                dwellings: .ready(PVSCDwellingResponse.Result(accounts: []))
            )
        )

        #expect(note.markdown.contains("- no base map — no background tiles were drawn"))
        #expect(!note.markdown.contains("apple.com/legal"))
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
