import Foundation
import GeoCore
import MapKit
import NSDataServices
import UIKit

/// The one place OpenStreetMap's address, credit and terms are written down.
///
/// The browser's ground is OpenStreetMap, and this is the same ground for the
/// native map: the screen overlay and the print compositor both fetch through
/// `tileRequest`, so the identifying `User-Agent` the OSM tile policy requires
/// is on every request either of them makes, and neither can drift to a
/// different host or a different credit than the other.
nonisolated enum OpenStreetMapBase {
    /// The id the two surfaces share for this ground. A shared link, a saved
    /// setup and the printed receipt all say "modern", and the web's export
    /// statuses use the same id for the same tiles.
    static let layerID = MapShareState.modernBaseLayerID

    /// What the page calls the base in its legend and its "what printed" list,
    /// word for word as `web/src/print/pdf/exportLayerSpecs.ts` names it.
    static let pageName = "OpenStreetMap base map"

    /// The name the printed attribution strip leads with, word for word as the
    /// browser's `printLayerSources` writes its own strip.
    static let attributionName = "Modern map"

    /// The credit the OpenStreetMap licence requires wherever the tiles show.
    static let credit = "© OpenStreetMap contributors"

    static let copyrightURL = URL(string: "https://www.openstreetmap.org/copyright")!

    /// The deepest level openstreetmap.org serves. Past it MapKit scales the
    /// z19 tiles up rather than requesting levels that do not exist, the same
    /// `maxNativeZoom: 19` the web passes Leaflet.
    static let maxNativeZoom = 19

    /// No `{s}` subdomain: the `a`/`b`/`c` aliases are deprecated and the
    /// policy asks new clients not to use them.
    static let host = "tile.openstreetmap.org"

    static func tileURL(z: Int, x: Int, y: Int) -> URL {
        URL(string: "https://\(host)/\(z)/\(x)/\(y).png")!
    }

    /// Who is asking. The tile policy requires a User-Agent that identifies
    /// the application — a generic or faked one is grounds for a block — and
    /// the contact URL is where the operators can reach this project.
    static let userAgent: String = {
        let version = Bundle.main.object(
            forInfoDictionaryKey: "CFBundleShortVersionString"
        ) as? String
        return "NSMarksTheSpot/\(version ?? "dev") iOS "
            + "(+https://kinnokilabs.com/apps/nsmarksthespot/)"
    }()

    /// One tile's request, User-Agent included.
    ///
    /// The default cache policy on the shared session is deliberate: the OSM
    /// policy asks clients to honour HTTP caching, and `URLCache` does exactly
    /// that. No `TileCache` entry is written for these tiles — the app's own
    /// disk cache exists for sources without usable cache headers, and adding
    /// this one would be a second copy of what `URLCache` already holds.
    static func tileRequest(z: Int, x: Int, y: Int) -> URLRequest {
        var request = URLRequest(url: tileURL(z: z, x: x, y: y))
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        return request
    }

    /// One tile, or a thrown error for a square that did not arrive.
    static func tileData(z: Int, x: Int, y: Int) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(
            for: tileRequest(z: z, x: x, y: y)
        )
        // The same three checks `TileFetcher.validateImageResponse` makes, in
        // its order, so an OSM error page cannot be handed to the map or the
        // page as though it were a tile.
        if let http = response as? HTTPURLResponse {
            guard (200...299).contains(http.statusCode) else {
                throw TileFetcherError.invalidHTTPStatus(http.statusCode)
            }
            if let mimeType = http.mimeType?.lowercased(), !mimeType.hasPrefix("image/") {
                throw TileFetcherError.invalidContentType(mimeType)
            }
        }
        guard UIImage(data: data) != nil else {
            throw TileFetcherError.invalidImageData
        }
        return data
    }

    /// The same square for the print export, with the outcome the page's
    /// legend is built from instead of a thrown error.
    ///
    /// Always `.source` when it arrives: OpenStreetMap covers the world, so
    /// there is no outside-coverage answer, and no licence stands in front of
    /// it. A square that did not arrive is a placeholder standing in for an
    /// answer nobody got, exactly as `OpacityTileOverlay` reports one.
    static func exportTile(
        z: Int, x: Int, y: Int
    ) async -> (Data, TileLoadOutcome, TileSubstance) {
        do {
            return (try await tileData(z: z, x: x, y: y), .served, .source)
        } catch {
            return (
                TileComposite.transparent ?? Data(),
                TileLoadOutcome(classifying: error),
                .placeholder
            )
        }
    }

    /// The base as the print compositor draws it: the same tile machinery every
    /// other raster goes through, so a failed square surfaces as a partial or
    /// failed outcome on the page rather than printing as silently blank
    /// ground.
    ///
    /// The source is the real `{z}/{x}/{y}` template, as `.tile` means
    /// everywhere else, even though `PrintMapCompositor.provider` answers this
    /// configuration by id before reading it: a provider that honoured the
    /// source generically must fetch the right squares, not a whole-world tile
    /// two hundred times over.
    static var printLayer: MapLayerState {
        MapLayerState(
            configuration: TileLayerConfiguration(
                id: layerID,
                name: pageName,
                source: .tile(URL(string: "https://\(host)/{z}/{x}/{y}.png")!),
                minZoom: 0,
                maxZoom: maxNativeZoom
            )
        )
    }
}

/// The OpenStreetMap world, drawn instead of Apple's base map.
///
/// This is the ground the browser shows, so it is what parity means for the
/// base map: the same survey, the same roads, the same labels on both
/// surfaces. `canReplaceMapContent` is what makes it a base rather than a
/// layer — MapKit draws no map of its own beneath it, exactly as
/// `BlankBaseOverlay` empties the world.
///
/// `nonisolated` for the reason the other tile overlays are: MapKit asks for
/// tiles on its own queues, and nothing here holds mutable state.
nonisolated final class OSMBaseOverlay: MKTileOverlay, @unchecked Sendable {
    override init(urlTemplate: String?) {
        super.init(urlTemplate: nil)
        canReplaceMapContent = true
        minimumZ = 0
        maximumZ = OpenStreetMapBase.maxNativeZoom
    }

    convenience init() {
        self.init(urlTemplate: nil)
    }

    /// Thrown errors are deliberate here where `OpacityTileOverlay` answers
    /// with a transparent square: a transparent square on a base-replacing
    /// overlay is a hole MapKit never retries, while a thrown tile is one it
    /// asks for again — which is how a square lost to a moment of bad signal
    /// gets drawn when the signal comes back.
    override func loadTile(at path: MKTileOverlayPath) async throws -> Data {
        try await OpenStreetMapBase.tileData(z: path.z, x: path.x, y: path.y)
    }
}

extension OSMBaseOverlay: WebDrawOrdered {
    /// Where the modern basemap sits on the web, because this is it: below
    /// every layer the app installs.
    var webDrawOrder: Int {
        OverlayZIndex.drawOrder(OverlayZIndex.modernBasemap, in: .tile)
    }
}
