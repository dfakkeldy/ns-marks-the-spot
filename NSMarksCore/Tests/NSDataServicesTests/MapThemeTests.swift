import Foundation
import GeoCore
import MapCatalog
import ParityFixtures
import Testing

@testable import NSDataServices

/// The five setups the app ships, checked against the web's own declaration.
///
/// The fixture is written by `web/src/themes/mapThemes.test.ts` from the
/// browser's registries, so this suite compares the Swift port with what the
/// browser actually ships rather than with a second Swift copy of the same
/// list. A theme that gained a layer in the browser fails here until the port
/// catches up, which is the drift the fixture exists to catch.
@Suite("Built-in map themes")
struct MapThemeParityTests {
    private static let fixture = MapPresentationFixture.loaded

    @Test("Ships the web's themes, in the web's order")
    func themeOrder() {
        #expect(MapTheme.builtIn.map(\.id) == Self.fixture.builtInThemes.map(\.id))
    }

    @Test("Names, describes and configures each theme as the web does")
    func themeContents() throws {
        for expected in Self.fixture.builtInThemes {
            let theme = try #require(
                MapTheme.builtIn.first { $0.id == expected.id },
                "\(expected.id) is missing"
            )
            #expect(theme.kind == .builtIn, "\(expected.id) kind")
            #expect(theme.name == expected.name, "\(expected.id) name")
            #expect(theme.description == expected.description, "\(expected.id) description")
            #expect(theme.state.layerIDs == expected.layerIDs, "\(expected.id) layers")
            #expect(
                theme.state.opacityOverrides == expected.opacityOverrides,
                "\(expected.id) opacity overrides"
            )
            #expect(
                theme.preferredCategoryIDs.map(\.rawValue) == expected.preferredCategoryIDs,
                "\(expected.id) sections"
            )
            #expect(
                theme.state.taxSaleEnabled == expected.taxSaleEnabled,
                "\(expected.id) tax sale"
            )
            #expect(theme.state.mode.rawValue == expected.mode, "\(expected.id) mode")
        }
    }

    @Test("Names only layers this build carries")
    func themesNameRealLayers() {
        for theme in MapTheme.builtIn {
            #expect(MapTheme.validate(theme) == [], "\(theme.id)")
        }
    }

    /// Tax-sale research is the one built-in that turns the notices on, and the
    /// only one that should. A theme that quietly enabled tax-sale colouring
    /// would put a screening layer over somebody's property because they picked
    /// a map style.
    @Test("Turns tax-sale information on in exactly one theme")
    func onlyOneThemeEnablesTaxSale() {
        let enabling = MapTheme.builtIn.filter(\.state.taxSaleEnabled).map(\.id)
        #expect(enabling == ["tax-sale-research"])
    }
}

@Suite("Map theme validation")
struct MapThemeValidationTests {
    private static func theme(
        layerIDs: [String] = ["modern"],
        opacityOverrides: [String: Double] = [:],
        categories: [LayerCategoryID] = [.backgroundMaps]
    ) -> MapTheme {
        MapTheme(
            id: "under-test",
            kind: .custom,
            name: "Under test",
            description: "A custom map theme.",
            state: MapThemeState(
                layerIDs: layerIDs,
                opacityOverrides: opacityOverrides
            ),
            preferredCategoryIDs: categories
        )
    }

    @Test func rejectsALayerThisBuildDoesNotHave() {
        #expect(
            MapTheme.validate(Self.theme(layerIDs: ["modern", "moon-base"]))
                == ["unknown layer ID: moon-base"]
        )
    }

    @Test func rejectsARepeatedLayer() {
        #expect(
            MapTheme.validate(Self.theme(layerIDs: ["modern", "modern"]))
                == ["duplicate layer ID: modern"]
        )
    }

    @Test func rejectsAnOpacityOutsideZeroToOne() {
        #expect(
            MapTheme.validate(Self.theme(opacityOverrides: ["modern": 1.5]))
                == ["invalid opacity: modern"]
        )
        #expect(
            MapTheme.validate(Self.theme(opacityOverrides: ["moon-base": 0.5]))
                == ["unknown opacity layer ID: moon-base"]
        )
    }

    @Test func rejectsARepeatedSection() {
        #expect(
            MapTheme.validate(Self.theme(categories: [.backgroundMaps, .backgroundMaps]))
                == ["duplicate category ID: background-maps"]
        )
    }

    /// Aerial imagery over the modern map hides the modern map. Two
    /// backgrounds, one of which the reader is told is drawn and cannot see.
    @Test func rejectsTwoOpaqueBackgrounds() {
        #expect(
            MapTheme.validate(Self.theme(layerIDs: ["modern", "ns-aerial"]))
                == ["opaque background"]
        )
    }
}

