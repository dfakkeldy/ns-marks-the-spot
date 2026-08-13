import Foundation
import GeoCore

/// A decoded JSON value.
///
/// The fixture is deliberately read as loose JSON rather than into typed
/// descriptors: decoding it into the same shapes the Swift catalog uses would
/// let a field the catalog models wrongly round-trip cleanly and pass. Reading
/// it as data and asserting against it keeps the fixture an independent
/// witness.
///
/// `Any` would have been the obvious way to hold that, and Swift 6 is right to
/// refuse it — a `[String: Any]` shared across parallel tests is not
/// concurrency-safe. This is the Sendable equivalent.
public enum JSONValue: Decodable, Sendable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    indirect case array([JSONValue])
    indirect case object([String: JSONValue])

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public var string: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    public var bool: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    public var double: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    public var int: Int? {
        guard case .number(let value) = self, value == value.rounded() else { return nil }
        return Int(value)
    }

    public var object: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    public var array: [JSONValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    /// Treats an explicit JSON `null` as absent.
    ///
    /// The web writes `licenceUrl: null` for the municipal sources that state
    /// no terms at all, which means the same thing as omitting it.
    public var nonNull: JSONValue? {
        self == .null ? nil : self
    }
}

/// One Fletcher sheet as the fixture declares it.
public struct FixtureSheet: Sendable {
    public let sheet: Int
    public let bounds: GeoBoundingBox
}

/// One `normalizePid` result as the web produced it.
public struct FixturePIDCase: Sendable {
    public let input: String
    /// The eight digits, or `nil` where the web rejected the input.
    public let pid: String?
}

/// The web's exported catalog, as read from the fixture.
public struct ParityFixture: Sendable {
    public let groupOrder: [String]
    public let order: [String]
    public let layers: [String: [String: JSONValue]]
    public let fletcher: [String: JSONValue]?
    public let parcelQuery: [String: JSONValue]?

    /// The sheet index, decoded from the fixture's `[[south, west], [north,
    /// east]]` corner pairs.
    ///
    /// The corner order is spelled out here, once, because it is the only place
    /// the test suite can get it wrong in a way that still typechecks — and
    /// getting it wrong here would make a transposed Swift transcription pass.
    public var fletcherSheets: [FixtureSheet]? {
        guard let entries = fletcher?["sheets"]?.array else { return nil }
        let decoded = entries.compactMap { entry -> FixtureSheet? in
            guard let object = entry.object,
                  let number = object["sheet"]?.int,
                  let corners = object["bounds"]?.array, corners.count == 2,
                  let southWest = corners[0].array, southWest.count == 2,
                  let northEast = corners[1].array, northEast.count == 2,
                  let south = southWest[0].double, let west = southWest[1].double,
                  let north = northEast[0].double, let east = northEast[1].double
            else { return nil }
            return FixtureSheet(
                sheet: number,
                bounds: GeoBoundingBox(south: south, west: west, north: north, east: east)
            )
        }
        // A partial decode would silently shrink the comparison set, so an
        // entry this reader could not understand is a failure, not a skip.
        return decoded.count == entries.count ? decoded : nil
    }

    /// `normalizePid` inputs and the answers the web gave them.
    ///
    /// A `null` there is a rejection the native port has to reproduce, so it is
    /// decoded as a case with no PID rather than dropped. An entry this reader
    /// cannot parse fails the whole set: quietly shrinking the comparison is
    /// how a parity suite starts passing for the wrong reason.
    public var parcelNormalizationCases: [FixturePIDCase]? {
        guard let entries = parcelQuery?["normalization"]?.array else { return nil }
        let decoded = entries.compactMap { entry -> FixturePIDCase? in
            guard let object = entry.object,
                  let input = object["input"]?.string,
                  let result = object["pid"]
            else { return nil }
            switch result {
            case .null:
                return FixturePIDCase(input: input, pid: nil)
            case .string(let pid):
                return FixturePIDCase(input: input, pid: pid)
            default:
                return nil
            }
        }
        return decoded.count == entries.count ? decoded : nil
    }

    /// Whole query URLs the web builds, keyed by the fixture's sample name.
    public var parcelQuerySamples: [String: String]? {
        guard let entries = parcelQuery?["samples"]?.array else { return nil }
        var samples: [String: String] = [:]
        for entry in entries {
            guard let object = entry.object,
                  let name = object["name"]?.string,
                  let url = object["url"]?.string
            else { return nil }
            samples[name] = url
        }
        return samples.count == entries.count ? samples : nil
    }

    public static let loaded: ParityFixture = {
        guard let url = Bundle.module.url(
            forResource: "layer-parity",
            withExtension: "json",
            subdirectory: "Fixtures"
        ) else {
            fatalError("layer-parity.json is missing from the test bundle")
        }
        guard let data = try? Data(contentsOf: url),
              let root = try? JSONDecoder().decode([String: JSONValue].self, from: data),
              let entries = root["layers"]?.array,
              let groupOrder = root["groupOrder"]?.array
        else {
            fatalError("layer-parity.json could not be read as the expected shape")
        }

        let objects = entries.compactMap(\.object)
        return ParityFixture(
            groupOrder: groupOrder.compactMap(\.string),
            order: objects.compactMap { $0["id"]?.string },
            layers: objects.reduce(into: [:]) { result, entry in
                guard let id = entry["id"]?.string else { return }
                result[id] = entry
            },
            fletcher: root["fletcher"]?.object,
            parcelQuery: root["parcelQuery"]?.object
        )
    }()

    public func layer(_ id: String) -> [String: JSONValue]? {
        layers[id]
    }
}
