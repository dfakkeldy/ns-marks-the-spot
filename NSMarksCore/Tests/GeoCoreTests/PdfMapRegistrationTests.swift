import Foundation
import Testing

@testable import GeoCore

/// A page rendered at one point per pixel, upright: PDF's y grows upwards and a
/// raster's grows downwards, so the transform flips it.
private func viewport(width: Double = 612, height: Double = 792) -> PdfViewportGeometry {
    PdfViewportGeometry(
        transform: [1, 0, 0, -1, 0, height], width: width, height: height
    )
}

/// A Measure viewport over the whole page, with four corners in Halifax.
private func measurePage(
    lpts: [Double] = [0, 0, 0, 1, 1, 1, 1, 0],
    gpts: [Double] = [44.6, -63.7, 44.7, -63.7, 44.7, -63.5, 44.6, -63.5],
    bbox: [Double] = [0, 0, 612, 792],
    name: String? = "Sheet 1"
) -> [String: PdfValue] {
    var viewportDictionary: [String: PdfValue] = [
        "Type": .name("Viewport"),
        "BBox": .array(bbox.map { .number($0) }),
        "Measure": .dictionary([
            "Type": .name("Measure"),
            "Subtype": .name("GEO"),
            "GCS": .dictionary(["Type": .name("GEOGCS"), "EPSG": .number(4326)]),
            "LPTS": .array(lpts.map { .number($0) }),
            "GPTS": .array(gpts.map { .number($0) }),
        ]),
    ]
    if let name { viewportDictionary["Name"] = .text(name) }
    return ["VP": .array([.dictionary(viewportDictionary)])]
}

/// A TerraGo dictionary in UTM zone 20 north, neatline over the whole page.
private func lgiPage(
    projection: [String: PdfValue] = [
        "Type": .name("Projection"),
        "ProjectionType": .text("UT"),
        "Datum": .text("NAR"),
        "Zone": .number(20),
        "Hemisphere": .text("N"),
        "Units": .text("m"),
    ],
    neatline: [Double] = [0, 0, 0, 792, 612, 792, 612, 0],
    version: String = "2.1",
    // A metre per point, with the page's origin near Halifax in zone 20.
    ctm: [Double] = [1, 0, 0, 1, 450_000, 4_940_000]
) -> [String: PdfValue] {
    [
        "LGIDict": .dictionary([
            "Type": .name("LGIDict"),
            "Version": .text(version),
            "Description": .text("TerraGo sheet"),
            "Projection": .dictionary(projection),
            "CTM": .array(ctm.map { .number($0) }),
            "Neatline": .array(neatline.map { .number($0) }),
        ])
    ]
}

@Suite("Reading an ISO 32000 Measure viewport")
struct PdfMeasureRegistrationTests {
    @Test("A registered page offers its corners as control points")
    func aRegisteredPageOffersItsCorners() throws {
        let extraction = PdfMapRegistration.candidates(
            page: measurePage(), viewport: viewport()
        )
        #expect(extraction.rejected.isEmpty)
        let candidate = try #require(extraction.candidates.first)
        #expect(candidate.flavour == .measure)
        #expect(candidate.label == "Sheet 1")
        #expect(candidate.gcps.count == 4)
        // LPTS (0,0) is the BBox's bottom-left in PDF space, which is the
        // raster's bottom-left once the page is flipped.
        #expect(candidate.gcps[0].pixel.x == 0)
        #expect(candidate.gcps[0].pixel.y == 792)
        #expect(candidate.gcps[0].map.lat == 44.6)
        #expect(candidate.sourceRect.width == 612)
        #expect(candidate.sourceRect.height == 792)
    }

