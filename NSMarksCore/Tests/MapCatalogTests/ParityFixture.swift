import Foundation

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

/// The web's exported catalog, as read from the fixture.
struct ParityFixture: Sendable {
    let groupOrder: [String]
    let order: [String]
    let layers: [String: [String: JSONValue]]

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
            }
        )
    }()

    func layer(_ id: String) -> [String: JSONValue]? {
        layers[id]
    }
}
