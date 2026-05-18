import Foundation

final class TileCache {
    private let memoryCache = NSCache<NSString, NSData>()
    private let diskQueue = DispatchQueue(label: "dev.dfakkeldy.ns-marks-the-spot.tilecache")
    private let fileManager = FileManager.default

    private var diskRoot: URL {
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        return caches.appendingPathComponent("Tiles", isDirectory: true)
    }

    func cachedTile(z: Int, x: Int, y: Int, layerName: String) -> Data? {
        let key = cacheKey(z: z, x: x, y: y, layerName: layerName)

        if let memoryData = memoryCache.object(forKey: key as NSString) {
            return memoryData as Data
        }

        let diskURL = diskURLFor(key: key)
        guard fileManager.fileExists(atPath: diskURL.path) else { return nil }

        guard let diskData = try? Data(contentsOf: diskURL) else { return nil }

        memoryCache.setObject(diskData as NSData, forKey: key as NSString)
        return diskData
    }

    func cacheTile(_ data: Data, z: Int, x: Int, y: Int, layerName: String) {
        let key = cacheKey(z: z, x: x, y: y, layerName: layerName)

        memoryCache.setObject(data as NSData, forKey: key as NSString)

        let url = diskURLFor(key: key)
        diskQueue.async { [weak self] in
            guard let self else { return }
            let dir = url.deletingLastPathComponent()
            try? self.fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
            try? data.write(to: url, options: .atomic)
        }
    }

    func clearDiskCache() {
        diskQueue.async { [weak self] in
            guard let self else { return }
            try? self.fileManager.removeItem(at: self.diskRoot)
        }
    }

    private func cacheKey(z: Int, x: Int, y: Int, layerName: String) -> String {
        "\(layerName)/\(z)/\(x)/\(y)"
    }

    private func diskURLFor(key: String) -> URL {
        diskRoot.appendingPathComponent("\(key).png")
    }
}
