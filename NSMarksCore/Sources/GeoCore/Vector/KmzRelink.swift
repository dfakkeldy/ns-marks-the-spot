import Foundation

/// Import-side of the KMZ interchange profile: resolve each descriptor's
/// href against the archive (case-insensitively), run the bytes through the
/// photo processor (caps enforced, thumbnails regenerated, EXIF stripped
/// again by construction), RE-MINT the ids, rewrite `nsmts:photos` to the
/// internal form, and strip exactly the viewer-facing `<img>` tags whose src
/// points into the photo directory. Missing archive entries, failed decodes,
/// and cap hits are distinct counts, never silent. `capturedAt` comes from
/// the descriptor, never re-invented.
///
/// Pure over an injected processor so the whole flow tests mac-native; the
/// app supplies the real pipeline and writes each `SavedPhoto` to disk.
/// Mirrors `web/src/userMaps/vector/photos/relinkKmzPhotos.ts`.
public enum KmzRelink {
    /// What the processor hands back for one archive photo.
    public struct ProcessedPhoto: Sendable {
        public var fullJpeg: Data
        public var thumbJpeg: Data
        public var width: Int
        public var height: Int

        public init(fullJpeg: Data, thumbJpeg: Data, width: Int, height: Int) {
            self.fullJpeg = fullJpeg
            self.thumbJpeg = thumbJpeg
            self.width = width
            self.height = height
        }
    }

    /// One re-linked photo the caller must persist under its new id.
    public struct SavedPhoto: Sendable {
        public var id: String
        public var processed: ProcessedPhoto
    }

    public struct Result: Sendable {
        public var parsed: ParsedVector
        public var photos: [SavedPhoto]
        public var linked: Int
        public var missingFromArchive: Int
        public var undecodable: Int
        /// Left out because a contract cap was reached — a limit, not a
        /// failure.
        public var capped: Int
        /// In the archive, but declared over the single-photo size cap.
        public var oversizedInArchive: Int = 0
        /// In the archive, but its bytes would not come out.
        public var unreadableInArchive: Int = 0
        /// Names that matched two archive entries differing only in case, and
        /// neither exactly.
        public var ambiguousInArchive: Int = 0
        /// References not read once the archive had inflated its budget.
        public var notReadOverBudget: Int = 0

        /// The per-file import note, or nil when the archive carried no
        /// photos at all. Distinct states stay distinct: missing,
        /// undecodable, and capped photos are three different facts about
        /// the archive.
        public var noteText: String? {
            var parts: [String] = []
            if linked > 0 {
                parts.append("\(linked) photo\(linked == 1 ? "" : "s") attached")
            }
            if missingFromArchive > 0 {
                parts.append("\(missingFromArchive) missing from the archive")
            }
            if undecodable > 0 {
                parts.append("\(undecodable) couldn't be decoded")
            }
            if capped > 0 {
                parts.append(
                    "\(capped) over the \(PhotoDescriptor.maxPerFeature)-per-feature/"
                        + "\(PhotoDescriptor.maxPerLayer)-per-layer photo cap"
                )
            }
            if oversizedInArchive > 0 {
                parts.append(
                    "\(oversizedInArchive) over the \(PhotoDescriptor.maxFileBytes / (1024 * 1024)) MB "
                        + "size cap"
                )
            }
            if unreadableInArchive > 0 {
                parts.append("\(unreadableInArchive) couldn't be read from the archive")
            }
            if ambiguousInArchive > 0 {
                parts.append("\(ambiguousInArchive) matched more than one file in the archive")
            }
            if notReadOverBudget > 0 {
                parts.append(
                    "\(notReadOverBudget) not read after \(KmzRelink.maxInflatedBytes / (1024 * 1024 * 1024)) GB "
                        + "of photos from this archive"
                )
            }
            guard !parts.isEmpty else { return nil }
            return parts.joined(separator: " · ") + "."
        }
    }

    /// The viewer-facing img tags the KMZ writer appends to descriptions —
    /// exactly the ones whose src points into the photo directory, tolerant
    /// of either surface's historical output.
    private static let imgTagPattern =
        "<img[^>]*src=\"files/[^\"]*\"[^>]*/?>(?:</img>)?"

    /// The dictionary form, for archives already read whole (tests, small
    /// files).
    public static func relink(
        parsed: ParsedVector,
        assets: [String: Data],
        mintID: () -> String = { UUID().uuidString },
        process: (Data) throws -> ProcessedPhoto
    ) -> Result {
        relink(
            parsed: parsed,
            assets: { name in (assets[name] ?? assets[name.lowercased()]).map { .bytes($0) } ?? .missing },
            mintID: mintID, process: process
        )
    }

