import Foundation
import GeoCore
import Testing
import UIKit

@testable import ns_marks_the_spot

/// The device half of photo attachments: files under the store, the sweeps
/// that keep them converged on what the features claim, and the session
/// attach path.
@Suite("Field-capture photo storage")
@MainActor
struct FieldCapturePhotoTests {
    private func temporaryStore() throws -> (UserVectorStore, URL) {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return (UserVectorStore(directory: root), root)
    }

    private func jpegBytes(width: Int = 64, height: Int = 48) -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        let image = renderer.image { context in
            UIColor.systemGreen.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        return image.jpegData(compressionQuality: 0.9) ?? Data()
    }

    private func pointLayer(descriptors: [PhotoDescriptor] = []) -> ParsedVector {
        var properties: [String: JSONValue] = [:]
        if !descriptors.isEmpty {
            properties[CaptureSpec.photosKey] =
                PhotoDescriptor.propertyValue(internalForm: descriptors)
        }
        return VectorEdit.recomputed([
            GeoJsonFeature(
                id: "f1",
                geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
                properties: properties
            )
        ])
    }

    @Test("Photo files round-trip and delete together")
    func photoFilesRoundTrip() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let full = jpegBytes()
        let thumb = jpegBytes(width: 8, height: 6)
        try await store.addPhoto(layerID: "layer-1", photoID: "p1", full: full, thumb: thumb)

        #expect(await store.photoData(layerID: "layer-1", photoID: "p1", thumb: false) == full)
        #expect(await store.photoData(layerID: "layer-1", photoID: "p1", thumb: true) == thumb)
        #expect(await store.photoCount(layerID: "layer-1") == 1)

        await store.deletePhoto(layerID: "layer-1", photoID: "p1")
        #expect(await store.photoData(layerID: "layer-1", photoID: "p1", thumb: false) == nil)
        #expect(await store.photoCount(layerID: "layer-1") == 0)
    }

    @Test("Replacing geometry sweeps photo files no descriptor references")
    func replaceGeometrySweepsOrphanedPhotos() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let record = UserVectorLayerRecord(
            id: "layer-1", name: "Layer", source: .drawn,
            origin: .drawn(createdAt: .now), createdAt: .now,
            colorHex: "#d55e00", featureCount: 1, bbox: nil
        )
        let kept = PhotoDescriptor(id: "kept")
        _ = try await store.add(record, geometry: pointLayer(descriptors: [kept]))
        try await store.addPhoto(
            layerID: "layer-1", photoID: "kept", full: jpegBytes(), thumb: jpegBytes()
        )
        try await store.addPhoto(
            layerID: "layer-1", photoID: "orphan", full: jpegBytes(), thumb: jpegBytes()
        )

        _ = try await store.replaceGeometry(
            id: "layer-1", with: pointLayer(descriptors: [kept]), now: .now
        )

        #expect(await store.photoData(layerID: "layer-1", photoID: "kept", thumb: false) != nil)
        #expect(await store.photoData(layerID: "layer-1", photoID: "orphan", thumb: false) == nil)
    }

    @Test("Deleting a layer takes its photo directory with it")
    func deletingALayerRemovesItsPhotos() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let record = UserVectorLayerRecord(
            id: "layer-1", name: "Layer", source: .drawn,
            origin: .drawn(createdAt: .now), createdAt: .now,
            colorHex: "#d55e00", featureCount: 1, bbox: nil
        )
        _ = try await store.add(record, geometry: pointLayer())
        try await store.addPhoto(
            layerID: "layer-1", photoID: "p1", full: jpegBytes(), thumb: jpegBytes()
        )

        _ = try await store.delete(id: "layer-1")
        #expect(await store.photoData(layerID: "layer-1", photoID: "p1", thumb: false) == nil)
        let photosDir = root.appendingPathComponent("photos/layer-1")
        #expect(!FileManager.default.fileExists(atPath: photosDir.path))
    }

    @Test("Attaching through the session writes descriptor, files, and claims")
    func sessionAttachWritesDescriptorAndFiles() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let viewModel = UserVectorsViewModel(store: store)
        let row = try #require(await viewModel.newDrawingLayer(name: "Visit"))
        let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
        session.begin(row)
        session.startDrawing(.point)
        session.handleTap(latitude: 44.6, longitude: -63.5)
        let featureID = try #require(session.selectedFeatureID)

        await session.attachPhotos([
            (data: jpegBytes(), sourceName: "IMG_1.jpg", capturedAt: "2026-08-29T14:00:00.000Z")
        ])
        #expect(session.photoMessages.isEmpty)

        let feature = try #require(session.selectedFeature)
        let descriptors = PhotoDescriptor.read(from: feature.properties)
        #expect(descriptors.count == 1)
        #expect(descriptors[0].sourceName == "IMG_1.jpg")
        // The caller's capture claim is kept when the bytes carry none; a
        // UIKit-rendered JPEG has no EXIF DateTimeOriginal.
        #expect(descriptors[0].capturedAt == "2026-08-29T14:00:00.000Z")
        let stored = await session.photoData(photoID: descriptors[0].id, thumb: false)
        #expect(stored != nil)

        // Removal deletes the descriptor and both files in one flow.
        await session.removePhoto(featureID: featureID, photoID: descriptors[0].id)
        let after = try #require(session.selectedFeature)
        #expect(PhotoDescriptor.read(from: after.properties).isEmpty)
        #expect(await session.photoData(photoID: descriptors[0].id, thumb: false) == nil)
    }

    @Test("The per-feature cap refuses with a message that names it")
    func perFeatureCapRefusesByName() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let viewModel = UserVectorsViewModel(store: store)
        let row = try #require(await viewModel.newDrawingLayer(name: "Visit"))
        let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
        session.begin(row)
        session.startDrawing(.point)
        session.handleTap(latitude: 44.6, longitude: -63.5)
        let featureID = try #require(session.selectedFeatureID)

        // 20 descriptors already on the feature — the cap.
        let full = (0..<PhotoDescriptor.maxPerFeature).map { PhotoDescriptor(id: "p\($0)") }
        session.updateFeatureProperties(
            featureID: featureID,
            patch: [CaptureSpec.photosKey: PhotoDescriptor.propertyValue(internalForm: full)]
        )
        await session.attachPhotos([(data: jpegBytes(), sourceName: nil, capturedAt: nil)])
        let message = try #require(session.photoMessages.first)
        #expect(message.contains("20"))
    }
}
