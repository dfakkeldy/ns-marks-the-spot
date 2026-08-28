import CoreGraphics
import GeoCore

nonisolated enum MapMutation: Equatable, Sendable {
    case setMapType(MapBaseType)
    case addTileOverlay(MapLayerState)
    case removeTileOverlay(id: String)
    case setTileOverlayAlpha(id: String, alpha: CGFloat)
    /// Replaces every parcel outline at once.
    ///
    /// Wholesale rather than added and removed one at a time, because moving
    /// the selection restyles the parcel that lost it as well as the one that
    /// gained it, and a per-id diff would have to notice a change that is not
    /// in the set of ids. The web rebuilds its parcel layer on the same event.
    case setParcelShapes([ParcelShape])
    /// Replaces every viewport-layer shape at once, for the same reason parcel
    /// outlines are replaced wholesale: a pan reissues the query, and the answer
    /// is a new set of features rather than an edit to the old one.
    case setFeatureShapes([FeatureShape])
    case setUserMaps([UserMapDrape])
    /// Pokes one drape's live renderer instead of rebuilding it, mirroring
    /// `setTileOverlayAlpha`: the opacity slider fires dozens of times per
    /// gesture, and a rebuild per tick discards MapKit's rendered content and
    /// re-warps the whole sheet for a change the renderer absorbs in place.
    case setUserMapAlpha(id: String, alpha: CGFloat)
    /// Replaces every user vector layer at once. An edit rewrites a layer's
    /// features rather than patching one of them, so there is no smaller unit
    /// to diff.
    case setUserVectors([UserVectorDrawing])
    case setVectorDraft(VectorDraftPreview?)
    case setVectorHandles(VectorSelectionHandles?)
    case setVectorMoveHandle(VectorMoveHandle?)
    case setParcelOverviewMarkers([ParcelOverviewMarker])
    case setFeatureMarkers([FeatureMarker])
    case setShowsUserLocation(Bool)
    case beginBoundsSelection
    case endBoundsSelection
}

/// Pure state-transition planner: given the applied state and the desired
/// state, emit the mutations that reconcile them. No MapKit types, no side
/// effects — tests assert directly on the emitted mutations.
nonisolated enum MapStateDiff {
    /// Alpha alone mutates in place; anything structural rebuilds wholesale.
    ///
    /// "Same structure" means the same records with the same decoded images in
    /// the same order — the cases where a drape's mesh cannot have changed and
    /// the only difference a rebuild could draw is the opacity the renderer
    /// can be handed directly.
    static func userMapMutations(
        from current: [UserMapDrape], to desired: [UserMapDrape]
    ) -> [MapMutation] {
        guard current != desired else { return [] }
        let sameStructure = current.count == desired.count
            && zip(current, desired).allSatisfy {
                $0.record == $1.record && $0.image === $1.image
            }
        guard sameStructure else { return [.setUserMaps(desired)] }
        return zip(current, desired)
            .filter { $0.alpha != $1.alpha }
            .map { .setUserMapAlpha(id: $1.record.id, alpha: $1.alpha) }
    }

    static func mutations(from current: MapViewState, to desired: MapViewState) -> [MapMutation] {
        var mutations: [MapMutation] = []

        if current.baseMapType != desired.baseMapType {
            mutations.append(.setMapType(desired.baseMapType))
        }

        mutations.append(contentsOf: layerMutations(from: current.layers, to: desired.layers))

        // The user's scans first: they sit in tile space, under every vector
        // layer, and `installInDrawOrder` places them there whatever order
        // these mutations arrive in — but rebuilding them after the parcels
        // would still churn overlays the map is already holding.
        mutations.append(contentsOf: userMapMutations(from: current.userMaps, to: desired.userMaps))

        // Before the parcel outlines: install order is z-order, and every
        // viewport layer draws below the parcel a user selected, which stays
        // the visual authority.
        if current.featureShapes != desired.featureShapes {
            mutations.append(.setFeatureShapes(desired.featureShapes))
        }

        if current.parcelShapes != desired.parcelShapes {
            mutations.append(.setParcelShapes(desired.parcelShapes))
        }

        // After the parcels: the user's own layers draw above every catalogued
        // one, because they are what the user is working on and a boundary
        // they sketched must not disappear under the layer they are comparing
        // it to.
        if current.userVectors != desired.userVectors {
            mutations.append(.setUserVectors(desired.userVectors))
        }

        // Last of the vector work: the shape in progress is drawn over
        // everything, including the layer it will join.
        if current.parcelOverviewMarkers != desired.parcelOverviewMarkers {
            mutations.append(.setParcelOverviewMarkers(desired.parcelOverviewMarkers))
        }

        if current.vectorHandles != desired.vectorHandles {
            mutations.append(.setVectorHandles(desired.vectorHandles))
        }

        if current.vectorMoveHandle != desired.vectorMoveHandle {
            mutations.append(.setVectorMoveHandle(desired.vectorMoveHandle))
        }

        if current.vectorDraft != desired.vectorDraft {
            mutations.append(.setVectorDraft(desired.vectorDraft))
        }

        if current.featureMarkers != desired.featureMarkers {
            mutations.append(.setFeatureMarkers(desired.featureMarkers))
        }

        if current.showsUserLocation != desired.showsUserLocation {
            mutations.append(.setShowsUserLocation(desired.showsUserLocation))
        }

        if current.interactionMode != desired.interactionMode {
            switch desired.interactionMode {
            case .selectingBounds:
                mutations.append(.beginBoundsSelection)
            case .idle:
                mutations.append(.endBoundsSelection)
            }
        }

        return mutations
    }

    /// A hidden layer has no overlay on the map at all.
    ///
    /// Leaving one installed at alpha 0 draws nothing, but MapKit goes on
    /// asking it for every tile the view moves over — so a layer the user
    /// switched off would keep requesting the Province's service, out of sight,
    /// for as long as the app was open. The web adds a tile layer only while it
    /// is visible and removes it on hide; this is that behaviour.
    private static func layerMutations(
        from current: [MapLayerState],
        to desired: [MapLayerState]
    ) -> [MapMutation] {
        var mutations: [MapMutation] = []
        // Keyed on what is actually installed, which is the shown layers.
        let installed = Dictionary(
            current.filter { $0.effectiveAlpha > 0 }.map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        let shownIDs = Set(desired.filter { $0.effectiveAlpha > 0 }.map(\.id))

        for layer in current where installed[layer.id] != nil && !shownIDs.contains(layer.id) {
            mutations.append(.removeTileOverlay(id: layer.id))
        }

        for layer in desired where layer.effectiveAlpha > 0 {
            guard let existing = installed[layer.id] else {
                mutations.append(.addTileOverlay(layer))
                continue
            }

            if existing.configuration != layer.configuration {
                mutations.append(.removeTileOverlay(id: layer.id))
                mutations.append(.addTileOverlay(layer))
                continue
            }

            if existing.effectiveAlpha != layer.effectiveAlpha {
                mutations.append(.setTileOverlayAlpha(id: layer.id, alpha: layer.effectiveAlpha))
            }
        }

        return mutations
    }

}