    @Test("A viewport covering only the map frame registers only that frame")
    func onlyTheFrameIsRegistered() throws {
        let page = measurePage(bbox: [50, 100, 550, 700])
        let candidate = try #require(
            PdfMapRegistration.candidates(page: page, viewport: viewport())
                .candidates.first
        )
        #expect(candidate.sourceRect.x == 50)
        #expect(candidate.sourceRect.width == 500)
        // The page is 792 tall and the frame's top edge is at y=700 in PDF
        // space, so it starts 92 pixels down the raster.
        #expect(candidate.sourceRect.y == 92)
        #expect(candidate.sourceRect.height == 600)
    }

    @Test("A ground point that is not on the earth is refused")
    func groundPointsMustBePlaces() {
        let page = measurePage(
            gpts: [44.6, -63.7, 91, -63.7, 44.7, -63.5, 44.6, -63.5]
        )
        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        #expect(extraction.candidates.isEmpty)
        #expect(extraction.rejected == [
            PdfMapRegistration.Refusal(flavour: .measure, reason: .invalid)
        ])
    }

    @Test("Three points at one place determine nothing and are refused")
    func distinctPixelsAreRequired() {
        let page = measurePage(
            lpts: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
            gpts: [44.6, -63.7, 44.7, -63.6, 44.8, -63.5]
        )
        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        #expect(extraction.candidates.isEmpty)
        #expect(extraction.rejected.first?.reason == .invalid)
    }

    @Test("A rotated frame whose corners run past its own BBox is kept")
    func localPointsMayLeaveTheUnitSquare() {
        // The values, the BBox and the page size are the web's regression
        // fixture in `geoPdfMetadata.test.ts`, taken from a USGS quadrangle
        // whose map frame is rotated about a degree inside its viewport. Every
        // corner of a rotated frame sticks out past the box on one side or
        // another, so `LPTS` runs from -0.02238 to 1.02238. This is what an
        // ordinary georeferenced sheet looks like, and refusing it would send
        // the user to place by hand a map that told us where it sits.
        let page = measurePage(
            lpts: [
                0.00032, 1.01537,
                -0.02238, 0.00035,
                0.99968, -0.01537,
                1.02238, 0.99965,
            ],
            gpts: [
                42.85448, -70.65044,
                43.01304, -70.65468,
                43.01551, -70.47446,
                42.85693, -70.47068,
            ],
            bbox: [10.79975, 2088, 1708.16044, 38.69368]
        )
        let extraction = PdfMapRegistration.candidates(
            page: page, viewport: viewport(width: 1728, height: 2088)
        )
        #expect(extraction.rejected.isEmpty)
        #expect(extraction.candidates.count == 1)
        #expect(extraction.candidates.first?.gcps.count == 4)
    }

    @Test("Fewer than three pairs is not a registration")
    func threePairsAreTheMinimum() {
        let page = measurePage(lpts: [0, 0, 1, 1], gpts: [44.6, -63.7, 44.7, -63.5])
        #expect(
            PdfMapRegistration.candidates(page: page, viewport: viewport())
                .rejected.first?.reason == .invalid
        )
    }

    @Test("A coordinate system this app cannot place is named as such")
    func anUnsupportedSystemIsNotAnInvalidOne() {
        var page = measurePage()
        guard case .array(let entries) = page["VP"],
              var dictionary = entries[0].dictionaryValue,
              var measure = dictionary["Measure"]?.dictionaryValue
        else { Issue.record("the fixture changed shape"); return }
        measure["GCS"] = .dictionary(["Type": .name("PROJCS"), "EPSG": .number(32620)])
        dictionary["Measure"] = .dictionary(measure)
        page["VP"] = .array([.dictionary(dictionary)])

        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        #expect(extraction.candidates.isEmpty)
        #expect(extraction.rejected.first?.reason == .unsupportedCrs)
    }

    @Test("A WKT-only coordinate system is refused rather than guessed at")
    func wktIsNotParsedHere() {
        var page = measurePage()
        guard case .array(let entries) = page["VP"],
              var dictionary = entries[0].dictionaryValue,
              var measure = dictionary["Measure"]?.dictionaryValue
        else { Issue.record("the fixture changed shape"); return }
        measure["GCS"] = .dictionary([
            "Type": .name("GEOGCS"), "WKT": .text("GEOGCS[\"NAD83\"]"),
        ])
        dictionary["Measure"] = .dictionary(measure)
        page["VP"] = .array([.dictionary(dictionary)])

        #expect(
            PdfMapRegistration.candidates(page: page, viewport: viewport())
                .rejected.first?.reason == .unsupportedCrs
        )
    }

    @Test("A dictionary that is not a GEO Measure is structurally unsupported")
    func aPlainViewportIsUnsupported() {
        let page: [String: PdfValue] = [
            "VP": .array([
                .dictionary([
                    "Type": .name("Viewport"),
                    "BBox": .array([0, 0, 612, 792].map { .number(Double($0)) }),
                    "Measure": .dictionary([
                        "Type": .name("Measure"), "Subtype": .name("RL"),
                    ]),
                ])
            ])
        ]
        #expect(
            PdfMapRegistration.candidates(page: page, viewport: viewport())
                .rejected == [
                    PdfMapRegistration.Refusal(flavour: .measure, reason: .unsupported)
                ]
        )
    }

    @Test("A page with no registration at all offers nothing and refuses nothing")
    func anOrdinaryPageIsNotAFailure() {
        let extraction = PdfMapRegistration.candidates(
            page: ["Type": .name("Page")], viewport: viewport()
        )
        #expect(extraction.candidates.isEmpty)
        #expect(extraction.rejected.isEmpty)
    }
}

