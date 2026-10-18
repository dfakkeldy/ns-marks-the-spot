import Foundation
import MapCatalog
import Testing

@testable import NSDataServices

/// Where the rendered Atlas tiles are asked for.
@Suite("Atlas raster tile addresses")
struct AtlasRasterTileURLTests {
    private let host = URL(string: "https://tiles.kinnokilabs.com")!

    /// The package contract `web/scripts/atlasRaster` writes to, exactly:
    /// `<host>/atlas-raster/<revision>/<style>/{z}/{x}/{y}.webp`.
    @Test("A tile address follows the package contract")
    func aTileAddressFollowsThePackageContract() {
        let url = AtlasRasterTileURL.tileURL(style: .fletcher, z: 13, x: 2694, y: 2925, baseURL: host)
        #expect(
            url.absoluteString
                == "https://tiles.kinnokilabs.com/atlas-raster/\(AtlasRaster.tileRevision)/fletcher/13/2694/2925.webp"
        )
        #expect(
            AtlasRasterTileURL.tileTemplate(style: .day, baseURL: host)
                == "https://tiles.kinnokilabs.com/atlas-raster/\(AtlasRaster.tileRevision)/day/{z}/{x}/{y}.webp"
        )
    }

    /// The ocean stand-in and the receipt share the tiles' prefix, so a host
    /// that serves one serves the others.
    @Test("The ocean stand-in and the receipt sit beside the tiles")
    func theOceanStandInAndTheReceiptSitBesideTheTiles() {
        let prefix = "https://tiles.kinnokilabs.com/atlas-raster/\(AtlasRaster.tileRevision)"
        #expect(
            AtlasRasterTileURL.oceanTileURL(style: .night, z: 9, baseURL: host).absoluteString
                == "\(prefix)/night/ocean/9.webp"
        )
        #expect(AtlasRasterTileURL.sourceReceiptURL(baseURL: host).absoluteString == "\(prefix)/source.json")
    }

    /// The same host rules as the Fletcher sheets: HTTPS, or plain HTTP only
    /// against this machine, and a trailing slash is not a second prefix.
    @Test("The host is validated like the Fletcher host")
    func theHostIsValidatedLikeTheFletcherHost() throws {
        #expect(try AtlasRasterTileURL.normalizeBaseURL(nil) == nil)
        #expect(try AtlasRasterTileURL.normalizeBaseURL("  ") == nil)
        #expect(
            try AtlasRasterTileURL.normalizeBaseURL("https://Tiles.KinNoKiLabs.com/")?.absoluteString
                == "https://tiles.kinnokilabs.com"
        )
        let local = try #require(try AtlasRasterTileURL.normalizeBaseURL("http://127.0.0.1:8787"))
        #expect(
            AtlasRasterTileURL.tileURL(style: .day, z: 5, x: 1, y: 2, baseURL: local).absoluteString
                == "http://127.0.0.1:8787/atlas-raster/\(AtlasRaster.tileRevision)/day/5/1/2.webp"
        )
        #expect(throws: FletcherTileURL.BaseURLError.insecureScheme) {
            try AtlasRasterTileURL.normalizeBaseURL("http://tiles.example.com")
        }
    }
}
