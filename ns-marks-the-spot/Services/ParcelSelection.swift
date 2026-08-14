import GeoCore
import NSDataServices

/// The parcels the app has loaded and which one the user is asking about.
///
/// A value, so what the map draws and what the panel says are computed from the
/// same state rather than kept in step by hand.
///
/// Parcels accumulate: tapping a second parcel does not unload the first, which
/// is how the web behaves and what makes a neighbouring boundary still visible
/// while the new selection is read.
nonisolated struct ParcelSelection: Equatable, Sendable {
    private(set) var features: [ParcelFeature] = []
    private(set) var selectedPID: String?

    /// Whether the service has ever answered with a parcel for this PID.
    ///
    /// A selection can exist for a PID that is not loaded — the user typed it
    /// and the lookup has not returned, or returned nothing — so this is asked
    /// before spending a request, never as evidence about the parcel.
    func holds(pid: String) -> Bool {
        features.contains { $0.pid == pid }
    }

    var selectedFeatures: [ParcelFeature] {
        guard let selectedPID else { return [] }
        return features.filter { $0.pid == selectedPID }
    }

    /// What the map should draw.
    var shapes: [ParcelShape] { shapes(taxSalePIDs: []) }

    /// The same, styling the parcels a current tax-sale notice advertises.
    ///
    /// The highlight is passed in rather than held here: which parcels are
    /// listed is a fact about the bundled notices and the switches over them,
    /// and this type's job is the geometry the Province returned.
    func shapes(taxSalePIDs: Set<String>) -> [ParcelShape] {
        ParcelShape.shapes(
            for: ParcelFeatureCollection(identifiedFeatures: features),
            selecting: selectedPID,
            taxSalePIDs: taxSalePIDs
        )
    }

    /// Words for the case where the selected parcel is loaded and cannot be
    /// drawn, or `nil` when there is nothing to explain.
    ///
    /// Without this the map would simply show no outline, which looks exactly
    /// like the parcel not being there. The record came back; what is missing is
    /// its shape, and only one of those is a fact about the property.
    var boundaryNotice: String? {
        guard let selectedPID, !selectedFeatures.isEmpty else { return nil }
        let missing = selectedFeatures.filter { $0.boundary.parts.isEmpty }
        guard !missing.isEmpty else { return nil }
        let unreadable = missing.contains { $0.boundary == .unreadable }

        guard missing.count < selectedFeatures.count else {
            return unreadable
                ? "PID \(selectedPID) came back with a boundary this app could not read."
                : "PID \(selectedPID) came back without a mapped boundary."
        }
        // Some of the parcel is drawn and some of it is not, which is the worse
        // case of the two: an outline appears, everything below is looked up
        // inside it, and nothing on screen would otherwise say that part of the
        // parcel was never searched.
        return "PID \(selectedPID) came back as \(selectedFeatures.count) pieces, and "
            + "\(missing.count) of them "
            + (unreadable
                ? "carried a boundary this app could not read. "
                : "arrived without a mapped boundary. ")
            + "Everything below was looked up inside the pieces that are drawn."
    }

    /// A box around every part of the selected parcel, or `nil` when there is
    /// nothing drawable to look at.
    ///
    /// Every part, so focusing a parcel split by a road frames both sides of
    /// the road rather than whichever piece came back first.
    var selectedBounds: MapBounds? {
        let points = selectedFeatures.flatMap { $0.boundary.parts.flatMap { $0.flatMap(\.self) } }
        guard let first = points.first else { return nil }
        var bounds = MapBounds(
            minLatitude: first.lat,
            minLongitude: first.lng,
            maxLatitude: first.lat,
            maxLongitude: first.lng
        )
        for point in points.dropFirst() {
            bounds = MapBounds(
                minLatitude: min(bounds.minLatitude, point.lat),
                minLongitude: min(bounds.minLongitude, point.lng),
                maxLatitude: max(bounds.maxLatitude, point.lat),
                maxLongitude: max(bounds.maxLongitude, point.lng)
            )
        }
        return bounds
    }

    mutating func select(_ pid: String?) {
        selectedPID = pid
    }

    /// Adds whatever is new in `collection`.
    ///
    /// Keyed on the identifier and the shape together, as the web keys its
    /// merge. A parcel split by a road arrives as several features under one
    /// PID and all of them are wanted; the same feature arriving twice — a tap
    /// on a parcel already loaded — must not be, because
    /// `ParcelResponse.mappedAreaSquareMetres` sums across features and would
    /// report the property at twice its size.
    mutating func merge(_ collection: ParcelFeatureCollection) {
        var seen = Set(features.map(Key.init))
        for feature in collection.identifiedFeatures where seen.insert(Key(feature)).inserted {
            features.append(feature)
        }
    }

    private struct Key: Hashable {
        let pid: String
        let boundary: ParcelFeature.Boundary

        init(_ feature: ParcelFeature) {
            pid = feature.pid
            boundary = feature.boundary
        }
    }
}
