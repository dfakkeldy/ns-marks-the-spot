import Foundation
import ImageIO
import GeoTIFFTags

/// Spike probe: what does ImageIO know about a GeoTIFF that our tag reader
/// does not, and vice versa?
///
/// The question Phase 8 needs answered is whether `CGImageSourceGetCount`
/// exposes a GeoTIFF's internal overviews as separate indices — i.e. whether
/// ImageIO can give us the web parser's `chooseImageIndex` behaviour for free,
/// or whether preview generation has to go through the thumbnail API.

func physFootprintMB() -> Double {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
    }
    guard result == KERN_SUCCESS else { return -1 }
    return Double(info.phys_footprint) / 1_048_576
}

func time<T>(_ body: () -> T) -> (value: T, ms: Double) {
    let start = DispatchTime.now().uptimeNanoseconds
    let value = body()
    let ms = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    return (value, ms)
}

func probe(_ url: URL) {
    let name = url.lastPathComponent
    print("\n=== \(name) ===")
    let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? Int
    print("file: \(bytes.map(String.init) ?? "?") bytes")

    // --- our reader ---
    do {
        let data = try Data(contentsOf: url)
        let (file, readMs) = time { Result { try GeoTIFFTagReader.read(data) } }
        switch file {
        case .success(let file):
            let sizes = file.sizes.map { "\($0.width)x\($0.height)" }.joined(separator: ", ")
            print("tag reader: \(file.directories.count) IFD(s) [\(sizes)] in \(String(format: "%.2f", readMs)) ms")
            if let base = file.base {
                let gt = base.geotransform.map { $0.map { String(format: "%.9g", $0) }.joined(separator: ", ") }
                print("  crs: \(base.crsIdentifier ?? "none")   pixelIsPoint: \(base.geoKeys.isPixelIsPoint)")
                print("  geotransform: [\(gt ?? "none")]")
            }
        case .failure(let error):
            print("tag reader: rejected — \(error)")
        }
    } catch {
        print("tag reader: could not read file — \(error)")
    }

    // --- ImageIO ---
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        print("ImageIO: refused to open this file")
        return
    }
    let count = CGImageSourceGetCount(source)
    print("CGImageSourceGetCount: \(count)")
    for index in 0..<count {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil)
            as? [CFString: Any] else {
            print("  [\(index)] no properties")
            continue
        }
        let w = properties[kCGImagePropertyPixelWidth] as? Int ?? -1
        let h = properties[kCGImagePropertyPixelHeight] as? Int ?? -1
        print("  [\(index)] \(w)x\(h)")
    }

    // Does ImageIO surface the GeoTIFF tags at all?
    if let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
       let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
        let geoTags = tiff.keys.map { $0 as String }.filter {
            $0.contains("33550") || $0.contains("33922") || $0.contains("34264")
                || $0.lowercased().contains("model") || $0.lowercased().contains("geo")
        }
        print("ImageIO TIFF dict keys: \(tiff.keys.count), geo-looking: \(geoTags.isEmpty ? "none" : geoTags.joined(separator: ", "))")
    }

    // --- decode costs ---
    let before = physFootprintMB()
    let thumbOptions: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: 4096,
        kCGImageSourceCreateThumbnailWithTransform: true,
    ]
    let (thumb, thumbMs) = time {
        CGImageSourceCreateThumbnailAtIndex(source, 0, thumbOptions as CFDictionary)
    }
    let afterThumb = physFootprintMB()
    if let thumb {
        print(String(format: "thumbnail(max 4096): %dx%d in %.1f ms, footprint +%.1f MB",
                     thumb.width, thumb.height, thumbMs, afterThumb - before))
    } else {
        print(String(format: "thumbnail(max 4096): failed in %.1f ms", thumbMs))
    }

    // `CGImageSourceCreateImageAtIndex` alone is lazy — it returns in
    // microseconds and decodes nothing. Force realization so the numbers mean
    // something: cache immediately, then pull the pixel bytes.
    let fullOptions: [CFString: Any] = [kCGImageSourceShouldCacheImmediately: true]
    let (decoded, fullMs) = time { () -> (image: CGImage?, pixelBytes: Int) in
        let image = CGImageSourceCreateImageAtIndex(source, 0, fullOptions as CFDictionary)
        let bytes = image?.dataProvider?.data.map { CFDataGetLength($0) } ?? 0
        return (image, bytes)
    }
    let afterFull = physFootprintMB()
    if let image = decoded.image {
        print(String(format: "full decode [0]: %dx%d, %d px bytes in %.1f ms, footprint +%.1f MB",
                     image.width, image.height, decoded.pixelBytes, fullMs, afterFull - afterThumb))
    } else {
        print(String(format: "full decode [0]: failed in %.1f ms", fullMs))
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard !arguments.isEmpty else {
    print("usage: geotiff-probe <file.tif> [more.tif ...]")
    exit(2)
}
print(String(format: "baseline footprint: %.1f MB", physFootprintMB()))
for path in arguments {
    probe(URL(fileURLWithPath: path))
}
