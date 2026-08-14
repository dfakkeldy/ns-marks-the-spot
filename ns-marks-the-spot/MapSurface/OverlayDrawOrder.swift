import GeoCore
import MapKit

/// An overlay that knows where it belongs in the web's drawing order.
///
/// MapKit has no z-index: an overlay added later draws over one added earlier,
/// so installation order *is* the order, and every overlay this app installs
/// has to be placed against the ones already there rather than simply appended.
/// `OverlayZIndex.drawOrder` flattens Leaflet's two stacking spaces onto the
/// one number line that comparison needs.
nonisolated protocol WebDrawOrdered {
    var webDrawOrder: Int { get }
}

extension MKMapView {
    /// Installs `overlay` at the position its draw order asks for.
    ///
    /// Anything already installed that does not state an order — the bounds
    /// selection rectangle — is treated as topmost, because it is an
    /// interaction affordance rather than a layer, and a data overlay must not
    /// be laid over the box the user is currently dragging.
    func installInDrawOrder(_ overlay: MKOverlay & WebDrawOrdered) {
        let above = overlays.first { existing in
            ((existing as? WebDrawOrdered)?.webDrawOrder ?? .max) > overlay.webDrawOrder
        }
        if let above {
            insertOverlay(overlay, below: above)
        } else {
            addOverlay(overlay)
        }
    }
}

extension OpacityTileOverlay: WebDrawOrdered {
    var webDrawOrder: Int {
        // An id that is not a catalogued layer has no stated position. The
        // tile pane's own number puts it with the rasters rather than above
        // the vector layers, which is where an unrecognised *tile* belongs.
        guard let layer = LayerID(rawValue: configuration.id),
              let z = OverlayZIndex.tileZIndex(for: layer)
        else {
            return OverlayZIndex.drawOrder(OverlayZIndex.leafletTilePane, in: .tile)
        }
        return OverlayZIndex.drawOrder(z, in: .tile)
    }
}

extension ParcelPolygon: WebDrawOrdered {
    var webDrawOrder: Int {
        OverlayZIndex.drawOrder(OverlayZIndex.establishedParcel, in: .pane)
    }
}

extension FeaturePolygon: WebDrawOrdered {
    var webDrawOrder: Int { drawOrder }
}

extension FeaturePolyline: WebDrawOrdered {
    var webDrawOrder: Int { drawOrder }
}
