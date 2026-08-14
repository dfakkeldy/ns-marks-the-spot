import CryptoKit
import Foundation

/// The datasets both surfaces read, bundled from the repository's `SharedData/`
/// export.
///
/// `web/scripts/exportSharedData.mjs` copies an explicit allowlist of files out
/// of the web tree and writes a SHA-256 manifest beside them. The app bundles
/// the same bytes and the same manifest, so a copy that drifts from the web's
/// numbers fails a test rather than shipping: a tax-sale amount re-keyed by
/// hand is how one surface says $4,815 and the other says $4,851 and nobody
/// notices until someone bids.
///
/// The manifest is also the boundary that keeps restricted content out. It is
/// an allowlist, never a directory glob, so parcel geometry, zoning, and
/// anything carrying owner names stay live-query-only.
public enum SharedData {
    /// A dataset this app bundles, named exactly as the export names it.
    public enum Dataset: String, CaseIterable, Sendable {
        case annapolisTaxSale = "annapolisTaxSale.snapshot.json"
        case cbrmTaxSale = "cbrmTaxSale.snapshot.json"
        case cbrmTaxSaleResults = "cbrmTaxSaleResults.snapshot.json"
        case historicalTaxSales = "historicalTaxSales.json"
        case invernessTaxSale = "invernessTaxSale.snapshot.json"
        case middletonTaxSale = "middletonTaxSale.snapshot.json"
    }

    /// A bundled file was not where the bundle said it would be.
    ///
    /// Unrecoverable rather than empty: an absent dataset is a build that did
    /// not ship what it claims to ship, not a municipality with no listings.
    public struct MissingResource: Error, Equatable, Sendable {
        public let name: String
    }

    public struct Manifest: Decodable, Sendable {
        public struct Entry: Decodable, Sendable, Equatable {
            public let path: String
            public let bytes: Int
            public let sha256: String
        }

        public let version: Int
        public let files: [Entry]

        public func entry(for dataset: Dataset) -> Entry? {
            files.first { $0.path == dataset.rawValue }
        }
    }

    private static let directory = "SharedData"

    /// The bytes of a bundled dataset, exactly as the web reads them.
    public static func bytes(of dataset: Dataset) throws -> Data {
        try bytes(named: dataset.rawValue)
    }

    /// The manifest the export wrote next to those bytes.
    public static func manifest() throws -> Manifest {
        try JSONDecoder().decode(Manifest.self, from: bytes(named: "manifest.json"))
    }

    public static func sha256(of data: Data) -> String {
        SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func bytes(named name: String) throws -> Data {
        guard let url = Bundle.module.url(
            forResource: name,
            withExtension: nil,
            subdirectory: directory
        ) else {
            throw MissingResource(name: name)
        }
        return try Data(contentsOf: url)
    }
}
