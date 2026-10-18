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
/// The one thing MapKit does stack is its own lettering: overlays at
/// `MKOverlayLevel.aboveRoads` draw under Apple's place names and shields,
/// overlays at `.aboveLabels` over them, and the whole upper stack draws over
/// the whole lower one. An order kept within one level therefore means
/// nothing against an overlay in the other, so every overlay on the map is
/// installed at one level — the ground's, `MapController.overlayLevel` — and
/// the installers below take it rather than falling back to MapKit's default.
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
    /// Installs `overlay` at the position its draw order asks for, at `level`.
    ///
    /// Only that level's stack is scanned for the place: it is the one the
    /// overlay is going into, and the invariant that every overlay shares the
    /// ground's level makes it the whole map.
    ///
    /// Anything already installed that does not state an order — the bounds
    /// selection rectangle — is treated as topmost, because it is an
    /// interaction affordance rather than a layer, and a data overlay must not
    /// be laid over the box the user is currently dragging.
    func installInDrawOrder(_ overlay: MKOverlay & WebDrawOrdered, level: MKOverlayLevel) {
        let above = overlays(in: level).first { existing in
            ((existing as? WebDrawOrdered)?.webDrawOrder ?? .max) > overlay.webDrawOrder
        }
        if let above {
            // At the sibling's own level, which is `level`: that is the
            // stack it was found in.
            insertOverlay(overlay, below: above)
        } else {
            addOverlay(overlay, level: level)
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
    func installInDrawOrder(_ batch: [any MKOverlay & WebDrawOrdered], level: MKOverlayLevel) {
        guard !batch.isEmpty else { return }
        guard batch.count > 1 else {
            installInDrawOrder(batch[0], level: level)
            return
        }
        let existingOrders = overlays(in: level).map { ($0 as? WebDrawOrdered)?.webDrawOrder ?? .max }
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
            insertOverlay(overlay, at: existingIndex + inserted, level: level)
            inserted += 1
        }
    }
}

extension OpacityTileOverlay: WebDrawOrdered {
    /// Worked out in `init`, because this is asked once per comparison of
    /// every insert and the answer never changes. See `cachedDrawOrder`.
    var webDrawOrder: Int { cachedDrawOrder }
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