@Suite("Reading a TerraGo LGIDict")
struct PdfLgiRegistrationTests {
    @Test("A TerraGo sheet projects its neatline through the declared system")
    func aTerraGoSheetIsPlaced() throws {
        let candidate = try #require(
            PdfMapRegistration.candidates(page: lgiPage(), viewport: viewport())
                .candidates.first
        )
        #expect(candidate.flavour == .lgiDict)
        #expect(candidate.label == "TerraGo sheet")
        #expect(candidate.gcps.count == 4)
        // Zone 20's easting 450 000 at that northing is a little west of the
        // central meridian, in Nova Scotia.
        let point = candidate.gcps[0].map
        #expect(abs(point.lat - 44.6) < 0.5)
        #expect(abs(point.lng + 63.6) < 0.5)
        #expect(candidate.sourceRect.width == 612)
    }

    @Test("A single dictionary and an array of one read the same")
    func oneRegistrationIsNotADifferentKindOfFile() throws {
        var page = lgiPage()
        let single = try #require(page["LGIDict"])
        page["LGIDict"] = .array([single])
        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        #expect(extraction.candidates.count == 1)
        #expect(extraction.candidates[0].flavour == .lgiDict)
    }

    @Test("An unknown LGIDict version is not read")
    func onlyTheTwoKnownVersions() {
        let extraction = PdfMapRegistration.candidates(
            page: lgiPage(version: "1.0"), viewport: viewport()
        )
        #expect(extraction.candidates.isEmpty)
        #expect(extraction.rejected.first?.reason == .unsupported)
    }

    @Test("A closed neatline ring is four corners, not five")
    func aClosedRingIsStillARectangle() {
        let page = lgiPage(neatline: [0, 0, 0, 792, 612, 792, 612, 0, 0, 0])
        #expect(
            PdfMapRegistration.candidates(page: page, viewport: viewport())
                .candidates.count == 1
        )
    }

    @Test("A neatline that is not a rectangle is refused rather than squared off")
    func anLShapedNeatlineIsRefused() {
        let page = lgiPage(
            neatline: [0, 0, 0, 792, 300, 792, 300, 400, 612, 400, 612, 0]
        )
        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        #expect(extraction.candidates.isEmpty)
        #expect(extraction.rejected.first?.reason == .unsupported)
    }

    @Test("Four corners that collapse onto one edge are not a rectangle")
    func aDegenerateNeatlineIsRefused() {
        let page = lgiPage(neatline: [0, 0, 0, 792, 0, 400, 0, 100])
        #expect(
            PdfMapRegistration.candidates(page: page, viewport: viewport())
                .rejected.first?.reason == .unsupported
        )
    }

    @Test("A geographic TerraGo projection is read as WGS84")
    func theGeographicShorthandIsUnderstood() throws {
        let crs = try PdfMapRegistration.projectionDefinition([
            "Type": .name("Projection"),
            "ProjectionType": .text("GEOGRAPHIC"),
            "Datum": .text("WGE"),
        ])
        #expect(crs == "EPSG:4326")
    }

    @Test("A web-Mercator TerraGo projection needs every one of its zeros")
    func theMercatorShorthandIsExact() throws {
        var projection: [String: PdfValue] = [
            "Type": .name("Projection"),
            "ProjectionType": .text("MC"),
            "Datum": .text("WGE"),
            "Units": .text("m"),
            "CentralMeridian": .number(0),
            "OriginLatitude": .number(0),
            "FalseEasting": .number(0),
            "FalseNorthing": .number(0),
            "ScaleFactor": .number(0),
        ]
        #expect(try PdfMapRegistration.projectionDefinition(projection) == "EPSG:3857")

        // A shifted central meridian is a different projection wearing the same
        // two letters, and drawing it as web Mercator would slide the sheet.
        projection["CentralMeridian"] = .number(-63)
        #expect(throws: PdfMapRegistration.ReadFailure.unsupportedCrs) {
            _ = try PdfMapRegistration.projectionDefinition(projection)
        }
    }

    @Test("A UTM zone this app has not been verified against is refused")
    func onlyTheAllowedZones() {
        #expect(throws: PdfMapRegistration.ReadFailure.unsupportedCrs) {
            _ = try PdfMapRegistration.projectionDefinition([
                "Type": .name("Projection"),
                "ProjectionType": .text("UT"),
                "Datum": .text("NAR"),
                "Zone": .number(11),
                "Hemisphere": .text("N"),
                "Units": .text("m"),
            ])
        }
    }
}

