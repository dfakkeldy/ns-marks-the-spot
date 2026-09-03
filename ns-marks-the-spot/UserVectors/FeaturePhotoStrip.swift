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
                    LazyHStack(spacing: 8) {
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
        // A photo that could not be added is said, not only shown: the picker
        // closed and focus is elsewhere.
        .onChange(of: session.photoMessageGeneration) { _, _ in
            let messages = session.photoMessages
            guard !messages.isEmpty else { return }
            AccessibilityNotification.Announcement(messages.joined(separator: " ")).post()
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
                // Owned by the session, like a picked photo, and aimed at the
                // feature the camera was opened for.
                let target = feature.id
                session.beginAttachment {
                    await session.attachPhotos(
                        [(data: data, sourceName: nil, capturedAt: capturedAt)], to: target
                    )
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
            // Owned by the session, so Done waits for it: a photo picked a
            // moment before Done used to be loaded into a session that had
            // already closed.
            // Aimed at the feature the picker was opened for: the selection
            // can move while the library loads, and the photos must not.
            let target = feature.id
            session.beginAttachment {
                var loaded: [(data: Data, sourceName: String?, capturedAt: String?)] = []
                var failed = 0
                for item in items {
                    // The library bytes keep their EXIF until the pipeline
                    // strips it; capture time is read from them there.
                    guard let data = try? await item.loadTransferable(type: Data.self)
                    else {
                        failed += 1
                        continue
                    }
                    loaded.append((data: data, sourceName: nil, capturedAt: nil))
                }
                await session.attachPhotos(loaded, to: target, failedLoads: failed)
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
                // Registered with the session on the tap, before the first
                // await, so a Done tap a moment later waits for the removal.
                session.requestRemovePhoto(featureID: feature.id ?? "", photoID: descriptor.id)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.callout)
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

/// One async-loaded thumbnail, 56 pt square at the default text size.
struct PhotoThumbView: View {
    /// Download progress while the bytes are still coming from iCloud.
    var progress: Double? = nil
    var load: () async -> Data?

    /// Capped, not frozen: the thumbnail grows with the reader's text size so
    /// it stays proportionate to the labels beside it, and stops growing
    /// before a row of them takes the height the callout card needs for its
    /// provenance. The browser pins its own thumbnail at 64 px.
    @ScaledMetric private var scaledSide: CGFloat = 56
    private var side: CGFloat { min(scaledSide, 96) }

    @State private var image: UIImage?
    @State private var unavailable = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if let progress {
                Color.secondary.opacity(0.2)
                    .overlay {
                        ProgressView(value: progress)
                            .progressViewStyle(.circular)
                            .accessibilityLabel("Downloading photo")
                    }
            } else {
                Color.secondary.opacity(0.2)
                    .overlay {
                        Image(systemName: unavailable ? "photo.badge.exclamationmark" : "photo")
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel(unavailable ? "Photo unavailable" : "Photo loading")
            }
        }
        .frame(width: side, height: side)
        .clipShape(.rect(cornerRadius: 8))
        .task {
            guard image == nil else { return }
            let data = await load()
            image = data.flatMap(UIImage.init(data:))
            // Said as unavailable, not left loading: nothing else is coming.
            unavailable = image == nil && !Task.isCancelled
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
    @State private var unavailable = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if unavailable {
                // The load ended with nothing: said, rather than a spinner
                // that never stops.
                Text("This photo couldn't be loaded.")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView()
                    .tint(.white)
            }
            Button {
                onClose()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(.white, .black.opacity(0.5))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Close photo")
            .padding()
        }
        .task {
            let data = await load()
            image = data.flatMap(UIImage.init(data:))
            unavailable = image == nil && !Task.isCancelled
        }
        .onTapGesture { onClose() }
        .accessibilityLabel(title)
    }
}
