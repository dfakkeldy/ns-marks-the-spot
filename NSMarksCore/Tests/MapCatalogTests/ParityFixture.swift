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
enum JSONValue: Decodable, Sendable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    indirect case array([JSONValue])
    indirect case object([String: JSONValue])

    init(from decoder: any Decoder) throws {
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

    var string: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var bool: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    var double: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    var int: Int? {
        guard case .number(let value) = self, value == value.rounded() else { return nil }
        return Int(value)
    }

    var object: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    var array: [JSONValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    /// Treats an explicit JSON `null` as absent.
    ///
    /// The web writes `licenceUrl: null` for the municipal sources that state
    /// no terms at all, which means the same thing as omitting it.
    var nonNull: JSONValue? {
        self == .null ? nil : self
    }
}

/// One Fletcher sheet as the fixture declares it.
struct FixtureSheet: Sendable {
    let sheet: Int
    let bounds: GeoBoundingBox
}

/// The web's exported catalog, as read from the fixture.
struct ParityFixture: Sendable {
    let groupOrder: [String]
    let order: [String]
    let layers: [String: [String: JSONValue]]
    let fletcher: [String: JSONValue]?

    /// The sheet index, decoded from the fixture's `[[south, west], [north,
    /// east]]` corner pairs.
    ///
    /// The corner order is spelled out here, once, because it is the only place
    /// the test suite can get it wrong in a way that still typechecks — and
    /// getting it wrong here would make a transposed Swift transcription pass.
    var fletcherSheets: [FixtureSheet]? {
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

    static let loaded: ParityFixture = {
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
            fletcher: root["fletcher"]?.object
        )
    }()

    func layer(_ id: String) -> [String: JSONValue]? {
        layers[id]
    }
}
