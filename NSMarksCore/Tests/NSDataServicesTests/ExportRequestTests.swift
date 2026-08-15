import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

/// The whole-frame render an export asks for, instead of the couple of hundred
/// tiles the same frame would take.
@Suite("Export render requests")
struct ExportRequestTests {
    private static let box = WebMercatorBox(
        minX: -6_830_000, minY: 5_800_000, maxX: -6_820_000, maxY: 5_806_000
    )
    private static let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)

    private static func openRasterLayer() throws -> LayerID {
        let layer = try #require(
            LayerCatalog.all.first {
                $0.isRaster && $0.exportOptions != nil
                    && !$0.requiresProvinceClearance && $0.serviceURL != nil
            },
            "The catalog has no open raster layer to render"
        )
        return layer.id
    }

    /// One render, at the frame's own bbox and pixel size — not a tile pyramid.
    /// These services render on demand, so asking per tile is paying for the
    /// same picture two hundred times.
    @Test func theFrameIsAskedForAsOneRender() throws {
        let id = try Self.openRasterLayer()
        let request = try #require(
            try TileRequestFactory.exportRequest(
                for: id, box: Self.box, widthPx: 2317, heightPx: 2083,
                clearance: ProvinceLicenceClearance(allowsRestrictedLayers: false)
            )
        )

        let url = request.url.absoluteString
        #expect(url.contains("size=2317%2C2083"))
        #expect(url.contains("bboxSR=3857"))
        #expect(url.contains("-6830000"))
    }

    /// The licence is checked before an address exists, as it is for tiles.
    /// Exporting must not become the way around the gate.
    @Test func aRestrictedLayerIsRefusedBeforeAUrlIsBuilt() throws {
        let id = try #require(LayerCatalog.restrictedLayerIDs.first)

        #expect(throws: TileRequestFactory.Refusal.licenceNotAccepted(id)) {
            try TileRequestFactory.exportRequest(
                for: id, box: Self.box, widthPx: 1000, heightPx: 1000,
                clearance: ProvinceLicenceClearance(allowsRestrictedLayers: false)
            )
        }
    }

    /// Past what the service will render, the request is refused rather than
    /// sent. ArcGIS answers an oversize request with a smaller image, and a
    /// smaller image stretched over the frame is a map whose features are not
    /// where it says they are.
    @Test func anOversizeFrameIsRefusedRatherThanSilentlyShrunk() throws {
        let id = try Self.openRasterLayer()
        let size = TileRequestFactory.maximumExportDimensionPx + 1

        #expect(throws: TileRequestFactory.Refusal.sizeOutOfRange(id, size)) {
            try TileRequestFactory.exportRequest(
                for: id, box: Self.box, widthPx: size, heightPx: 100,
                clearance: Self.cleared
            )
        }
    }

    /// A layer with no second pass gets no invented one — `nil`, not a repeat
    /// of the first render under a different name.
    @Test func aLayerWithNoSecondPassGetsNone() throws {
        let id = try #require(
            LayerCatalog.all.first {
                $0.isRaster && $0.exportOptions != nil
                    && $0.exportOverlayOptions == nil && $0.serviceURL != nil
            }?.id
        )

        let request = try TileRequestFactory.exportRequest(
            for: id, box: Self.box, widthPx: 800, heightPx: 600,
            overlay: true, clearance: Self.cleared
        )
        #expect(request == nil)
    }

    /// The frame render and a tile of the same layer differ only in bbox and
    /// size: same service, same styling, so the printed layer looks like the
    /// one on screen rather than a differently styled render of it.
    @Test func theRenderMatchesTheTileInEverythingButExtent() throws {
        let id = try Self.openRasterLayer()
        let zoom = try #require(LayerCatalog.descriptor(for: id)?.minZoom)
        let tile = try #require(
            try? TileRequestFactory.tileRequest(
                for: id, x: 21, y: 22, z: zoom, clearance: Self.cleared
            )
        )
        let render = try #require(
            try TileRequestFactory.exportRequest(
                for: id, box: Self.box, widthPx: 800, heightPx: 600, clearance: Self.cleared
            )
        )

        func styling(_ url: URL) -> [String] {
            (url.absoluteString.split(separator: "?").last ?? "")
                .split(separator: "&")
                .map(String.init)
                .filter { !$0.hasPrefix("bbox=") && !$0.hasPrefix("size=") }
        }
        #expect(styling(tile.url) == styling(render.url))
    }
}
