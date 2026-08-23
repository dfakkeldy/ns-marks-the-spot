import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// What leaves the app: the link back to a map view, and the note about a
/// parcel.
@MainActor
@Suite("Sharing a view and exporting a parcel's evidence")
struct MapShareAndEvidenceTests {
    private static func inspection(
        pid: String = "15234636",
        notice: TaxSaleNoticeContext? = nil,
        historical: [HistoricalRecordContext] = [],
        civic: ParcelEvidence<CivicAddressResponse.Reading> = .ready(
            CivicAddressResponse.Reading(addresses: [], unreadableRows: 0)
        ),
        resources: ParcelEvidence<ParcelResourceIntersections> = .ready(
            ParcelResourceIntersections(sources: [])
        ),
        assessments: ParcelEvidence<PVSCAssessmentResponse.Result> = .ready(
            PVSCAssessmentResponse.Result(matchMethod: .spatial, accounts: [])
        ),
        dwellings: ParcelEvidence<PVSCDwellingResponse.Result> = .ready(
            PVSCDwellingResponse.Result(accounts: [])
        ),
        buildings: ParcelEvidence<ParcelBuildingCount> = .ready(
            ParcelBuildingCount(points: 0, polygons: 0)
        ),
        context: ParcelEvidence<ParcelContext> = .ready(ParcelContext()),
        flood: ParcelEvidence<ParcelFloodHazard> = .ready(
            ParcelFloodHazard(river: .outsidePublishedExtents, coastal: [])
        )
    ) -> ParcelInspection {
        var inspection = ParcelInspection(pid: pid, mappedArea: nil, boundaryNotice: nil)
        inspection.taxSaleNotice = notice
        inspection.historicalRecords = historical
        inspection.civicAddresses = civic
        inspection.resources = resources
        inspection.assessments = assessments
        inspection.dwellings = dwellings
        inspection.buildings = buildings
        inspection.mappedContext = context
        inspection.floodHazard = flood
        return inspection
    }

    private static func note(
        _ inspection: ParcelInspection,
        taxSaleEnabled: Bool = true,
        mode: MapShareState.Mode = .current
    ) -> EvidenceNote {
        EvidenceNote.build(
            ParcelEvidenceExport.input(
                generatedAt: Date(timeIntervalSince1970: 1_784_556_306),
                inspection: inspection,
                taxSaleEnabled: taxSaleEnabled,
                mode: mode,
                shareURL: URL(string: "https://example.com/map/")!,
                position: MapPosition(latitude: 46.1, longitude: -60.1, zoom: 15),
                activeLayers: [],
                baseMap: .standard,
                fletcherBaseURL: nil
            )
        )
    }

    // MARK: - The link