@Suite("Applying a theme to what this build can draw")
struct ResolvedThemeTests {
    private static let everything = Set(
        LayerID.allCases.map(\.rawValue)
    ).union([MapShareState.modernBaseLayerID])

    private static func capabilities(
        licenceAccepted: Bool = true,
        available: Set<String> = everything,
        restricted: Set<String> = []
    ) -> ThemeCapabilities {
        ThemeCapabilities(
            licenceAccepted: licenceAccepted,
            availableLayerIDs: available,
            restrictedLayerIDs: restricted
        )
    }

    private static let theme = MapTheme(
        id: "under-test",
        kind: .custom,
        name: "Under test",
        description: "A custom map theme.",
        state: MapThemeState(
            layerIDs: ["ns-aerial", "nsprd", "fletcher"],
            opacityOverrides: ["fletcher": 0.4]
        ),
        preferredCategoryIDs: [.historicalMaps]
    )

    @Test func appliesEverythingWhenEverythingIsAvailable() {
        let resolved = Self.theme.resolved(with: Self.capabilities())
        #expect(resolved.status == .exact)
        #expect(resolved.target.layerIDs == ["ns-aerial", "nsprd", "fletcher"])
        #expect(resolved.blockedLayerIDs.isEmpty)
        #expect(resolved.unavailableLayerIDs.isEmpty)
    }

    /// A build with no Fletcher tile host is a different case from a reader who
    /// has not accepted the Province licence, and the two are reported apart so
    /// the panel can say which happened.
    @Test func separatesWhatIsMissingFromWhatIsRefused() {
        let resolved = Self.theme.resolved(
            with: Self.capabilities(
                licenceAccepted: false,
                available: Self.everything.subtracting(["fletcher"]),
                restricted: ["ns-aerial"]
            )
        )
        #expect(resolved.status == .partial)
        #expect(resolved.unavailableLayerIDs == ["fletcher"])
        #expect(resolved.blockedLayerIDs == ["ns-aerial"])
        #expect(resolved.target.layerIDs == ["nsprd"])
    }

    @Test func drawsARestrictedLayerOnceTheLicenceIsAccepted() {
        let resolved = Self.theme.resolved(
            with: Self.capabilities(licenceAccepted: true, restricted: ["ns-aerial"])
        )
        #expect(resolved.status == .exact)
        #expect(resolved.target.layerIDs.contains("ns-aerial"))
    }

    /// An opacity for a layer the theme could not draw describes nothing.
    @Test func dropsAnOpacityForALayerItCouldNotDraw() {
        let resolved = Self.theme.resolved(
            with: Self.capabilities(available: Self.everything.subtracting(["fletcher"]))
        )
        #expect(resolved.target.opacityOverrides.isEmpty)
    }
}

@Suite("Recognising the setup the map is already in")
struct MapThemeMatchTests {
    @Test func ignoresTheOrderLayersAreListedIn() {
        let left = MapThemeState(layerIDs: ["nsprd", "roads"])
        let right = MapThemeState(layerIDs: ["roads", "nsprd"])
        #expect(left.matches(right))
    }

    /// With tax sales off the record mode governs nothing on screen, so two
    /// setups that differ only in it are the same setup — which is what stops
    /// the picker reading "Modified" over a map nobody has modified.
    @Test func ignoresTheRecordModeWhileTaxSalesAreOff() {
        let current = MapThemeState(layerIDs: ["modern"], taxSaleEnabled: false, mode: .current)
        let historical = MapThemeState(
            layerIDs: ["modern"], taxSaleEnabled: false, mode: .historical
        )
        #expect(current.matches(historical))
    }

    @Test func readsTheRecordModeWhileTaxSalesAreOn() {
        let current = MapThemeState(layerIDs: ["modern"], taxSaleEnabled: true, mode: .current)
        let historical = MapThemeState(
            layerIDs: ["modern"], taxSaleEnabled: true, mode: .historical
        )
        #expect(!current.matches(historical))
    }

    @Test func noticesAMovedSlider() {
        let plain = MapThemeState(layerIDs: ["fletcher"])
        let faded = MapThemeState(layerIDs: ["fletcher"], opacityOverrides: ["fletcher": 0.3])
        #expect(!plain.matches(faded))
    }

    @Test func findsTheBuiltInTheMapIsCurrentlyIn() throws {
        let explore = try #require(MapTheme.builtIn.first)
        let matched = MapTheme.match(explore.state, in: MapTheme.builtIn)
        #expect(matched?.id == "explore-nova-scotia")
    }

    @Test func findsNothingForASetupNoThemeDescribes() {
        let state = MapThemeState(layerIDs: ["modern", "abandoned-mines"])
        #expect(MapTheme.match(state, in: MapTheme.builtIn) == nil)
    }
}

