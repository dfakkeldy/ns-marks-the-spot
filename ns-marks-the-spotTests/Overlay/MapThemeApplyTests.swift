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
