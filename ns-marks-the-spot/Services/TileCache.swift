import Foundation

final class TileCache {
    private let cache = NSCache<NSString, NSData>()

    func cachedTile(z: Int, x: Int, y: Int) -> Data? {
        let key = "\(z)/\(x)/\(y)" as NSString
        return cache.object(forKey: key) as Data?
    }

    func cacheTile(_ data: Data, z: Int, x: Int, y: Int) {
        let key = "\(z)/\(x)/\(y)" as NSString
        cache.setObject(data as NSData, forKey: key)
    }

    func clearCache() {
        cache.removeAllObjects()
    }
}
