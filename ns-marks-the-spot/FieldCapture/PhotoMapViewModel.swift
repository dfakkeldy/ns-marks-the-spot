import Foundation
import GeoCore
import Observation
import Photos
import UIKit

/// PhotoKit-backed photo map: one full enumeration per grant, persisted under
/// Caches with the change token, later launches applying persistent changes.
/// The row in My Maps is the only UI; LayerCatalog is untouched.
@MainActor
@Observable
final class PhotoMapViewModel {
    enum Access: Equatable {
        case unknown
        case denied
        case limited
        case granted
    }

    var access: Access = .unknown
    var isVisible = false
    var isIndexing = false
    var snapshot = PhotoMapIndex.Snapshot(entries: [])
    var viewport = PhotoMapIndex.Viewport(entries: [], truncated: false, totalInView: 0)
    var indexError: String?

    private let storeURL: URL
    private let caching = PHCachingImageManager()

    init(directory: URL = PhotoMapViewModel.defaultDirectory) {
        self.storeURL = directory.appending(path: "index.json")
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        loadSnapshot()
        refreshAccess()
    }

    private static var defaultDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PhotoMapIndex", isDirectory: true)
    }

    var subtitle: String { "Your photos · never uploaded" }

    var statusLine: String? {
        switch access {
        case .limited:
            return "Showing only the photos you selected · Manage"
        case .denied:
            return "Photo access is off. The map cannot show your library."
        case .granted, .unknown:
            return nil
        }
    }

    var truncationNote: String? {
        viewport.truncated ? "Zoom in to see all photos." : nil
    }

    var canShowOnMap: Bool {
        access == .granted || access == .limited
    }

    func refreshAccess() {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized: access = .granted
        case .limited: access = .limited
        case .denied, .restricted: access = .denied
        case .notDetermined: access = .unknown
        @unknown default: access = .unknown
        }
    }

    func requestAccess() async {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        switch status {
        case .authorized: access = .granted
        case .limited: access = .limited
        default: access = .denied
        }
        if canShowOnMap {
            await applyOrRebuild()
        }
    }

    func setVisible(_ visible: Bool) async {
        if visible, access == .unknown {
            await requestAccess()
        }
        isVisible = visible && canShowOnMap
        if isVisible {
            await applyOrRebuild()
        }
    }

    func refreshViewport(bounds: GeoBoundingBox?) {
        guard isVisible, let bounds else {
            viewport = PhotoMapIndex.Viewport(entries: [], truncated: false, totalInView: 0)
            return
        }
        viewport = PhotoMapIndex.viewport(snapshot, bounds: bounds)
    }

    func applyOrRebuild() async {
        guard canShowOnMap else { return }
        if let tokenData = snapshot.changeToken,
           let token = Self.unarchiveToken(tokenData),
           let result = try? PHPhotoLibrary.shared().fetchPersistentChanges(since: token),
           !result.contains(where: { _ in true })
        {
            return
        }
        await rebuildIndex()
    }

    func rebuildIndex() async {
        guard canShowOnMap else { return }
        isIndexing = true
        indexError = nil
        defer { isIndexing = false }
        let fetched = PHAsset.fetchAssets(with: .image, options: nil)
        var entries: [PhotoMapIndex.Entry] = []
        entries.reserveCapacity(fetched.count)
        fetched.enumerateObjects { asset, _, _ in
            guard let location = asset.location else { return }
            let captured = asset.creationDate.map { CaptureTime.iso($0) }
            entries.append(
                PhotoMapIndex.Entry(
                    id: asset.localIdentifier,
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    capturedAt: captured
                )
            )
        }
        snapshot = PhotoMapIndex.Snapshot(
            entries: entries,
            changeToken: Self.archiveToken(PHPhotoLibrary.shared().currentChangeToken)
        )
        persist()
    }

    /// Transient overlay of the in-view geotagged library. Not a stored layer.
    func drawing() -> UserVectorDrawing? {
        guard isVisible, !viewport.entries.isEmpty else { return nil }
        let epoch = Date(timeIntervalSince1970: 0)
        let record = UserVectorLayerRecord(
            id: PhotoMapViewModel.layerID,
            name: "Your photos",
            source: .photos,
            origin: .photos(createdAt: epoch, count: viewport.entries.count),
            createdAt: epoch,
            colorHex: "#7c3aed",
            featureCount: viewport.entries.count,
            bbox: nil
        )
        let features = viewport.entries.map { entry in
            var properties: [String: JSONValue] = [:]
            if let capturedAt = entry.capturedAt {
                properties[CaptureSpec.capturedAtKey] = .string(capturedAt)
            }
            return GeoJsonFeature(
                id: "photo-map:\(entry.id)",
                geometry: .point(GeoJsonPosition(lng: entry.longitude, lat: entry.latitude)),
                properties: properties
            )
        }
        return UserVectorDrawing(
            record: record,
            parsed: ParsedVector(features: features, bbox: nil)
        )
    }

    func callout(annotationID: String) -> UserVectorCalloutItem? {
        guard let drawing = drawing() else { return nil }
        guard let separator = annotationID.firstIndex(of: "/") else { return nil }
        let layerID = String(annotationID[..<separator])
        let featureID = String(annotationID[annotationID.index(after: separator)...])
        guard layerID == PhotoMapViewModel.layerID,
              let feature = drawing.parsed.features.first(where: { $0.id == featureID })
        else { return nil }
        return UserVectorCalloutItem(feature: feature, record: drawing.record)
    }

    func thumbnail(assetID: String) async -> Data? {
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetID], options: nil)
        guard let asset = assets.firstObject else { return nil }
        final class Once: @unchecked Sendable {
            var resumed = false
        }
        let once = Once()
        return await withCheckedContinuation { continuation in
            let options = PHImageRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .fast
            options.isNetworkAccessAllowed = true
            options.isSynchronous = false
            caching.requestImage(
                for: asset,
                targetSize: CGSize(width: 256, height: 256),
                contentMode: .aspectFill,
                options: options
            ) { image, _ in
                guard !once.resumed else { return }
                once.resumed = true
                continuation.resume(returning: image?.jpegData(compressionQuality: 0.7))
            }
        }
    }

    func openManageAccess() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    static let layerID = "photo-map-layer"

    private static func archiveToken(_ token: PHPersistentChangeToken) -> Data? {
        try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    }

    private static func unarchiveToken(_ data: Data) -> PHPersistentChangeToken? {
        try? NSKeyedUnarchiver.unarchivedObject(
            ofClass: PHPersistentChangeToken.self, from: data
        )
    }

    private func loadSnapshot() {
        guard let data = try? Data(contentsOf: storeURL) else { return }
        struct File: Codable {
            var entries: [PhotoMapIndex.Entry]
            var changeToken: Data?
        }
        guard let file = try? JSONDecoder().decode(File.self, from: data) else { return }
        snapshot = PhotoMapIndex.Snapshot(entries: file.entries, changeToken: file.changeToken)
    }

    private func persist() {
        struct File: Codable {
            var entries: [PhotoMapIndex.Entry]
            var changeToken: Data?
        }
        let file = File(entries: snapshot.entries, changeToken: snapshot.changeToken)
        guard let data = try? JSONEncoder().encode(file) else { return }
        try? data.write(to: storeURL, options: .atomic)
    }
}