    /// Re-links through a lookup that reads one asset at a time, so the
    /// bytes of each photo live only while it is being processed.
    public static func relink(
        parsed: ParsedVector,
        assets read: (String) -> KmzParse.AssetRead,
        mintID: () -> String = { UUID().uuidString },
        process: (Data) throws -> ProcessedPhoto
    ) -> Result {
        var photos: [SavedPhoto] = []
        var linked = 0
        var missingFromArchive = 0
        var undecodable = 0
        var capped = 0
        var oversized = 0
        var unreadable = 0
        var ambiguous = 0
        var overBudget = 0
        var features: [GeoJsonFeature] = []
        // One read and one decode per distinct href, however many features
        // point at it: the processed photo is shared (its Data is
        // copy-on-write) and a failure is remembered, not retried, so a
        // document naming one asset a thousand times inflates it once.
        var outcomes: [String: ReadOutcome] = [:]
        var inflatedBytes = 0

        for feature in parsed.features {
            let descriptors = PhotoDescriptor.readKmz(from: feature.properties)
            guard !descriptors.isEmpty else {
                features.append(feature)
                continue
            }
            var internalDescriptors: [PhotoDescriptor] = []
            for descriptor in descriptors {
                if internalDescriptors.count >= PhotoDescriptor.maxPerFeature
                    || linked >= PhotoDescriptor.maxPerLayer
                {
                    capped += 1
                    continue
                }
                // As written: the source resolves spelling, exact first.
                let href = descriptor.href ?? "files/\(descriptor.id).jpg"
                let outcome: ReadOutcome
                if let remembered = outcomes[href] {
                    outcome = remembered
                } else {
                    outcome = readAndProcess(href, read: read, process: process, inflatedBytes: &inflatedBytes)
                    outcomes[href] = outcome
                }
                let processed: ProcessedPhoto
                switch outcome {
                case .processed(let ready):
                    processed = ready
                case .missing:
                    missingFromArchive += 1
                    continue
                case .capped:
                    oversized += 1
                    continue
                case .unreadable:
                    unreadable += 1
                    continue
                case .undecodable:
                    undecodable += 1
                    continue
                case .ambiguous:
                    ambiguous += 1
                    continue
                case .overBudget:
                    overBudget += 1
                    continue
                }
                let sourceName =
                    descriptor.sourceName
                    ?? String(href.split(separator: "/").last ?? "photo.jpg")
                let saved = SavedPhoto(id: mintID(), processed: processed)
                photos.append(saved)
                internalDescriptors.append(
                    PhotoDescriptor(
                        id: saved.id,
                        capturedAt: descriptor.capturedAt,
                        sourceName: sourceName,
                        width: Double(processed.width),
                        height: Double(processed.height)
                    )
                )
                linked += 1
            }
            var copy = feature
            if internalDescriptors.isEmpty {
                copy.properties.removeValue(forKey: CaptureSpec.photosKey)
            } else {
                copy.properties[CaptureSpec.photosKey] =
                    PhotoDescriptor.propertyValue(internalForm: internalDescriptors)
            }
            if let description = copy.properties["description"]?.stringValue {
                let stripped = strippedImgAppendix(description)
                if stripped.isEmpty {
                    copy.properties.removeValue(forKey: "description")
                } else {
                    copy.properties["description"] = .string(stripped)
                }
            }
            features.append(copy)
        }

        return Result(
            parsed: VectorEdit.recomputed(features),
            photos: photos,
            linked: linked,
            missingFromArchive: missingFromArchive,
            undecodable: undecodable,
            capped: capped,
            oversizedInArchive: oversized,
            unreadableInArchive: unreadable,
            ambiguousInArchive: ambiguous,
            notReadOverBudget: overBudget
        )
    }

    /// What one href came to, remembered per href for the whole relink.
    private enum ReadOutcome {
        case processed(ProcessedPhoto)
        case missing, capped, unreadable, undecodable, ambiguous, overBudget
    }

    /// The most an archive's photos may inflate to, all told. Each is held
    /// only while it is decoded, so this bounds time more than memory; a
    /// document that references thousands of distinct 50 MB entries is not
    /// a map, and the rest are reported as not read rather than as missing.
    public static let maxInflatedBytes = 1_073_741_824

    private static func readAndProcess(
        _ href: String,
        read: (String) -> KmzParse.AssetRead,
        process: (Data) throws -> ProcessedPhoto,
        inflatedBytes: inout Int
    ) -> ReadOutcome {
        guard inflatedBytes < maxInflatedBytes else { return .overBudget }
        switch read(href) {
        case .bytes(let bytes):
            inflatedBytes += bytes.count
            guard let processed = try? process(bytes) else { return .undecodable }
            return .processed(processed)
        case .missing: return .missing
        case .capped: return .capped
        case .unreadable: return .unreadable
        case .ambiguous: return .ambiguous
        }
    }

    static func strippedImgAppendix(_ description: String) -> String {
        guard let regex = try? NSRegularExpression(
            pattern: imgTagPattern, options: [.caseInsensitive]
        ) else { return description }
        let range = NSRange(description.startIndex..., in: description)
        let stripped = regex.stringByReplacingMatches(
            in: description, options: [], range: range, withTemplate: ""
        )
        // Trailing whitespace only: the img appendix follows the user's text,
        // and leading whitespace is the user's own.
        var text = Substring(stripped)
        while let last = text.last, last.isWhitespace {
            text = text.dropLast()
        }
        return String(text)
    }
}