@Suite("What a PDF is allowed to say a number is")
struct PdfObjectScalarTests {
    @Test("A number written as a string is still a number")
    func terraGoWritesScalarsAsStrings() {
        #expect(PdfValue.text(" -1.5e3 ").scalarValue == -1500)
        #expect(PdfValue.text(".5").scalarValue == 0.5)
        #expect(PdfValue.text("42").scalarValue == 42)
    }

    @Test("Text that merely looks numeric is not accepted")
    func nearlyNumericIsNotNumeric() {
        for text in ["1,5", "0x10", "Infinity", "nan", "1.2.3", "", ".", "1e"] {
            #expect(PdfValue.text(text).scalarValue == nil, "\(text) parsed as a number")
        }
    }

    @Test("A number array with one non-number in it is not an array of numbers")
    func allOrNothing() {
        #expect(PdfValue.array([.number(1), .name("Two")]).numberArray == nil)
        #expect(PdfValue.array([.number(1), .text("2")]).numberArray == [1, 2])
    }
}

@Suite("What a page's registrations mean for the file")
struct PdfRegistrationOutcomeTests {
    @Test("A page with no registration is an ordinary scan, not a failure")
    func nothingSaidIsNotAFailure() {
        #expect(
            PdfMapRegistration.selection(of: PdfMapRegistration.Extraction())
                == .manual(.absent)
        )
    }

    @Test("A page whose only registration was refused still imports, with the reason")
    func aRefusedRegistrationIsStillAnImport() {
        // Not a refusal: the page is a usable map whichever way it is placed,
        // and the reason is what tells the user whether to re-export it or just
        // click four corners.
        let extraction = PdfMapRegistration.Extraction(
            rejected: [.init(flavour: .lgiDict, reason: .unsupportedCrs)]
        )
        #expect(
            PdfMapRegistration.selection(of: extraction) == .manual(.unsupportedCrs)
        )
    }

    @Test("The reason the user can act on is the one reported")
    func theActionableReasonWins() {
        let extraction = PdfMapRegistration.Extraction(
            rejected: [
                .init(flavour: .measure, reason: .unsupported),
                .init(flavour: .lgiDict, reason: .unsupportedCrs),
            ]
        )
        #expect(
            PdfMapRegistration.selection(of: extraction) == .manual(.unsupportedCrs)
        )
    }

    @Test("A usable registration beside a refused one still places the sheet")
    func oneGoodRegistrationIsEnough() throws {
        var page = measurePage()
        for (key, value) in lgiPage(version: "9.9") { page[key] = value }
        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        #expect(extraction.rejected.count == 1)
        guard case .automatic(let candidate) = PdfMapRegistration.selection(of: extraction)
        else { Issue.record("the page was not placed"); return }
        #expect(candidate.flavour == .measure)
    }

    @Test("Two frames on one page are the user's choice, not the app's")
    func twoFramesAreAChoice() {
        // Both are honest registrations of different ground. Picking the first
        // would drape an inset over the county it is an inset of, and the map
        // would look entirely plausible while it did.
        var page = measurePage()
        for (key, value) in lgiPage() { page[key] = value }
        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        guard case .selectionRequired(let candidates) =
            PdfMapRegistration.selection(of: extraction)
        else { Issue.record("one of the two frames was chosen for the user"); return }
        #expect(candidates.count == 2)
    }

    @Test("A page is drawn to the cap, whichever way round it is")
    func theRenderScaleFillsTheCap() throws {
        // A letter page: 4096 / 792 points.
        let letter = try #require(
            PdfMapRegistration.renderScale(pageWidth: 612, pageHeight: 792)
        )
        #expect(abs(letter - 4096 / 792) < 1e-9)
        // A page whose points already outnumber the cap is scaled *down* to it.
        // Not doing so would render a wall-sized plan at 9000 px and hand the
        // decoder a raster several times the cap in each direction.
        let plan = try #require(
            PdfMapRegistration.renderScale(pageWidth: 9000, pageHeight: 6000)
        )
        #expect(abs(plan - 4096 / 9000) < 1e-9)
        #expect(PdfMapRegistration.renderScale(pageWidth: 0, pageHeight: 792) == nil)
        #expect(PdfMapRegistration.renderScale(pageWidth: .nan, pageHeight: 792) == nil)
    }
}

