import Foundation
import GeoCore

/// A URL that has already passed the Province licence gate.
///
/// The internal initializer keeps app callers on `TileRequestFactory`, which
/// checks the layer's licence before producing its URL.
public struct TileRequest: Sendable, Equatable {
    /// The layer this request was cleared for.
    public let layer: LayerID

    /// The fully-formed URL to fetch.
    public let url: URL

    init(layer: LayerID, url: URL) {
        self.layer = layer
        self.url = url
    }
}
