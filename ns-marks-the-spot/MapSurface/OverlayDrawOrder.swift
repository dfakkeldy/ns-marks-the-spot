import GeoCore
import MapKit

/// An overlay that knows where it belongs in the web's drawing order.
///
/// MapKit has no z-index: an overlay added later draws over one added earlier,
/// so installation order *is* the order, and every overlay this app installs
/// has to be placed against the ones already there rather than simply appended.
/// `OverlayZIndex.drawOrder` flattens Leaflet's two stacking spaces onto the
/// one number line that comparison needs.
///
/// A known divergence from the web: this covers overlays only. Wells, mineral
/// occurrences and abandoned mines are drawn as annotations, and MapKit puts
/// every annotation above every overlay with no way to interleave them — so a
/// well dot can sit over a parcel boundary that the web would have drawn on
/// top of it. Annotations rather than small circle overlays because a marker is
/// a record the user has to be able to tap and read, and a callout is what
/// makes that possible; a fixed-size dot drawn as an overlay would be a shape
/// on the ground whose apparent radius grew with the zoom, which is a claim
/// about location accuracy the record does not make. The order is wrong; the
/// alternative would have been misleading about what the dot means.
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

    /// Installs a whole batch in one pass.
    ///
    /// The single-overlay path reads `overlays` — which bridges a fresh array
    /// on every access — and scans it linearly per insert, with a LayerID
    /// parse and catalog lookup per comparison for tile overlays. Replacing a
    /// few hundred viewport features one at a time was therefore quadratic on
    /// the main thread at every settle. Installed overlays are already in
    /// non-decreasing draw order (this is the invariant the single path
    /// maintains), so one snapshot of their orders and one walk of the sorted
    /// batch places everything with the same result in linear time.
    func installInDrawOrder(_ batch: [any MKOverlay & WebDrawOrdered]) {
        guard !batch.isEmpty else { return }
        guard batch.count > 1 else {
            installInDrawOrder(batch[0])
            return
        }
        let existingOrders = overlays.map { ($0 as? WebDrawOrdered)?.webDrawOrder ?? .max }
        // Sorted with the original position as tiebreak: `sorted` is not
        // guaranteed stable, and members of equal order must keep the order
        // their caller stated.
        let ordered = batch.enumerated()
            .sorted { ($0.element.webDrawOrder, $0.offset) < ($1.element.webDrawOrder, $1.offset) }
            .map(\.element)
        var existingIndex = 0
        var inserted = 0
        for overlay in ordered {
            // Equal orders go above the equals already installed, exactly as
            // the single path places them.
            while existingIndex < existingOrders.count,
                  existingOrders[existingIndex] <= overlay.webDrawOrder {
                existingIndex += 1
            }
            insertOverlay(overlay, at: existingIndex + inserted)
            inserted += 1
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
