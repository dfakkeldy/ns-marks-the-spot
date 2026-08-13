import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerInstallationTests {
    @Test func appContainerInstallsCatalogLayers() {
        let container = AppContainer()
        let ids = container.mapController.layers.map(\.id)

        // Fletcher is deliberately absent from this list: it installs only when
        // a tile host is configured, and the test below covers both branches of
        // that.
        #expect(ids.contains("ns-aerial"))
        #expect(ids.contains("nsprd"))
        #expect(ids.contains("crown-lands"))
        #expect(ids.contains("flood-risk"))
        #expect(ids.contains("waterfalls"))
    }

    @Test func nsAerialLayerUsesArcGISMapServiceSource() {
        let container = AppContainer()
        let layer = container.mapController.layers.first { $0.id == "ns-aerial" }

        guard let layer else {
            Issue.record("NS Aerial layer was not installed")
            return
        }

        if case .arcgisMapService(let url, let transparent) = layer.configuration.source {
            #expect(url.absoluteString == "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer")
            #expect(transparent == false)
        } else {
            Issue.record("NS Aerial should use arcgisMapService")
        }
    }

    /// The Fletcher entry with a base URL supplied here rather than by the
    /// environment.
    ///
    /// Both installation branches are driven from explicit descriptors because
    /// only one of them is reachable in any given checkout:
    /// `FLETCHER_TILE_BASE_URL` is unset in CI and in a plain clone, so a test
    /// that read `descriptor.sourceURL` and branched on it would exercise the
    /// absent case forever and pass with the hosted case deleted outright.
    private func fletcher(hostedAt base: URL?) throws -> LayerDescriptor {
        var descriptor = try #require(LayerCatalog.descriptor(for: .fletcher))
        descriptor.sourceURL = base
        return descriptor
    }

    @Test func installsFletcherAgainstAConfiguredTileHost() throws {
        let base = try #require(URL(string: "https://tiles.example.test/fletcher"))
        let descriptor = try fletcher(hostedAt: base)
        let layer = try #require(
            AppContainer.makeLayer(from: descriptor),
            "a configured host must install the layer"
        )

        // The per-sheet source specifically. Read as a plain XYZ template the
        // same base URL expands to `/{z}/{x}/{y}.png` with no sheet segment,
        // which is a 404 for every tile — and the descriptor is the only thing
        // that says which of the two this is.
        guard case .fletcherSheets(let source) = layer.configuration.source else {
            Issue.record("Fletcher should use the per-sheet source, not a tile template")
            return
        }
        #expect(source == base)
        #expect(layer.id == "fletcher")
    }

    @Test func leavesFletcherOutWhenNoTileHostIsConfigured() throws {
        // The sheets are rendered from the Rumsey scans by our own pipeline and
        // read from an HTTPS host set at build time. Until that build is hosted
        // there is nothing to point at, and an absent row reads as a feature
        // that has not shipped where an installed one reads as a broken switch.
        let descriptor = try fletcher(hostedAt: nil)
        #expect(AppContainer.makeLayer(from: descriptor) == nil)
    }

    @Test func refusesATileHostPointedAtTheRetiredSource() {
        // The rights boundary, driven with an actual retired host rather than
        // observed on whatever this checkout happens to be configured with. The
        // David Rumsey permission in `docs/FLETCHER_GEOREFERENCING.md` does not
        // cover OldMapsOnline-derived tiles, so this is not a degraded build —
        // it is a build that must not make the request at all.
        #expect(LayerCatalog.normalizedBuildSetting("https://www.oldmapsonline.org/tiles") == nil)
        #expect(LayerCatalog.normalizedBuildSetting("https://cdn.OldMapsOnline.ORG/f") == nil)

        // And it does not refuse everything, which is the other half: a guard
        // that rejected every host would pass the two checks above while
        // silently uninstalling the layer on a legitimate build.
        #expect(
            LayerCatalog.normalizedBuildSetting("  https://tiles.example.test/fletcher  ")
                == "https://tiles.example.test/fletcher"
        )
        // Unsubstituted build settings and placeholders are "not configured",
        // not values to parse.
        #expect(LayerCatalog.normalizedBuildSetting("$(FLETCHER_TILE_BASE_URL)") == nil)
        #expect(LayerCatalog.normalizedBuildSetting("<your-host-here>") == nil)
        #expect(LayerCatalog.normalizedBuildSetting("   ") == nil)
    }

    @Test func fletcherLayerUsesSourceAwareCacheIdentifier() throws {
        let descriptor = try #require(LayerCatalog.descriptor(for: .fletcher))
        // Built from an explicit base rather than `descriptor.sourceURL`, which
        // is nil until the build is hosted: the property under test is that the
        // identifier follows the source, and that holds either way.
        let base = try #require(URL(string: "https://tiles.example.test/fletcher"))
        let configuration = TileLayerConfiguration(
            descriptor: descriptor, source: .fletcherSheets(baseURL: base)
        )

        #expect(configuration.cacheIdentifier.hasPrefix("\(descriptor.cacheKey)_"))
        #expect(configuration.cacheIdentifier != descriptor.cacheKey)

        // A different host is a different cache: tiles rendered by one build
        // must never be served for another.
        let elsewhere = try #require(URL(string: "https://other.example.test/fletcher"))
        let moved = TileLayerConfiguration(
            descriptor: descriptor, source: .fletcherSheets(baseURL: elsewhere)
        )
        #expect(moved.cacheIdentifier != configuration.cacheIdentifier)

        // And so is the same URL read as a plain XYZ template, since the two
        // sources expand it to entirely different addresses.
        let asTemplate = TileLayerConfiguration(descriptor: descriptor, source: .tile(base))
        #expect(asTemplate.cacheIdentifier != configuration.cacheIdentifier)
    }

    @Test func arcGISDynamicLayersRetainRestrictionsAndPayloads() {
        guard let floodRisk = installedLayer(id: "flood-risk"),
              let propertyBoundaries = installedLayer(id: "nsprd"),
              let waterfalls = installedLayer(id: "waterfalls") else {
            Issue.record("Expected dynamic ArcGIS layers were not installed")
            return
        }

        if case .arcgisDynamic(_, let dynamicLayers, let layerRestrictions) = floodRisk.configuration.source {
            #expect(dynamicLayers == nil)
            #expect(layerRestrictions == "show:24,25,26")
        } else {
            Issue.record("Flood risk should use ArcGIS dynamic layers")
        }

        if case .arcgisDynamic(_, let dynamicLayers, let layerRestrictions) = propertyBoundaries.configuration.source {
            #expect(layerRestrictions == nil)
            #expect(dynamicLayers?.contains("\"mapLayerId\":0") == true)
            #expect(dynamicLayers?.contains("\"showLabels\":false") == true)
        } else {
            Issue.record("Property boundaries should use ArcGIS dynamic layers")
        }

        if case .arcgisDynamic(_, let dynamicLayers, let layerRestrictions) = waterfalls.configuration.source {
            #expect(layerRestrictions == nil)
            #expect(dynamicLayers?.contains("\"mapLayerId\":1") == true)
            #expect(dynamicLayers?.contains("FEAT_DESC = 'Falls -  On a single line river point'") == true)
        } else {
            Issue.record("Waterfalls should use ArcGIS dynamic layers")
        }
    }

    private func installedLayer(id: String) -> MapLayerState? {
        AppContainer().mapController.layers.first { $0.id == id }
    }
}
