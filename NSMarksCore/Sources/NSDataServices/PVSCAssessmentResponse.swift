import Foundation
import GeoCore

/// What PVSC's open dataset says about an assessment account.
///
/// The values are the ones PVSC published for a tax year. They are not a sale
/// price, an appraisal, or a statement about what a property is worth today —
/// the caveat that says so travels with them to the screen.
public enum PVSCAssessmentResponse {
    /// One account's figures for one tax year.
    public struct Record: Sendable, Equatable {
        public let taxYear: Int
        public let assessedValue: Double
        public let taxableAssessedValue: Double
        /// Where PVSC published the account's point. This is what a spatial
        /// match is made against, and it is why a spatial match is weaker than
        /// a notice AAN: it is the position of a record, not a boundary.
        public let coordinate: GeoPoint

        public init(
            taxYear: Int, assessedValue: Double, taxableAssessedValue: Double,
            coordinate: GeoPoint
        ) {
            self.taxYear = taxYear
            self.assessedValue = assessedValue
            self.taxableAssessedValue = taxableAssessedValue
            self.coordinate = coordinate
        }
    }

    /// One account and the years on record for it, newest first.
    public struct Account: Sendable, Equatable {
        public let aan: String
        public let records: [Record]

        public init(aan: String, records: [Record]) {
            self.aan = aan
            self.records = records
        }

        /// The most recent year on record.
        public var current: Record? { records.first }
    }

    /// How the accounts were found, which decides what they are evidence of.
    public enum MatchMethod: Sendable, Equatable {
        /// A tax-sale notice named the AAN. The link between the sale and the
        /// account is the Province's, not this app's.
        case noticeAAN
        /// PVSC's published point for the account falls inside the mapped
        /// parcel. Evidence that the point is there, not that the account
        /// covers this parcel or only this parcel.
        case spatial
    }

    public struct Result: Sendable, Equatable {
        public let matchMethod: MatchMethod
        public let accounts: [Account]

        public init(matchMethod: MatchMethod, accounts: [Account]) {
            self.matchMethod = matchMethod
            self.accounts = accounts
        }
    }

    public enum Failure: Error, Equatable, Sendable {
        /// Not JSON, or not the array of rows Socrata sends.
        case malformed
        /// Rows arrived and none of them could be read. Not an empty dataset.
        case unusableRows(Int)
    }

    /// The rows in one reply, and how many arrived.
    ///
    /// The count is kept because paging is decided on rows sent, not on rows
    /// understood: a full page carrying one unreadable row is still a full
    /// page, and stopping there would drop every account after it.
    public struct Page: Sendable, Equatable {
        public let rowCount: Int
        public let rows: [(aan: String, record: Record)]

        public static func == (left: Page, right: Page) -> Bool {
            left.rowCount == right.rowCount
                && left.rows.count == right.rows.count
                && zip(left.rows, right.rows).allSatisfy {
                    $0.aan == $1.aan && $0.record == $1.record
                }
        }
    }

    public static func page(from data: Data) throws(Failure) -> Page {
        let payload: [Row]
        do {
            payload = try JSONDecoder().decode([Row].self, from: data)
        } catch {
            throw .malformed
        }
        return Page(rowCount: payload.count, rows: payload.compactMap(parse))
    }

    /// Accounts assembled from rows, the web's `groupAccounts`.
    ///
    /// One record per account per year, first spelling kept, accounts in AAN
    /// order and years newest first. Values are never summed across accounts:
    /// two accounts on one parcel are two records, and adding them would invent
    /// a figure PVSC never published.
    public static func accounts(from rows: [(aan: String, record: Record)]) -> [Account] {
        var order: [String] = []
        var byAAN: [String: [Int: Record]] = [:]
        for row in rows {
            if byAAN[row.aan] == nil {
                byAAN[row.aan] = [:]
                order.append(row.aan)
            }
            if byAAN[row.aan]?[row.record.taxYear] == nil {
                byAAN[row.aan]?[row.record.taxYear] = row.record
            }
        }
        return order.sorted().map { aan in
            Account(
                aan: aan,
                records: (byAAN[aan] ?? [:]).values.sorted { $0.taxYear > $1.taxYear }
            )
        }
    }

    /// The web's `parseRow`. A row missing any of its six columns, or carrying
    /// a coordinate off the globe, is dropped rather than half-read.
    static func parse(_ row: Row) -> (aan: String, record: Record)? {
        guard let rawAAN = row.aan?.text,
              let aan = PVSCAssessmentQuery.normalizeAAN(rawAAN),
              let taxYear = row.tax_year?.number, taxYear == taxYear.rounded(),
              taxYear.magnitude < 9e15,
              let assessed = row.assessed_value?.number,
              let taxable = row.taxable_assessed_value?.number,
              let lng = row.x_coord?.number, let lat = row.y_coord?.number,
              (-180...180).contains(lng), (-90...90).contains(lat)
        else { return nil }

        return (
            aan,
            Record(
                taxYear: Int(taxYear),
                assessedValue: assessed,
                taxableAssessedValue: taxable,
                coordinate: GeoPoint(lat: lat, lng: lng)
            )
        )
    }

    /// One row as Socrata sends it. Every column arrives as a string or a
    /// number depending on the row, which is why none of them is typed here.
    struct Row: Decodable, Sendable {
        let aan: Column?
        let tax_year: Column?
        let assessed_value: Column?
        let taxable_assessed_value: Column?
        let x_coord: Column?
        let y_coord: Column?
    }

    enum Column: Decodable, Sendable {
        case string(String)
        case number(Double)
        /// Neither a string nor a number. Kept as a case rather than thrown,
        /// because throwing here fails the whole page: one odd cell in a
        /// thousand-row reply would take nine hundred and ninety-nine readable
        /// accounts down with it. The web drops the row and keeps the page.
        case unusable

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let value = try? container.decode(String.self) {
                self = .string(value)
            } else if let value = try? container.decode(Double.self) {
                self = .number(value)
            } else {
                self = .unusable
            }
        }

        /// Only a string. The dataset stores AANs zero-padded, so they arrive
        /// as text; a numeric one would have lost its leading zeros before it
        /// got here, and padding it back would be a guess at which account it
        /// is. The web drops the row for the same reason.
        var text: String? {
            if case .string(let value) = self { return value }
            return nil
        }

        /// `Number(value)`, with one deliberate difference: JavaScript reads an
        /// empty string as zero, so a blank `assessed_value` reaches the web's
        /// screen as a $0 assessment and a blank `tax_year` as the year 0.
        /// A missing figure is missing, and the row is dropped instead.
        var number: Double? {
            switch self {
            case .number(let value): return value.isFinite ? value : nil
            case .string(let value):
                let trimmed = value.trimmingCharacters(in: .whitespaces)
                guard !trimmed.isEmpty, let number = Double(trimmed), number.isFinite else {
                    return nil
                }
                return number
            case .unusable: return nil
            }
        }
    }
}
