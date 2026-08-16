import Foundation

/// What a PDF import turned out to be, kept with the record.
///
/// Ported from the web's `PdfImportMetadata`. It exists because a PDF is the
/// one kind of user map where what the app did is not visible from the result:
/// a placed sheet and a hand-placed sheet look identical on the map, an atlas
/// and a single sheet import the same way, and a page with three registrations
/// where the app chose one looks exactly like a page with one. Each of those is
/// a different claim about the ground under the drape, so each is written down.
public struct PdfImportMetadata: Hashable, Sendable, Codable {
    /// Which frame, if any, places the sheet.
    public enum Registration: Hashable, Sendable, Codable {
        /// Placed from the file's own coordinates. The frame that was used, and
        /// the others that were not — a user who suspects the wrong frame was
        /// chosen can switch to another without re-importing.
        case embedded(frameID: String, label: String?, candidates: [PdfMapRegistration.Candidate])
        /// Several frames, none chosen. Nothing draws until the user picks one.
        case selectionRequired([PdfMapRegistration.Candidate])
        /// No usable registration, and why.
        case manual(PdfMapRegistration.ManualReason)
    }

    /// How many pages the file had. Only the first is imported, and this is
    /// what lets the app say so: an atlas silently reduced to its cover is a
    /// user concluding the other thirty-nine sheets held nothing.
    public var pageCount: Int
    public var registration: Registration

    public init(pageCount: Int, registration: Registration) {
        self.pageCount = pageCount
        self.registration = registration
    }

    /// Every frame the file offered, whatever state the record is in.
    public var candidates: [PdfMapRegistration.Candidate] {
        switch registration {
        case .embedded(_, _, let candidates), .selectionRequired(let candidates):
            candidates
        case .manual:
            []
        }
    }

    /// Whether the map is waiting for the user to say which frame it is.
    public var needsFrameSelection: Bool {
        if case .selectionRequired = registration { return true }
        return false
    }

    /// What the panel says about this import, in the web's own words.
    ///
    /// One sentence about the pages and one about the placement, always both.
    /// The page sentence prints even for a one-page file, because "page 1
    /// imported" and silence are the same text to a reader who did not know
    /// there was a question.
    public var note: String {
        let pages = pageCount > 1
            ? "Page 1 of \(pageCount) imported; later pages were not imported."
            : "Page 1 imported."
        switch registration {
        case .embedded:
            return "\(pages) Placed from the coordinates in the file."
        case .selectionRequired:
            return """
                \(pages) Choose the main map or an inset; its own coordinates \
                will place it.
                """
        case .manual(let reason):
            return "\(pages) \(Self.explanation(of: reason)) Add matching points to place it."
        }
    }

    /// Why a page must be placed by hand, said so the remedy is obvious.
    public static func explanation(of reason: PdfMapRegistration.ManualReason) -> String {
        switch reason {
        case .absent: "No geospatial registration was found in this file."
        case .unsupported: "This PDF's registration is in a form this app does not read."
        case .unsupportedCrs: "This PDF's registration uses a coordinate system this app cannot place."
        case .invalid: "The positioning in this file could not be checked."
        case .unreadable: "The positioning in this file could not be read."
        }
    }
}
