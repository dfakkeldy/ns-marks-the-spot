import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// Applying a named setup to the map, and what the panel says about it after.
///
/// The model and its storage are checked in the package's `MapThemeTests`
/// against the fixture the browser exports. These are about the other half:
/// that a theme picked here actually moves the switches, the base map, the
/// tax-sale record set and the sliders, and that a theme this build cannot
/// deliver in full says so rather than reading as applied.
@MainActor
struct MapThemeApplyTests {
    private func theme(_ id: String) throws -> MapTheme {
        try #require(MapTheme.builtIn.first { $0.id == id })
    }

    @Test func applyingASetupTurnsOnItsLayersAndSwitchesOnTaxSale() throws {
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsAerial, .nsprd, .roads, .waterFeatures, .buildings],
            showsTaxSale: false
        )

        viewModel.selectTheme("tax-sale-research")

        #expect(viewModel.showsTaxSale)
        #expect(viewModel.baseMapType == .nsAerial)
        let drawn = Set(viewModel.rows.filter(\.isVisible).map(\.id))
        #expect(drawn == [
            LayerID.nsAerial.rawValue,
            LayerID.nsprd.rawValue,
            LayerID.roads.rawValue,
            LayerID.waterFeatures.rawValue,
            LayerID.buildings.rawValue,
        ])
        #expect(viewModel.themeStatus == .exact)
        #expect(viewModel.themeStatusText == "Tax Sale Research")
        #expect(viewModel.themeNotice == nil)
    }

    @Test func switchingSetupsTurnsOffWhatTheOldOneHadOn() throws {
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsAerial, .nsprd, .roads, .waterFeatures, .buildings],
            showsTaxSale: false
        )

        viewModel.selectTheme("tax-sale-research")
        viewModel.selectTheme("explore-nova-scotia")

        // "modern" is the standard base map, and nothing else is drawn.
        #expect(viewModel.baseMapType == .standard)
        #expect(viewModel.rows.filter(\.isVisible).isEmpty)
        #expect(viewModel.showsTaxSale == false)
        #expect(viewModel.themeStatusText == "Explore Nova Scotia")
    }

    @Test func aSetupNamingNoBackgroundLeavesTheMapBlank() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.roads])
        let roadsOnly = MapTheme(
            id: "roads-only",
            kind: .custom,
            name: "Roads only",
            description: "A custom map theme.",
            state: MapThemeState(layerIDs: [LayerID.roads.rawValue]),
            preferredCategoryIDs: [.roadsPlaces]
        )

        viewModel.apply(roadsOnly)

        #expect(viewModel.baseMapType == .blank)
        #expect(viewModel.rows.first { $0.id == LayerID.roads.rawValue }?.isVisible == true)
    }

    /// A relaunch restores the map before the panel is ever built, and the
    /// browser opens the sections the restored setup prefers. Coming back to a
    /// saved Forestry map and finding Forestry, Land, Roads and Water all shut
    /// is the layers being there and none of them being findable.
    @Test func aRestoredSetupOpensTheSectionsItPrefers() throws {
        let saved = try theme("tax-sale-research")
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsAerial, .nsprd, .roads, .waterFeatures, .buildings],
            showsTaxSale: false
        )

        viewModel.resume(
            MapSession(
                view: MapShareState(
                    taxSaleEnabled: true,
                    layerIDs: saved.state.layerIDs
                ),
                background: .nsAerial
            )
        )

        #expect(viewModel.activeThemeID == saved.id)
        #expect(viewModel.openingSections == Set(saved.preferredCategoryIDs))
    }

    /// A map that is nobody's saved setup opens where a first launch opens.
    @Test func aMapMatchingNoSetupOpensAtTheBackgroundMaps() {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd, .contours])

        viewModel.toggleVisibility(LayerID.contours.rawValue)

        #expect(viewModel.activeThemeID == nil)
        #expect(viewModel.openingSections == [.backgroundMaps])
    }

    @Test func aSetupCarriesTheSlidersItWasSavedWith() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.crownLands])
        let declared = try #require(LayerCatalog.descriptor(for: .crownLands)?.opacity)
        let dimmed = MapTheme(
            id: "dimmed",
            kind: .custom,
            name: "Dimmed",
            description: "A custom map theme.",
            state: MapThemeState(
                layerIDs: ["modern", LayerID.crownLands.rawValue],
                opacityOverrides: [LayerID.crownLands.rawValue: 0.25]
            ),
            preferredCategoryIDs: [.landProperty]
        )

        viewModel.apply(dimmed)

        let row = try #require(viewModel.rows.first { $0.id == LayerID.crownLands.rawValue })
        #expect(row.isVisible)
        #expect(row.opacity == 0.25)
        #expect(declared != 0.25)

        // And the setup the map is now in reports that slider, so saving it
        // again would keep it.
        #expect(viewModel.themeState.opacityOverrides[LayerID.crownLands.rawValue] == 0.25)
    }

    @Test func aLayerThisBuildDoesNotCarryIsReportedAsUnavailable() throws {
        // Forestry & Field Access names seven layers; this map has three of
        // them installed.
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial, .roads, .contours])

        viewModel.selectTheme("forestry-field-access")

        #expect(viewModel.themeStatus == .partial)
        #expect(viewModel.themeStatusText == "Forestry & Field Access · Partly applied")
        let notice = try #require(viewModel.themeNotice)
        #expect(notice.hasPrefix("Unavailable: "))
        #expect(notice.contains("Crown Lands"))
        // Nothing was refused: this reader has accepted the licence, so the
        // layers that are missing are missing from the build.
        #expect(notice.contains("Licence required") == false)
    }

    @Test func aPartlyAppliedSetupBecomesModifiedAtTheNextToggle() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial, .roads, .contours])

        viewModel.selectTheme("forestry-field-access")
        viewModel.toggleVisibility(LayerID.contours.rawValue)

        #expect(viewModel.themeStatus == .modified)
        #expect(viewModel.themeStatusText == "Forestry & Field Access · Modified")
        #expect(viewModel.themeNotice == nil)
    }

    @Test func resetPutsBackWhatWasSwitchedOff() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.placeNames, .mainRoads])

        viewModel.selectTheme("georeferencing")
        viewModel.toggleVisibility(LayerID.mainRoads.rawValue)
        #expect(viewModel.themeStatus == .modified)

        viewModel.resetTheme()

        #expect(viewModel.themeStatus == .exact)
        #expect(viewModel.rows.first { $0.id == LayerID.mainRoads.rawValue }?.isVisible == true)
    }

    // MARK: - The licence

    @Test func aSetupNamingARestrictedLayerAsksBeforeApplyingAnything() throws {
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsAerial, .nsprd, .roads],
            licence: .unknown,
            showsTaxSale: false
        )

        viewModel.selectTheme("tax-sale-research")

        #expect(viewModel.isShowingLicenceSheet)
        // Nothing moved yet. A map that switched on the unrestricted half and
        // then asked would have already changed what the reader was looking at.
        #expect(viewModel.rows.filter(\.isVisible).isEmpty)
        #expect(viewModel.showsTaxSale == false)
    }

    @Test func acceptingTheLicenceAppliesTheWholeSetup() throws {
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsAerial, .nsprd, .roads, .waterFeatures, .buildings],
            licence: .unknown,
            showsTaxSale: false
        )

        viewModel.selectTheme("tax-sale-research")
        viewModel.acceptProvinceLicence()

        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == true)
        #expect(viewModel.rows.first { $0.id == LayerID.roads.rawValue }?.isVisible == true)
        #expect(viewModel.showsTaxSale)
        #expect(viewModel.themeStatus == .exact)
    }

    @Test func decliningTheLicenceAppliesTheRestAndSaysWhatWasRefused() throws {
        // Historical Maps, because Fletcher is a Rumsey scan rather than a
        // Province service: it is the part of the setup a refused Province
        // licence has no say over.
        let viewModel = OverlayViewModel.forTesting(
            installing: [.fletcher, .placeNames, .mainRoads],
            licence: .unknown
        )

        viewModel.selectTheme("historical-maps")
        viewModel.declineProvinceLicence()

        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.rows.first { $0.id == LayerID.fletcher.rawValue }?.isVisible == true)
        #expect(viewModel.rows.first { $0.id == LayerID.placeNames.rawValue }?.isVisible == false)
        #expect(viewModel.baseMapType == .standard)
        #expect(viewModel.themeStatus == .partial)
        let notice = try #require(viewModel.themeNotice)
        #expect(notice.contains("Licence required: Place names, Main roads only"))
        // Installed and hidden, not missing: the reader can still change their
        // mind, and telling them it is unavailable would say otherwise.
        #expect(notice.contains("Unavailable") == false)
    }

    @Test func dismissingTheLicenceSheetLeavesTheMapAlone() throws {
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsAerial, .nsprd, .roads],
            licence: .unknown,
            showsTaxSale: false
        )

        viewModel.selectTheme("tax-sale-research")
        viewModel.dismissLicenceSheet()

        #expect(viewModel.rows.filter(\.isVisible).isEmpty)
        #expect(viewModel.showsTaxSale == false)
        // The picker does not show the setup that was dropped. What it does
        // show is Explore Nova Scotia, because a modern map with nothing on it
        // is that setup, whether or not anybody picked it.
        #expect(viewModel.activeThemeID == "explore-nova-scotia")

        // And the dismissal is not remembered: answering a later prompt applies
        // the layer that prompt was about, not the setup that was dropped.
        viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        viewModel.acceptProvinceLicence()
        #expect(viewModel.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == true)
        #expect(viewModel.rows.first { $0.id == LayerID.roads.rawValue }?.isVisible == false)
    }

    // MARK: - Saving

    @Test func savingTheCurrentSetupNamesTheMapItWasSavedFrom() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.roads, .contours])
        viewModel.toggleVisibility(LayerID.roads.rawValue)

        viewModel.saveCurrentSetup(named: "Field day", openSections: [.roadsPlaces])

        let saved = try #require(viewModel.themes.custom.first)
        #expect(saved.name == "Field day")
        #expect(saved.preferredCategoryIDs == [.roadsPlaces])
        #expect(viewModel.activeThemeID == saved.id)
        #expect(viewModel.themeStatus == .exact)
        #expect(viewModel.themeStatusText == "Field day")

        // And it is a setup like any other: switching away and back returns the
        // map to it.
        viewModel.selectTheme("explore-nova-scotia")
        #expect(viewModel.rows.filter(\.isVisible).isEmpty)
        viewModel.selectTheme(saved.id)
        #expect(viewModel.rows.first { $0.id == LayerID.roads.rawValue }?.isVisible == true)
    }

    @Test func deletingTheSavedSetupTheMapIsInLeavesTheMapDrawn() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.roads])
        viewModel.toggleVisibility(LayerID.roads.rawValue)
        viewModel.saveCurrentSetup(named: "Field day", openSections: [.roadsPlaces])
        let saved = try #require(viewModel.themes.custom.first)

        viewModel.deleteSavedTheme(saved.id)

        #expect(viewModel.themes.custom.isEmpty)
        #expect(viewModel.rows.first { $0.id == LayerID.roads.rawValue }?.isVisible == true)
        #expect(viewModel.activeThemeID == nil)
        #expect(viewModel.themeStatusText == "Current setup")
    }

    /// A setup that matches nothing saved has no name of its own, and where it
    /// came from is the only thing left to call it.
    ///
    /// The browser has it easier: on the browser an unnamed setup can only have
    /// come from a link, so it is always "Shared setup". Here it is also what a
    /// launch nobody has touched reads, which is why the two are told apart
    /// rather than assumed.
    @Test func aSetupALinkPutThereIsNamedAsTheSendersUntilTheReaderChangesIt() {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd, .roads])
        #expect(viewModel.themeStatusText == "Explore Nova Scotia")

        viewModel.restore(
            from: URL(string: "https://example.com/map/?layers=nsprd,roads&position=45.6,-61.4,15")!
        )

        #expect(viewModel.activeThemeID == nil)
        #expect(viewModel.themeStatusText == "Shared setup")
        #expect(viewModel.themeDescription == "Map settings restored from a shared link.")

        // The first switch the reader touches makes it theirs, which is the
        // same moment the link's own notice stops describing what is on screen.
        viewModel.toggleVisibility(LayerID.roads.rawValue)
        #expect(viewModel.themeStatusText == "Current setup")
        #expect(viewModel.themeDescription == "The layers this map currently has on.")
    }

    /// Nothing arrived from anybody, so there is nobody to attribute the map to.
    @Test func aSetupTheReaderBuiltIsTheirOwn() {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd, .roads])
        viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        viewModel.toggleVisibility(LayerID.roads.rawValue)

        #expect(viewModel.activeThemeID == nil)
        #expect(viewModel.themeStatusText == "Current setup")
    }

    /// A refused save keeps nothing and says nothing was kept, so the manager
    /// can leave the reader's typing in the field to try again.
    @Test func aSetupThatCouldNotBeSavedReportsThat() {
        let viewModel = OverlayViewModel.forTesting(installing: [.roads])

        #expect(viewModel.saveCurrentSetup(named: "   ", openSections: []) == false)
        #expect(viewModel.themes.custom.isEmpty)
        // And the map is left as it was: a fresh one already reads as the
        // built-in that describes it.
        #expect(viewModel.activeThemeID == "explore-nova-scotia")
    }

    // MARK: - What a setup does not decide

    /// Which records are read is the reader's question, not the setup's. The
    /// browser clears the redemption filter only when a setup switches tax
    /// sales off, and so does this.
    @Test func applyingASetupLeavesTheRedemptionFilterAlone() throws {
        let taxSale = TaxSaleViewModel()
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsAerial, .nsprd, .roads, .waterFeatures, .buildings],
            taxSale: taxSale,
            showsTaxSale: false
        )
        taxSale.filter = .redemption
        let firstEvent = try #require(taxSale.upcomingEvents.first?.id)
        taxSale.setEventVisibility(firstEvent, to: false)

        viewModel.selectTheme("tax-sale-research")

        #expect(taxSale.filter == .redemption)
        // The notices themselves do come back: a setup that shows tax sales
        // and hides half of them reads as a sale being over.
        #expect(taxSale.isSelected(firstEvent))
    }

    @Test func aSetupThatSwitchesTaxSalesOffClearsTheFilter() {
        let taxSale = TaxSaleViewModel()
        let viewModel = OverlayViewModel.forTesting(installing: [.roads], taxSale: taxSale)
        taxSale.filter = .immediateOrNone

        viewModel.selectTheme("explore-nova-scotia")

        #expect(viewModel.showsTaxSale == false)
        #expect(taxSale.filter == .all)
    }

    // MARK: - Backgrounds a setup cannot carry

    /// Satellite and Hybrid are MapKit's, and neither has a name in the
    /// vocabulary a setup is written in. A map drawing one is therefore not the
    /// setup it was saved from, and the panel says so rather than calling it
    /// exact and then handing back a different background when it is picked.
    @Test func aSatelliteMapIsNotTheSetupItWasSavedFrom() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.roads])
        viewModel.toggleVisibility(LayerID.roads.rawValue)
        viewModel.setBaseMapType(.satellite)

        viewModel.saveCurrentSetup(named: "Field day", openSections: [.roadsPlaces])
        let saved = try #require(viewModel.themes.custom.first)

        #expect(viewModel.activeThemeID == saved.id)
        #expect(viewModel.themeStatus == .modified)
        #expect(viewModel.themeNotice?.contains("Satellite background is not part of a saved setup") == true)

        // And picking it again gives what it actually recorded, which is a map
        // with no background at all.
        viewModel.selectTheme(saved.id)
        #expect(viewModel.baseMapType == .blank)
        #expect(viewModel.themeStatus == .exact)
        #expect(viewModel.themeNotice == nil)
    }

    // MARK: - Reset

    /// Reset re-applies the same setup, which resolves to an equal value. The
    /// panel reopens sections on the count of applications for that reason: on
    /// the resolution alone, a reset would put the layers back and leave the
    /// sections wherever the reader had wandered to.
    @Test func resettingCountsAsAnotherApplication() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.placeNames, .mainRoads])

        viewModel.selectTheme("historical-maps")
        let applied = viewModel.themeApplications
        viewModel.toggleVisibility(LayerID.mainRoads.rawValue)
        #expect(viewModel.themeStatus == .modified)

        viewModel.resetTheme()

        #expect(viewModel.themeApplications == applied + 1)
        #expect(viewModel.rows.first { $0.id == LayerID.mainRoads.rawValue }?.isVisible == true)
        #expect(viewModel.themeResolution?.preferredCategoryIDs == [.historicalMaps, .roadsPlaces])
    }

    @Test func aSavedLibraryThatCouldNotBeReadIsSaidSoInThePanel() throws {
        let suite = UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.set(Data("not a library".utf8), forKey: CustomThemeStore.storageKey)
        let viewModel = OverlayViewModel.forTesting(
            installing: [.roads],
            themes: MapThemeLibrary(
                storage: UserDefaultsCustomThemeStorage(defaults: defaults)
            )
        )

        let notice = try #require(viewModel.themeNotice)
        #expect(notice.contains(CustomThemeStore.loadWarning))
        #expect(notice.contains("Saving a setup will replace the unreadable library."))
    }
}