@Suite("The reader's saved setups")
struct CustomThemeStoreTests {
    private static let state = MapThemeState(
        layerIDs: ["modern", "nsprd"],
        opacityOverrides: ["nsprd": 0.5],
        taxSaleEnabled: true,
        mode: .historical
    )

    private static func saved() throws -> [MapTheme] {
        [
            try CustomThemeStore.make(
                id: "saved-1",
                name: "  Field day  ",
                state: state,
                preferredCategoryIDs: [.landProperty]
            )
        ]
    }

    @Test func keepsWhatWasSavedAcrossALaunch() throws {
        let themes = try Self.saved()
        let library = CustomThemeStore.read(try CustomThemeStore.data(for: themes))
        #expect(library.status == .loaded)
        #expect(library.warning == nil)
        #expect(library.themes == themes)
        #expect(library.themes.first?.name == "Field day")
    }

    @Test func startsEmptyOnADeviceThatHasSavedNothing() {
        let library = CustomThemeStore.read(nil)
        #expect(library.status == .loaded)
        #expect(library.themes.isEmpty)
        #expect(library.warning == nil)
    }

    /// A document this build cannot read at all is reported as unreadable
    /// rather than as an empty library: "you have no saved themes" and "your
    /// saved themes could not be read" are different sentences, and only one of
    /// them is true.
    @Test func saysSoWhenTheLibraryCannotBeRead() {
        let library = CustomThemeStore.read(Data("not json".utf8))
        #expect(library.status == .unreadable)
        #expect(library.warning == CustomThemeStore.loadWarning)
        #expect(library.themes.isEmpty)
    }

    @Test func rejectsADocumentFromAVersionThisBuildDoesNotKnow() {
        let data = Data(#"{"version":2,"themes":[]}"#.utf8)
        #expect(CustomThemeStore.read(data).status == .unreadable)
    }

    /// One theme lost is one theme lost, not the library. A reader with six
    /// saved setups and one unreadable entry should still open the other five.
    @Test func keepsTheThemesItCanStillRead() throws {
        let data = Data(
            """
            {"version":1,"themes":[
              {"id":"good","name":"Good","layerIds":["modern"],"opacityOverrides":{},
               "preferredCategoryIds":["background-maps"],"taxSaleEnabled":false,
               "mapMode":"current"},
              {"name":"No ID","layerIds":[],"opacityOverrides":{},
               "preferredCategoryIds":[],"taxSaleEnabled":false,"mapMode":"current"}
            ]}
            """.utf8
        )
        let library = CustomThemeStore.read(data)
        #expect(library.status == .partial)
        #expect(library.themes.map(\.id) == ["good"])
        #expect(library.warning?.contains("a theme without a valid ID") == true)
    }

    /// A layer this build has never heard of is dropped rather than kept, the
    /// way a shared link's unknown layers are: a theme cannot promise to draw
    /// something nothing can draw.
    @Test func dropsALayerThisBuildDoesNotKnow() throws {
        let data = Data(
            """
            {"version":1,"themes":[
              {"id":"good","name":"Good","layerIds":["modern","moon-base"],
               "opacityOverrides":{"moon-base":0.5},
               "preferredCategoryIds":["background-maps","atlantis"],
               "taxSaleEnabled":false,"mapMode":"current"}
            ]}
            """.utf8
        )
        let library = CustomThemeStore.read(data)
        #expect(library.status == .partial)
        #expect(library.themes.first?.state.layerIDs == ["modern"])
        #expect(library.themes.first?.state.opacityOverrides.isEmpty == true)
        #expect(library.themes.first?.preferredCategoryIDs == [.backgroundMaps])
    }

    /// JSON has a boolean and JSON has a number, and Foundation's bridging
    /// treats a stored `1` as `true` and a stored `true` as `1.0`. A library
    /// that says either should be told it is wrong: a switch nobody set and a
    /// slider nobody moved are settings this app would have invented.
    @Test func refusesANumberWhereTheSwitchBelongs() {
        let data = Data(
            """
            {"version":1,"themes":[
              {"id":"good","name":"Good","layerIds":["modern"],"opacityOverrides":{},
               "preferredCategoryIds":["background-maps"],"taxSaleEnabled":1,
               "mapMode":"current"}
            ]}
            """.utf8
        )
        let library = CustomThemeStore.read(data)
        #expect(library.status == .partial)
        #expect(library.themes.isEmpty)
    }

    @Test func refusesABooleanWhereTheSliderBelongs() throws {
        let data = Data(
            """
            {"version":1,"themes":[
              {"id":"good","name":"Good","layerIds":["modern","crown-lands"],
               "opacityOverrides":{"crown-lands":true},
               "preferredCategoryIds":["background-maps"],"taxSaleEnabled":false,
               "mapMode":"current"}
            ]}
            """.utf8
        )
        let library = CustomThemeStore.read(data)
        #expect(library.status == .partial)
        #expect(library.themes.first?.state.opacityOverrides.isEmpty == true)
        #expect(library.warning?.contains("invalid opacity: crown-lands") == true)
    }

    @Test func refusesASetupThatWouldNotDraw() {
        #expect(throws: CustomThemeStore.Failure.invalid("opaque background")) {
            try CustomThemeStore.make(
                name: "Two backgrounds",
                state: MapThemeState(layerIDs: ["modern", "ns-aerial"]),
                preferredCategoryIDs: []
            )
        }
    }

