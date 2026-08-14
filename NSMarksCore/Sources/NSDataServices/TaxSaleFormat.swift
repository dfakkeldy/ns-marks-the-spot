import Foundation

/// How tax-sale facts are written out.
///
/// Ported from `web/src/services/taxSaleFormat.ts`, including its locale
/// choices: Canadian dollars and Halifax time, fixed rather than taken from the
/// device. A notice's sale time is a fact about a hall in Nova Scotia, and
/// rendering it in the reader's own zone would move the auction.
public enum TaxSaleFormat {
    public static let timeZoneIdentifier = "America/Halifax"

    public static func currency(cents: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "CAD"
        formatter.locale = Locale(identifier: "en_CA")
        return formatter.string(from: NSNumber(value: Double(cents) / 100))
            ?? "$\(Double(cents) / 100)"
    }

    /// A date in the notice's own zone, spelled out.
    public static func date(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_CA")
        formatter.timeZone = TimeZone(identifier: timeZoneIdentifier)
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }

    /// A calendar day the notice printed, `yyyy-MM-dd`.
    ///
    /// Read as noon in Halifax, which is what the web does and what keeps a
    /// publication date from rendering as the day before. Returned unchanged
    /// when it is not a day this can read, rather than replaced with a date
    /// nobody published.
    public static func day(_ value: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: timeZoneIdentifier)
        parser.dateFormat = "yyyy-MM-dd"
        guard let parsed = parser.date(from: value) else { return value }
        return date(parsed.addingTimeInterval(12 * 60 * 60))
    }

    /// When the sale happens, or that the notice did not say.
    public static func eventDateLabel(_ event: TaxSaleEvent) -> String {
        guard let instant = event.saleStartsAt ?? event.closedAt else {
            return "Date not listed"
        }
        return date(instant)
    }
}