    @Test func theLinkCarriesTheVisibleLayersAndTheBaseMap() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd, .nsAerial])
        model.toggleVisibility(LayerID.nsprd.rawValue)

        let state = model.shareState
        #expect(state.mode == .current)
        #expect(state.layerIDs.contains(MapShareState.modernBaseLayerID))
        #expect(state.layerIDs.contains(LayerID.nsprd.rawValue))
        #expect(state.layerIDs.contains(LayerID.nsAerial.rawValue) == false)
        #expect(model.shareURL?.absoluteString.hasPrefix(
            "https://kinnokilabs.com/apps/nsmarksthespot/map/?taxSale=off&mode=current"
        ) == true)
    }

    /// The satellite base is MapKit's, and the web has nothing to restore it
    /// with. Naming it in a link would be naming a layer that does not exist
    /// there.
    @Test func theSatelliteBaseIsNotCarried() {
        let model = OverlayViewModel.forTesting(installing: [])
        model.setBaseMapType(.satellite)

        #expect(model.shareState.layerIDs.contains(MapShareState.modernBaseLayerID) == false)
    }

    @Test func aHistoricalMapSaysSoInTheLink() {
        let historical = HistoricalTaxSaleViewModel()
        let model = OverlayViewModel.forTesting(installing: [], historical: historical)
        model.setMapRecordMode(.historical)

        #expect(model.shareState.mode == .historical)
        #expect(model.shareURL?.absoluteString.contains("mode=historical") == true)
    }

    // MARK: - Opening one

    @Test func openingALinkRestoresItsLayersAndItsRecordSet() {
        let historical = HistoricalTaxSaleViewModel()
        let model = OverlayViewModel.forTesting(
            installing: [.nsprd, .nsAerial],
            historical: historical
        )
        model.toggleVisibility(LayerID.nsAerial.rawValue)

        model.restore(
            from: URL(
                string: "https://kinnokilabs.com/apps/nsmarksthespot/map/"
                    + "?mode=historical&layers=nsprd&position=46.1,-60.1,14"
            )!
        )

        #expect(model.mapRecordMode == .historical)
        #expect(model.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == true)
        // Switched off again, because the link says which layers were on and an
        // extra one would put a source in front of the reader that the sender
        // was not reading.
        #expect(model.rows.first { $0.id == LayerID.nsAerial.rawValue }?.isVisible == false)
    }

    /// The browser turns its modern map on for a link that names layers and no
    /// ground to draw them over. A reader whose own map was on None would
    /// otherwise open that link to parcel boundaries on white.
    @Test func aLinkNamingLayersOverNoGroundOpensOverTheModernMap() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd])
        model.setBaseMapType(.blank)

        model.restore(
            from: URL(
                string: "https://kinnokilabs.com/apps/nsmarksthespot/map/"
                    + "?layers=nsprd&position=46.1,-60.1,14"
            )!
        )

        #expect(model.baseMapType == .standard)
    }

    /// Only when there is nothing under them. Satellite is ground the browser
    /// has no word for, and a link that says nothing about the background is
    /// not asking for it to change.
    @Test func aLinkOverABackgroundThatDrawsLeavesItAlone() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd])
        model.setBaseMapType(.satellite)

        model.restore(
            from: URL(
                string: "https://kinnokilabs.com/apps/nsmarksthespot/map/"
                    + "?layers=nsprd&position=46.1,-60.1,14"
            )!
        )

        #expect(model.baseMapType == .satellite)
    }

    /// NS Aerial below zoom 10 is a background in the picker and nothing on the
    /// map, which is the browser's own test for whether a link has usable
    /// ground under it.
    @Test func aLinkOpenedOverImageryTooFarOutFallsBackToTheModernMap() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd, .nsAerial])
        model.setBaseMapType(.nsAerial)

        model.restore(
            from: URL(
                string: "https://kinnokilabs.com/apps/nsmarksthespot/map/"
                    + "?layers=nsprd&position=46.1,-60.1,9"
            )!
        )

        #expect(model.baseMapType == .standard)
    }

    /// Resuming is not opening a link. Nobody sent this view: the reader turned
    /// their own background off and closed the app, and switching it back on at
    /// launch is arguing with them.
    @Test func aResumedSessionKeepsTheBackgroundTheReaderTurnedOff() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd])
        model.setBaseMapType(.blank)

        model.resume(
            MapSession(
                view: MapShareState(
                    layerIDs: [LayerID.nsprd.rawValue],
                    position: MapPosition(latitude: 46.1, longitude: -60.1, zoom: 14)
                ),
                background: .blank
            )
        )

        #expect(model.baseMapType == .blank)
    }

    /// A link cannot accept the Province licence on the reader's behalf, and it
    /// cannot pass over the layer in silence either. The layer stays off, the
    /// map says so, and the sheet puts the decision in front of the reader.
    ///
    /// The browser does exactly this: a shared link naming a restricted layer
    /// with no acceptance stored opens its licence dialog. Asking is not
    /// accepting; it is the same question the layer's own switch would raise.
    @Test func aLinkAsksAboutTheLicenceItsLayersAreBehind() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd], licence: .unknown)

        model.restore(
            from: URL(string: "https://example.com/map/?mode=current&layers=nsprd")!
        )

        #expect(model.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == false)
        #expect(model.isShowingLicenceSheet)
        #expect(model.sharedLinkNotice?.contains("Province licence") == true)
    }

    /// Accepting brings back every layer the link asked for, not only the one
    /// the sheet happened to name.
    @Test func acceptingRestoresAllOfTheLinksHeldLayers() {
        let model = OverlayViewModel.forTesting(
            installing: [.nsprd, .nsAerial],
            licence: .unknown
        )

        model.restore(
            from: URL(string: "https://example.com/map/?mode=current&layers=nsprd,ns-aerial")!
        )
        model.acceptProvinceLicence()

        #expect(model.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == true)
        #expect(model.rows.first { $0.id == LayerID.nsAerial.rawValue }?.isVisible == true)
        #expect(model.sharedLinkNotice == nil)
    }

    /// Declining leaves the layers off and the notice up. It is the only thing
    /// on screen saying this is not the view that was sent.
    @Test func decliningKeepsTheLinksLayersOffAndSaysSo() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd], licence: .unknown)

        model.restore(
            from: URL(string: "https://example.com/map/?mode=current&layers=nsprd")!
        )
        model.declineProvinceLicence()

        #expect(model.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == false)
        #expect(model.isShowingLicenceSheet == false)
        #expect(model.sharedLinkNotice != nil)
    }

    /// Dismissing without answering is not accepting. A later acceptance,
    /// reached some other way, does not switch the link's layers on behind it.
    @Test func dismissingTheSheetDropsTheLinksClaimOnTheLayers() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd], licence: .unknown)

        model.restore(
            from: URL(string: "https://example.com/map/?mode=current&layers=nsprd")!
        )
        model.dismissLicenceSheet()
        model.acceptProvinceLicence()

        #expect(model.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == false)
    }

    /// A layer this build has no source for is named too. Silence there left a
    /// link opening a map with the water it advertised simply absent.
    @Test func aLinkNamingALayerThisBuildLacksSaysWhatIsMissing() {
        let model = OverlayViewModel.forTesting(installing: [], licence: .accepted)

        model.restore(
            from: URL(string: "https://example.com/map/?mode=current&layers=church-richmond")!
        )

        #expect(model.sharedLinkNotice?.contains("Not in this app yet") == true)
        #expect(model.isShowingLicenceSheet == false)
    }

    /// The notice describes the view that arrived. The first switch the reader
    /// touches makes it describe a map that is no longer on screen.
    @Test func touchingASwitchClearsTheLinksNotice() {
        let model = OverlayViewModel.forTesting(installing: [.nsAerial], licence: .accepted)

        model.restore(
            from: URL(string: "https://example.com/map/?mode=current&layers=church-richmond")!
        )
        #expect(model.sharedLinkNotice != nil)

        model.toggleVisibility(LayerID.nsAerial.rawValue)

        #expect(model.sharedLinkNotice == nil)
    }

    /// A link that names no parcel is a link to a view. Whatever card was open
    /// belongs to the reader's own earlier search, not to what arrived.
    @Test func aLinkWithoutAParcelClosesTheOpenCard() {
        let model = OverlayViewModel.forTesting(installing: [])
        model.editSearchText("15234636")

        model.restore(from: URL(string: "https://example.com/map/?mode=current")!)

        #expect(model.parcels.selectedPID == nil)
        #expect(model.searchText.isEmpty)
        // The search field is empty and the map has moved: without a sentence,
        // a reader whose link carried nothing they can see cannot tell a
        // restored view from a search that quietly did nothing.
        #expect(model.parcelMessage == ParcelLookupMessage.openedSharedView)
    }

    // MARK: - The note

    /// A whole lookup that could not run is not the same as one that ran and
    /// found nothing, and the note has to keep the two apart at the section
    /// level as well as the record level.
    @Test func anUnavailableSourceIsNotAnEmptyAnswer() {
        let note = Self.note(
            Self.inspection(
                civic: .unavailable("The civic address source could not be reached."),
                resources: .unavailable("The geology sources could not be reached.")
            )
        )

        #expect(note.markdown.contains(
            "- The civic address source could not be reached. No absence is inferred."
        ))
        #expect(
            note.markdown.contains("No mapped civic address point returned inside the parcel.")
                == false
        )
        #expect(note.markdown.contains(
            "- The geology sources could not be reached. No absence is inferred."
        ))
    }

    /// The base map is a source: a note listing only the overlays describes a
    /// map nobody looked at.
    @Test func theNoteNamesTheBaseMapItWasReadOver() {
        #expect(Self.note(Self.inspection()).markdown.contains("Apple Maps standard base map"))
    }

    /// The panel and the note say the same thing about the same finding. They
    /// read the wording from one place, and this is the test that keeps them
    /// there: a note with its own copy of the coastal sentence would drift from
    /// the screen the reader was looking at when they exported it.
    @Test func theNoteCarriesTheSameMappedEvidenceThePanelShows() {
        let note = Self.note(
            Self.inspection(
                flood: .ready(
                    ParcelFloodHazard(
                        river: .publishedIntersection([
                            RiverAEPIntersection(
                                annualExceedanceProbabilityPercent: 1,
                                relationship: .area,
                                places: ["Sydney"]
                            )
                        ]),
                        coastal: [
                            CoastalFloodEvidence(
                                scenario: .year2100,
                                sample: .success(
                                    FloodHazardResponse.RasterSampleSummary(
                                        sampledParcelPixels: 400,
                                        floodedParcelPixels: 40,
                                        approximateAffectedPercent: 10,
                                        approximateAffectedSquareMetres: 1820
                                    )
                                )
                            )
                        ]
                    )
                )
            )
        )

        #expect(note.markdown.contains("1% annual-exceedance flood area intersects this parcel"))
        #expect(note.markdown.contains("2100: approximately 10% of the mapped parcel area"))
        #expect(note.markdown.contains("not a finding of no flood hazard"))
        // The roads half answered with nothing, and says so as an answer.
        #expect(note.markdown.contains("## Mapped roads and water"))
        #expect(note.markdown.contains("No mapped water feature intersects this parcel."))
    }

    /// A road list assembled without the address file is short, and the note
    /// has to say so. Handed over on its own it reads as the whole set of
    /// roads at this parcel.
    @Test func aRoadListMissingItsAddressHalfSaysSo() {
        let note = Self.note(
            Self.inspection(civic: .unavailable("The civic address source could not be reached."))
        )

        #expect(
            note.markdown.contains(
                "The civic address file has not answered, so a road named only by an address "
                    + "on this parcel would not be listed."
            )
        )
    }

    /// A flood percentage with no definition beside it reads as a property of
    /// the parcel. It is not one, and the sentence that says so travels with it.
    @Test func aFloodFigureCarriesWhatItMeasures() {
        #expect(Self.note(Self.inspection()).markdown.contains(FloodEvidenceCaveat.measurement))
    }

    /// The coastal licence's three notices are conditions of using the data,
    /// so they travel with every coastal finding the note reports rather than
    /// staying on the panel the reader has already closed.
    @Test func aCoastalFindingCarriesTheLicencesOwnNotices() {
        let note = Self.note(Self.inspection())

        for notice in CoastalFloodLicence.notices {
            #expect(note.markdown.contains(notice))
        }
    }

    /// A source that failed keeps its own reason all the way into the note.
    @Test func aFailedBuildingCountReadsAsAFailureNotAsNoBuildings() {
        let note = Self.note(
            Self.inspection(buildings: .unavailable("The building service could not be reached."))
        )

        #expect(
            note.markdown.contains(
                "The building service could not be reached. No absence is inferred."
            )
        )
        #expect(!note.markdown.contains("Nothing is mapped inside this outline"))
    }

    @Test func theNoteIsHeldBackUntilEverySourceHasAnswered() {
        #expect(ParcelEvidenceExport.isReady(Self.inspection()))
        #expect(ParcelEvidenceExport.isReady(Self.inspection(dwellings: .looking)) == false)
        #expect(ParcelEvidenceExport.isReady(Self.inspection(civic: .looking)) == false)
        // The mapped-evidence sources gate the note too. Exporting while the
        // flood screen was still running produced a dated document with no
        // flood section at all, which reads as a parcel nobody asked about.
        #expect(ParcelEvidenceExport.isReady(Self.inspection(buildings: .looking)) == false)
        #expect(ParcelEvidenceExport.isReady(Self.inspection(context: .looking)) == false)
        #expect(ParcelEvidenceExport.isReady(Self.inspection(flood: .looking)) == false)
    }

    /// The dwelling dataset is keyed by assessment account, so no account means
    /// the question was never asked. The note has to say that rather than say
    /// the dataset failed or that there is no house.
    @Test func anUnaskedDwellingLookupReadsAsUnasked() {
        let unasked = Self.note(
            Self.inspection(
                dwellings: .unavailable(ParcelLookupMessage.noAccountToAskDwellingsWith)
            )
        )
        #expect(unasked.markdown.contains("were not looked up because no PVSC assessment"))
        #expect(unasked.markdown.contains("dwelling source unavailable") == false)

        let failed = Self.note(
            Self.inspection(dwellings: .unavailable("PVSC dwelling data is unavailable right now."))
        )
        #expect(
            failed.markdown.contains("PVSC residential dwelling source unavailable at export time.")
        )
    }

    /// The mineral inventory is the only source asked twice — on the parcel and
    /// within a kilometre — so it is the only one whose lines say which.
    @Test func onlyTheMineralInventoryReportsProximity() {
        let note = Self.note(
            Self.inspection(
                resources: .ready(
                    ParcelResourceIntersections(sources: [
                        ParcelResourceIntersections.Source(
                            layerID: .mineralOccurrences,
                            records: .success([
                                ResourceIntersectionResponse.Intersection(
                                    id: "A01-002",
                                    name: "Nearby occurrence",
                                    detail: "Placer · Au",
                                    relationship: .withinOneKilometre
                                )
                            ])
                        ),
                        ParcelResourceIntersections.Source(
                            layerID: .abandonedMines,
                            records: .success([
                                ResourceIntersectionResponse.Intersection(
                                    id: "M-1",
                                    name: "Shaft",
                                    detail: "Reported 1908",
                                    relationship: .onParcel
                                )
                            ])
                        ),
                    ])
                )
            )
        )

        #expect(note.markdown.contains("A01-002 · Nearby occurrence · Within 1 km · Placer · Au"))
        #expect(note.markdown.contains("- Shaft · Reported 1908") == false)
        #expect(note.markdown.contains("Shaft · Reported 1908"))
        #expect(note.markdown.contains("Shaft · Within 1 km") == false)
    }

    /// A source that could not be reached is written as unavailable, not as a
    /// source that answered with nothing.
    @Test func aFailedResourceSourceIsNotAnEmptyAnswer() {
        let note = Self.note(
            Self.inspection(
                resources: .ready(
                    ParcelResourceIntersections(sources: [
                        ParcelResourceIntersections.Source(
                            layerID: .mineralOccurrences,
                            records: .failure(.unreachable(.notConnectedToInternet))
                        )
                    ])
                )
            )
        )

        #expect(note.markdown.contains("source unavailable at export time."))
        #expect(note.markdown.contains("No published mineral occurrence was returned") == false)
    }

    /// The note inherits the panel's rule: the current notice or the dated
    /// records, never both on the same page.
    @Test func theNoteCarriesOneRecordSet() {
        let records = HistoricalTaxSaleCatalog.bundled.records(
            matching: HistoricalTaxSaleCatalog.Filter()
        )
        guard let record = records.first,
              let event = HistoricalTaxSaleCatalog.bundled.event(id: record.eventID)
        else { return }

        let note = Self.note(
            Self.inspection(historical: [HistoricalRecordContext(event: event, record: record)]),
            mode: .historical
        )

        #expect(note.markdown.contains("Mode: Historical records"))
        #expect(note.markdown.contains(event.shortMunicipality))
        #expect(note.markdown.contains(event.noticeURL.absoluteString))
    }
}
