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
    /// Who decided which frame places the sheet.
    ///
    /// The web has a third case, `producer-rule`, for a table of known
    /// producers' layouts. That table is empty there, so what would be ported
    /// is the machinery and none of the knowledge.
    public enum Selection: String, Hashable, Sendable, Codable {
        /// The page offered exactly one frame, so there was nothing to choose.
        case sole
        /// The user said which frame the sheet is.
        case user
    }

    /// A page placed by a frame the file itself carries.
    public struct Embedded: Hashable, Sendable, Codable {
        public var flavour: PdfMapRegistration.Flavour
        public var selection: Selection
        public var frameID: String
        public var label: String?
        /// The frames that were not used as well as the one that was, so a user
        /// who suspects the wrong frame was chosen can switch without
        /// re-importing the file.
        public var candidates: [PdfMapRegistration.Candidate]
        /// The user has moved the points since. Tracked because replacing them
        /// with another frame's coordinates would throw away work that only
        /// they can redo — so it is something they get asked about.
        public var adjusted: Bool

        public init(
            flavour: PdfMapRegistration.Flavour,
            selection: Selection,
            frameID: String,
            label: String?,
            candidates: [PdfMapRegistration.Candidate],
            adjusted: Bool = false
        ) {
            self.flavour = flavour
            self.selection = selection
            self.frameID = frameID
            self.label = label
            self.candidates = candidates
            self.adjusted = adjusted
        }
    }

    /// Which frame, if any, places the sheet.
    ///
    /// Coded by hand in `UserMapLibrary.swift`, beside the other conformances
    /// that are a file format rather than an implementation detail.
    public enum Registration: Hashable, Sendable {
        case embedded(Embedded)
        /// Several frames, none chosen. Nothing draws until the user picks one.
        case selectionRequired([PdfMapRegistration.Candidate])
        /// No usable registration, and why.
        case manual(reason: PdfMapRegistration.ManualReason, adjusted: Bool)
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
        case .embedded(let embedded): embedded.candidates
        case .selectionRequired(let candidates): candidates
        case .manual: []
        }
    }

    /// Whether the map is waiting for the user to say which frame it is.
    public var needsFrameSelection: Bool {
        if case .selectionRequired = registration { return true }
        return false
    }

    /// Whether the user can switch to a different frame than the one in use.
    /// Only worth offering when the page carried more than one.
    public var canChangeFrame: Bool {
        if case .embedded(let embedded) = registration {
            return embedded.candidates.count > 1
        }
        return false
    }

    /// The frame currently placing the sheet, if one is.
    public var selectedFrameID: String? {
        if case .embedded(let embedded) = registration { return embedded.frameID }
        return nil
    }

    /// Whether the user has moved the points since the file placed them.
    public var isAdjusted: Bool {
        switch registration {
        case .embedded(let embedded): embedded.adjusted
        case .manual(_, let adjusted): adjusted
        case .selectionRequired: false
        }
    }

    /// The same metadata with the points marked as the user's work.
    ///
    /// A page still waiting for a frame is left alone: there is nothing to
    /// adjust away from until one is chosen.
    public func markingAdjusted() -> PdfImportMetadata {
        var copy = self
        switch registration {
        case .embedded(var embedded):
            embedded.adjusted = true
            copy.registration = .embedded(embedded)
        case .manual(let reason, _):
            copy.registration = .manual(reason: reason, adjusted: true)
        case .selectionRequired:
            break
        }
        return copy
    }

    /// What to call a frame in a list of them.
    ///
    /// An unnamed frame is numbered among the *unnamed* ones, as the web does,
    /// so "Unnamed frame 2" is the second frame without a name of its own
    /// rather than the second frame on the page — which on a page whose main
    /// map is labelled and whose insets are not would name the first inset
    /// "frame 2" and leave no "frame 1" at all.
    public static func label(
        at index: Int, in candidates: [PdfMapRegistration.Candidate]
    ) -> String {
        guard candidates.indices.contains(index) else { return "Unnamed frame" }
        if let label = candidates[index].label { return label }
        let unnamed = candidates[...index].count { $0.label == nil }
        return "Unnamed frame \(max(1, unnamed))"
    }

    /// The row's provenance line: which page, which frame, read how, and
    /// whether the user has moved it since.
    ///
    /// The web prints this under every user map, and it is the only place the
    /// distinction between a sheet the file placed and a sheet the user placed
    /// is visible once both are drawn on the map.
    public var provenance: String {
        let page = pageCount > 1 ? "GeoPDF page 1 of \(pageCount)" : "GeoPDF page 1"
        switch registration {
        case .selectionRequired:
            return "\(page) · Choose frame"
        case .manual(let reason, let adjusted):
            return "\(page) · \(reason.rawValue) registration · manual points"
                + (adjusted ? " · adjusted" : "")
        case .embedded(let embedded):
            let index = embedded.candidates.firstIndex { $0.id == embedded.frameID }
            let label = embedded.label
                ?? Self.label(at: index ?? 0, in: embedded.candidates)
            let flavour = embedded.flavour == .measure ? "Measure" : "LGIDict"
            let selection = embedded.selection == .sole
                ? "sole registration" : "chosen by you"
            return "\(page) · \(label) · \(flavour) · \(selection)"
                + (embedded.adjusted ? " · adjusted" : "")
        }
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
        case .manual(let reason, _):
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
