import GeoCore
import PhotosUI
import SwiftUI

/// The selected feature's photos: thumbnails, attach from camera or library,
/// per-photo remove, the one-time "move point to photo's location" offer,
/// and a lightbox. The library picker is `PhotosPicker` — out-of-process and
/// permissionless — and every ingested photo goes through the pipeline that
/// re-encodes and strips EXIF, GPS included.
struct FeaturePhotoStrip: View {
    @Bindable var session: VectorEditSession
    let feature: GeoJsonFeature

    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var isShowingCamera = false
    @State private var lightbox: LightboxPhoto?

    private var descriptors: [PhotoDescriptor] {
        PhotoDescriptor.read(from: feature.properties)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(descriptors.isEmpty ? "Photos" : "Photos (\(descriptors.count))")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Spacer()
                if CameraPicker.isAvailable {
                    Button {
                        isShowingCamera = true
                    } label: {
                        Label("Take photo", systemImage: "camera")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                }
                PhotosPicker(
                    selection: $pickerItems,
                    maxSelectionCount: PhotoDescriptor.maxPerFeature,
                    matching: .images
                ) {
                    Label("Add photos", systemImage: "photo.on.rectangle")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
            }

            if !descriptors.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(Array(descriptors.enumerated()), id: \.element.id) {
                            index, descriptor in
                            thumb(descriptor, index: index, count: descriptors.count)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }

            if let offer = session.photoLocationOffer,
               offer.featureID == feature.id
            {
                HStack(spacing: 8) {
                    Text(
                        "Photo has a location \(Geodesy.formatDistance(offer.distanceM)) away."
                    )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    Spacer()
                    Button("Move point there") { session.acceptPhotoLocationOffer() }
                        .font(.caption2)
                    Button("Keep") { session.dismissPhotoLocationOffer() }
                        .font(.caption2)
                }
            }

            ForEach(session.photoMessages, id: \.self) { message in
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .fullScreenCover(isPresented: $isShowingCamera) {
            CameraPicker { image in
                isShowingCamera = false
                guard let image, let data = image.jpegData(compressionQuality: 0.95) else {
                    return
                }
                // The camera's capture moment is now, as a matter of fact —
                // the pipeline strips whatever the camera wrote.
                let capturedAt = CaptureTime.iso(Date())
                Task {
                    await session.attachPhotos([
                        (data: data, sourceName: nil, capturedAt: capturedAt)
                    ])
                }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $lightbox) { photo in
            PhotoLightboxView(
                title: photo.title,
                load: { await session.photoData(photoID: photo.id, thumb: false) }
            ) {
                lightbox = nil
            }
        }
        .onChange(of: pickerItems) { _, items in
            guard !items.isEmpty else { return }
            pickerItems = []
            Task {
                var loaded: [(data: Data, sourceName: String?, capturedAt: String?)] = []
                for item in items {
                    // The library bytes keep their EXIF until the pipeline
                    // strips it; capture time is read from them there.
                    guard let data = try? await item.loadTransferable(type: Data.self)
                    else { continue }
                    loaded.append((data: data, sourceName: nil, capturedAt: nil))
                }
                await session.attachPhotos(loaded)
            }
        }
    }

    private func thumb(_ descriptor: PhotoDescriptor, index: Int, count: Int) -> some View {
        ZStack(alignment: .topTrailing) {
            Button {
                lightbox = LightboxPhoto(
                    id: descriptor.id,
                    title: descriptor.sourceName ?? "Photo \(index + 1)"
                )
            } label: {
                PhotoThumbView {
                    await session.photoData(photoID: descriptor.id, thumb: true)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open photo \(index + 1) of \(count)")

            Button {
                Task {
                    await session.removePhoto(
                        featureID: feature.id ?? "", photoID: descriptor.id
                    )
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(.white, .black.opacity(0.6))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove photo \(index + 1)")
            .padding(2)
        }
    }
}

private struct LightboxPhoto: Identifiable {
    let id: String
    let title: String
}

/// One async-loaded thumbnail, 56 pt square.
struct PhotoThumbView: View {
    var load: () async -> Data?

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.secondary.opacity(0.2)
                    .overlay {
                        Image(systemName: "photo")
                            .foregroundStyle(.secondary)
                    }
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(.rect(cornerRadius: 8))
        .task {
            guard image == nil, let data = await load() else { return }
            image = UIImage(data: data)
        }
    }
}

/// The full-size viewer: the stored (already re-encoded) bytes, a close
/// button, black surround.
struct PhotoLightboxView: View {
    let title: String
    var load: () async -> Data?
    var onClose: () -> Void

    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView()
                    .tint(.white)
            }
            Button {
                onClose()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white, .black.opacity(0.5))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Close photo")
            .padding()
        }
        .task {
            guard let data = await load() else { return }
            image = UIImage(data: data)
        }
        .onTapGesture { onClose() }
        .accessibilityLabel(title)
    }
}
