import Foundation
import GeoCore
import MapCatalog
import Testing
@testable import ns_marks_the_spot

/// The app's reading of the shared catalog.
///
/// The catalog's own contents are parity-locked against the web export by
/// `LayerCatalogParityTests` in `NSMarksCore`; nothing here re-asserts a field
/// that test already owns. What is checked here is the native layer on top:
/// which catalogued layers this app installs, in what order, with what offline
/// promise, and whose credit.
@MainActor
struct LayerCatalogTests {
    @Test func installOrderHoldsOnlyRastersThisAppCanDraw() {
        let installOrder = NativeLayerTraits.installOrder
        let installed = Set(installOrder)

        // Every entry is a catalogued layer with a raster delivery. A vector
        // layer reaching this list would be installed as a tile overlay and
        // answer every tile with a blank.
        for id in installOrder {
            let descriptor = LayerCatalog.descriptor(for: id)
            #expect(descriptor != nil, "\(id.rawValue) is installed but not catalogued")
            #expect(
                descriptor?.delivery == .mapExport || descriptor?.delivery == .xyzTemplate,
                "\(id.rawValue) is installed with a non-raster delivery"
            )
        }

        // The Church sheets have no tiles at all, so they must not be here even
        // though the panel gives them a row.
        #expect(installed.isDisjoint(with: [
            .churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton
        ]))

        // No duplicates: MapKit would draw the same overlay twice and
        // `MapController.addLayer` would drop the second silently.
        #expect(installOrder.count == installed.count)
    }

    @Test func installOrderIsAscendingZOrder() {
        // Install order *is* z-order in MapKit — an overlay added later draws
        // over one added earlier — so the sequence has to be non-decreasing in
        // the shared z-index or the map stacks differently from the web.
        let zIndexes = NativeLayerTraits.installOrder.compactMap { OverlayZIndex.tileZIndex(for: $0) }

        #expect(zIndexes.count == NativeLayerTraits.installOrder.count)
        #expect(zIndexes == zIndexes.sorted())

        // The two ends of the stack, named rather than derived, so a change to
        // the ordering rule that happens to stay sorted still has to be looked
        // at: imagery underneath everything, labels on top of everything.
        #expect(NativeLayerTraits.installOrder.first == .nsAerial)
        #expect(NativeLayerTraits.installOrder.last == .placeNames)
    }

    @Test func onlyFletcherIsDownloadable() {
        // `TileDownloadManager` only knows how to plan Fletcher sheets, so
        // `savedAreaDownloadable` is a promise this app can keep for exactly one
        // layer. A second `.xyzTemplate` entry would otherwise acquire a
        // Download button that produces an empty area.
        let downloadable = LayerCatalog.all
            .filter { NativeLayerTraits.offlinePolicy(for: $0) == .savedAreaDownloadable }
            .map(\.id)

        #expect(downloadable == [.fletcher])
    }

    @Test func exportLayersAreCachedWhenViewed() throws {
        let nsAerial = try #require(LayerCatalog.descriptor(for: .nsAerial))
        let crownLands = try #require(LayerCatalog.descriptor(for: .crownLands))

        #expect(NativeLayerTraits.offlinePolicy(for: nsAerial) == .viewedCacheOnly)
        #expect(NativeLayerTraits.offlinePolicy(for: crownLands) == .viewedCacheOnly)
        #expect(NativeLayerTraits.caveat(for: nsAerial).hasSuffix("cached when viewed"))
    }

    @Test func basemapCapableLayersHaveABaseMapCase() throws {
        #expect(NativeLayerTraits.basemapCapable.isEmpty == false)

        for id in NativeLayerTraits.basemapCapable {
            let descriptor = try #require(LayerCatalog.descriptor(for: id))
            // The picker's cases are titles, and the title comes from the
            // catalog. An id declared basemap-capable with no matching case
            // would give `OverlayViewModel` a base map it cannot select.
            #expect(
                MapBaseType(rawValue: descriptor.name) != nil,
                "\(id.rawValue) is basemap-capable with no MapBaseType case"
            )
            // And it has to be installable, or the picker entry draws nothing.
            #expect(NativeLayerTraits.installOrder.contains(id))
        }
    }

    @Test func churchSheetsAreCataloguedWithNothingToFetch() throws {
        let churchIDs: [LayerID] = [
            .churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton
        ]

        for id in churchIDs {
            let descriptor = try #require(LayerCatalog.descriptor(for: id))

            // Catalogued for attribution and metadata only; no tiles exist yet,
            // so there is deliberately nothing to fetch and nothing to install.
            #expect(descriptor.delivery == .unavailable)
            #expect(descriptor.availability == .rightsPending)
            #expect(descriptor.nativeDefaultVisible == false)
            #expect(NativeLayerTraits.offlinePolicy(for: descriptor) == .onlineOnly)
            #expect(AppContainer.makeLayer(from: descriptor, fletcherBaseURL: nil) == nil)
        }
    }

    @Test func churchSheetsCreditTheRumseyCollection() throws {
        let descriptor = try #require(LayerCatalog.descriptor(for: .churchRichmond))
        let attribution = NativeLayerTraits.attribution(for: descriptor)

        #expect(attribution.provider == "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries")
        #expect(descriptor.caveat.contains("1885"))
        #expect(attribution.licenseURL?.absoluteString == "https://www.davidrumsey.com/about/copyright-and-permissions")
    }

    @Test func provinceAttributionIsIncluded() throws {
        let descriptor = try #require(LayerCatalog.descriptor(for: .nsAerial))
        let attribution = NativeLayerTraits.attribution(for: descriptor)

        #expect(attribution.provider == "Province of Nova Scotia")
        #expect(attribution.copyright == "Service Nova Scotia")
        #expect(attribution.disclaimer.contains("without warranty or liability"))
    }
}