@Suite("What the panel says about a PDF import")
struct PdfImportNoteTests {
    @Test("An atlas says how many pages it left behind")
    func laterPagesAreNamed() {
        let note = PdfImportMetadata(
            pageCount: 40, registration: .manual(reason: .absent, adjusted: false)
        ).note
        #expect(note.contains("Page 1 of 40"))
        #expect(note.contains("later pages were not imported"))
    }

    @Test("A placed sheet says the file placed it")
    func placementIsAttributed() {
        let note = PdfImportMetadata(
            pageCount: 1,
            registration: .embedded(
                PdfImportMetadata.Embedded(
                    flavour: .measure, selection: .sole, frameID: "direct-0",
                    label: nil, candidates: []
                )
            )
        ).note
        #expect(note == "Page 1 imported. Placed from the coordinates in the file.")
    }

    @Test("Every manual reason names a remedy rather than just a fault")
    func eachReasonIsActionable() {
        for reason in [
            PdfMapRegistration.ManualReason.absent, .unsupported, .unsupportedCrs,
            .invalid, .unreadable,
        ] {
            let note = PdfImportMetadata(
                pageCount: 1, registration: .manual(reason: reason, adjusted: false)
            ).note
            #expect(note.hasSuffix("Add matching points to place it."))
        }
    }
}

@Suite("Naming a registration")
struct PdfCandidateIdentityTests {
    @Test("The same file read twice names its registration the same")
    func identityIsStable() {
        let first = PdfMapRegistration.candidates(page: measurePage(), viewport: viewport())
        let second = PdfMapRegistration.candidates(page: measurePage(), viewport: viewport())
        #expect(first.candidates.first?.id == second.candidates.first?.id)
    }

    @Test("Two registrations of different ground are named differently")
    func differentFramesAreDifferentRegistrations() {
        let whole = PdfMapRegistration.candidates(
            page: measurePage(), viewport: viewport()
        ).candidates.first?.id
        let framed = PdfMapRegistration.candidates(
            page: measurePage(bbox: [50, 100, 550, 700]), viewport: viewport()
        ).candidates.first?.id
        #expect(whole != framed)
    }

