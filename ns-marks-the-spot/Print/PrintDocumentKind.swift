/// The two documents the export can make, ported from the web's
/// `PrintResearchDocument` and `PrintFieldDocument`.
///
/// They share a map page. What separates them is what a reader is meant to do
/// with it: the field sheet is carried onto the ground and says to confirm what
/// is there, and the research summary is filed and carries the evidence
/// appendix that says what each source answered, returned nothing for, and was
/// never asked. Printing one under the other's name puts the wrong warning on
/// the page — "confirm this on site" on a document nobody is taking outside, or
/// "not proof of absence" on a sheet that never listed a source.
enum PrintDocumentKind: String, CaseIterable, Identifiable, Sendable {
    case fieldSheet
    case researchSummary

    var id: String { rawValue }

    var label: String {
        switch self {
        case .fieldSheet: "Field sheet"
        case .researchSummary: "Research summary"
        }
    }

    /// Whether the evidence appendix follows the map. The one structural
    /// difference between the two documents.
    var includesAppendix: Bool { self == .researchSummary }

    /// What the page must not be read as, in the web's own wording.
    var caveat: String {
        switch self {
        case .fieldSheet: PrintExport.fieldCaveat
        case .researchSummary: PrintExport.screeningCaveat
        }
    }

    /// The page's own name when the user gives it none.
    ///
    /// The PID rides in the name rather than in the subtitle because the name
    /// is also the filename, and a folder of `NS Marks map.pdf` is a folder of
    /// pages nobody can tell apart. With no parcel open there is no PID to
    /// promise, and the page says only what it is.
    func defaultTitle(pid: String?) -> String {
        guard let pid, !pid.isEmpty else {
            return self == .fieldSheet ? "NS Marks field sheet" : "NS Marks map"
        }
        let base = self == .fieldSheet ? "Parcel field sheet" : "Parcel research summary"
        return "\(base) — PID \(pid)"
    }
}
