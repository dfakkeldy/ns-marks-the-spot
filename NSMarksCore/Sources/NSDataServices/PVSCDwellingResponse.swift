import Foundation

/// What PVSC's residential dwelling dataset says about an account.
///
/// Every field is optional and stays optional. A dwelling record with no year
/// built is a record PVSC published without one, and filling it in — from a
/// sibling record, from the assessment year, from anything — would put a date
/// on a building that nobody dated.
public enum PVSCDwellingResponse {
    public struct Dwelling: Sendable, Equatable {
        public let yearBuilt: Int?
        public let style: String?
        public let squareFeetLivingArea: Double?
        public let livingUnits: Double?
        public let bathrooms: Double?
        public let garage: Bool?
        public let underConstruction: Bool?

        public init(
            yearBuilt: Int? = nil, style: String? = nil, squareFeetLivingArea: Double? = nil,
            livingUnits: Double? = nil, bathrooms: Double? = nil, garage: Bool? = nil,
            underConstruction: Bool? = nil
        ) {
            self.yearBuilt = yearBuilt
            self.style = style
            self.squareFeetLivingArea = squareFeetLivingArea
            self.livingUnits = livingUnits
            self.bathrooms = bathrooms
            self.garage = garage
            self.underConstruction = underConstruction
        }
    }

    /// One account and the dwellings on it, newest first.
    ///
    /// Several rows on one account are several dwellings. They are listed, not
    /// counted into one: PVSC published them separately and a total across them
    /// would be this app's number rather than PVSC's.
    public struct Account: Sendable, Equatable {
        public let aan: String
        public let dwellings: [Dwelling]

        public init(aan: String, dwellings: [Dwelling]) {
            self.aan = aan
            self.dwellings = dwellings
        }
    }

    public enum Failure: Error, Equatable, Sendable {
        case malformed
        /// Rows arrived and none could be read. Not a parcel with no dwelling.
        case unusableRows(Int)
    }

    public struct Page: Sendable, Equatable {
        public let rowCount: Int
        /// Rows that parsed, before grouping. Kept separately from
        /// `accounts.count` because several rows collapse into one account.
        public let readableRows: Int
        public let accounts: [Account]
    }

    /// The accounts, and how much of the reply went unread.
    public struct Result: Sendable, Equatable {
        public let accounts: [Account]

        /// Rows PVSC sent that could not be read. Said out loud, because an
        /// unreadable dwelling row and a parcel with no house produce the same
        /// short list.
        public let unreadableRows: Int

        public init(accounts: [Account], unreadableRows: Int = 0) {
            self.accounts = accounts
            self.unreadableRows = unreadableRows
        }
    }

    public static func page(from data: Data) throws(Failure) -> Page {
        let payload: [Row]
        do {
            payload = try JSONDecoder().decode([Row].self, from: data)
        } catch {
            throw .malformed
        }
        let rows = payload.compactMap(parse)
        return Page(rowCount: payload.count, readableRows: rows.count, accounts: accounts(from: rows))
    }

    /// Rows assembled into accounts: accounts in number order, dwellings newest
    /// first with undated ones last.
    static func accounts(from rows: [(aan: String, dwelling: Dwelling)]) -> [Account] {
        var order: [String] = []
        var byAAN: [String: [Dwelling]] = [:]
        for row in rows {
            if byAAN[row.aan] == nil {
                byAAN[row.aan] = []
                order.append(row.aan)
            }
            byAAN[row.aan]?.append(row.dwelling)
        }
        return order.sorted().map { aan in
            // Sorted on the key alone rather than on a tuple, so records with
            // the same year keep the order PVSC listed them in — there is no
            // second field that would rank them without inventing a ranking.
            Account(
                aan: aan,
                dwellings: (byAAN[aan] ?? []).enumerated()
                    .sorted {
                        let left = $0.element.yearBuilt ?? Int.min
                        let right = $1.element.yearBuilt ?? Int.min
                        return left == right ? $0.offset < $1.offset : left > right
                    }
                    .map(\.element)
            )
        }
    }

    /// The web's `parseRow`. Only the account number is required: a row that
    /// names an account and publishes nothing else is still PVSC saying there
    /// is a dwelling on that account.
    static func parse(_ row: Row) -> (aan: String, dwelling: Dwelling)? {
        guard let text = row.aan?.text,
              let aan = PVSCAssessmentQuery.normalizeAAN(text)
        else { return nil }

        return (
            aan,
            Dwelling(
                yearBuilt: row.year_built?.number.flatMap(Self.wholeNumber),
                style: row.style?.trimmedText,
                squareFeetLivingArea: row.square_foot_living_area?.number,
                livingUnits: row.living_units?.number,
                bathrooms: row.bathrooms?.number,
                garage: row.garage?.flag,
                underConstruction: row.under_construction?.flag
            )
        )
    }

    /// A year is only a year when it is one. The web keeps whatever `Number()`
    /// produced, so a fractional or astronomically large `year_built` reaches
    /// its screen as-is; here it is dropped rather than rounded into a date
    /// PVSC did not publish.
    static func wholeNumber(_ value: Double) -> Int? {
        guard value == value.rounded(), value.magnitude < 9e15 else { return nil }
        return Int(value)
    }

    struct Row: Decodable, Sendable {
        let aan: PVSCAssessmentResponse.Column?
        let year_built: PVSCAssessmentResponse.Column?
        let style: PVSCAssessmentResponse.Column?
        let square_foot_living_area: PVSCAssessmentResponse.Column?
        let living_units: PVSCAssessmentResponse.Column?
        let bathrooms: PVSCAssessmentResponse.Column?
        let garage: PVSCAssessmentResponse.Column?
        let under_construction: PVSCAssessmentResponse.Column?
    }
}

extension PVSCAssessmentResponse.Column {
    /// A trimmed string, or `nil` when there is nothing left of it.
    var trimmedText: String? {
        guard case .string(let value) = self else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// PVSC's `Y`/`N`. Anything else is `nil` rather than false: "not marked"
    /// and "marked no" are different, and only one of them says there is no
    /// garage.
    var flag: Bool? {
        guard case .string(let value) = self else { return nil }
        switch value.trimmingCharacters(in: .whitespaces).uppercased() {
        case "Y": return true
        case "N": return false
        default: return nil
        }
    }
}
