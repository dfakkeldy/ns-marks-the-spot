import GeoCore

/// The same decision applies to a stopped recording and a recovered one.
enum DriveCoverageSaveDecision: Equatable {
    case automatic
    case saveSheet

    static func decide(_ result: TrackRecording.StopResult, cataloguesKnown: Bool,
                       catalogueIDs: Set<String>) -> Self {
        guard cataloguesKnown, result.profile == .drive, let tag = result.coverage,
              catalogueIDs.contains(tag.catalogueID),
              result.segments.contains(where: { $0.count >= 2 }) else { return .saveSheet }
        return .automatic
    }
}