    @Test("A page carrying both flavours offers both, each named for what it is")
    func bothFlavoursSurvive() {
        var page = measurePage()
        for (key, value) in lgiPage() { page[key] = value }
        let extraction = PdfMapRegistration.candidates(page: page, viewport: viewport())
        #expect(extraction.candidates.map(\.flavour) == [.measure, .lgiDict])
    }
}

@Suite("What the row says placed a PDF")
struct PdfProvenanceTests {
    private static let frames = [
        PdfMapRegistration.Candidate(
            id: "measure-0", flavour: .measure, label: "Halifax County",
            sourceRect: PixelRect(x: 0, y: 0, width: 100, height: 100), gcps: []
        ),
        PdfMapRegistration.Candidate(
            id: "measure-1", flavour: .measure, label: nil,
            sourceRect: PixelRect(x: 0, y: 0, width: 10, height: 10), gcps: []
        ),
        PdfMapRegistration.Candidate(
            id: "measure-2", flavour: .measure, label: nil,
            sourceRect: PixelRect(x: 20, y: 0, width: 10, height: 10), gcps: []
        ),
    ]

    @Test("An unnamed frame is numbered among the unnamed ones")
    func unnamedFramesAreNumberedAmongThemselves() {
        // Not by position on the page: on a sheet whose main map is labelled
        // and whose two insets are not, numbering by position would call the
        // first inset "frame 2" and leave the user looking for a frame 1.
        #expect(PdfImportMetadata.label(at: 0, in: Self.frames) == "Halifax County")
        #expect(PdfImportMetadata.label(at: 1, in: Self.frames) == "Unnamed frame 1")
        #expect(PdfImportMetadata.label(at: 2, in: Self.frames) == "Unnamed frame 2")
    }

    @Test("A sole registration is not reported as the user's choice")
    func soleIsNotChosen() {
        let metadata = PdfImportMetadata(
            pageCount: 1,
            registration: .embedded(
                PdfImportMetadata.Embedded(
                    flavour: .measure, selection: .sole, frameID: "measure-0",
                    label: "Halifax County", candidates: [Self.frames[0]]
                )
            )
        )
        #expect(
            metadata.provenance
                == "GeoPDF page 1 · Halifax County · Measure · sole registration"
        )
        // One frame is nothing to change to.
        #expect(!metadata.canChangeFrame)
    }

    @Test("Moving the points shows in the row, and only after they move")
    func adjustmentIsVisible() {
        let metadata = PdfImportMetadata(
            pageCount: 12,
            registration: .embedded(
                PdfImportMetadata.Embedded(
                    flavour: .lgiDict, selection: .user, frameID: "measure-1",
                    label: nil, candidates: Self.frames
                )
            )
        )
        #expect(
            metadata.provenance
                == "GeoPDF page 1 of 12 · Unnamed frame 1 · LGIDict · chosen by you"
        )
        #expect(!metadata.isAdjusted)
        #expect(metadata.canChangeFrame)
        #expect(metadata.markingAdjusted().provenance.hasSuffix("· adjusted"))
    }

    @Test("A page still waiting for a frame cannot be adjusted away from")
    func nothingToAdjustYet() {
        // There is no placement to have moved from, so marking it adjusted
        // would put a "this replaces your points" warning in front of a user
        // who has never placed anything.
        let waiting = PdfImportMetadata(
            pageCount: 1, registration: .selectionRequired(Self.frames)
        )
        #expect(waiting.markingAdjusted() == waiting)
        #expect(waiting.provenance == "GeoPDF page 1 · Choose frame")
        #expect(waiting.selectedFrameID == nil)
    }

    @Test("A hand-placed page says the registration it could not use")
    func manualNamesTheReason() {
        let manual = PdfImportMetadata(
            pageCount: 1, registration: .manual(reason: .unsupportedCrs, adjusted: true)
        )
        #expect(
            manual.provenance
                == "GeoPDF page 1 · unsupported-crs registration · manual points · adjusted"
        )
    }
}