    @Test func refusesAThemeWithNoName() {
        #expect(throws: CustomThemeStore.Failure.nameRequired) {
            try CustomThemeStore.make(
                name: "   ",
                state: MapThemeState(layerIDs: ["modern"]),
                preferredCategoryIDs: []
            )
        }
    }

    /// The built-ins are the app's, not the reader's. Writing one into the
    /// saved library would leave a copy that stopped following the app.
    @Test func refusesToSaveABuiltInAsTheReadersOwn() throws {
        #expect(throws: CustomThemeStore.Failure.notCustom) {
            _ = try CustomThemeStore.data(for: MapTheme.builtIn)
        }
    }

    @Test func renamesAndUpdatesAndDuplicatesAndDeletes() throws {
        var themes = try Self.saved()

        themes = try CustomThemeStore.rename(themes, id: "saved-1", to: "Renamed")
        #expect(themes.first?.name == "Renamed")

        themes = try CustomThemeStore.update(
            themes,
            id: "saved-1",
            state: MapThemeState(layerIDs: ["modern"]),
            preferredCategoryIDs: [.roadsPlaces]
        )
        #expect(themes.first?.state.layerIDs == ["modern"])
        #expect(themes.first?.name == "Renamed", "an update keeps the name")

        themes = try CustomThemeStore.duplicate(themes, id: "saved-1", duplicateID: "saved-2")
        #expect(themes.map(\.id) == ["saved-1", "saved-2"])
        #expect(themes[1].state == themes[0].state)

        themes = CustomThemeStore.delete(themes, id: "saved-1")
        #expect(themes.map(\.id) == ["saved-2"])
    }

    @Test func refusesToRenameAThemeThatIsNoLongerSaved() throws {
        let themes = try Self.saved()
        #expect(throws: CustomThemeStore.Failure.notFound("gone")) {
            _ = try CustomThemeStore.rename(themes, id: "gone", to: "New name")
        }
    }

    @Test func writesAndReadsThroughTheDeviceStore() throws {
        let suite = "ns-marks-the-spot.theme-tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        let storage = UserDefaultsCustomThemeStorage(defaults: defaults)
        #expect(storage.load().themes.isEmpty)

        let themes = try Self.saved()
        #expect(storage.save(themes) == nil)
        #expect(storage.load().themes == themes)
    }

    /// `true` is not version 1. Foundation bridges a JSON boolean to a number
    /// that answers 1 to an `Int` cast, which would let a document this build
    /// has no idea how to read pass the version gate.
    @Test func refusesABooleanWhereTheVersionBelongs() {
        let data = Data(#"{"version":true,"themes":[]}"#.utf8)
        #expect(CustomThemeStore.read(data).status == .unreadable)
    }

    /// The key holding something that is not a document is a library that
    /// could not be read, not a device that has saved nothing. The difference
    /// decides whether the reader is warned before the next save writes over
    /// it.
    @Test func treatsAKeyHoldingSomethingElseAsUnreadable() throws {
        #expect(CustomThemeStore.read(object: "an older build's string").status == .unreadable)

        let suite = "ns-marks-the-spot.theme-tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("an older build's string", forKey: CustomThemeStore.storageKey)

        let library = UserDefaultsCustomThemeStorage(defaults: defaults).load()
        #expect(library.status == .unreadable)
        #expect(library.warning == CustomThemeStore.loadWarning)
    }

    /// A device that takes the write and keeps none of it is a failed save.
    /// Reported, because the alternative is a panel that says the setup was
    /// saved and a next launch that has never heard of it.
    @Test func reportsASaveTheDeviceDidNotKeep() throws {
        let suite = "ns-marks-the-spot.theme-tests.\(UUID().uuidString)"
        let defaults = try #require(RefusingUserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        let storage = UserDefaultsCustomThemeStorage(defaults: defaults)
        #expect(storage.save(try Self.saved()) == .notSaved)
        #expect(storage.load().themes.isEmpty)
    }
}

/// A defaults store that accepts every write and keeps none, standing in for a
/// domain the device will not let the app write: a managed preference, or a
/// container it has lost.
private final class RefusingUserDefaults: UserDefaults {
    override func set(_ value: Any?, forKey defaultName: String) {}
}
