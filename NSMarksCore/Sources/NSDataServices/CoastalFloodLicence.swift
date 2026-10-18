import Foundation

/// The notices the coastal hazard licence requires to travel with the data.
///
/// Not decoration and not summarisable: the permission, the disclaimer of
/// endorsement, and the disclaimer of warranty are conditions of using the
/// Department's data, so they are rendered wherever a coastal finding is —
/// on the panel, and in the note and printed appendix that quote it.
public nonisolated enum CoastalFloodLicence {
    public static let permission =
        "Reproduced and distributed with the permission of the Department of "
        + "Service Nova Scotia."

    public static let endorsement =
        "This product has been produced by KinNoKi Labs and includes data provided by "
        + "the Department of Service Nova Scotia. The incorporation of that data shall "
        + "not be construed as constituting an endorsement by the Department of Service "
        + "Nova Scotia of this product."

    public static let warranty =
        "Service Nova Scotia makes no representation and gives no warranty of any kind "
        + "respecting the data's accuracy, usefulness, novelty, validity, scope, "
        + "completeness, or currency."

    public static let notices = [permission, endorsement, warranty]

    /// The three notices as one paragraph, for the places that carry a source's
    /// credit as a single line.
    public static var attribution: String { notices.joined(separator: " ") }
}
