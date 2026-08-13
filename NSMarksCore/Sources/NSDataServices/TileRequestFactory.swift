import Foundation
import GeoCore
import MapCatalog

/// The only place a `TileRequest` comes from, and therefore the only place a
/// layer's licence is checked before the network is touched.
///
/// The check is first, before the URL is even assembled. That ordering is not
/// stylistic: it means an un-cleared restricted layer has no code path in which
/// its address exists as a `URL` value, so there is nothing to accidentally log,
/// cache, prefetch, or pass to a fetcher.
public enum TileRequestFactory {
    /// Why a request was not produced.
    ///
    /// Typed, so the compiler enumerates the ways this can fail and a caller
    /// cannot quietly conflate "you have not accepted the licence" with "that
    /// zoom has no tiles".
    public enum Refusal: Error, Equatable, Sendable {
        case unknownLayer(LayerID)
        /// The layer needs Province clearance the caller does not hold.
        case licenceNotAccepted(LayerID)
        /// The layer draws vectors, not tiles.
        case notARasterLayer(LayerID)
        /// The layer's address is runtime configuration that is not set.
        case noServiceURL(LayerID)
        case zoomOutOfRange(LayerID, Int)
        case malformedURL(LayerID)
    }

    /// A cleared request for one 256px tile.
    public static func tileRequest(
        for id: LayerID,
        x: Int,
        y: Int,
        z: Int,
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> TileRequest {
        guard let layer = LayerCatalog.descriptor(for: id) else {
            throw .unknownLayer(id)
        }
        // First, before anything constructs an address.
        guard clearance.allows(layer) else {
            throw .licenceNotAccepted(id)
        }
        guard layer.isRaster else {
            throw .notARasterLayer(id)
        }
        guard layer.supports(zoom: z) else {
            throw .zoomOutOfRange(id, z)
        }
        guard let serviceURL = layer.serviceURL else {
            throw .noServiceURL(id)
        }
        guard let options = layer.exportOptions else {
            // An `/export` raster with no export options would be a catalog
            // bug, not a runtime condition; refusing beats guessing at defaults
            // and sending a request the web never makes.
            throw .notARasterLayer(id)
        }
        guard let url = ArcGISExportURL.tile(
            serviceURL: serviceURL,
            options: options,
            x: x,
            y: y,
            z: z
        ) else {
            throw .malformedURL(id)
        }
        return TileRequest(layer: id, url: url)
    }

    /// The second pass for the layers the web draws twice.
    ///
    /// Only `roads` has one — the contrast casing that keeps a road legible
    /// where it crosses water — and it renders one z-index above the base pass.
    /// Returns `nil` for every other layer rather than inventing a second
    /// request.
    public static func overlayTileRequest(
        for id: LayerID,
        x: Int,
        y: Int,
        z: Int,
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> TileRequest? {
        guard let layer = LayerCatalog.descriptor(for: id) else {
            throw .unknownLayer(id)
        }
        guard clearance.allows(layer) else {
            throw .licenceNotAccepted(id)
        }
        guard let options = layer.exportOverlayOptions else { return nil }
        guard layer.supports(zoom: z) else {
            throw .zoomOutOfRange(id, z)
        }
        guard let serviceURL = layer.serviceURL else {
            throw .noServiceURL(id)
        }
        guard let url = ArcGISExportURL.tile(
            serviceURL: serviceURL,
            options: options,
            x: x,
            y: y,
            z: z
        ) else {
            throw .malformedURL(id)
        }
        return TileRequest(layer: id, url: url)
    }
}
